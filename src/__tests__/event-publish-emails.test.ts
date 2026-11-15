import { describe, expect, it, vi } from 'vitest';
import {
  composeEventEmail,
  eventChange,
  type ClaimedNotice,
  type EventFields,
} from '../../supabase/functions/_shared/event-email';
import { emailProblem, type PlainEmail } from '../../supabase/functions/_shared/send-email';
import { deliver, type EventEmailDependencies } from '../../supabase/functions/send-event-emails/handler';

// TRAK-135 (Imad and Kostas, 16 Oct): publishing an event emails the same
// people a change does. One email per publish: a series published at once is
// one email listing the dates. Which publishes queue a notice is decided in SQL
// (supabase/tests/event_publish_emails.sql). The wording is Kostas's (TRAK-190,
// 20 Oct): what the coach did, then each event; a plain "Training" goes
// unnamed, a match says "Match vs … (away)" and its kit; 5 listed, then "...and N more".

const event = (over: Partial<EventFields> = {}): EventFields => ({
  title: 'U15 training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-10-14T13:00:00Z', event_date: '2026-10-14', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: '16:45:00', venue: 'Academy Pitch 2', cancel_reason: null, kit: null, ...over,
});
// A published notice's "before" is the draft, which families never saw.
const published = (id: string, now: Partial<EventFields> = {}): ClaimedNotice => ({
  notice_id: id, kind: 'published', before: event(), event: event(now), squad: 'U15', academy: 'Synthetic FC',
  child_names: [], recipients: [{ user_id: 'guardian-1', email: 'guardian@example.org' }],
});
const on = (day: number, over: Partial<EventFields> = {}) =>
  ({ event_date: `2026-11-${String(day).padStart(2, '0')}`, starts_at: `2026-11-${String(day).padStart(2, '0')}T13:00:00Z`, ...over });
const asCancelled = (n: ClaimedNotice): ClaimedNotice => ({ ...n, kind: 'cancelled', before: { ...n.event, status: 'scheduled' }, event: { ...n.event, status: 'cancelled' } });
const MATCH: Partial<EventFields> = { event_type: 'match', title: 'League', opponent: 'Panionios U14', home_away: 'away',
  start_time: '11:00:00', end_time: '12:30:00', meet_time: '10:15:00', venue: 'Nea Smyrni Stadium', kit: 'White' };

