import { NavLink } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { IconOverview, IconSquad, IconCoaches, IconProfile } from '@/components/icons/TrakIcons'

const tabs = [
  { to: '/club/home',    label: 'Overview', Icon: IconOverview },
  { to: '/club/squads',  label: 'Squads',   Icon: IconSquad    },
  { to: '/club/radar',   label: 'Radar',    Icon: ({ size, color }: { size: number; color: string }) => <TrendingUp size={size} color={color} /> },
  { to: '/club/coaches', label: 'Coaches',  Icon: IconCoaches  },
  { to: '/club/profile', label: 'Profile',  Icon: IconProfile  },
]

export function ClubNavBar() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-ground/95 backdrop-blur"
      style={{ borderTop: '1px solid rgb(var(--t-line))' }}
    >
      <div className="grid grid-cols-5">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex flex-col items-center justify-center gap-1 py-3"
          >
            {({ isActive }) => (
              <>
                <Icon size={20} color={isActive ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))'} />
                <span
                  style={{
                    fontFamily: 'var(--t-font)',
                    fontSize: 11,
                    fontWeight: 400,
                    color: isActive ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))',
                  }}
                >
                  {label}
                </span>
                {isActive && (
                  <span
                    className="absolute top-0 h-0.5 w-10 rounded-full"
                    style={{ background: 'rgb(var(--t-brand))' }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
