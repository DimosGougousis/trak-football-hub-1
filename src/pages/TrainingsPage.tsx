import { useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar } from '@/components/trak'

/* The two training pages are static HTML in public/trainings, kept exactly as
   designed (white, their own fonts and scripts). vercel.json lets only
   /trainings/* run inline scripts and be framed, and only by this site.
   Unlike the rest of the app, the frame is not held to the 430px phone
   column: on a tablet or desktop it spans the whole window. */
const PAGES = [
  { id: 'sessions', tab: 'Coaching sessions', title: 'Coaching Session Catalogue', src: '/trainings/coaching-session-catalogue.html' },
  { id: 'play-it-right', tab: 'Play It Right', title: 'Play It Right', src: '/trainings/play-it-right.html' },
] as const

export default function TrainingsPage({ role }: { role: 'coach' | 'player' }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = PAGES.find(p => p.id === params.get('page')) ?? PAGES[0]
  // New event's theme link: the catalogue opens on that library.
  const lib = page.id === 'sessions' ? params.get('lib') : null

  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className="mx-auto w-full max-w-[760px] px-5 pt-3 pb-3 border-b border-line grid gap-3">
        <h1
          className="text-[16px] font-medium text-ink tracking-tight text-center"
          style={{ fontFamily: 'var(--t-font)' }}
        >
          Trainings
        </h1>
        <div role="tablist" aria-label="Training pages" className="grid grid-cols-2 gap-2">
          {PAGES.map(p => {
            const selected = p.id === page.id
            return (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setParams(p.id === PAGES[0].id ? {} : { page: p.id }, { replace: true })}
                className="min-h-11 rounded-[10px] border text-[13px] font-medium transition-colors"
                style={{
                  fontFamily: 'var(--t-font)',
                  background: selected ? 'rgb(var(--t-brand) / 0.06)' : 'rgb(var(--t-raised))',
                  borderColor: selected ? 'rgb(var(--t-brand))' : 'rgb(var(--t-line))',
                  color: selected ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-2))',
                }}
              >
                {p.tab}
              </button>
            )
          })}
        </div>
      </div>

      <iframe
        key={page.id}
        title={page.title}
        src={lib ? `${page.src}?${new URLSearchParams({ lib })}` : page.src}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        // TRAK-199: beside a coach's laptop rail there is no bottom bar, so the frame runs to the bottom (index.css).
        className="trak-trainings-frame block w-full h-[calc(100dvh-186px)] border-0 bg-surface"
      />

      <NavBar role={role} activeTab={`/${role}/trainings`} onNavigate={navigate} />
    </div>
  )
}
