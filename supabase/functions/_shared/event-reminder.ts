// TRAK-136 (J8.13): the wording of the reminder 2 days before. Pure, so tests
// pin exactly what a family reads. One email per person per day, listing every
// event that day across their children, in time order: what, when (and meet
// time), where, and kit for a match. Informative, never pushy (Fabra 2023).
// The subject is generic. Coach-typed text has its links replaced and is left
// out if it names a child in the squad, as in the change emails. No
// unsubscribe link: Microsoft's scanner would click it (TRAK-107); reminders
// are turned off in Settings.
import { namePatterns } from './ical-feed.ts';
import {
  TRAK_URL, WHO_TO_ASK, clean, eventName, kindLabel, longDay, shortDay, timeRange, type EventFields,
} from './event-email.ts';
import type { PlainEmail } from './send-email.ts';

/** One event in a claimed reminder (claim_event_reminders()). */
export interface ReminderEvent extends EventFields {
  id: string;
  kit: string | null;
  squad: string | null;
  academy: string | null;
  child_names: string[];
}
/** One person's reminder for one day. */
export interface ClaimedReminder {
  user_id: string;
  email: string;
  /** YYYY-MM-DD on the academy's clock (TRAK-175). */
  day: string;
  events: ReminderEvent[];
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function block(e: ReminderEvent): string {
  const names = namePatterns(e.child_names ?? []);
  const squad = [clean(e.squad, names), clean(e.academy, names)].filter(Boolean).join(', ');
  const meet = hhmm(e.meet_time);
  const lines = [
    squad ? `${eventName(e, names)} · ${squad}` : eventName(e, names),
    `${timeRange(e)}${meet ? ` · meet ${meet}` : ''}`,
  ];
  const venue = clean(e.venue, names);
  if (venue) lines.push(`Venue: ${venue}`);
  // Kit is for matches only (J8.4).
  const kit = e.event_type === 'match' ? clean(e.kit, names) : '';
  if (kit) lines.push(`Kit: ${kit}`);
  return lines.join('\n');
}

/** The scheduled events, earliest first: a cancellation since the claim drops out. */
export const remindable = (events: ReminderEvent[]) => events
  .filter(e => e.status === 'scheduled')
  .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));

/** The reminder for one person and day, or null when nothing is left to remind. */
export function composeReminderEmail(reminder: ClaimedReminder): PlainEmail | null {
  const events = remindable(reminder.events);
  if (!events.length) return null;
  const subject = events.length === 1
    ? `Reminder: ${kindLabel(events[0])} on ${shortDay(reminder.day)}`
    : `Reminder: ${events.length} events on ${shortDay(reminder.day)}`;
  const text = [
    `Coming up on ${longDay(reminder.day)}:`,
    ...events.map(block),
    `See the full schedule in Trak: ${TRAK_URL}`,
    'Turn these reminders off in Trak: Settings → Notifications.',
    WHO_TO_ASK,
  ].join('\n\n');
  return { to: reminder.email, subject, text };
}
