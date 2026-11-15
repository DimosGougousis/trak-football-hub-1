import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { useCoachSquad } from '@/lib/coach-squad'
import { SESSIONS, ageLabel, libraryOrder, squadsAgeBand, type LibrarySession } from '@/lib/library/library'
import { LibraryChips, ProgrammeRow, SearchBox } from './parts'

/* TRAK-264: the Programmes chip. The six-week programmes for the coach's age
   group first, then the ones for every age; the rest wait behind a button. */

const group = 'mt-5 mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2'

export default function ProgrammesPage() {
  const { user, profile } = useAuth()
  const coachSquad = useCoachSquad(user?.id)
  const band = squadsAgeBand(coachSquad.squads)
  const [more, setMore] = useState(false)
  const programmes = SESSIONS.filter(s => s.is_programme).sort(libraryOrder)
  const forBand = band ? programmes.filter(p => p.ages.includes(band)) : []
  const everyAge = programmes.filter(p => p.ages.length === 0)
  const rest = programmes.filter(p => !forBand.includes(p) && !everyAge.includes(p))
  const list = (items: LibrarySession[]) => (
    <div className="grid gap-1 tablet:grid-cols-2 tablet:gap-x-2">{items.map(p => <ProgrammeRow key={p.id} programme={p} showLibrary />)}</div>
  )

  return (
    <MobileShell width="wide">
      <div className="pt-3.5 pb-36 tablet:pt-7 laptop:pt-8">
        <div className="flex items-center gap-3">
          <CoachMenuButton name={profile?.full_name || 'Coach'} />
          <h1 className="text-[28px] font-bold tracking-[-0.01em] text-ink tablet:text-[34px] laptop:text-[36px]">Library</h1>
        </div>
        <SearchBox />
        <LibraryChips programmesOn />

        <h2 className="mt-6 text-[20px] font-bold text-ink tablet:text-[24px]">Six-week programmes</h2>
        <p className="mt-1 text-[14px] text-ink-2">One session a week for six weeks. {programmes.length} programmes.</p>

        {band && forBand.length > 0 && <>
          <h3 className={group}>For {ageLabel(band).toLowerCase()}{coachSquad.squads.length ? ` (${coachSquad.squads.join(' and ')})` : ''}</h3>
          {list(forBand)}
        </>}
        {everyAge.length > 0 && <>
          <h3 className={group}>For every age</h3>
          {list(everyAge)}
        </>}
        {rest.length > 0 && (more || !band
          ? <><h3 className={group}>{band ? 'For other ages' : 'By age group'}</h3>{list(rest)}</>
          : <button type="button" onClick={() => setMore(true)}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-full border border-line text-[14px] font-medium text-ink tablet:max-w-[360px]">
              {rest.length} more for other ages
            </button>)}
      </div>
    </MobileShell>
  )
}
