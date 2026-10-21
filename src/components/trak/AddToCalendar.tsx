import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isGuardianCreatedChild } from '@/lib/child-login'
import { relativeLabel } from '@/lib/alert-read-state'
import {
  CALENDAR_APP_LABEL, calendarApps, createCalendarLink, feedLinks, fetchCalendarLink, startCalendarHandoff,
  revokeCalendarLink, type CalendarApp, type FeedLinks,
} from '@/lib/calendar-link'

/* TRAK-133 (J8.10): "Add Trak to my calendar" in one tap: a card on Home
   after setup, and Settings → Calendar. A person's link is shown only once
   and they have one (TRAK-132), so a link is made only on a tap, never when a
   screen opens, and one link serves every app tapped in this visit. */

const font = { fontFamily: 'var(--t-font)' }
// A guardian-created child login has no mailbox, and change emails skip it
// (TRAK-135), so it's never promised one (Kostas, #286).
const howItWorks = (childLogin: boolean) => childLogin
  ? 'Changes reach your calendar automatically. Some calendars take a few hours, so check Trak for same-day changes.'
  : 'Changes reach your calendar automatically. Some calendars take a few hours, so for same-day changes we also email you.'
const LINK_FAILED = "Couldn't make your calendar link. Check your connection and try again."

const statusKey = (userId: string | undefined) => ['calendar-link', userId]

function useCalendarLinkStatus(wanted = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: statusKey(user?.id),
    queryFn: fetchCalendarLink,
    enabled: !!user && wanted,
    networkMode: 'always',
  })
}

