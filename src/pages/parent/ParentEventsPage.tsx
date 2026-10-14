import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MobileShell, NavBar } from '@/components/trak'
import { ParentChildSelector, ParentFamilyContent } from '@/components/parent/ParentFamily'
import { ParentUpcomingEvents } from '@/components/parent/ParentEvents'

/** The calendar entry point shows the selected child's events (TRAK-171). */
export default function ParentEventsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <MobileShell>
      <div className="pt-3 pb-4">
        <Link to="/parent/home" className="inline-flex min-h-11 items-center text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary">Back to home</Link>
        <h1 className="text-xl text-foreground mb-5">Events</h1>
        <ParentChildSelector />
        <ParentFamilyContent><ParentUpcomingEvents /></ParentFamilyContent>
      </div>
      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
