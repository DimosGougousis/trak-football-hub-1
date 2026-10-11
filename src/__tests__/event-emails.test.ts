import { describe, expect, it, vi } from 'vitest';
import {
  LINK_PLACEHOLDER,
  composeEventEmail,
  eventChange,
  withoutLinks,
  type ClaimedNotice,
  type EventFields,
} from '../../supabase/functions/_shared/event-email';
import { emailProblem, type PlainEmail, type SendResult } from '../../supabase/functions/_shared/send-email';
import {
  RETRY_DELAYS_MS,
  SEND_GAP_MS,
  WAIT_BUDGET_MS,
  deliver,
  handleEventEmailRequest,
  sweep,
  type EventEmailDependencies,
} from '../../supabase/functions/send-event-emails/handler';

// TRAK-135 (J8.12): what a family reads when a published event is cancelled
// or changed today/tomorrow, and how send-event-emails sends it: one email
// per person, no child names, no coach message, coach-typed links removed,
// within Resend's rate, retried, recorded, never twice. Which events queue an
// email and who receives it is decided in SQL (supabase/tests/event_change_emails.sql).

const event = (over: Partial<EventFields> = {}): EventFields => ({
  title: 'U15 training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-10-14T13:00:00Z', event_date: '2026-10-14', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: null, venue: 'Academy Pitch 2', cancel_reason: null, ...over,
});
const notice = (id: string, before: Partial<EventFields>, now: Partial<EventFields>, recipients = [
  { user_id: 'guardian-1', email: 'guardian@example.org' },
]): ClaimedNotice => ({
  notice_id: id, kind: now.status === 'cancelled' ? 'cancelled' : 'changed',
  before: event(before), event: event(now), squad: 'U15', academy: 'Synthetic FC', child_names: [], recipients,
});
const cancelled = (id = 'n-1', over: Partial<EventFields> = {}, recipients?: ClaimedNotice['recipients']) =>
  notice(id, over, { ...over, status: 'cancelled' }, recipients);