describe('TRAK-135: the email a family reads when an event is published', () => {
  it('one event: what the coach did, then when, where and when to arrive', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1')])!;
    expect(email.subject).toBe('New training on Wed 14 Oct');
    expect(email.text).toBe([
      'Your coach has added a training session.',
      '',
      'U15 training',
      'Wednesday 14 October, 17:00 – 18:30',
      'Academy Pitch 2',
      'Please arrive by 16:45',
      '',
      `If your child can't make it, tap "Can't make it" in Trak so the coach knows.`,
      'See the full schedule: https://trakfootball.com',
      '',
      'You get this email because you or your child is in this squad on Trak.',
      '',
      'Questions about this event? Ask your coach or academy.',
      'Questions about the app? Email support@trakfootball.com',
    ].join('\n'));
    expect(emailProblem(email)).toBeNull();
  });

  it('a plain "Training" goes unnamed: the opener already says it', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1', { title: 'Training' })])!;
    expect(email.text).toContain('Your coach has added a training session.\n\nWednesday 14 October, 17:00 – 18:30\n');
  });

  it('a series published at once is one email listing every date, in order', () => {
    const email = composeEventEmail('guardian@example.org', [
      published('n-2', { event_date: '2026-10-21', starts_at: '2026-10-21T13:00:00Z' }),
      published('n-1'),
      published('n-3', { event_date: '2026-10-28', starts_at: '2026-10-28T13:00:00Z' }),
    ])!;
    expect(email.subject).toBe('3 new trainings on Trak');
    expect(email.text).toContain('Your coach has added 3 trainings to the schedule.\n\n');
    const days = [...email.text.matchAll(/^(\w{3} \d+ \w{3}), /gm)].map(m => m[1]);
    expect(days).toEqual(['Wed 14 Oct', 'Wed 21 Oct', 'Wed 28 Oct']);
    expect(email.text).toContain(`If your child can't make it to any of these, tap`);
    expect(email.text).toContain('Questions about these events?');
  });

  it('edited within the 15 s window: the final state, never "old → new"', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1', { start_time: '18:00:00', end_time: '19:30:00', venue: 'Pitch 4' })])!;
    expect(email.text).toContain('Wednesday 14 October, 18:00 – 19:30\nPitch 4\n');
    expect(email.text).not.toMatch(/→|CHANGED|Academy Pitch 2/);
  });

  it('cancelled within the 15 s window: families never heard of it, so nothing is sent', () => {
    expect(eventChange(published('n-1', { status: 'cancelled' }))).toBeNull();
    expect(composeEventEmail('guardian@example.org', [published('n-1', { status: 'cancelled' })])).toBeNull();
  });

  it('with a cancellation in the same send: one email, the cancellation first', () => {
    const cancelled: ClaimedNotice = { ...published('n-2', { status: 'cancelled', event_date: '2026-10-15', starts_at: '2026-10-15T13:00:00Z' }), kind: 'cancelled' };
    const email = composeEventEmail('guardian@example.org', [published('n-1'), cancelled])!;
    expect(email.subject).toBe('2 schedule changes on Trak');
    const cancelledAt = email.text.indexOf('Your coach has CANCELLED a training session.');
    const addedAt = email.text.indexOf('Your coach has added a training session.');
    expect(cancelledAt).toBeGreaterThanOrEqual(0);
    expect(addedAt).toBeGreaterThan(cancelledAt);
  });

  it('no child names: a venue naming a squad child is left out', () => {
    const email = composeEventEmail('guardian@example.org', [{ ...published('n-1', { venue: "Sam Synthetic's garden" }), child_names: ['Sam Synthetic'] }])!;
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Sam/);
    expect(email.text).toContain('Wednesday 14 October, 17:00 – 18:30\nPlease arrive by 16:45\n');
  });
});

