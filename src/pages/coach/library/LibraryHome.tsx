import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { LIBRARIES, LIBRARY_PATH, SESSIONS, libraryPath } from '@/lib/library/library'
import { ON_LIBRARY, ON_LIBRARY_RING } from '@/lib/fixed-colours'
import { LibraryChips, PlayItRightRow, SearchBox } from './parts'

/* TRAK-264: the Library's first page, from the Spotify mockups' Search screen:
   a search box, three chips, a coloured tile per library, then Play It Right. */

const h2 = 'mb-3 text-[20px] font-bold text-ink tablet:mb-3.5 tablet:text-[24px] laptop:text-[26px]'

export default function LibraryHome() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  // Old links still land: New event's theme link was ?lib=<the catalogue's name>, and Play It Right was ?page=play-it-right.
  const asked = LIBRARIES.find(l => l.name === params.get('lib'))
  if (asked) return <Navigate to={libraryPath(asked.key)} replace />
  if (params.get('page') === 'play-it-right') return <Navigate to={`${LIBRARY_PATH}/play-it-right`} replace />

  return (
    <MobileShell width="wide">
      <div className="pt-3.5 pb-36 tablet:pt-7 laptop:pt-8">
        <div className="flex items-center gap-3">
          <CoachMenuButton name={profile?.full_name || 'Coach'} />
          <h1 className="text-[28px] font-bold tracking-[-0.01em] text-ink tablet:text-[34px] laptop:text-[36px]">Library</h1>
        </div>
        <SearchBox />
        <LibraryChips />

        <h2 className={`mt-6 tablet:mt-8 ${h2}`}>Browse drills</h2>
        <ul className="grid grid-cols-2 gap-2.5 tablet:grid-cols-4 tablet:gap-3 laptop:gap-4">
          {LIBRARIES.map(library => (
            <li key={library.key}>
              <Link to={libraryPath(library.key)}
                className="relative flex h-24 flex-col justify-between overflow-hidden rounded-[8px] p-3 tablet:h-[132px] tablet:rounded-[10px] tablet:p-4 laptop:h-[150px] laptop:p-[18px]"
                style={{ background: library.colour, color: ON_LIBRARY }}>
                <span className="text-[17px] font-bold leading-[1.15] tablet:text-[18px] laptop:text-[24px]">{library.label}</span>
                <span className="text-[12px] font-medium">{SESSIONS.filter(s => s.library === library.name).length} sessions</span>
                <span aria-hidden className="absolute -right-3.5 -bottom-3.5 h-16 w-16 rounded-full border-2 tablet:-right-5 tablet:-bottom-5 tablet:h-[92px] tablet:w-[92px] laptop:-right-6 laptop:-bottom-6 laptop:h-[110px] laptop:w-[110px]"
                  style={{ borderColor: ON_LIBRARY_RING }} />
              </Link>
            </li>
          ))}
        </ul>

        <h2 className={`mt-6 tablet:mt-8 ${h2}`}>The academy's way</h2>
        <PlayItRightRow />
      </div>
    </MobileShell>
  )
}
