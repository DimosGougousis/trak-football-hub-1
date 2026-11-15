import { describe, expect, it, vi } from 'vitest';
import { LINK_PLACEHOLDER } from '../../supabase/functions/_shared/event-email';
import { composeReminderEmails, type ClaimedReminder, type ReminderEvent } from '../../supabase/functions/_shared/event-reminder';
import { emailProblem, type PlainEmail, type SendResult } from '../../supabase/functions/_shared/send-email';
import { SEND_GAP_MS } from '../../supabase/functions/send-event-emails/handler';
import {
  deliverReminders,
  handleReminderRequest,
  type ReminderDependencies,
} from '../../supabase/functions/send-event-reminders/handler';

// TRAK-136 (J8.13): the reminder 2 days before, and how send-event-reminders
// sends it. TRAK-243 (Kostas's wording, 21 Oct): one email per event, laid out
// like the new-event email (TRAK-190). Who is due, and never twice for a day,
// is decided in SQL (supabase/tests/event_reminders.sql).

const event = (over: Partial<ReminderEvent> = {}): ReminderEvent => ({
  id: 'ev-1', title: 'Training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-10-14T13:00:00Z', event_date: '2026-10-14', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: null, venue: 'Academy Pitch 2', cancel_reason: null, kit: null,
  squad: 'U15', academy: 'Synthetic FC', child_names: ['Lucas Hernandez'], ...over,
});
const reminder = (events: ReminderEvent[], over: Partial<ClaimedReminder> = {}): ClaimedReminder => ({
  user_id: 'guardian-1', email: 'guardian@example.org', day: '2026-10-14', events, ...over,
});
const only = (r: ClaimedReminder) => {
  const emails = composeReminderEmails(r);
  expect(emails).toHaveLength(1);
  return emails[0].email;
};
const FOOTER = 'You get this email because you or your child is in this squad on Trak.\n\n'
  + 'Questions about this event? Ask your coach or academy.\nQuestions about the app? Email support@trakfootball.com';