describe('the email a family reads', () => {
  it('a cancellation: what, when, where and the squad, with no coach message', () => {
    const email = composeEventEmail('guardian@example.org', [cancelled()])!;
    expect(email.subject).toBe('Training cancelled: Wed 14 Oct');
    expect(email.text).toContain('CANCELLED: U15 training\nWas: Wednesday 14 October, 17:00–18:30 at Academy Pitch 2\nSquad: U15, Synthetic FC');
    expect(email.text).toContain('https://trakfootball.com');
    expect(emailProblem(email)).toBeNull();
  });

  it('a change: each changed field old → new, then the event now', () => {
    const email = composeEventEmail('guardian@example.org', [notice('n-1', {},
      { start_time: '18:30:00', end_time: '20:00:00', venue: 'Pitch 4', meet_time: '18:00:00' })])!;
    expect(email.subject).toBe('Training changed: Wed 14 Oct');
    expect(email.text).toContain([
      'CHANGED: U15 training',
      'Time: 17:00–18:30 → 18:30–20:00',
      'Meet: not set → 18:00',
      'Venue: Academy Pitch 2 → Pitch 4',
      'Now: Wednesday 14 October, 18:30–20:00 at Pitch 4',
    ].join('\n'));
  });

  it('a move to another day says both days', () => {
    const change = eventChange(notice('n-1', { event_date: '2026-10-17' }, { event_date: '2026-10-11' }));
    expect(change).toEqual({ what: 'changed', lines: ['Date: Sat 17 Oct → Sun 11 Oct'] });
  });

  it('edits that cancelled each other out send nothing', () => {
    expect(eventChange(notice('n-1', {}, { title: 'Renamed' }))).toBeNull();
    expect(composeEventEmail('guardian@example.org', [notice('n-1', {}, {})])).toBeNull();
  });

  it('prints only the event fields, never notes or a name, nor a cancel reason naming a squad child', () => {
    // SQL never sends notes or names; even if a row carried them, the email wouldn't print them.
    const leaky = cancelled('n-1', { cancel_reason: 'Sam is injured', notes: 'Private', player_name: 'Sam' } as Partial<EventFields>);
    const email = composeEventEmail('guardian@example.org', [{ ...leaky, child_names: ['Sam Synthetic'] }])!;
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Sam|injured|Private/);
  });

  it('a series cancelled at once is one email listing every date', () => {
    const email = composeEventEmail('guardian@example.org', [
      cancelled('n-2', { event_date: '2026-10-21', starts_at: '2026-10-21T13:00:00Z' }),
      cancelled('n-1'),
      cancelled('n-3', { event_date: '2026-10-28', starts_at: '2026-10-28T13:00:00Z' }),
    ])!;
    expect(email.subject).toBe('3 events cancelled');
    const days = [...email.text.matchAll(/Was: (\w+ \d+ \w+)/g)].map(m => m[1]);
    expect(days).toEqual(['Wednesday 14 October', 'Wednesday 21 October', 'Wednesday 28 October']);
  });

  it('replaces links the coach typed, so the sender doesn\'t refuse the whole email', () => {
    const maps = 'https://maps.app.goo.gl/AbC123?g_st=iw';
    const email = composeEventEmail('guardian@example.org', [cancelled('n-1', {
      title: 'Training www.club.example/info', venue: `Al Barsha Pitch 2 ${maps}`,
    })])!;
    expect(email.text).toContain(`Al Barsha Pitch 2 ${LINK_PLACEHOLDER}`);
    expect(email.subject).toBe('Training cancelled: Wed 14 Oct');
    expect(email.text).toContain(`CANCELLED: Training ${LINK_PLACEHOLDER}\n`);
    expect(email.text).not.toContain('goo.gl');
    expect(emailProblem(email)).toBeNull();
    expect(withoutLinks('Meet at\nhttps://wa.me/123  gate')).toBe(`Meet at ${LINK_PLACEHOLDER} gate`);
  });

  it('names a match by its opponent when it has no title, and survives missing times', () => {
    const email = composeEventEmail('guardian@example.org', [cancelled('n-1', {
      title: '', event_type: 'match', opponent: 'Synthetic Rovers', start_time: null, end_time: null, event_date: null,
      starts_at: '2026-10-14T14:30:00Z',
    })])!;
    // Only starts_at: its Dubai date and time (UTC+4).
    expect(email.subject).toBe('Match cancelled: Wed 14 Oct');
    expect(email.text).toContain('CANCELLED: Match vs Synthetic Rovers\n');
    expect(email.text).toContain('Was: Wednesday 14 October, 18:30 at Academy Pitch 2');
  });
});

