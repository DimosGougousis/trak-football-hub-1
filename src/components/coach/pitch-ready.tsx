import type { ReactNode } from 'react'

/* The season plan's pitch-ready look (Tarek, 24 Nov, season_plan_pitch_ready_mockup.html), kept in one place so the
   Squad page and a player's page read the same as /coach/season-plan: white cards with a firm border, black headings
   with a coloured bar, chunky buttons, and green "good" / amber "waiting" pills. TRAK-189: every colour is a role token
   (in the light theme `line` is the mockup's slate-300, `ink` and `brand` its slate-900, `raised` its slate-100), so
   the look follows the coach's theme. */
export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
export const CARD = 'rounded-2xl border-2 border-line bg-surface shadow-sm'
export const BTN = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-ink disabled:opacity-50 print:hidden ${FOCUS}`
export const BTN_DARK = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-brand bg-brand px-4 py-2 text-sm font-bold text-on-brand shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-50 print:hidden ${FOCUS}`
export const GOOD = 'inline-flex items-center gap-1 rounded-lg border-2 border-success bg-success/10 px-2.5 py-1 text-xs font-extrabold text-success'
export const WAIT = 'inline-flex items-center gap-1 rounded-lg border-2 border-attention bg-attention/20 px-2.5 py-1 text-xs font-extrabold text-ink'
export const PILL = (on: boolean) => `min-h-[38px] rounded-lg border-2 px-3 py-1.5 text-xs font-extrabold transition-colors ${FOCUS} ${on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:border-ink'}`
/** The squad badge beside a page's title ("U16 · 15 Players"). */
export const BADGE = 'inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-surface px-3 py-1.5 text-xs font-extrabold tracking-tight text-ink sm:text-sm'
/** A block's title inside a page, as SectionHeading draws it (the bar, black capitals), for an h3 or h4 in place. */
export const SECTION_TITLE = "flex items-center gap-2.5 text-sm font-black uppercase tracking-wider text-ink before:h-5 before:w-2 before:shrink-0 before:rounded-sm before:bg-ink before:content-['']"

export function SectionHeading({ id, bar, children }: { id: string; bar: string; children: ReactNode }) {
  return <div className="flex items-center gap-2.5">
    <span aria-hidden="true" className={`h-6 w-2.5 rounded-sm ${bar}`} />
    <h2 id={id} className="text-sm font-black uppercase tracking-wider text-ink sm:text-base">{children}</h2>
  </div>
}
