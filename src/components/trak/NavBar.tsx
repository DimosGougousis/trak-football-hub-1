import { forwardRef } from 'react'
import type { Role } from '@/lib/types'
import {
  IconHome,
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
}

export const NavBar = forwardRef<HTMLElement, NavBarProps>(
  function NavBar({ role, activeTab, onNavigate }, ref) {
    const items = getNavItems(role)
    return (
      <nav
      ref={ref}
      className="fixed bottom-0 w-full max-w-[430px] mx-auto left-1/2 -translate-x-1/2 flex justify-around items-center px-4 py-2 border-t border-line z-50"
      style={{
        background: 'rgb(var(--t-ground) / 0.96)',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        willChange: 'auto',
      }}
    >
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
            <span
              style={{
                fontFamily: 'var(--t-font-mono)',
                fontWeight: 500,
                fontSize: '9px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: isActive ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))',
              }}
            >
              {item.label}
            </span>
            {isActive && (
              <span
                className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
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
