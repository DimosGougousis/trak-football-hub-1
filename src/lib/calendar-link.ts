import { supabase, SUPABASE_FUNCTIONS_URL } from '@/integrations/supabase/client'

/**
 * TRAK-133 (J8.10): "Add Trak to my calendar" in one tap.
 *
 * The feed is TRAK-132's calendar-feed Edge Function. A person has one
 * personal link, and its token is returned only when it is made
 * (create_my_calendar_link revokes the previous one). So a link is made only
 * when the person taps an app, never when a screen opens, and one link serves
 * every app they tap in that visit.
 */

export type CalendarApp = 'apple' | 'google' | 'outlook'

export const CALENDAR_APP_LABEL: Record<CalendarApp, string> = {
  apple: 'Apple Calendar',
  google: 'Google Calendar',
  outlook: 'Outlook',
}

export interface FeedLinks {
  /** iPhone, iPad and Mac: the Calendar app's subscribe prompt. */
  apple: string
  /** Google Calendar's subscribe prompt (calendar.google.com/calendar/render?cid=). */
  google: string
  /** Outlook.com's "add from the web" prompt. */
  outlook: string
  /** The same for work or school accounts (Microsoft 365). */
  outlookWork: string
  /** The plain https link, to paste into any other calendar. */
  copy: string
}

export function feedLinks(token: string): FeedLinks {
  const copy = `${SUPABASE_FUNCTIONS_URL}/calendar-feed/${token}.ics`
  const webcal = copy.replace(/^https?:\/\//, 'webcal://')
  const feed = encodeURIComponent(webcal)
  return {
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${feed}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${feed}&name=Trak`,
    outlookWork: `https://outlook.office.com/calendar/0/addfromweb?url=${feed}&name=Trak`,
    copy,
  }
}

/** All three apps, the device's own calendar first. */
export function calendarApps(userAgent: string): CalendarApp[] {
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return ['apple', 'google', 'outlook']
  if (/Windows/i.test(userAgent)) return ['outlook', 'google', 'apple']
  return ['google', 'apple', 'outlook']
}

/** Makes the person's personal link, revoking any previous one. Returns the token. */
export async function createCalendarLink(): Promise<string> {
  const { data, error } = await supabase.rpc('create_my_calendar_link')
  if (error || typeof data !== 'string' || !data) throw error ?? new Error('no calendar link')
  return data
}

/** Stops the person's personal link: every calendar using it gets nothing on its next refresh. */
export async function revokeCalendarLink(): Promise<void> {
  const { error } = await supabase.rpc('revoke_my_calendar_link')
  if (error) throw error
}

export interface CalendarLinkStatus { createdAt: string; lastFetchedAt: string | null }

/** The live personal link's dates, or null when there is none. Never the token. */
export async function fetchCalendarLink(): Promise<CalendarLinkStatus | null> {
  const { data, error } = await supabase.rpc('my_calendar_link')
  if (error) throw error
  const row = (data ?? [])[0] as { created_at: string; last_fetched_at: string | null } | undefined
  return row ? { createdAt: row.created_at, lastFetchedAt: row.last_fetched_at } : null
}

export interface CalendarHandoff {
  /** Sends the person to `url`. False when the browser blocked the new tab. */
  go: (url: string) => boolean
  /** Nothing to open after all (the link couldn't be made). */
  cancel: () => void
}

/**
 * Hands the link to the phone. Apple's webcal:// link opens the Calendar
 * app's subscribe prompt and leaves the page where it is. TRAK-228: Google's
 * and Outlook's prompts are web pages, so they open in a tab of their own and
 * Trak stays open. Call this in the tap itself: the tab is opened now, before
 * the personal link exists, because a browser blocks a tab opened after that
 * wait. It is pointed at the page once the link is made.
 */
export function startCalendarHandoff(web: boolean): CalendarHandoff {
  if (!web) return { go: url => { window.location.assign(url); return true }, cancel: () => {} }
  const tab = window.open('', '_blank')
  // The calendar's page must not be able to reach back into Trak.
  if (tab) tab.opener = null
  return {
    go: url => {
      if (!tab || tab.closed) return false
      tab.location.href = url
      return true
    },
    cancel: () => { tab?.close() },
  }
}
