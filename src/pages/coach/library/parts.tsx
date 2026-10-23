import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PitchArt, ProgrammeArt } from '@/components/library/LibraryArt'
import { useBack } from './useBack'
import { ON_LIBRARY, ON_LIBRARY_BUTTON, ON_TINT_BUTTON } from '@/lib/fixed-colours'
import {
  LIBRARY_PATH, factsLine, kitItem, libraryOf, programmeOf, programmeWeeks, sessionLine, sessionPath, titleParts, weekOf,
  type LibrarySession,
} from '@/lib/library/library'

/* TRAK-264: pieces the Library's screens share. */

const icon = (size: number, children: ReactNode, strokeWidth = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none">{children}</svg>
)
export const SearchIcon = ({ size = 22 }: { size?: number }) => icon(size, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)
export const ChevronRight = ({ size = 20 }: { size?: number }) => icon(size, <path d="m9 6 6 6-6 6" />)
export const ChevronLeft = ({ size = 22 }: { size?: number }) => icon(size, <path d="m15 6-6 6 6 6" />, 2.2)
export const CloseIcon = ({ size = 16 }: { size?: number }) => icon(size, <path d="M6 6l12 12M18 6 6 18" />, 2.4)
const PitchIcon = ({ size = 26 }: { size?: number }) => icon(size, <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.5" /></>, 1.8)

/** The round Back button at the top of a page: on a coloured header (`onColour`) or a pale one. */
export function BackButton({ fallback, label, onColour = false }: { fallback: string; label: string; onColour?: boolean }) {
  const back = useBack(fallback)
  return (
    <button type="button" onClick={back} aria-label={label}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ background: onColour ? ON_LIBRARY_BUTTON : ON_TINT_BUTTON, color: onColour ? ON_LIBRARY : 'rgb(var(--t-ink))' }}>
      <ChevronLeft />
    </button>
  )
}

const chipClass = 'flex h-8 flex-none items-center rounded-full px-3.5 text-[14px] laptop:h-[34px] laptop:px-4'

/** A filter chip. On, it turns green with a round × in front, and tapping it clears it.
 *  `pressed` is one choice of a few (All · Drills · Programmes): green, no ×. */
export function Chip({ to, onClick, on = false, pressed, label, children }: {
  to?: string; onClick?: () => void; on?: boolean; pressed?: boolean; label?: string; children: ReactNode
}) {
  const style = on || pressed ? { background: 'rgb(var(--t-brand))', color: 'rgb(var(--t-on-brand))' } : { background: 'rgb(var(--t-raised))', color: 'rgb(var(--t-ink))' }
  const inner = on ? <>
    <span className="mr-1.5 -ml-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: 'rgb(var(--t-on-brand) / 0.22)' }}><CloseIcon size={12} /></span>
    {children}
  </> : children
  return to
    ? <Link to={to} aria-label={label} className={chipClass} style={style}>{inner}</Link>
    : <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed ?? on} className={chipClass} style={style}>{inner}</button>
}

/** Drills · Programmes · Play It Right, under the Library's search box. */
export function LibraryChips({ programmesOn = false }: { programmesOn?: boolean }) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {programmesOn && <Chip to={LIBRARY_PATH} on label="Programmes, tap to clear">Programmes</Chip>}
      <Chip to={`${LIBRARY_PATH}/search?show=drills`}>Drills</Chip>
      {!programmesOn && <Chip to={`${LIBRARY_PATH}/programmes`}>Programmes</Chip>}
      <Chip to={`${LIBRARY_PATH}/play-it-right`}>Play It Right</Chip>
    </div>
  )
}

/** The Library's search box: a link to the search screen, which has the real box. */
export function SearchBox({ placeholder = 'Search drills' }: { placeholder?: string }) {
  return (
    <Link to={`${LIBRARY_PATH}/search`}
      className="mt-4 flex h-12 items-center gap-2.5 rounded-[8px] border px-3.5 text-ink laptop:max-w-[560px] laptop:rounded-[10px]"
      style={{ background: 'rgb(var(--t-surface))', borderColor: 'rgb(var(--t-line))' }}>
      <SearchIcon />
      <span className="text-[16px] text-ink-3">{placeholder}</span>
    </Link>
  )
}

/** Play It Right, as a row: the academy's way. */
export function PlayItRightRow() {
  return (
    <Link to={`${LIBRARY_PATH}/play-it-right`}
      className="flex h-16 items-center gap-3 overflow-hidden rounded-[8px] pr-3.5 tablet:h-20 tablet:gap-4 laptop:h-24"
      style={{ background: 'rgb(var(--t-raised))' }}>
      <span className="flex h-16 w-16 flex-none items-center justify-center text-on-brand tablet:h-20 tablet:w-20 laptop:h-24 laptop:w-24" style={{ background: 'rgb(var(--t-brand))' }}>
        <PitchIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold text-ink tablet:text-[18px]">Play It Right</span>
        <span className="text-[13px] text-ink-2 tablet:text-[15px]">Match moments from the code of conduct</span>
      </span>
      <span className="text-ink-3"><ChevronRight /></span>
    </Link>
  )
}