describe('the reminder a family reads (Kostas, 21 Oct)', () => {
  it('a match, exactly as Kostas wrote it', () => {
    const email = only(reminder([event({
      event_type: 'match', title: 'vs Panionios U14', opponent: 'Panionios U14', home_away: 'away',
      event_date: '2026-11-07', starts_at: '2026-11-07T09:00:00Z', start_time: '11:00:00', end_time: '12:30:00',
      meet_time: '10:15:00', venue: 'Nea Smyrni Stadium', kit: 'White',
    })], { day: '2026-11-07' }));
    expect(email.to).toBe('guardian@example.org');
    expect(email.subject).toBe('Match reminder on Sat 7 Nov');
    expect(email.text).toBe([
      'Coming up: match vs Panionios U14 (away).',
      'Saturday 7 November, 11:00 – 12:30\nNea Smyrni Stadium\nPlease arrive by 10:15\nKit: White',
      'If your child can\'t make it, tap "Can\'t make it" in Trak so the coach knows.\nSee the full schedule: https://trakfootball.com',
      'Turn these reminders off in Trak: Settings → Notifications.',
      FOOTER,
    ].join('\n\n'));
    expect(emailProblem(email)).toBeNull();
  });

  it('a plain training says "training"; a training the coach named, and any other event, says its name as typed', () => {
    const plain = only(reminder([event()]));
    expect(plain.subject).toBe('Training reminder on Wed 14 Oct');
    expect(plain.text.startsWith('Coming up: training.\n\nWednesday 14 October, 17:00 – 18:30\nAcademy Pitch 2\n\n')).toBe(true);
    expect(only(reminder([event({ title: 'Tactical' })])).text.startsWith('Coming up: Tactical.\n\n')).toBe(true);
    const other = only(reminder([event({ event_type: 'other', title: 'Team photo!' })]));
    expect(other.subject).toBe('Event reminder on Wed 14 Oct');
    expect(other.text.startsWith('Coming up: Team photo!\n\n')).toBe(true);
  });

  it('no squad line, no kit for a training, and the name only once', () => {
    const email = only(reminder([event({ kit: 'Bibs', title: 'Tactical' })]));
    expect(email.text).not.toMatch(/U15|Synthetic FC|Kit:/);
    expect(email.text.match(/Tactical/g)).toHaveLength(1);
  });

  it('two events that day are two emails, in time order', () => {
    const emails = composeReminderEmails(reminder([
      event({ id: 'b', start_time: '18:30:00', end_time: null, squad: 'U17' }),
      event({ id: 'a', event_type: 'match', title: '', opponent: 'Synthetic Rovers', kit: 'Red shirts', home_away: 'away', start_time: '09:00:00', end_time: '10:30:00' }),
    ]));
    expect(emails.map(e => e.eventId)).toEqual(['a', 'b']);
    expect(emails.map(e => e.email.subject)).toEqual(['Match reminder on Wed 14 Oct', 'Training reminder on Wed 14 Oct']);
    expect(emails[0].email.text).toContain('Kit: Red shirts');
  });

  it('never names a child, in the subject or the body, and keeps coach-typed links out', () => {
    const email = only(reminder([event({
      title: 'Extra session for Lucas', venue: 'Pitch 2 maps.app.goo.gl/x', kit: 'Lucas brings bibs',
    })]));
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Lucas/);
    expect(email.text.startsWith('Coming up: training.')).toBe(true);
    expect(email.text).toContain(`Pitch 2 ${LINK_PLACEHOLDER}`);
    expect(emailProblem(email)).toBeNull();
  });

  it('says how to turn reminders off, with the schedule as its only link and no unsubscribe link', () => {
    const email = only(reminder([event()]));
    expect(email.text).toContain('Turn these reminders off in Trak: Settings → Notifications.');
    expect(email.text.endsWith(FOOTER)).toBe(true);
    expect(email.text).not.toMatch(/unsubscribe/i);
    expect(email.text.match(/https?:\/\/\S+/g)).toEqual(['https://trakfootball.com']);
  });

  it('nothing to remind (the events were cancelled since) sends nothing', () => {
    expect(composeReminderEmails(reminder([]))).toEqual([]);
    expect(composeReminderEmails(reminder([event({ status: 'cancelled' })]))).toEqual([]);
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
  it('one email per event; each person and day is finished once, as sent, with its event count', async () => {
    const { d, calls } = deps();
    const r = report();
    await deliverReminders([
      reminder([event(), event({ id: 'ev-2', start_time: '19:00:00' })]),
      reminder([event()], { user_id: 'player-1', email: 'player@example.org' }),
    ], d, r);
    expect(calls.sent.map(m => m.to)).toEqual(['guardian@example.org', 'guardian@example.org', 'player@example.org']);
    expect(calls.finished).toEqual([
      ['guardian-1', '2026-10-14', 'sent', 2, 'email-2', null],
      ['player-1', '2026-10-14', 'sent', 1, 'email-3', null],
    ]);
    expect(r).toEqual({ reminders: 2, emails: 3, failed: 0 });
  });

  it('carries an idempotency key per person, day and event, so a retried reminder is one send each', async () => {
    const a = deps(); const b = deps();
    await deliverReminders([reminder([event()])], a.d, report());
    await deliverReminders([reminder([event()])], b.d, report());
    const key = a.calls.sent[0].idempotencyKey;
    expect(key).toMatch(/^trak-reminder-[0-9a-f]{64}$/);
    expect(b.calls.sent[0].idempotencyKey).toBe(key);
    const c = deps();
    await deliverReminders([reminder([event()], { day: '2026-10-15' }), reminder([event({ id: 'ev-9' })])], c.d, report());
    expect(c.calls.sent.map(m => m.idempotencyKey)).not.toContain(key);
    expect(new Set(c.calls.sent.map(m => m.idempotencyKey)).size).toBe(2);
  });

  it('stays under Resend\'s 10 a second', async () => {
    const { d, calls } = deps();
    await deliverReminders(Array.from({ length: 6 }, (_, i) =>
      reminder([event(), event({ id: 'ev-2' })], { user_id: `u-${i}`, email: `g${i}@example.org` })), d, report());
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

  it('one of two emails failing finishes the day as failed, so it is retried; the sent one\'s key stops a second copy', async () => {
    const send = vi.fn(async (m: PlainEmail): Promise<SendResult> =>
      m.subject.startsWith('Match') ? { sent: false, reason: 'delivery_failed', status: 502 } : { sent: true, id: 'ok-1' });
    const { d, calls } = deps({ send });
    const r = report();
    await deliverReminders([reminder([event(), event({ id: 'm', event_type: 'match', opponent: 'Rovers', start_time: '19:00:00' })])], d, r);
    expect(calls.finished).toEqual([['guardian-1', '2026-10-14', 'failed', 1, 'ok-1', 'delivery_failed:502']]);
    expect(r).toEqual({ reminders: 1, emails: 1, failed: 1 });
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
