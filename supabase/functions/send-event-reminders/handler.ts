// TRAK-136 (J8.13): sends the reminders due 2 days from today, on each
// academy's own clock and within its 09:00–20:00 (TRAK-175). Only
// the scheduler calls it (pg_cron through pg_net, with its own token from
// Vault, never a project key), or the operator by hand; nobody else. It takes no input: the
// database decides the day and who is due, and hands each person out once.
//
// One email per person, paced within Resend's 10 requests/second and retried
// like J8.12's. Each carries an idempotency key made from the person and the
// day, so a reminder taken back after a crash can't arrive twice. Every
// outcome is written back (sent, failed with a reason code, or nothing left
// to send); a write that fails leaves the row "sending", and the database
// takes it back after 10 minutes. Responses and logs carry no addresses.
import { composeReminderEmail, remindable, type ClaimedReminder } from '../_shared/event-reminder.ts';
import type { PlainEmail, SendResult } from '../_shared/send-email.ts';
import { isScheduler, reasonCode, sendPaced } from '../send-event-emails/handler.ts';
import { corsHeaders, json, sameSecret } from '../send-roster-invites/handler.ts';

export type ReminderOutcome = 'sent' | 'failed' | 'nothing_to_send';
export interface ReminderDependencies {
  /** Every value of SUPABASE_SECRET_KEYS: the operator's key is one of them. */
  secretKeys: string[];
  /** TRAK_CRON_TOKEN: the scheduler's own token; '' when unset. */
  cronToken: string;
  claim(): Promise<ClaimedReminder[]>;
  finish(userId: string, day: string, outcome: ReminderOutcome, eventCount: number,
    providerId: string | null, error: string | null): Promise<void>;
  send(message: PlainEmail): Promise<SendResult>;
  sleep(ms: number): Promise<void>;
  now(): number;
}
export interface ReminderReport { reminders: number; emails: number; failed: number }

/** Resend's idempotency key for one person's reminder for one day (kept 24 h). */
export async function reminderKey(userId: string, day: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}|${day}`)));
  return `trak-reminder-${Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function deliverReminders(reminders: ClaimedReminder[], deps: ReminderDependencies, report: ReminderReport): Promise<void> {
  const pace = { last: -Infinity };
  for (const reminder of reminders) {
    report.reminders++;
    const composed = composeReminderEmail(reminder);
    let outcome: ReminderOutcome = 'nothing_to_send';
    let count = 0;
    let providerId: string | null = null;
    let error: string | null = null;
    if (composed) {
      const result = await sendPaced({ ...composed, idempotencyKey: await reminderKey(reminder.user_id, reminder.day) }, deps, pace);
      if (result.sent) {
        outcome = 'sent';
        count = remindable(reminder.events).length;
        providerId = result.id;
        report.emails++;
      } else {
        outcome = 'failed';
        error = reasonCode(result);
        report.failed++;
      }
    }
    try {
      await deps.finish(reminder.user_id, reminder.day, outcome, count, providerId, error);
    } catch {
      // Left "sending": taken back after 10 minutes, and the key stops a second copy.
    }
  }
}

/** The scheduler (its token on x-trak-cron) or the operator (a secret key on apikey) starts a run; nobody else. */
export async function handleReminderRequest(
  req: Request, deps: ReminderDependencies,
): Promise<{ response: Response; work: Promise<ReminderReport> | null }> {
  const done = (response: Response) => ({ response, work: null });
  if (req.method === 'OPTIONS') return done(new Response('ok', { headers: corsHeaders }));
  if (req.method !== 'POST') return done(json({ accepted: false, reason: 'method_not_allowed' }, 405));

  const apikey = req.headers.get('apikey')?.trim() ?? '';
  const isOperator = apikey.length > 0 && deps.secretKeys.some(key => sameSecret(apikey, key));
  if (!isOperator && !isScheduler(req, deps.cronToken)) {
    return done(json({ accepted: false, error: 'Not authenticated' }, 401));
  }
  // Nothing to choose: an empty body or {} only.
  const raw = (await req.text()).trim();
  if (raw && raw !== '{}') return done(json({ accepted: false, error: 'Send {} only', reason: 'invalid_request' }, 400));

  const work = (async () => {
    const report: ReminderReport = { reminders: 0, emails: 0, failed: 0 };
    await deliverReminders(await deps.claim(), deps, report);
    return report;
  })();
  return { response: json({ accepted: true }, 202), work };
}