/** A session in a list: its picture, its short name and one supporting line. It opens the
 *  session's page, or, given `onSelect` (a laptop's list), shows it beside the list. */
export function SessionRow({ session, onSelect, selected = false }: { session: LibrarySession; onSelect?: () => void; selected?: boolean }) {
  const { title } = titleParts(session)
  const cls = 'flex h-16 w-full min-w-0 items-center gap-3 rounded-[6px] px-2 text-left tablet:h-[68px] tablet:px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  const body = <>
    <PitchArt seed={session.id} colour={libraryOf(session).colour} size={48} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={`truncate text-[16px] font-semibold ${selected ? 'text-brand' : 'text-ink'}`}>{title}</span>
      <span className="truncate text-[13px] text-ink-2">{sessionLine(session)}</span>
    </span>
  </>
  return onSelect
    ? <button type="button" onClick={onSelect} aria-pressed={selected} className={`${cls} ${selected ? '' : 'hover:bg-raised'}`}
        style={selected ? { background: 'rgb(var(--t-raised))', boxShadow: 'inset 3px 0 0 rgb(var(--t-brand))' } : undefined}>{body}</button>
    : <Link to={sessionPath(session)} className={cls}>{body}</Link>
}

/** A six-week programme in a list, as a small album. */
export function ProgrammeRow({ programme, tinted = false, showLibrary = false }: { programme: LibrarySession; tinted?: boolean; showLibrary?: boolean }) {
  const library = libraryOf(programme)
  const line = [showLibrary ? library.label : 'Six-week programme', programme.ages.length === 0 ? 'every age' : '']
  return (
    <Link to={sessionPath(programme)} className="flex h-[72px] min-w-0 items-center gap-3 rounded-[8px] px-2.5"
      style={tinted ? { background: 'rgb(var(--t-raised))' } : undefined}>
      <ProgrammeArt colour={library.colour} size={52} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-semibold leading-tight text-ink">{titleParts(programme).title}</span>
        <span className="truncate text-[13px] text-ink-2">{line.filter(Boolean).join(' · ')}</span>
      </span>
      <span className="text-ink-3"><ChevronRight /></span>
    </Link>
  )
}

/** A session's name block: its small label, its title, its library and topic, and its facts.
 *  The session's page and a laptop's open session both start with it. */
export function SessionHeading({ session, level = 1 }: { session: LibrarySession; level?: 1 | 2 }) {
  const library = libraryOf(session)
  const { label, title } = titleParts(session)
  const Title = level === 1 ? 'h1' : 'h2'
  return (
    <div className="w-full min-w-0 flex-1">
      <p className="text-[13px] text-ink-2 tablet:text-[14px]">{label}</p>
      <Title className={`mt-0.5 font-bold leading-[1.08] tracking-[-0.01em] text-ink ${level === 1 ? 'text-[30px] tablet:text-[42px]' : 'text-[28px] laptop:text-[32px]'}`}>{title}</Title>
      <p className="mt-2 flex items-center gap-2 text-[14px] font-medium text-ink">
        <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: library.colour }} />
        {library.label} · {session.topic.replace('&', 'and')}
      </p>
      <p className="mt-1 text-[14px] text-ink-2">{factsLine(session)}</p>
    </div>
  )
}

/** Everything a session says: what it's about, what players learn, the kit, its skills and its programme.
 *  Every session has its about line and skills, so no session's page is empty. Kostas, 22 Oct: nothing
 *  in the Library sends the coach to another website, so the FA's video, PDF and page aren't linked. */
