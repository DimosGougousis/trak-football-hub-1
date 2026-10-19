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
// (supabase/tests/event_publish_emails.sql). The wording is the change email's
// factual format until Kostas writes TRAK-190.

const event = (over: Partial<EventFields> = {}): EventFields => ({
  title: 'U15 training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-10-14T13:00:00Z', event_date: '2026-10-14', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: '16:45:00', venue: 'Academy Pitch 2', cancel_reason: null, ...over,
});
// A published notice's "before" is the draft, which families never saw.
const published = (id: string, now: Partial<EventFields> = {}): ClaimedNotice => ({
  notice_id: id, kind: 'published', before: event(), event: event(now), squad: 'U15', academy: 'Synthetic FC',
  child_names: [], recipients: [{ user_id: 'guardian-1', email: 'guardian@example.org' }],
});

describe('TRAK-135: the email a family reads when an event is published', () => {
  it('one event: what, when, meet, where and the squad', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1')])!;
    expect(email.subject).toBe('Training added: Wed 14 Oct');
    expect(email.text).toContain([
      'NEW: U15 training',
      'When: Wednesday 14 October, 17:00–18:30 at Academy Pitch 2',
      'Meet: 16:45',
      'Squad: U15, Synthetic FC',
    ].join('\n'));
    expect(emailProblem(email)).toBeNull();
  });

  it('a series published at once is one email listing every date, in order', () => {
    const email = composeEventEmail('guardian@example.org', [
      published('n-2', { event_date: '2026-10-21', starts_at: '2026-10-21T13:00:00Z' }),
      published('n-1'),
      published('n-3', { event_date: '2026-10-28', starts_at: '2026-10-28T13:00:00Z' }),
    ])!;
    expect(email.subject).toBe('3 events added');
    const days = [...email.text.matchAll(/When: (\w+ \d+ \w+)/g)].map(m => m[1]);
    expect(days).toEqual(['Wednesday 14 October', 'Wednesday 21 October', 'Wednesday 28 October']);
  });

  it('edited within the 15 s window: the final state, never "old → new"', () => {
    const email = composeEventEmail('guardian@example.org', [published('n-1', { start_time: '18:00:00', end_time: '19:30:00', venue: 'Pitch 4' })])!;
    expect(email.text).toContain('When: Wednesday 14 October, 18:00–19:30 at Pitch 4');
    expect(email.text).not.toMatch(/→|CHANGED|Academy Pitch 2/);
  });

  it('cancelled within the 15 s window: families never heard of it, so nothing is sent', () => {
    expect(eventChange(published('n-1', { status: 'cancelled' }))).toBeNull();
    expect(composeEventEmail('guardian@example.org', [published('n-1', { status: 'cancelled' })])).toBeNull();
  });

  it('with a cancellation in the same send: one email, both in it', () => {
    const cancelled: ClaimedNotice = { ...published('n-2', { status: 'cancelled', event_date: '2026-10-15', starts_at: '2026-10-15T13:00:00Z' }), kind: 'cancelled' };
    const email = composeEventEmail('guardian@example.org', [published('n-1'), cancelled])!;
    expect(email.subject).toBe('2 schedule changes');
    expect(email.text).toContain('NEW: U15 training');
    expect(email.text).toContain('CANCELLED: U15 training');
  });

  it('no child names: a venue naming a squad child is left out', () => {
    const email = composeEventEmail('guardian@example.org', [{ ...published('n-1', { venue: "Sam Synthetic's garden" }), child_names: ['Sam Synthetic'] }])!;
    expect(`${email.subject}\n${email.text}`).not.toMatch(/Sam/);
    expect(email.text).toContain('When: Wednesday 14 October, 17:00–18:30\n');
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
    expect(calls.sent.map(m => m.subject)).toEqual(['2 events added']);
    expect(calls.finished).toEqual([['n-1', 'sent', 0, null], ['n-2', 'sent', 0, null]]);
  });

  it('cancelled inside the window: no email, finished as nothing to send', async () => {
    const { d, calls } = deps();
    await deliver([published('n-1', { status: 'cancelled' })], d, { notices: 0, emails: 0, failed: 0 });
    expect(calls.sent).toEqual([]);
    expect(calls.finished).toEqual([['n-1', 'nothing_to_send', 0, null]]);
  });
});