/** The buttons, the device's own calendar first. Makes the link on the first tap only. */
function AddToCalendarButtons({ onAdded, compact = false }: { onAdded?: () => void, compact?: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const links = useRef<FeedLinks | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // TRAK-228: the browser blocked the calendar's tab; a link to tap instead.
  const [blocked, setBlocked] = useState<{ url: string; label: string } | null>(null)
  // Compact (the Home card): the device's own calendar, the rest on request.
  const [showOthers, setShowOthers] = useState(!compact)
  const [first, ...others] = calendarApps(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  async function linksForThisVisit(): Promise<FeedLinks | null> {
    if (links.current) return links.current
    try {
      links.current = feedLinks(await createCalendarLink())
      void queryClient.invalidateQueries({ queryKey: statusKey(user?.id) })
      return links.current
    } catch {
      setError(LINK_FAILED)
      return null
    }
  }

  // TRAK-228: Apple's link opens the Calendar app; the others are web pages,
  // opened in their own tab so Trak stays open.
  async function add(pick: (l: FeedLinks) => string, label: string, web: boolean) {
    if (busy) return
    const handoff = startCalendarHandoff(web)
    setBusy(true)
    setError(null)
    setBlocked(null)
    const l = await linksForThisVisit()
    setBusy(false)
    if (!l) { handoff.cancel(); return }
    const url = pick(l)
    if (!handoff.go(url)) { setBlocked({ url, label }); return }
    onAdded?.()
  }

  async function copy() {
    if (busy) return
    setBusy(true)
    setError(null)
    const l = await linksForThisVisit()
    setBusy(false)
    if (!l) return
    try {
      await navigator.clipboard.writeText(l.copy)
      setCopied(true)
      onAdded?.()
    } catch {
      setError("Couldn't copy the link. Try one of the calendar buttons instead.")
    }
  }

  const button = (app: CalendarApp, primary = false) => (
    <button key={app} type="button" disabled={busy} onClick={() => void add(l => l[app], CALENDAR_APP_LABEL[app], app !== 'apple')}
      className="w-full py-3 rounded-[12px] text-[14px] font-medium disabled:opacity-60"
      style={{ ...font, background: primary ? 'rgb(var(--t-brand))' : 'rgb(var(--t-raised))', color: primary ? 'rgb(var(--t-on-brand))' : 'rgb(var(--t-ink))' }}>
      Add to {CALENDAR_APP_LABEL[app]}
    </button>
  )

  return (
    <div className="space-y-2">
      {button(first, true)}
      {!showOthers ? (
        <button type="button" onClick={() => setShowOthers(true)}
          className="w-full py-2 text-[13px] text-ink-2" style={font}>Other calendar</button>
      ) : <>
      <p className="pt-1 text-[11px] text-ink-3" style={font}>Other calendar</p>
      {others.map(app => button(app))}
      <button type="button" disabled={busy} onClick={() => void add(l => l.outlookWork, 'Outlook', true)}
        className="w-full py-2.5 rounded-[12px] text-[13px] disabled:opacity-60"
        style={{ ...font, background: 'rgb(var(--t-raised))', color: 'rgb(var(--t-ink))' }}>
        Add to Outlook (work or school)
      </button>
      <button type="button" disabled={busy} onClick={() => void copy()}
        className="w-full py-2.5 text-[13px] text-ink-2 disabled:opacity-60" style={font}>
        {copied ? 'Link copied' : 'Copy calendar link'}
      </button>
      </>}
      {blocked && <p className="text-[12px] text-ink-2" style={font}>
        Your browser stopped the new tab.{' '}
        <a href={blocked.url} target="_blank" rel="noopener noreferrer" onClick={() => onAdded?.()}
          className="font-medium text-brand underline">Open {blocked.label}</a>
      </p>}
      {error && <p role="alert" className="text-[12px] text-danger" style={font}>{error}</p>}
    </div>
  )
}

/** "Last synced 2h ago", "Last synced yesterday", or that no calendar has asked yet. */
function syncedText(lastFetchedAt: string | null): string {
  if (!lastFetchedAt) return 'Added; no calendar has synced yet'
  const label = relativeLabel(lastFetchedAt)
  if (/^\d+[mh]$/.test(label)) return `Last synced ${label} ago`
  return `Last synced ${label === 'Just now' ? 'just now' : label === 'Yesterday' ? 'yesterday' : label}`
}

/** Settings → Calendar, for players and parents. */
export function CalendarSettings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const status = useCalendarLinkStatus()
  const [revoking, setRevoking] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new set of buttons after "Get a new link": the old visit's link is gone.
  const [visit, setVisit] = useState(0)

  async function newLink() {
    setRevoking(true)
    setError(null)
    try {
      await revokeCalendarLink()
      setRevoked(true)
      setVisit(v => v + 1)
      await queryClient.invalidateQueries({ queryKey: statusKey(user?.id) })
    } catch {
      setError("Couldn't stop your old link. Check your connection and try again.")
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="py-3.5 space-y-3">
      <p className="text-[13px] text-ink" style={font}>
        {status.isPending ? 'Checking…'
          : status.isError ? "Couldn't check your calendar link."
            : status.data ? syncedText(status.data.lastFetchedAt) : 'Not added yet'}
      </p>
      <p className="text-[12px] text-ink-2 leading-relaxed" style={font}>{howItWorks(isGuardianCreatedChild(user))}</p>
      {status.data && !revoked && (
        <p className="text-[12px] text-ink-2 leading-relaxed" style={font}>
          Adding Trak again gives you a new link: calendars you added before stop updating until you add them again.
        </p>
      )}
      {revoked && <p role="status" className="text-[12px] text-ink-2" style={font}>
        Your old link no longer works. Add Trak to your calendars again below.
      </p>}
      <AddToCalendarButtons key={visit} />
      {status.data && (
        <button type="button" disabled={revoking} onClick={() => void newLink()}
          className="w-full py-2.5 text-[13px] disabled:opacity-60" style={{ ...font, color: 'rgb(var(--t-danger))' }}>
          Get a new link
        </button>
      )}
      {error && <p role="alert" className="text-[12px] text-danger" style={font}>{error}</p>}
    </div>
  )
}

const skipKey = (userId: string) => `trak:calendar-prompt-skipped:${userId}`
function readSkipped(userId: string): boolean {
  try { return localStorage.getItem(skipKey(userId)) === '1' } catch { return false }
}
function writeSkipped(userId: string) {
  try { localStorage.setItem(skipKey(userId), '1') } catch { /* storage unavailable */ }
}

/** The card on Home after setup: shown once there are events to see and no calendar added yet. */
export function CalendarHomePrompt({ hasEvents }: { hasEvents: boolean }) {
  const { user } = useAuth()
  const [hidden, setHidden] = useState(() => (user ? readSkipped(user.id) : false))
  // Ask about the link only when the card could show: no request on a Home with no events.
  const status = useCalendarLinkStatus(hasEvents && !hidden)
  // No events yet, a calendar already added, or the read failed: say nothing.
  if (!user || !hasEvents || hidden || !status.isSuccess || status.data) return null

  const hide = () => { writeSkipped(user.id); setHidden(true) }
  return (
    <section aria-label="Add Trak to your calendar" className="rounded-xl border p-4 my-4 space-y-3"
      style={{ borderColor: 'rgb(var(--t-brand) / 0.3)', background: 'rgb(var(--t-brand) / 0.06)' }}>
      <div className="flex items-center gap-2">
        <CalendarPlus size={16} color="rgb(var(--t-brand))" aria-hidden="true" />
        <p className="text-[14px] font-medium text-ink" style={font}>Add Trak to your calendar</p>
      </div>
      <p className="text-[12px] text-ink-2 leading-relaxed" style={font}>{howItWorks(isGuardianCreatedChild(user))}</p>
      <AddToCalendarButtons onAdded={hide} compact />
      <button type="button" onClick={hide} className="w-full py-2 text-[13px] text-ink-2" style={font}>Not now</button>
    </section>
  )
}
