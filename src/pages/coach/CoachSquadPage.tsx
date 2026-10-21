import { useRef, type KeyboardEvent } from 'react'
import { LayoutGroup } from 'motion/react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { Avatar } from '@/components/arc/avatar/avatar'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { NavBar } from '@/components/trak'
import { useAuth } from '@/contexts/AuthContext'
import { useSquadRoster, type SquadRoster } from '@/components/coach/squad/useSquadRoster'
import { SquadLoadError } from '@/components/coach/squad/SquadLoadError'

/* TRAK-250: Squad is a full-width coach workspace with four views of the same
   roster. The tab lives in the URL (?tab=), so a view can be linked and a
   reload keeps it. Every view reads from one shared roster (useSquadRoster). */
const TABS = [
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'availability', label: 'Availability' },
  { id: 'season', label: 'Season' },
] as const
type TabId = typeof TABS[number]['id']

const tabId = (id: TabId) => `squad-tab-${id}`

export default function CoachSquadPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const active: TabId = TABS.find(t => t.id === params.get('tab'))?.id ?? 'snapshot'
  const roster = useSquadRoster()
  const tabs = useRef<HTMLDivElement>(null)

  const choose = (id: TabId) => setParams({ tab: id }, { replace: true })
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex(t => t.id === active)
    const next = e.key === 'ArrowRight' ? (at + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (at + TABS.length - 1) % TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    choose(TABS[next].id)
    tabs.current?.querySelector<HTMLElement>(`#${tabId(TABS[next].id)}`)?.focus()
  }

  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className="mx-auto w-full max-w-[1280px] px-5 md:px-8">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6 pb-4">
          <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Squad</h1>
          <div
            ref={tabs}
            role="tablist"
            aria-label="Squad views"
            onKeyDown={onKeyDown}
            className="order-last md:order-none flex w-full md:w-auto gap-6 overflow-x-auto border-b border-line md:border-b-0"
          >
            {TABS.map(t => {
              const selected = t.id === active
              return (
                <button
                  key={t.id}
                  id={tabId(t.id)}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="squad-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(t.id)}
                  className="min-h-11 -mb-px border-b-2 px-0.5 text-[14px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                  style={{
                    borderColor: selected ? 'rgb(var(--t-brand))' : 'transparent',
                    color: selected ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))',
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          {roster.squad && roster.squads.length >= 2 && (
            <LayoutGroup id="age">
              <div className="arc flex">
                <SegmentedControl label="Squad" value={roster.squad} onValueChange={roster.setSquad}
                  options={roster.squads.map(age => ({ value: age, label: age }))} />
              </div>
            </LayoutGroup>
          )}
          <Avatar name={profile?.full_name || 'Coach'} size="md" className="arc ml-auto" aria-hidden />
        </header>

        <section id="squad-panel" role="tabpanel" aria-labelledby={tabId(active)} tabIndex={-1} className="pb-8 focus:outline-none">
          {roster.error ? <SquadLoadError onRetry={roster.retry} />
            : roster.isPending ? <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading your squad…</p>
            : roster.players.length === 0 ? <PreparingSquad />
            : <Placeholder tab={active} roster={roster} />}
        </section>
      </div>
      <NavBar role="coach" activeTab={location.pathname} onNavigate={navigate} />
    </div>
  )
}

function PreparingSquad() {
  return (
    <div className="flex flex-col items-center text-center pt-14 px-6">
      <div
        className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4"
        style={{ background: 'rgb(var(--t-brand) / 0.08)', border: '1px solid rgb(var(--t-brand) / 0.15)' }}
      >
        <Users size={22} className="text-brand" strokeWidth={1.5} />
      </div>
      <p className="text-[15px] text-ink-2 font-medium mb-1">Your squad is being prepared</p>
      <p className="text-[12px] text-ink-3 leading-relaxed mb-5">Your academy will add players to this squad.</p>
    </div>
  )
}

/** Temporary: each tab's real panel replaces this one by one (TRAK-250 tasks 4-7). */
function Placeholder({ tab, roster }: { tab: TabId; roster: SquadRoster }) {
  return (
    <div className="pt-4">
      <h2 className="sr-only">{TABS.find(t => t.id === tab)?.label}</h2>
      {tab === 'snapshot' && (
        <ul className="space-y-1">
          {roster.players.map(p => <li key={p.id} className="text-[14px] text-ink">{p.player_name}</li>)}
        </ul>
      )}
    </div>
  )
}