describe('TRAK-190: Kostas\'s wording, 20 Oct', () => {
  it('a match: named as the app names it, with its kit', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1', { ...MATCH, event_date: '2026-10-25', starts_at: '2026-10-25T07:00:00Z' })])!;
    expect(email.subject).toBe('New match on Sun 25 Oct');
    expect(email.text).toContain([
      'Your coach has added a match.', '', 'Match vs Panionios U14 (away)', 'Sunday 25 October, 11:00 – 12:30',
      'Nea Smyrni Stadium', 'Please arrive by 10:15', 'Kit: White', '',
    ].join('\n'));
  });

  it('kit only on a match, and never one naming a squad child', () => {
    expect(composeEventEmail('guardian@example.org', [published('n-1', { kit: 'Bibs' })])!.text).not.toContain('Kit:');
    const named = composeEventEmail('guardian@example.org', [{ ...published('n-1', { ...MATCH, kit: "Sam's spare kit" }), child_names: ['Sam Synthetic'] }])!;
    expect(named.text).not.toMatch(/Kit:|Sam/);
  });

  it('5 listed, then "...and N more"; the subject keeps the whole count', () => {
    const email = composeEventEmail('guardian@example.org', Array.from({ length: 25 }, (_, i) => published(`n-${i}`, on(i + 1))))!;
    expect(email.subject).toBe('25 new trainings on Trak');
    expect(email.text).toContain('Your coach has added 25 trainings to the schedule.');
    expect([...email.text.matchAll(/^(\w{3} \d+ \w{3}), /gm)].map(m => m[1])).toEqual(['Sun 1 Nov', 'Mon 2 Nov', 'Tue 3 Nov', 'Wed 4 Nov', 'Thu 5 Nov']);
    expect(email.text).toContain('Thu 5 Nov, 17:00 – 18:30\nAcademy Pitch 2\nPlease arrive by 16:45\n\n...and 20 more. See them all in Trak.\n\n');
    const five = composeEventEmail('guardian@example.org', Array.from({ length: 5 }, (_, i) => published(`n-${i}`, on(i + 1))))!;
    expect(five.text).not.toContain('more. See them all');
  });

  it('mixed kinds of event: "events", and each one labelled', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1', on(1, { title: 'Training' })), published('n-2', on(2, MATCH))])!;
    expect(email.subject).toBe('2 new events on Trak');
    expect(email.text).toContain('Your coach has added 2 events to the schedule.\n\nTraining\nSun 1 Nov, 17:00 – 18:30\n');
    expect(email.text).toContain('\n\nMatch vs Panionios U14 (away)\nMon 2 Nov, 11:00 – 12:30\n');
  });

  it('cancelled: no "Can\'t make it", arrival or kit; one shared reason said once, after the events', () => {
    const notices = [1, 2, 3].map(d => asCancelled(published(`n-${d}`, on(d, { cancel_reason: 'Pitch closed for repairs' }))));
    const email = composeEventEmail('guardian@example.org', notices)!;
    expect(email.subject).toBe('3 trainings cancelled on Trak');
    expect(email.text).toContain('Your coach has CANCELLED 3 trainings.');
    expect(email.text.match(/Reason:/g)).toHaveLength(1);
    expect(email.text).toContain('Tue 3 Nov, 17:00 – 18:30\nAcademy Pitch 2\n\nReason: Pitch closed for repairs\n\nSee the full schedule');
    expect(email.text).not.toMatch(/Can't make it|Please arrive|Kit:/);
    const different = composeEventEmail('guardian@example.org', [
      asCancelled(published('n-1', on(1, { cancel_reason: 'Rain' }))), asCancelled(published('n-2', on(2, { cancel_reason: 'Holiday' }))),
    ])!;
    expect(different.text).toContain('Sun 1 Nov, 17:00 – 18:30\nAcademy Pitch 2\nReason: Rain\n');
    expect(different.text).toContain('Mon 2 Nov, 17:00 – 18:30\nAcademy Pitch 2\nReason: Holiday\n');
  });
});

describe('TRAK-135: sending a publish', () => {
  const deps = () => {
    const calls = { sent: [] as PlainEmail[], finished: [] as unknown[][] };
    const d = {
      recordDelivery: vi.fn(async () => {}),
      finish: vi.fn(async (...args: unknown[]) => { calls.finished.push(args); }),
      send: vi.fn(async (m: PlainEmail) => { calls.sent.push(m); return { sent: true as const, id: `email-${calls.sent.length}` }; }),
      sleep: vi.fn(async () => {}),
      now: () => 0,
    } as unknown as EventEmailDependencies;
    return { d, calls };
  };

  it('a series: one email per person, and every notice finished as sent', async () => {
    const { d, calls } = deps();
    await deliver([published('n-1'), published('n-2', { event_date: '2026-10-21', starts_at: '2026-10-21T13:00:00Z' })], d,
      { notices: 0, emails: 0, failed: 0 });
    expect(calls.sent.map(m => m.subject)).toEqual(['2 new trainings on Trak']);
    expect(calls.finished).toEqual([['n-1', 'sent', 0, null], ['n-2', 'sent', 0, null]]);
  });

  it('cancelled inside the window: no email, finished as nothing to send', async () => {
    const { d, calls } = deps();
    await deliver([published('n-1', { status: 'cancelled' })], d, { notices: 0, emails: 0, failed: 0 });
    expect(calls.sent).toEqual([]);
    expect(calls.finished).toEqual([['n-1', 'nothing_to_send', 0, null]]);
  });
});