export function SessionDetail({ session, compact = false }: { session: LibrarySession; compact?: boolean }) {
  const library = libraryOf(session)
  const programme = programmeOf(session)
  const h2 = compact ? 'text-[17px]' : 'text-[20px] tablet:text-[22px]'
  const chip = 'flex h-8 items-center rounded-full px-3 text-[14px] text-ink'
  return (
    <div className="grid gap-6">
      {!session.is_programme && (
        <section>
          <h2 className={`${h2} mb-1.5 font-bold text-ink`}>About this session</h2>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{session.summary}</p>
        </section>
      )}
      <div className={compact ? 'grid gap-6' : 'grid gap-6 tablet:grid-cols-2 tablet:gap-x-8'}>
        <div className="grid content-start gap-6">
          {session.objectives.length > 0 && (
            <section>
              <h2 className={`${h2} mb-2 font-bold text-ink`}>Players will learn to</h2>
              <ul className="grid list-disc gap-1.5 pl-5 text-[15px] leading-snug text-ink">
                {session.objectives.map(item => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}
          {session.setup.length > 0 && (
            <section>
              <h2 className={`${h2} mb-2.5 font-bold text-ink`}>You'll need</h2>
              <ul className="flex flex-wrap gap-2">
                {session.setup.map(item => <li key={item} className={chip} style={{ background: 'rgb(var(--t-raised))' }}>{kitItem(item)}</li>)}
              </ul>
            </section>
          )}
          {session.skills.length > 0 && (
            <section>
              <h2 className={`${h2} mb-2.5 font-bold text-ink`}>Skills</h2>
              <ul className="flex flex-wrap gap-2">
                {session.skills.map(item => <li key={item} className={chip} style={{ background: 'rgb(var(--t-raised))' }}>{item}</li>)}
              </ul>
            </section>
          )}
        </div>
        {programme && (
          <section>
            <h2 className={`${h2} mb-2 font-bold text-ink`}>Part of a six-week programme</h2>
            <Link to={sessionPath(programme)} className="flex h-16 items-center gap-3 rounded-[8px] px-2.5" style={{ background: 'rgb(var(--t-raised))' }}>
              <ProgrammeArt colour={library.colour} size={44} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[16px] font-semibold text-ink">{titleParts(programme).title}</span>
                <span className="text-[13px] text-ink-2">This is week {weekOf(session)} of 6</span>
              </span>
              <span className="text-ink-3"><ChevronRight /></span>
            </Link>
            <WeekList programme={programme} current={session} />
          </section>
        )}
      </div>
      <p className="text-[12px] text-ink-3">From England Football Learning, {session.published}. © The FA</p>
    </div>
  )
}

/** Where a laptop's open item sticks: just under the frame's 60px top bar. */
const STICK = 72

/** On a laptop, Squad's way (TRAK-263, TRAK-267): one card with a narrow list on the left and the open item
 *  wide beside it. The open item stays in view (sticky, under the frame's top bar) however far down the
 *  list the coach picked it; nothing open yet says so, as Squad's "Nobody selected" does. Drills and
 *  Play It Right's match moments both use it. */
export function BesideList<T extends { id: string }>({ label, items, open, row, view, empty }: {
  label: string
  items: T[]
  open?: T
  row: (item: T, selected: boolean) => ReactNode
  view: (item: T) => ReactNode
  empty: { title: string; hint: string }
}) {
  const pane = useRef<HTMLDivElement>(null)
  // Near the end of a long list the open item can only stick as far as the card's bottom, which can
  // push its top under the frame's top bar; then the page moves up just enough to show it whole.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const top = pane.current?.getBoundingClientRect().top ?? STICK
      const page = document.scrollingElement ?? document.documentElement
      if (top < STICK) page.scrollTo({ top: page.scrollTop + top - STICK, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    // No overflow clipping on the card: it would stop the open item from sticking.
    <div className="grid rounded-[14px] border border-line bg-surface" style={{ gridTemplateColumns: 'minmax(280px, 34%) minmax(0, 1fr)' }}>
      <ul aria-label={label} className="grid content-start gap-0.5 border-r border-line p-2">
        {items.map(item => <li key={item.id} className="min-w-0">{row(item, item.id === open?.id)}</li>)}
      </ul>
      <div className="min-w-0">
        <div ref={pane} className="sticky top-[72px] max-h-[calc(100dvh-84px)] overflow-y-auto">
          {open ? view(open) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-1 p-6 text-center">
              <p className="text-[16px] font-semibold text-ink">{empty.title}</p>
              <p className="text-[14px] text-ink-2">{empty.hint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The Close button on a laptop's open item. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close"
      className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <CloseIcon />
    </button>
  )
}

/** A programme's six weeks, numbered like an album's tracks. A week whose session is known opens it. */
export function WeekList({ programme, current }: { programme: LibrarySession; current?: LibrarySession }) {
  return (
    <ol className="mt-1 grid">
      {programmeWeeks(programme).map(({ week, name, session }) => {
        const here = !!session && session.id === current?.id
        const body = <>
          <span className={`w-5 flex-none text-right text-[14px] ${here ? '' : 'text-ink-3'}`}>{week || ''}</span>
          <span className="flex-1">{name}</span>
          {here && <span className="text-[12px] font-semibold">This one</span>}
        </>
        const cls = `flex min-h-11 items-center gap-3.5 px-1 text-[15px] ${here ? 'font-semibold text-brand' : 'text-ink'}`
        return <li key={`${week}-${name}`}>{session && !here ? <Link to={sessionPath(session)} className={cls}>{body}</Link> : <span className={cls}>{body}</span>}</li>
      })}
    </ol>
  )
}
