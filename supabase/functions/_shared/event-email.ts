// TRAK-135 (J8.12): the wording of a cancellation, change or publish email,
// in Kostas's words (TRAK-190, 20 Oct). Pure, so tests pin exactly what a
// family reads. Plain text for a phone: what the coach did, then each event's
// day, time, venue, meet time and kit (for a change, what moved, old → new).
// No child names, no notes, and no link but the plain trakfootball.com page.
// Coach-typed text (title, venue, opponent, cancel reason) has its links
// replaced, because sendPlainEmail() refuses a whole email over one Google
// Maps link, and is left out if it names a child in the squad (the calendar
// feed's check, J8 check 6). The subject is never coach-typed (Imad, 10 Oct).
import { namePatterns } from './ical-feed.ts';
import { LINK, type PlainEmail } from './send-email.ts';

/** The event fields an email talks about (trak_private.event_email_fields). */
export interface EventFields {
  title: string | null;
  event_type: string | null;
  opponent: string | null;
  home_away: string | null;
  status: string | null;
  starts_at: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  meet_time: string | null;
  venue: string | null;
  cancel_reason: string | null;
  /** TRAK-190: matches say the kit. Optional: notices queued before 20 Oct don't carry it. */
  kit?: string | null;
}
export interface EventRecipient { user_id: string; email: string }
/** One claimed notice, as claim_event_change_notices() returns it. */
export interface ClaimedNotice {
  notice_id: string;
  kind: 'cancelled' | 'changed' | 'published';
  before: EventFields;
  event: EventFields;
  squad: string | null;
  academy: string | null;
  /** Every child on the coach's squad rows: coach-typed text naming one is left out. */
  child_names: string[];
  recipients: EventRecipient[];
}

export const LINK_PLACEHOLDER = '(link in the Trak app)';
export const TRAK_URL = 'https://trakfootball.com';
/** Imad, 10 Oct: no Reply-To; event questions go to the coach, app questions to Trak.
 *  The reminder email's footer; the event emails use Kostas's (TRAK-190) in composeEventEmail. */
export const WHO_TO_ASK = 'Questions about this event? Ask your coach/academy. '
  + 'Feedback or questions about the app? Send us an email at support@trakfootball.com';
const SUBJECT_MAX = 150;

/** Coach-typed text, safe to send: links replaced, one line, trimmed. */
export function withoutLinks(text: string | null | undefined): string {
  return (text ?? '').replace(LINK, LINK_PLACEHOLDER).replace(/\s+/g, ' ').trim();
}

/** Coach-typed text for the email, or '' when it names a child in the squad. */
export function clean(text: string | null | undefined, names: RegExp[]): string {
  const safe = withoutLinks(text);
  return names.some(p => p.test(safe)) ? '' : safe;
}

/** The cancel reason, or null: left out whole if it names a child or carries a link (Imad, 10 Oct). */
function cancelReason(e: EventFields, names: RegExp[]): string | null {
  const reason = (e.cancel_reason ?? '').replace(/\s+/g, ' ').trim();
  if (!reason || (reason.match(LINK) ?? []).length || names.some(p => p.test(reason))) return null;
  return reason;
}

// Dubai is UTC+4 all year (no daylight saving), so an instant's Dubai date
// and time are a fixed shift. Only the oldest rows lack event_date/start_time,
// and they all predate any non-Dubai academy (TRAK-175): every event since has
// event_date + start_time on its academy's clock, which the email prints as is.
const DUBAI_MS = 4 * 60 * 60 * 1000;
function dubaiParts(startsAt: string | null): { date: string | null; time: string | null } {
  const at = startsAt ? Date.parse(startsAt) : NaN;
  if (!Number.isFinite(at)) return { date: null, time: null };
  const iso = new Date(at + DUBAI_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
const eventDate = (e: EventFields) => e.event_date ?? dubaiParts(e.starts_at).date;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const startTime = (e: EventFields) => hhmm(e.start_time) ?? (e.event_date ? null : dubaiParts(e.starts_at).time);

function dayName(date: string | null, style: 'long' | 'short'): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date to be confirmed';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: style, day: 'numeric', month: style, timeZone: 'UTC',
  });
}
/** "Wednesday 14 October" */
export const longDay = (date: string | null) => dayName(date, 'long');
/** "Wed 14 Oct" */
export const shortDay = (date: string | null) => dayName(date, 'short');

/** The event emails' own spacing (Kostas, TRAK-190): "18:00 – 19:30". Reminders keep timeRange's. */
const spaced = (range: string) => range.replace('–', ' – ');

