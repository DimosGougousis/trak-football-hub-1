import { forwardRef } from 'react'
import type { Role } from '@/lib/types'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import {
  IconHome,
  IconCalendar,
  IconLog,
  IconGoals,
  IconRecognition,
  IconProfile,
  IconSquad,
  IconMatch,
  IconTraining,
  IconAssess,
  ACTIVE_COLOR,
  DEFAULT_COLOR,
} from '@/components/icons/TrakIcons'

type IconComponent = (props: { size?: number; color?: string }) => JSX.Element

interface NavItem {
  label: string
  path: string
  Icon: IconComponent
  /** Only in a coach's side menu on a laptop (TRAK-254); a phone reaches it another way. */
  sideMenuOnly?: boolean
}

function getNavItems(role: Role): NavItem[] {
  if (role === 'player') return [
    { label: 'Home', path: '/player/home', Icon: IconHome },
    { label: 'Sessions', path: '/player/matches', Icon: IconMatch },  // TRAK-112: matches and training
    { label: 'Trainings', path: '/player/trainings', Icon: IconTraining },
    { label: 'Card', path: '/player/evolution', Icon: IconRecognition },
    { label: 'Profile', path: '/player/profile', Icon: IconProfile },
  ]
  if (role === 'coach') return [
    { label: 'Home', path: '/coach/home', Icon: IconHome },
    // TRAK-254: on a phone the Schedule is behind Home's calendar icon. TRAK-255: called Schedule.
    { label: 'Schedule', path: '/coach/schedule', Icon: IconCalendar, sideMenuOnly: true },
    { label: 'Squad', path: '/coach/squad', Icon: IconSquad },
    { label: 'Feedback', path: '/coach/feedback', Icon: IconAssess },  // TRAK-211: Feedback and assessment
    // No Sessions tab: Home's "Log a match or training" and the "+" reach it.
    { label: 'Trainings', path: '/coach/trainings', Icon: IconTraining },
    { label: 'Profile', path: '/coach/profile', Icon: IconProfile },
  ]
  return [
    { label: 'Home',    path: '/parent/home',    Icon: IconHome },
    { label: 'Events',  path: '/parent/matches', Icon: IconMatch },
    { label: 'Profile', path: '/parent/profile', Icon: IconProfile },
  ]
}

interface NavBarProps {
  role: Role
  activeTab: string
  onNavigate: (path: string) => void
  /** TRAK-254: a page with no bottom bar on a phone still has the side menu on a laptop. */
  sideMenuOnly?: boolean
}

export const NavBar = forwardRef<HTMLElement, NavBarProps>(
  function NavBar({ role, activeTab, onNavigate, sideMenuOnly = false }, ref) {
    // TRAK-254: a coach on a laptop gets the side menu (index.css): the TRAK name,
    // room for "+ Create" (QuickAdd sits there), and the Calendar.
    const sideMenu = useSideMenuScreen() && role === 'coach'
    const items = getNavItems(role).filter(item => sideMenu || !item.sideMenuOnly)
    if (sideMenuOnly && !sideMenu) return null
    return (
      <nav
      ref={ref}
      // TRAK-199: as wide as a page; TRAK-254: the side menu for a coach on a laptop (index.css).
      className="trak-nav trak-page fixed bottom-0 w-full mx-auto left-1/2 -translate-x-1/2 flex justify-around items-center px-4 py-2 border-t border-line z-50"
      style={{
        background: 'rgb(var(--t-ground) / 0.96)',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        willChange: 'auto',
      }}
    >
      {sideMenu && <>
        <span className="trak-nav-wordmark">TRAK</span>
        <span aria-hidden="true" className="trak-nav-create-slot" />
      </>}
      {items.map(item => {
        // TRAK-186: a tab stays marked on every page under it (Squad → a player).
        const isActive = activeTab === item.path || activeTab.startsWith(`${item.path}/`)
        const Icon = item.Icon
        return (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            aria-current={isActive ? 'page' : undefined}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative"
            style={{
              background: isActive ? 'rgb(var(--t-brand) / 0.06)' : 'transparent',
              minWidth: 52,
            }}
          >
            <Icon size={20} color={isActive ? ACTIVE_COLOR : DEFAULT_COLOR} />
            <span className="trak-nav-label" style={{ color: isActive ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))' }}>
              {item.label}
            </span>
            {isActive && (
              <span
                className="trak-nav-dot absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                style={{ background: 'rgb(var(--t-brand))' }}
              />
            )}
          </button>
        )
      })}
      </nav>
    )
  },
)
