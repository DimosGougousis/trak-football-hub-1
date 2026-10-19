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

  return (
    <div className="min-h-screen bg-[#0A0A0B] pb-24">
      <div className="mx-auto w-full max-w-[760px] px-5 pt-3 pb-3 border-b border-white/[0.07] grid gap-3">
        <h1
          className="text-[16px] font-medium text-white/88 tracking-tight text-center"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
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
                  fontFamily: "'DM Sans', sans-serif",
                  background: selected ? 'rgba(200,242,90,0.06)' : '#17171A',
                  borderColor: selected ? '#C8F25A' : 'rgba(255,255,255,0.11)',
                  color: selected ? '#C8F25A' : 'rgba(255,255,255,0.7)',
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
        src={page.src}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="block w-full border-0 bg-white"
        style={{ height: 'calc(100dvh - 186px)' }}
      />

      <NavBar role={role} activeTab={`/${role}/trainings`} onNavigate={navigate} />
    </div>
  )
}
