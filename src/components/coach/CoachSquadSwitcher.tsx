import { ChevronDown } from 'lucide-react'
import { HomeTitle } from '@/components/trak/HomeHeader'
import { useCoachSquad } from '@/lib/coach-squad'

/**
 * TRAK-176: the centre of the coach's Home header. One squad: the coach's
 * name, as before. Two or more: a squad picker, as a parent picks a child; a
 * native select, so a phone opens its own wheel.
 */
export function CoachSquadSwitcher({ coachId, name }: { coachId: string | undefined; name: string }) {
  const { squads, squad, setSquad } = useCoachSquad(coachId)
  if (!squad || squads.length < 2) return <HomeTitle>{name}</HomeTitle>
  return (
    <label className="relative inline-flex min-w-0 items-center">
      <span className="sr-only">Squad</span>
      <select value={squad} onChange={e => setSquad(e.target.value)}
        className="appearance-none bg-transparent pr-6 text-[19px] font-semibold text-foreground/90 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
        style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.02em' }}>
        {squads.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-0 text-foreground/60" />
    </label>
  )
}
