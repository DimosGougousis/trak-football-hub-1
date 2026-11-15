// TRAK-136 (J8.13): the reminder 2 days before. Pure, so tests pin exactly
// what a family reads. TRAK-243 (Kostas's wording, 21 Oct): one email per
// event, laid out like the new-event email (TRAK-190): "Coming up: <name>.",
// then when, where, arrive by and kit. Informative, never pushy (Fabra 2023).
// The subject is generic. Coach-typed text has its links replaced and is left
// out if it names a child in the squad, as in the change emails. No
// unsubscribe link: Microsoft's scanner would click it (TRAK-107); reminders
// are turned off in Settings.
import { namePatterns } from './ical-feed.ts';
import {
  IN_THIS_SQUAD, SEE_SCHEDULE, cantMakeIt, clean, emailEventName, kindLabel, longDay, namedAlone, shortDay,
  spaced, timeRange, whoToAsk, type EventFields,
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

/** "match vs Panionios U14 (away)", "training", or the name the coach gave it, as typed. */
function comingUp(e: ReminderEvent, names: RegExp[]): string {
  if (!namedAlone(e, names)) return 'training.';
  const name = emailEventName(e, names);
  // Trak's own words go lower case after "Coming up:"; a coach's title stays as typed.
  const own = e.event_type === 'match' && e.opponent && name.startsWith('Match vs ')
    || name === kindLabel(e);
  const said = own ? name[0].toLowerCase() + name.slice(1) : name;
  return /[.!?]$/.test(said) ? said : `${said}.`;
}

function composeOne(reminder: ClaimedReminder, e: ReminderEvent): PlainEmail {
  const names = namePatterns(e.child_names ?? []);
  const venue = clean(e.venue, names);
  const meet = hhmm(e.meet_time);
  // Kit is for matches only (J8.4).
  const kit = e.event_type === 'match' ? clean(e.kit, names) : '';
  const details = [
    `${longDay(reminder.day)}, ${spaced(timeRange(e))}`,
    ...(venue ? [venue] : []),
    ...(meet ? [`Please arrive by ${meet}`] : []),
    ...(kit ? [`Kit: ${kit}`] : []),
  ];
  const text = [
    `Coming up: ${comingUp(e, names)}`,
    details.join('\n'),
    [cantMakeIt(false), SEE_SCHEDULE].join('\n'),
    'Turn these reminders off in Trak: Settings → Notifications.',
    IN_THIS_SQUAD,
    whoToAsk(false),
  ].join('\n\n');
  return { to: reminder.email, subject: `${kindLabel(e)} reminder on ${shortDay(reminder.day)}`, text };
}

/** The scheduled events, earliest first: a cancellation since the claim drops out. */
export const remindable = (events: ReminderEvent[]) => events
  .filter(e => e.status === 'scheduled')
  .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));

/** One person's reminders for one day: an email per event (Kostas, 21 Oct), none when nothing is left. */
export function composeReminderEmails(reminder: ClaimedReminder): { eventId: string; email: PlainEmail }[] {
  return remindable(reminder.events).map(e => ({ eventId: e.id, email: composeOne(reminder, e) }));
}
