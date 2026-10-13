import { describe, expect, it, vi } from 'vitest';
import { LINK_PLACEHOLDER, WHO_TO_ASK } from '../../supabase/functions/_shared/event-email';
import { composeReminderEmail, type ClaimedReminder, type ReminderEvent } from '../../supabase/functions/_shared/event-reminder';
import { emailProblem, type PlainEmail, type SendResult } from '../../supabase/functions/_shared/send-email';
import { SEND_GAP_MS } from '../../supabase/functions/send-event-emails/handler';
import {
  deliverReminders,
  handleReminderRequest,
  type ReminderDependencies,
} from '../../supabase/functions/send-event-reminders/handler';

// TRAK-136 (J8.13): the reminder 2 days before, one email per person per day
// listing all their children's events, and how send-event-reminders sends it.
// Who is due, and never twice for a day, is decided in SQL
// (supabase/tests/event_reminders.sql).

const event = (over: Partial<ReminderEvent> = {}): ReminderEvent => ({
  id: 'ev-1', title: 'Training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-10-14T13:00:00Z', event_date: '2026-10-14', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: null, venue: 'Academy Pitch 2', cancel_reason: null, kit: null,
  squad: 'U15', academy: 'Synthetic FC', child_names: ['Lucas Hernandez'], ...over,
});
const reminder = (events: ReminderEvent[], over: Partial<ClaimedReminder> = {}): ClaimedReminder => ({
  user_id: 'guardian-1', email: 'guardian@example.org', day: '2026-10-14', events, ...over,
});

describe('the reminder a family reads', () => {
  it('one event: a generic subject, then what, when, where', () => {
    const email = composeReminderEmail(reminder([event({ meet_time: '16:45:00' })]))!;
    expect(email.to).toBe('guardian@example.org');
    expect(email.subject).toBe('Reminder: Training on Wed 14 Oct');
    expect(email.text).toContain('Coming up on Wednesday 14 October:');
    expect(email.text).toContain('Training · U15, Synthetic FC\n17:00–18:30 · meet 16:45\nVenue: Academy Pitch 2');
    expect(emailProblem(email)).toBeNull();
  });

  it('a family with two children gets one email listing every event that day, in time order', () => {
    const email = composeReminderEmail(reminder([
      event({ id: 'b', start_time: '18:30:00', end_time: null, squad: 'U17' }),
      event({ id: 'a', event_type: 'match', title: '', opponent: 'Synthetic Rovers', kit: 'Red shirts', home_away: 'away', start_time: '09:00:00', end_time: '10:30:00' }),
    ]))!;
    expect(email.subject).toBe('Reminder: 2 events on Wed 14 Oct');
    const match = email.text.indexOf('Match vs Synthetic Rovers · U15');
    const training = email.text.indexOf('Training · U17');
    expect(match).toBeGreaterThan(-1);
    expect(training).toBeGreaterThan(match);
    // Kit is for matches only (J8.4).
    expect(email.text).toContain('Kit: Red shirts');
    expect(email.text.match(/Kit:/g)).toHaveLength(1);
  });

  it('never names a child, in the subject or the body, and keeps coach-typed links out', () => {
    const email = composeReminderEmail(reminder([event({
      title: 'Extra session for Lucas', venue: 'Pitch 2 maps.app.goo.gl/x', kit: 'Lucas brings bibs',
    })]))!;
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Lucas/);
    expect(email.text).toContain(`Training · U15, Synthetic FC`);
    expect(email.text).toContain(`Venue: Pitch 2 ${LINK_PLACEHOLDER}`);
    expect(emailProblem(email)).toBeNull();
  });

  it('links the schedule and says how to turn reminders off, with no unsubscribe link', () => {
    const email = composeReminderEmail(reminder([event()]))!;
    expect(email.text).toContain('See the full schedule in Trak: https://trakfootball.com');
    // No "Can't make it" until its screen ships (TRAK-137's app half); the email
    // mustn't ask families for something the app can't do yet (Tarek, #271).
    expect(email.text).not.toMatch(/make it/i);
    expect(email.text).toContain('Turn these reminders off in Trak: Settings → Notifications.');
    expect(email.text.endsWith(WHO_TO_ASK)).toBe(true);
    expect(email.text).not.toMatch(/unsubscribe/i);
    expect(email.text.match(/https?:\/\/\S+/g)).toEqual(['https://trakfootball.com']);
  });

  it('nothing to remind (the events were cancelled since) sends nothing', () => {
    expect(composeReminderEmail(reminder([]))).toBeNull();
    expect(composeReminderEmail(reminder([event({ status: 'cancelled' })]))).toBeNull();
  });
});