/** "17:00–18:30", "17:00" or "time to be confirmed". */
export function timeRange(e: EventFields): string {
  const start = startTime(e);
  const end = hhmm(e.end_time);
  if (!start) return 'time to be confirmed';
  return end ? `${start}–${end}` : start;
}

const KIND_LABEL: Record<string, string> = { training: 'Training', match: 'Match', tournament: 'Tournament' };
/** What kind of event it is: the subject's only word about it. */
export const kindLabel = (e: EventFields) => KIND_LABEL[e.event_type ?? ''] ?? 'Event';

/** What the event is called: the coach's title, or what kind of event it is. */
export function eventName(e: EventFields, names: RegExp[] = []): string {
  const title = clean(e.title, names);
  if (title) return title;
  if (e.event_type === 'match') {
    const opponent = clean(e.opponent, names);
    return opponent ? `Match vs ${opponent}` : 'Match';
  }
  return kindLabel(e);
}

export type EventChange = { what: 'cancelled' } | { what: 'changed'; lines: string[] } | { what: 'published' };

/**
 * What families need to hear, from the event as they last saw it to now, or
 * null when nothing they'd notice changed (edits that cancelled out).
 */
export function eventChange(notice: Pick<ClaimedNotice, 'before' | 'event'> & { kind?: ClaimedNotice['kind']; child_names?: string[] }): EventChange | null {
  const { before, event } = notice;
  // TRAK-135: newly published. Families never saw the draft, so no "old → new";
  // cancelled inside the 15 s window, they never heard of it: nothing to send.
  if (notice.kind === 'published') return event.status === 'scheduled' ? { what: 'published' } : null;
  const names = namePatterns(notice.child_names ?? []);
  if (event.status === 'cancelled') return before.status === 'cancelled' ? null : { what: 'cancelled' };
  if (event.status !== 'scheduled' || before.status !== 'scheduled') return null;

  const lines: string[] = [];
  const was = { date: eventDate(before), time: timeRange(before) };
  const now = { date: eventDate(event), time: timeRange(event) };
  if (was.date !== now.date) lines.push(`Date: ${shortDay(was.date)} → ${shortDay(now.date)}`);
  if (was.time !== now.time) lines.push(`Time: ${spaced(was.time)} → ${spaced(now.time)}`);
  const meetWas = hhmm(before.meet_time);
  const meetNow = hhmm(event.meet_time);
  if (meetWas !== meetNow) lines.push(`Meet: ${meetWas ?? 'not set'} → ${meetNow ?? 'not set'}`);
  // Compared as typed; shown only if it names no child.
  const venue = (e: EventFields) => clean(e.venue, names) || (withoutLinks(e.venue) ? 'see the Trak app' : 'not set');
  if (withoutLinks(before.venue) !== withoutLinks(event.venue)) lines.push(`Venue: ${venue(before)} → ${venue(event)}`);
  return lines.length ? { what: 'changed', lines } : null;
}

// ── Kostas's wording (TRAK-190, 20 Oct) ─────────────────────────────────────

/** What a family is told an event is, the way the app names it: "Match vs Panionios U14 (away)". */
function emailEventName(e: EventFields, names: RegExp[]): string {
  if (e.event_type === 'match') {
    const opponent = clean(e.opponent, names);
    const side = e.home_away === 'home' || e.home_away === 'away' ? ` (${e.home_away})` : '';
    if (opponent) return `Match vs ${opponent}${side}`;
  }
  return clean(e.title, names) || kindLabel(e);
}

/** One email about one event names it only when the opener doesn't already: a plain "Training" goes unnamed. */
function namedAlone(e: EventFields, names: RegExp[]): boolean {
  if (e.event_type !== 'training') return true;
  const title = clean(e.title, names);
  return !!title && title.toLowerCase() !== 'training';
}

const NOUN: Record<string, { one: string; word: string; many: string }> = {
  training: { one: 'a training session', word: 'training', many: 'trainings' },
  match: { one: 'a match', word: 'match', many: 'matches' },
  tournament: { one: 'a tournament', word: 'tournament', many: 'tournaments' },
};
const noun = (e: EventFields) => NOUN[e.event_type ?? ''] ?? { one: 'an event', word: 'event', many: 'events' };
/** "trainings" when every event is one, else "events". */
const plural = (events: EventFields[]) => {
  const kinds = new Set(events.map(e => noun(e).many));
  return kinds.size === 1 ? [...kinds][0] : 'events';
};

const VERB = { published: 'added', cancelled: 'CANCELLED', changed: 'CHANGED' } as const;

type Item = { notice: ClaimedNotice; change: EventChange };