// Imad's #264 review (10 Oct): the subject is generic, never coach-typed text;
// coach-typed text reaches the body only if it names no child in the squad;
// the cancel reason is shown unless it names a child or carries a link.
describe('no child name, no coach-typed subject (J8 check 6)', () => {
  const squad = (n: ClaimedNotice): ClaimedNotice => ({ ...n, child_names: ['Lucas Hernandez', 'Theo Al Amiri'] });

  it('the subject says only the kind of event and the day', () => {
    const email = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { title: 'Lucas birthday kickabout' }))])!;
    expect(email.subject).toBe('Training cancelled: Wed 14 Oct');
    const match = composeEventEmail('guardian@example.org', [squad(notice('n-1',
      { event_type: 'match', title: '', opponent: 'Synthetic Rovers' }, { event_type: 'match', title: '', opponent: 'Synthetic Rovers', start_time: '18:00:00' }))])!;
    expect(match.subject).toBe('Match changed: Wed 14 Oct');
    expect(composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { event_type: 'tournament' }))])!.subject)
      .toBe('Tournament cancelled: Wed 14 Oct');
  });

  it('a title, opponent or venue naming a squad child is left out of the body', () => {
    const email = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', {
      title: 'Extra session for Lucas', venue: "Theo's garden",
    }))])!;
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Lucas|Theo/i);
    expect(email.text).toContain('CANCELLED: Training\nWas: Wednesday 14 October, 17:00–18:30\n');
    const match = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', {
      title: '', event_type: 'match', opponent: 'Hernandez Academy',
    }))])!;
    expect(match.text).toContain('CANCELLED: Match\n');
    // "Al" alone is not a name: an ordinary venue stays.
    const venue = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { venue: 'Al Barsha Pitch 2' }))])!;
    expect(venue.text).toContain('at Al Barsha Pitch 2');
  });

  it('the cancel reason is shown when it names no child and has no link', () => {
    const email = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { cancel_reason: 'Pitch closed for\nmaintenance' }))])!;
    expect(email.text).toContain('CANCELLED: U15 training\nWas: Wednesday 14 October, 17:00–18:30 at Academy Pitch 2\nReason: Pitch closed for maintenance\n');
    for (const reason of ['Lucas is ill', 'theo away', 'New date: maps.app.goo.gl/x', 'See https://club.example']) {
      const leaky = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { cancel_reason: reason }))])!;
      expect(leaky.text, reason).not.toContain('Reason:');
      expect(leaky.text, reason).not.toContain(reason);
    }
  });

  it('a short link without https:// is replaced too (maps.app.goo.gl/x)', () => {
    const email = composeEventEmail('guardian@example.org', [squad(cancelled('n-1', { venue: 'Pitch 2 maps.app.goo.gl/x' }))])!;
    expect(email.text).toContain(`Pitch 2 ${LINK_PLACEHOLDER}`);
    expect(emailProblem(email)).toBeNull();
  });

  it('ends with who to ask: the coach about the event, Trak about the app', () => {
    const email = composeEventEmail('guardian@example.org', [squad(cancelled())])!;
    // Imad's wording (10 Oct). No Reply-To: event questions are the coach's.
    expect(email.text.endsWith('Questions about this event? Ask your coach/academy. '
      + 'Feedback or questions about the app? Send us an email at support@trakfootball.com')).toBe(true);
    expect(emailProblem(email)).toBeNull();
  });
});

function deps(over: Partial<EventEmailDependencies> = {}) {
  let clock = 0;
  const calls = { sent: [] as PlainEmail[], sentAt: [] as number[], delivered: [] as [string[], string][], finished: [] as unknown[][] };
  const d: EventEmailDependencies = {
    secretKeys: ['sb_secret_operator-test-key'],
    getCaller: vi.fn(async jwt => ({ data: jwt === 'coach-jwt' ? { id: 'coach-1' } : jwt === 'parent-jwt' ? { id: 'parent-1' } : null, error: null })),
    isCoach: vi.fn(async id => id === 'coach-1'),
    waitSeconds: vi.fn(async () => null),
    claim: vi.fn(async () => []),
    recordDelivery: vi.fn(async (ids, userId) => { calls.delivered.push([ids, userId]); }),
    finish: vi.fn(async (...args) => { calls.finished.push(args); }),
    send: vi.fn(async (message: PlainEmail): Promise<SendResult> => {
      calls.sent.push(message); calls.sentAt.push(clock); return { sent: true, id: `email-${calls.sent.length}` };
    }),
    sleep: vi.fn(async ms => { clock += ms; }),
    now: () => clock,
    ...over,
  };
  return { d, calls };
}
const report = () => ({ notices: 0, emails: 0, failed: 0 });

