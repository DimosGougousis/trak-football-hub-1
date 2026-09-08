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
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-[#0A0A0B]/95 backdrop-blur"
      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
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
                <Icon size={20} color={isActive ? '#C8F25A' : 'rgba(255,255,255,0.45)'} />
                <span
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    fontWeight: 400,
                    color: isActive ? '#C8F25A' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {label}
                </span>
                {isActive && (
                  <span
                    className="absolute top-0 h-0.5 w-10 rounded-full"
                    style={{ background: '#C8F25A' }}
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
