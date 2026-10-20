import { ClubHeader, Pill } from '@/components/club/ClubShell'

/** A failed or pending count is unknown, not an empty academy. */
export function AcademyDashboardHeader({ club, coaches }: { club: string; coaches: number | null }) {
  if (coaches !== null) return <ClubHeader club={club} coaches={coaches} />
  return (
    <div className="mb-6">
      <h1 style={{ fontFamily: 'var(--t-font)', fontWeight: 300, fontSize: 28, color: 'rgb(var(--t-ink))' }}>
        {club}
      </h1>
      <div className="mt-3 flex gap-2">
        <Pill label="Pilot Active" accent />
        <Pill label="— Coaches" />
      </div>
    </div>
  )
}
