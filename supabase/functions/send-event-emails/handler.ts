// TRAK-135 (J8.12): sends the cancellation and change emails the database
// has queued (event_change_notices). The coach's app calls it after saving
// or cancelling a published event; the operator can call it to retry. It
// takes no input: the database decides what is due and who gets it, so a
// caller can only make queued emails go sooner, never choose recipients.
//
// It waits until the last queued edit is 15 s old (quick edits arrive as one
// email), claims what is due, groups it per person (a series cancelled at
// once is one email), and sends within Resend's 10 requests/second, retrying
// 429s and outages. Never twice: each email carries an idempotency key made
// from the person and the notices, so Resend counts every try (a retry after a
// lost answer, a later sweep) as one send; and each delivery is recorded
// before the next send, so a later sweep skips that person. A delivery that
// can't be recorded doesn't stop the sweep. What still fails stays on the
// notice as "failed" with counts and a reason code. Responses and logs carry
// no addresses.
import { composeEventEmail, eventChange, type ClaimedNotice } from '../_shared/event-email.ts';
import type { PlainEmail, SendResult } from '../_shared/send-email.ts';
import { corsHeaders, json, sameSecret } from '../send-roster-invites/handler.ts';

export type NoticeOutcome = 'sent' | 'failed' | 'nothing_to_send';
export interface EventEmailDependencies {
  /** Every value of SUPABASE_SECRET_KEYS: the operator's key is one of them. */
  secretKeys: string[];
  getCaller(jwt: string): Promise<{ data: { id: string } | null; error: unknown }>;
  isCoach(userId: string): Promise<boolean>;
  /** Seconds until the last pending notice is due; null when none is pending. */
  waitSeconds(): Promise<number | null>;
  claim(): Promise<ClaimedNotice[]>;
  recordDelivery(noticeIds: string[], userId: string, providerId: string | null): Promise<void>;
  finish(noticeId: string, outcome: NoticeOutcome, failed: number, error: string | null): Promise<void>;
  send(message: PlainEmail): Promise<SendResult>;
  sleep(ms: number): Promise<void>;
  now(): number;
}
export interface SweepReport { notices: number; emails: number; failed: number }

/** 8 a second, under Resend's 10 requests/second per team. */
export const SEND_GAP_MS = 125;
/** A 429 or an outage is tried again after 1, 2 and 4 s. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
/** Longest a sweep waits for edits to settle; the rest goes on the next call. */
export const WAIT_BUDGET_MS = 45_000;

const retryable = (result: SendResult) =>
  !result.sent && result.reason === 'delivery_failed' && (result.status === undefined || result.status === 429 || result.status >= 500);
const reasonCode = (result: SendResult) =>
  result.sent ? null : result.status ? `${result.reason}:${result.status}` : result.reason;

/**
 * Resend's idempotency key for one person's email about these notices (kept
 * 24 h): the same person and notices give the same key, in any order.
 */