function deps(over: Partial<ReminderDependencies> = {}) {
  let clock = 0;
  const calls = { sent: [] as PlainEmail[], sentAt: [] as number[], finished: [] as unknown[][] };
  const d: ReminderDependencies = {
    secretKeys: ['sb_secret_operator-test-key'],
    cronToken: 'cron-test-token-0123456789abcdef0123456789abcdef',
    claim: vi.fn(async () => []),
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
const report = () => ({ reminders: 0, emails: 0, failed: 0 });

describe('sending reminders', () => {
  it('one email per claimed person, each finished as sent with its event count', async () => {
    const { d, calls } = deps();
    const r = report();
    await deliverReminders([
      reminder([event(), event({ id: 'ev-2' })]),
      reminder([event()], { user_id: 'player-1', email: 'player@example.org' }),
    ], d, r);
    expect(calls.sent.map(m => m.to)).toEqual(['guardian@example.org', 'player@example.org']);
    expect(calls.finished).toEqual([
      ['guardian-1', '2026-10-14', 'sent', 2, 'email-1', null],
      ['player-1', '2026-10-14', 'sent', 1, 'email-2', null],
    ]);
    expect(r).toEqual({ reminders: 2, emails: 2, failed: 0 });
  });

  it('carries an idempotency key per person and day, so a retried reminder is one send', async () => {
    const a = deps(); const b = deps();
    await deliverReminders([reminder([event()])], a.d, report());
    await deliverReminders([reminder([event({ id: 'ev-9' })])], b.d, report());
    const key = a.calls.sent[0].idempotencyKey;
    expect(key).toMatch(/^trak-reminder-[0-9a-f]{64}$/);
    expect(b.calls.sent[0].idempotencyKey).toBe(key);
    const c = deps();
    await deliverReminders([reminder([event()], { day: '2026-10-15' })], c.d, report());
    expect(c.calls.sent[0].idempotencyKey).not.toBe(key);
  });

  it('stays under Resend\'s 10 a second', async () => {
    const { d, calls } = deps();
    await deliverReminders(Array.from({ length: 12 }, (_, i) =>
      reminder([event()], { user_id: `u-${i}`, email: `g${i}@example.org` })), d, report());
    const gaps = calls.sentAt.slice(1).map((t, i) => t - calls.sentAt[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(SEND_GAP_MS);
  });

  it('a failure is finished as failed with a reason code; the others still go', async () => {
    const send = vi.fn(async (m: PlainEmail): Promise<SendResult> =>
      m.to === 'broken@example.org' ? { sent: false, reason: 'invalid_email' } : { sent: true, id: 'ok' });
    const { d, calls } = deps({ send });
    const r = report();
    await deliverReminders([
      reminder([event()], { user_id: 'u-1', email: 'broken@example.org' }),
      reminder([event()], { user_id: 'u-2', email: 'fine@example.org' }),
    ], d, r);
    expect(calls.finished).toEqual([
      ['u-1', '2026-10-14', 'failed', 0, null, 'invalid_email'],
      ['u-2', '2026-10-14', 'sent', 1, 'ok', null],
    ]);
    expect(r).toEqual({ reminders: 2, emails: 1, failed: 1 });
  });

  it('nothing left to remind is finished as nothing_to_send, with no email', async () => {
    const { d, calls } = deps();
    await deliverReminders([reminder([])], d, report());
    expect(calls.sent).toEqual([]);
    expect(calls.finished).toEqual([['guardian-1', '2026-10-14', 'nothing_to_send', 0, null, null]]);
  });

  it('a finish that fails doesn\'t stop the others (the row is taken back later; the key stops a second copy)', async () => {
    const finished: string[] = [];
    const { d, calls } = deps({ finish: vi.fn(async (userId: string) => {
      if (userId === 'u-1') throw new Error('database call failed');
      finished.push(userId);
    }) });
    await expect(deliverReminders([
      reminder([event()], { user_id: 'u-1' }), reminder([event()], { user_id: 'u-2' }),
    ], d, report())).resolves.toBeUndefined();
    expect(calls.sent).toHaveLength(2);
    expect(finished).toEqual(['u-2']);
  });
});

describe('who may start it', () => {
  const post = (headers: Record<string, string>, body = '{}') =>
    new Request('https://edge.example/send-event-reminders', { method: 'POST', headers, body });

  it('the operator\'s secret key (the scheduler) starts a run and gets 202 at once', async () => {
    const { d } = deps({ claim: vi.fn(async () => [reminder([event()])]) });
    const { response, work } = await handleReminderRequest(post({ apikey: 'sb_secret_operator-test-key' }), d);
    expect(response.status).toBe(202);
    expect(await work).toEqual({ reminders: 1, emails: 1, failed: 0 });
  });

  it('the scheduler\'s own token starts a run: it never sends a project key (pg_net queues headers where any database login can read them)', async () => {
    const { d } = deps({ claim: vi.fn(async () => [reminder([event()])]) });
    const { response, work } = await handleReminderRequest(post({ 'x-trak-cron': 'cron-test-token-0123456789abcdef0123456789abcdef' }), d);
    expect(response.status).toBe(202);
    expect(await work).toEqual({ reminders: 1, emails: 1, failed: 0 });
  });

  it('the scheduler token only works on its own header, and never when it is unset or too short to be one', async () => {
    for (const [cronToken, headers] of [
      ['cron-test-token-0123456789abcdef0123456789abcdef', { apikey: 'cron-test-token-0123456789abcdef0123456789abcdef' }],
      ['', { 'x-trak-cron': '' }],
      ['short', { 'x-trak-cron': 'short' }],
    ] as [string, Record<string, string>][]) {
      const { d } = deps({ cronToken });
      const { response, work } = await handleReminderRequest(post(headers), d);
      expect(response.status).toBe(401);
      expect(work).toBeNull();
      expect(d.claim).not.toHaveBeenCalled();
    }
  });

  it('nobody else: no key, a wrong key or token, or any signed-in user', async () => {
    const { d } = deps();
    for (const headers of [{}, { apikey: 'sb_secret_wrong' }, { 'x-trak-cron': 'cron-test-token-0123456789abcdef0123456789abcdeX' }, { Authorization: 'Bearer coach-jwt' }] as Record<string, string>[]) {
      const { response, work } = await handleReminderRequest(post(headers), d);
      expect(response.status).toBe(401);
      expect(work).toBeNull();
    }
    expect(d.claim).not.toHaveBeenCalled();
  });

  it('a caller can\'t choose the day or the people', async () => {
    const { d } = deps();
    const { response, work } = await handleReminderRequest(post({ apikey: 'sb_secret_operator-test-key' }, '{"day":"2026-12-25"}'), d);
    expect(response.status).toBe(400);
    expect(work).toBeNull();
  });
});