/** One event: its name (when it needs one), day and time, venue, then what to bring and when to arrive. */
function block({ notice, change }: Item, inList: boolean, sharedReason: boolean): string {
  const e = notice.event;
  const names = namePatterns(notice.child_names ?? []);
  const venue = clean(e.venue, names);
  const meet = hhmm(e.meet_time);
  const kit = e.event_type === 'match' ? clean(e.kit, names) : '';
  const reason = change.what === 'cancelled' && !sharedReason ? cancelReason(e, names) : null;
  const day = inList ? shortDay(eventDate(e)) : longDay(eventDate(e));
  const now = [
    `${day}, ${spaced(timeRange(e))}`,
    ...(venue ? [venue] : []),
    ...(change.what !== 'cancelled' && meet ? [`Please arrive by ${meet}`] : []),
    ...(change.what !== 'cancelled' && kit ? [`Kit: ${kit}`] : []),
    ...(reason ? [`Reason: ${reason}`] : []),
  ];
  const name = inList || namedAlone(e, names) ? [emailEventName(e, names)] : [];
  if (change.what !== 'changed') return [...name, ...now].join('\n');
  return [...name, 'What changed:', ...change.lines, '', ...now].join('\n');
}

const MAX_LISTED = 5;

const oneLine = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > SUBJECT_MAX ? `${line.slice(0, SUBJECT_MAX - 1).trimEnd()}…` : line;
};

/**
 * One email to one person, covering every notice they're owed in this send
 * (a series cancelled at once is one email, not six). Notices with nothing
 * to say are left out; null when none is left. Kostas (TRAK-190): the first 5
 * events are listed, then "...and N more"; the subject keeps the whole count.
 */
export function composeEventEmail(to: string, notices: ClaimedNotice[]): PlainEmail | null {
  const items = notices
    .map(notice => ({ notice, change: eventChange(notice) }))
    .filter((item): item is Item => item.change !== null)
    .sort((a, b) => (eventDate(a.notice.event) ?? '').localeCompare(eventDate(b.notice.event) ?? ''));
  if (!items.length) return null;

  const single = items.length === 1;
  // One section per thing the coach did, most urgent first; one section when it's all the same.
  const sections = (['cancelled', 'changed', 'published'] as const)
    .map(what => ({ what, items: items.filter(item => item.change.what === what) }))
    .filter(section => section.items.length);

  let subject: string;
  if (single) {
    // Generic, never coach-typed: a subject shows on lock screens and in previews.
    const { notice, change } = items[0];
    const day = shortDay(eventDate(notice.event));
    subject = change.what === 'published'
      ? `New ${noun(notice.event).word} on ${day}`
      : `${kindLabel(notice.event)} ${change.what} on ${day}`;
  } else if (sections.length === 1) {
    const { what } = sections[0];
    const kinds = plural(items.map(item => item.notice.event));
    subject = what === 'published' ? `${items.length} new ${kinds} on Trak` : `${items.length} ${kinds} ${what} on Trak`;
  } else {
    subject = `${items.length} schedule changes on Trak`;
  }

  let room = MAX_LISTED;
  const body = sections.flatMap(({ what, items: these }) => {
    const shown = these.slice(0, Math.max(room, 0));
    room -= shown.length;
    if (!shown.length) return [];
    const events = these.map(item => item.notice.event);
    const opener = these.length === 1
      ? `Your coach has ${VERB[what]} ${noun(events[0]).one}.`
      : `Your coach has ${VERB[what]} ${these.length} ${plural(events)}${what === 'published' ? ' to the schedule' : ''}.`;
    // Several cancelled for one reason: said once, after them (Kostas, 20 Oct).
    const reasons = what === 'cancelled' && these.length > 1
      ? these.map(item => cancelReason(item.notice.event, namePatterns(item.notice.child_names ?? []))) : [];
    const shared = reasons.length && reasons[0] && reasons.every(r => r === reasons[0]) ? reasons[0] : null;
    return [opener, ...shown.map(item => block(item, !single, !!shared)), ...(shared ? [`Reason: ${shared}`] : [])];
  });
  const hidden = items.length - Math.min(items.length, MAX_LISTED);

  const attending = items.some(item => item.change.what !== 'cancelled');
  const canMakeIt = attending
    ? [`If your child can't make it${single ? '' : ' to any of these'}, tap "Can't make it" in Trak so the coach knows.`] : [];
  const text = [
    ...body,
    ...(hidden ? [`...and ${hidden} more. See them all in Trak.`] : []),
    [...canMakeIt, `See the full schedule: ${TRAK_URL}`].join('\n'),
    'You get this email because you or your child is in this squad on Trak.',
    `Questions about ${single ? 'this event' : 'these events'}? Ask your coach or academy.\nQuestions about the app? Email support@trakfootball.com`,
  ].join('\n\n');
  return { to, subject: oneLine(subject), text };
}