export async function idempotencyKey(noticeIds: string[], userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${[...noticeIds].sort().join(',')}:${userId}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return `trak-event-${Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Sends one person's email, paced and retried. */
async function sendPaced(message: PlainEmail, deps: EventEmailDependencies, pace: { last: number }): Promise<SendResult> {
  let result: SendResult = { sent: false, reason: 'delivery_failed' };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]);
    const gap = pace.last + SEND_GAP_MS - deps.now();
    if (gap > 0) await deps.sleep(gap);
    pace.last = deps.now();
    result = await deps.send(message);
    if (!retryable(result)) break;
  }
  return result;
}

/** Sends the claimed notices: one email per person, then each notice's outcome. */
export async function deliver(notices: ClaimedNotice[], deps: EventEmailDependencies, report: SweepReport): Promise<void> {
  const failures = new Map<string, { count: number; reason: string | null }>(notices.map(n => [n.notice_id, { count: 0, reason: null }]));
  const unrecorded = new Set<string>();
  const people = new Map<string, { email: string; notices: ClaimedNotice[] }>();
  for (const notice of notices) {
    for (const r of notice.recipients) {
      const person = people.get(r.user_id) ?? { email: r.email, notices: [] };
      person.notices.push(notice);
      people.set(r.user_id, person);
    }
  }

  const pace = { last: -Infinity };
  for (const [userId, person] of people) {
    const composed = composeEventEmail(person.email, person.notices);
    if (!composed) continue;
    const noticeIds = person.notices.map(n => n.notice_id);
    const message = { ...composed, idempotencyKey: await idempotencyKey(noticeIds, userId) };
    const result = await sendPaced(message, deps, pace);
    if (result.sent) {
      report.emails++;
      try {
        await deps.recordDelivery(noticeIds, userId, result.id);
      } catch {
        // The email went. Throwing here would leave every notice "sending",
        // and the 10-minute reclaim would mail this person again.
        for (const id of noticeIds) unrecorded.add(id);
      }
    } else {
      report.failed++;
      for (const n of person.notices) {
        const f = failures.get(n.notice_id)!;
        f.count++;
        f.reason = reasonCode(result);
      }
    }
  }

  for (const notice of notices) {
    const f = failures.get(notice.notice_id)!;
    // Edits that cancelled out: nothing to tell. No recipients at all is still
    // "sent" (sent_count 0): there was no one to tell.
    const outcome: NoticeOutcome = f.count ? 'failed' : eventChange(notice) === null ? 'nothing_to_send' : 'sent';
    // Sent but not recorded: finished as sent (never reclaimed), with a code for the operator.
    const reason = f.reason ?? (unrecorded.has(notice.notice_id) ? 'delivery_not_recorded' : null);
    await deps.finish(notice.notice_id, outcome, f.count, reason);
    report.notices++;
  }
}

/** Waits for quick edits to settle, then sends everything due, until nothing is. */
export async function sweep(deps: EventEmailDependencies): Promise<SweepReport> {
  const report: SweepReport = { notices: 0, emails: 0, failed: 0 };
  const started = deps.now();
  for (let round = 0; round < 10; round++) {
    const wait = await deps.waitSeconds();
    if (wait !== null && wait > 0) {
      const ms = Math.ceil(wait * 1000) + 250;
      // Edits still coming in: the call after the last one sends them.
      if (deps.now() - started + ms > WAIT_BUDGET_MS) break;
      await deps.sleep(ms);
      continue;
    }
    const notices = await deps.claim();
    if (!notices.length) break;
    await deliver(notices, deps, report);
  }
  return report;
}

/** A coach (their session) or the operator (a secret key) starts a sweep; nobody else. */
export async function handleEventEmailRequest(
  req: Request, deps: EventEmailDependencies,
): Promise<{ response: Response; work: Promise<SweepReport> | null }> {
  const done = (response: Response) => ({ response, work: null });
  if (req.method === 'OPTIONS') return done(new Response('ok', { headers: corsHeaders }));
  if (req.method !== 'POST') return done(json({ accepted: false, reason: 'method_not_allowed' }, 405));

  // As in send-roster-invites: the gateway can't verify secret keys, so
  // verify_jwt is off and this checks the key, or a session Auth verifies.
  const apikey = req.headers.get('apikey')?.trim() ?? '';
  const isOperator = apikey.length > 0 && deps.secretKeys.some(key => sameSecret(apikey, key));
  if (!isOperator) {
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return done(json({ accepted: false, error: 'Not authenticated' }, 401));
    const { data: caller, error } = await deps.getCaller(token);
    if (error || !caller) return done(json({ accepted: false, error: 'Not authenticated' }, 401));
    if (!(await deps.isCoach(caller.id))) return done(json({ accepted: false, error: 'Coaches only' }, 403));
  }

  // Nothing to choose: an empty body or {} only.
  const raw = (await req.text()).trim();
  if (raw && raw !== '{}') return done(json({ accepted: false, error: 'Send {} only', reason: 'invalid_request' }, 400));

  return { response: json({ accepted: true }, 202), work: sweep(deps) };
}