describe('sending', () => {
  it('one email per person, even when they are owed several notices, then each notice is finished', async () => {
    const { d, calls } = deps();
    const both = [{ user_id: 'guardian-1', email: 'guardian@example.org' }, { user_id: 'player-1', email: 'player@example.org' }];
    const r = report();
    await deliver([cancelled('n-1', {}, both), cancelled('n-2', { event_date: '2026-10-21' }, both)], d, r);
    expect(calls.sent.map(m => m.to)).toEqual(['guardian@example.org', 'player@example.org']);
    expect(calls.delivered).toEqual([[['n-1', 'n-2'], 'guardian-1'], [['n-1', 'n-2'], 'player-1']]);
    expect(calls.finished).toEqual([['n-1', 'sent', 0, null], ['n-2', 'sent', 0, null]]);
    expect(r).toEqual({ notices: 2, emails: 2, failed: 0 });
  });

  it('stays under Resend\'s 10 a second', async () => {
    const recipients = Array.from({ length: 20 }, (_, i) => ({ user_id: `u-${i}`, email: `g${i}@example.org` }));
    const { d, calls } = deps();
    await deliver([cancelled('n-1', {}, recipients)], d, report());
    expect(calls.sent).toHaveLength(20);
    const gaps = calls.sentAt.slice(1).map((t, i) => t - calls.sentAt[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SEND_GAP_MS);
  });

  it('retries a 429 and records the email once it goes', async () => {
    const results: SendResult[] = [{ sent: false, reason: 'delivery_failed', status: 429 }, { sent: true, id: 'email-ok' }];
    const { d, calls } = deps({ send: vi.fn(async () => results.shift()!) });
    await deliver([cancelled()], d, report());
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledWith(RETRY_DELAYS_MS[0]);
    expect(calls.delivered).toEqual([[['n-1'], 'guardian-1']]);
    expect(calls.finished).toEqual([['n-1', 'sent', 0, null]]);
  });

  it('a send that keeps failing leaves the notice failed with a reason code, and the others still go', async () => {
    const send = vi.fn(async (m: PlainEmail): Promise<SendResult> =>
      m.to === 'broken@example.org' ? { sent: false, reason: 'delivery_failed', status: 429 } : { sent: true, id: 'ok' });
    const { d, calls } = deps({ send });
    const r = report();
    await deliver([cancelled('n-1', {}, [
      { user_id: 'u-1', email: 'broken@example.org' }, { user_id: 'u-2', email: 'fine@example.org' },
    ])], d, r);
    expect(send.mock.calls.filter(([m]) => m.to === 'broken@example.org')).toHaveLength(1 + RETRY_DELAYS_MS.length);
    expect(calls.delivered).toEqual([[['n-1'], 'u-2']]);
    expect(calls.finished).toEqual([['n-1', 'failed', 1, 'delivery_failed:429']]);
    expect(r).toEqual({ notices: 1, emails: 1, failed: 1 });
  });

  it('does not retry an email the sender refused outright', async () => {
    const { d, calls } = deps({ send: vi.fn(async () => ({ sent: false, reason: 'invalid_email' } as SendResult)) });
    await deliver([cancelled()], d, report());
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(calls.finished).toEqual([['n-1', 'failed', 1, 'invalid_email']]);
  });

  it('edits that cancelled out are finished as nothing to send, with no email', async () => {
    const { d, calls } = deps();
    await deliver([notice('n-1', {}, { title: 'Renamed' })], d, report());
    expect(calls.sent).toEqual([]);
    expect(calls.finished).toEqual([['n-1', 'nothing_to_send', 0, null]]);
  });

  // Imad's #264 review: Resend may accept an email whose answer never arrives
  // (a network error), and the retry sends it again. The idempotency key makes
  // Resend treat every try of one person's email as the same email.
  it('every try of one person\'s email carries the same idempotency key; another person\'s differs', async () => {
    const results: SendResult[] = [{ sent: false, reason: 'delivery_failed' }, { sent: true, id: 'email-ok' }, { sent: true, id: 'email-2' }];
    const { d, calls } = deps({ send: vi.fn(async (m: PlainEmail) => { calls.sent.push(m); return results.shift()!; }) });
    await deliver([cancelled('n-1', {}, [
      { user_id: 'guardian-1', email: 'guardian@example.org' }, { user_id: 'player-1', email: 'player@example.org' },
    ])], d, report());
    const keys = calls.sent.map(m => m.idempotencyKey);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^trak-event-[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    // The same person and notices give the same key on a later sweep, in any order.
    const again = deps();
    await deliver([cancelled('n-2', { event_date: '2026-10-21' }), cancelled('n-1')], again.d, report());
    const other = deps();
    await deliver([cancelled('n-1'), cancelled('n-2', { event_date: '2026-10-21' })], other.d, report());
    expect(again.calls.sent[0].idempotencyKey).toBe(other.calls.sent[0].idempotencyKey);
  });

  it('a delivery that can\'t be recorded doesn\'t stop the others, and the notice is still finished as sent', async () => {
    // Before: the throw ended the sweep, the notice sat in "sending", and the
    // 10-minute reclaim mailed this person again.
    const { d, calls } = deps({
      recordDelivery: vi.fn(async (_ids: string[], userId: string) => {
        if (userId === 'guardian-1') throw new Error('database call failed');
        calls.delivered.push([_ids, userId]);
      }),
    });
    const r = report();
    await expect(deliver([cancelled('n-1', {}, [
      { user_id: 'guardian-1', email: 'guardian@example.org' }, { user_id: 'player-1', email: 'player@example.org' },
    ])], d, r)).resolves.toBeUndefined();
    expect(calls.sent.map(m => m.to)).toEqual(['guardian@example.org', 'player@example.org']);
    expect(calls.delivered).toEqual([[['n-1'], 'player-1']]);
    // Sent, so never reclaimed; the reason code tells the operator one wasn't recorded.
    expect(calls.finished).toEqual([['n-1', 'sent', 0, 'delivery_not_recorded']]);
    expect(r).toEqual({ notices: 1, emails: 2, failed: 0 });
  });

  it('no recipients (a squad with no consented family) is finished as sent to nobody', async () => {
    const { d, calls } = deps();
    await deliver([cancelled('n-1', {}, [])], d, report());
    expect(calls.sent).toEqual([]);
    expect(calls.finished).toEqual([['n-1', 'sent', 0, null]]);
  });
});

describe('the sweep', () => {
  it('waits for the last quick edit to settle, then claims and sends once', async () => {
    const waits = [12, 0, null];
    const claims = [[cancelled()], []];
    const { d, calls } = deps({
      waitSeconds: vi.fn(async () => waits.shift() ?? null),
      claim: vi.fn(async () => claims.shift() ?? []),
    });
    const r = await sweep(d);
    expect(d.sleep).toHaveBeenCalledWith(12_250);
    expect(calls.sent).toHaveLength(1);
    expect(r).toEqual({ notices: 1, emails: 1, failed: 0 });
  });

  it('leaves edits still coming in for the next call instead of running out of time', async () => {
    const { d } = deps({ waitSeconds: vi.fn(async () => WAIT_BUDGET_MS / 1000 + 1) });
    await sweep(d);
    expect(d.claim).not.toHaveBeenCalled();
  });
});

describe('who may start it', () => {
  const post = (headers: Record<string, string>, body = '{}') =>
    new Request('https://edge.example/send-event-emails', { method: 'POST', headers, body });

  it('a coach\'s session starts a sweep and gets 202 at once', async () => {
    const { d } = deps();
    const { response, work } = await handleEventEmailRequest(post({ Authorization: 'Bearer coach-jwt' }), d);
    expect(response.status).toBe(202);
    expect(await work).toEqual({ notices: 0, emails: 0, failed: 0 });
  });

  it('the operator\'s secret key starts one', async () => {
    const { d } = deps();
    const { response } = await handleEventEmailRequest(post({ apikey: 'sb_secret_operator-test-key' }, ''), d);
    expect(response.status).toBe(202);
  });

  it('nobody else: no session, a bad session, or a parent', async () => {
    const { d } = deps();
    for (const [headers, status] of [[{}, 401], [{ Authorization: 'Bearer forged' }, 401], [{ Authorization: 'Bearer parent-jwt' }, 403]] as const) {
      const { response, work } = await handleEventEmailRequest(post(headers), d);
      expect(response.status).toBe(status);
      expect(work).toBeNull();
    }
    expect(d.claim).not.toHaveBeenCalled();
  });

  it('a caller can\'t choose events or recipients', async () => {
    const { d } = deps();
    const { response, work } = await handleEventEmailRequest(post({ Authorization: 'Bearer coach-jwt' }, '{"to":"x@example.org"}'), d);
    expect(response.status).toBe(400);
    expect(work).toBeNull();
  });
});
