import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MobileShell } from '@/components/trak'
import { PitchArt, ProgrammeArt } from '@/components/library/LibraryArt'
import { LIBRARY_PATH, SESSIONS, libraryOf, libraryOrder, searchLibrary, sessionPath, titleParts, type LibrarySession } from '@/lib/library/library'
import { Chip, ProgrammeRow, SearchIcon, SessionRow } from './parts'
import { useBack } from './useBack'

/* TRAK-264: searching the Library, as the catalogue did: every word must be in
   the session somewhere (its name, aims, skills or kit). Results come as the
   coach types. The Drills chip with nothing typed lists every session. */

type Show = 'all' | 'drills' | 'programmes'
const SHOWS: [Show, string][] = [['all', 'All'], ['drills', 'Drills'], ['programmes', 'Programmes']]
const PAGE = 30

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const show = (SHOWS.find(([value]) => value === params.get('show'))?.[0] ?? 'all') as Show
  const [limit, setLimit] = useState(PAGE)
  const back = useBack(LIBRARY_PATH)
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    setParams(next, { replace: true })
    setLimit(PAGE)
  }

  const found = query.trim() ? searchLibrary(query)
    : show === 'all' ? [] : [...SESSIONS].sort(libraryOrder)
  const shown = found.filter(s => show === 'all' || (show === 'programmes') === s.is_programme)
  const top = query.trim() && show === 'all' ? shown[0] : undefined
  const programmes = shown.filter(s => s.is_programme && s !== top)
  const sessions = shown.filter(s => !s.is_programme && s !== top)

  return (
    <MobileShell width="wide">
      <div className="pt-3.5 pb-36 tablet:pt-7 laptop:pt-8">
        <div className="flex items-center gap-2.5">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[8px] border-2 border-ink px-3.5 text-ink laptop:max-w-[560px]" style={{ background: 'rgb(var(--t-surface))' }}>
            <SearchIcon />
            <span className="sr-only">Search the Library</span>
            {/* The coach tapped the search box to get here, so the keyboard opens. */}
            <input type="search" autoFocus value={query} onChange={e => set({ q: e.target.value })}
              placeholder="Sessions, skills or kit" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3" />
          </label>
          <button type="button" onClick={back} className="flex h-11 flex-none items-center px-1 text-[15px] font-medium text-ink">Cancel</button>
        </div>
        <div className="mt-3 flex gap-2">
          {SHOWS.map(([value, text]) => (
            <Chip key={value} pressed={show === value} onClick={() => set({ show: value === 'all' ? null : value })}>{text}</Chip>
          ))}
        </div>

        {!query.trim() && show === 'all' && (
          <p className="mt-6 text-[15px] text-ink-2">Type a skill, a session's name or a piece of kit: pressing, 1v1, rondo, mini-goals.</p>
        )}
        {query.trim() && shown.length === 0 && (
          <p role="status" className="mt-6 text-[15px] text-ink">No sessions match “{query.trim()}”.</p>
        )}

        {top && <>
          <h2 className="mt-5 mb-2.5 text-[20px] font-bold text-ink">Top result</h2>
          <TopResult session={top} />
        </>}
        {sessions.length > 0 && <>
          <h2 className="mt-6 mb-1.5 text-[20px] font-bold text-ink">Sessions</h2>
          <div className="grid gap-1 tablet:grid-cols-2 tablet:gap-x-2">
            {sessions.slice(0, limit).map(s => <SessionRow key={s.id} session={s} />)}
          </div>
          {sessions.length > limit && (
            <button type="button" onClick={() => setLimit(n => n + PAGE)}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-full border border-line text-[14px] font-medium text-ink tablet:max-w-[360px]">
              Show {Math.min(PAGE, sessions.length - limit)} more
            </button>
          )}
        </>}
        {programmes.length > 0 && <>
          <h2 className="mt-6 mb-1.5 text-[20px] font-bold text-ink">Programmes</h2>
          <div className="grid gap-1 tablet:grid-cols-2 tablet:gap-x-2">
            {programmes.map(p => <ProgrammeRow key={p.id} programme={p} showLibrary />)}
          </div>
        </>}
      </div>
    </MobileShell>
  )
}

function TopResult({ session }: { session: LibrarySession }) {
  const library = libraryOf(session)
  return (
    <Link to={sessionPath(session)} className="flex flex-col gap-3.5 rounded-[8px] bg-raised p-4 tablet:max-w-[480px]">
      {session.is_programme ? <ProgrammeArt colour={library.colour} size={92} /> : <PitchArt seed={session.id} colour={library.colour} size={92} />}
      <span className="flex flex-col gap-1">
        <span className="text-[24px] font-bold leading-tight text-ink">{titleParts(session).title}</span>
        <span className="flex items-center gap-2 text-[14px] text-ink-2">
          <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-semibold text-surface">{session.is_programme ? 'Programme' : 'Session'}</span>
          {library.label}
        </span>
      </span>
    </Link>
  )
}
