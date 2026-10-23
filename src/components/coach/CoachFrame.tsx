import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, House, Settings, Users } from 'lucide-react'
import { PitchIcon } from '@/components/icons/PitchIcon'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from '@/components/arc/avatar/avatar'
import { SidebarRail, type RailEntry } from '@/components/arc/blocks/sidebar-rail/sidebar-rail'
import { GlassTabBar } from '@/components/arc/glass-tabbar/glass-tabbar'
import { CoachAlertsBell } from '@/components/coach/CoachAlertsBell'
import { CoachCreate } from '@/components/coach/QuickAdd'
import { CoachFrameContext, useCoachFrame, type CoachFrame as Frame } from '@/components/coach/coach-frame-context'
import { useCoachSquad } from '@/lib/coach-squad'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { BARLESS, COACH_SCREEN_PATH, placeOf, type CoachScreen } from '@/lib/coach-places'

/* TRAK-259 (Imad, 22 Oct): the coach's frame, around every coach page.
   Laptop: Arc's sidebar rail (the club, Home, Calendar, Squads, Library, then
   Settings and the coach), with the bell and "+ Create" at the top right.
   Phone and tablet: Arc's glass tab bar (Home, Squad, Library) with the "+"
   at its right; the coach's avatar on a page opens the same sidebar as a
   sheet. Feedback and Profile left the nav; their pages still open. */

type Screen = CoachScreen
const TO = COACH_SCREEN_PATH

/** The club's name and the coach's role, as Home's quiet line and Settings read them. */
function useCoachIdentity(userId: string | undefined) {
  return useQuery({
    queryKey: ['coach', userId, 'identity'],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('coach_details').select('coach_role, team, organization_id').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      const org = data?.organization_id
        ? (await supabase.from('organizations').select('name').eq('id', data.organization_id).maybeSingle()).data
        : null
      return { role: data?.coach_role ?? null, team: data?.team ?? null, club: (org as { name?: string } | null)?.name ?? null }
    },
  })
}

export function CoachFrame() {
  const { user, profile } = useAuth()
  if (profile?.role !== 'coach' || !user) return <Outlet />
  return <Framed userId={user.id} name={profile.full_name || 'Coach'} />
}

function Framed({ userId, name }: { userId: string; name: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const wide = useSideMenuScreen()
  const coachSquad = useCoachSquad(userId)
  const identity = useCoachIdentity(userId).data
  const [sheetOpen, setSheetOpen] = useState(false)
  const listeners = useRef(new Set<() => void>())
  const { screen, title } = placeOf(pathname)

  const frame = useMemo<Frame>(() => ({
    openMenu: () => setSheetOpen(true),
    subscribeSaved: listener => { listeners.current.add(listener); return () => { listeners.current.delete(listener) } },
  }), [])
  const saved = useCallback(() => listeners.current.forEach(listener => listener()), [])

  // Fixed bars on a laptop page (Assess's Back and Next) centre on the page beside the sidebar: --rail-w is its width.
  const setRail = useCallback((width: number) => document.documentElement.style.setProperty('--rail-w', `${width}px`), [])
  useEffect(() => { if (!wide) document.documentElement.style.removeProperty('--rail-w') }, [wide])
  useEffect(() => () => { document.documentElement.style.removeProperty('--rail-w') }, [])

  const many = coachSquad.squads.length > 1
  const items: RailEntry[] = [
    { id: 'home', label: 'Home', icon: House },
    { id: 'calendar', label: 'Schedule', icon: CalendarDays }, // TRAK-255: the coach's is called Schedule
    many
      ? { id: 'squads', label: 'Squads', icon: Users, children: coachSquad.squads.map(squad => ({ id: `squad:${squad}`, label: squad })) }
      : { id: 'squad', label: 'Squad', icon: Users },
    // TRAK-265: Imad's pitch icon.
    { id: 'library', label: 'Library', icon: PitchIcon },
  ]
  const active = screen === 'squad' && many && coachSquad.squad ? `squad:${coachSquad.squad}` : screen ?? ''
  const select = (id: string) => {
    if (id.startsWith('squad:')) { coachSquad.setSquad(id.slice(6)); navigate(TO.squad); return }
    if (id in TO) navigate(TO[id as Screen])
  }
  const club = identity?.club || 'Your academy'

  return <CoachFrameContext.Provider value={frame}>
    <SidebarRail label={club} title={title} narrow={!wide} sheetOpen={sheetOpen} onSheetOpenChange={setSheetOpen} onWidthChange={setRail}
      brand={{ name: club, logo: <Avatar name={club} size="sm" /> }}
      items={items} footerItem={{ id: 'settings', label: 'Settings', icon: Settings }}
      profile={{ name, detail: identity?.role ?? undefined, avatar: <Avatar name={name} size="sm" /> }}
      active={active} onSelect={select} defaultOpen={{ squads: true }}
      actions={<><CoachAlertsBell coachId={userId} /><CoachCreate placement="top" onSaved={saved} /></>}>
      <Outlet />
    </SidebarRail>
    {!wide && !BARLESS.test(pathname) && <div className="arc fixed inset-x-0 z-50 px-3 pointer-events-none" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      <GlassTabBar label="Coach" value={screen ?? ''} onValueChange={value => navigate(TO[value as Screen])}
        style={{ ['--glass-active' as string]: 'rgb(var(--t-brand))' }}
        items={[
          { value: 'home', label: 'Home', icon: <House /> },
          { value: 'squad', label: 'Squad', icon: <Users /> },
          { value: 'library', label: 'Library', icon: <PitchIcon /> },
        ]}
        actionNode={<CoachCreate placement="bar" onSaved={saved} />} />
    </div>}
  </CoachFrameContext.Provider>
}

/** The coach's avatar at the top left of a phone page: it opens the side menu. A laptop has the sidebar instead. */
export function CoachMenuButton({ name }: { name: string }) {
  const wide = useSideMenuScreen()
  const frame = useCoachFrame()
  if (wide || !frame) return null
  return <button type="button" onClick={frame.openMenu} aria-label="Open menu" aria-haspopup="dialog"
    className="arc flex-none rounded-full transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    <Avatar name={name} size="md" />
  </button>
}
