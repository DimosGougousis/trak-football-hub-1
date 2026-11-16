import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MobileShell, NavBar } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { useFamilyLook } from '@/components/trak/FamilyFrame'
import { Avatar } from '@/components/arc/avatar/avatar'
import { TeamTraining } from '@/components/player/TeamTraining'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from '@/lib/i18n'
import { TRAINING_THEMES, type TrainingTheme } from '@/lib/training-theme'

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
  const look = useFamilyLook()
  const [params, setParams] = useSearchParams()
  const page = PAGES.find(p => p.id === params.get('page')) ?? PAGES[0]
  // New event's theme link: the catalogue opens on that library.
  const lib = page.id === 'sessions' ? params.get('lib') : null

  // TRAK-441 slice 7, behind family_look: the tab opens on Team training and the libraries; a library opens the catalogue.
  if (look && role === 'player' && !params.has('page') && !params.has('lib')) return <FamilyTrainings />

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
                // In the family look the bare address is the Trainings page, so the catalogue keeps its own.
                onClick={() => setParams(p.id === PAGES[0].id && !look ? {} : { page: p.id }, { replace: true })}
                className="min-h-11 rounded-xl border text-[13px] font-medium transition-colors"
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
        // TRAK-199: beside a coach's laptop side menu there is no bottom bar, so the frame runs to the bottom (index.css).
        className="trak-trainings-frame block w-full h-[calc(100dvh-186px)] border-0 bg-surface"
      />

      {/* TRAK-254: "+ Create" in a coach's side menu on a laptop. */}
      {role === 'coach' && <QuickAdd sideMenuOnly />}
      <NavBar role={role} activeTab={`/${role}/trainings`} onNavigate={navigate} />
    </div>
  )
}

/** Each library's word: the coach's theme words, with the mockup's short ones where those run to two lines. */
const LIBRARY_WORD = {
  technical: 'coachSchedule:themeTechnical', defending: 'coachSchedule:themeDefending', attacking: 'coachSchedule:themeAttacking',
  goalkeeping: 'coachSchedule:themeGoalkeeping', transition: 'coachSchedule:themeTransition',
  physical: 'common:cataloguePhysical', psychological: 'common:cataloguePsychological',
} as const satisfies Record<TrainingTheme, string>
const LIBRARIES = [...TRAINING_THEMES].sort((a, b) => b.sessions - a.sessions)
const ALL_SESSIONS = TRAINING_THEMES.reduce((sum, theme) => sum + theme.sessions, 0)

/** TRAK-441 slice 7 (mockup, 12 Nov): Team training (moved from Sessions), then the catalogue's libraries as the coach's
 *  cards. "Set for you" waits until a coach can set one. A phone: the avatar and the tab's name; a laptop: the top bar's. */
function FamilyTrainings() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const cards: [word: string, search: string, count: number][] = [
    [t('common:allSessions'), `?page=${PAGES[0].id}`, ALL_SESSIONS],
    ...LIBRARIES.map(theme => [t(LIBRARY_WORD[theme.key]), `?${new URLSearchParams({ lib: theme.library })}`, theme.sessions] as [string, string, number]),
  ]
  return <MobileShell width="wide">
    <div className="arc pt-3 pb-28 laptop:pt-6">
      <header className="flex items-center gap-3 pb-4 pt-1 laptop:hidden">
        <Avatar name={profile?.full_name ?? ''} size="md" />
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">{t('nav:trainings')}</h1>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 laptop:grid-cols-2 laptop:items-start laptop:gap-8">
        {user && <TeamTraining childId={user.id} />}
        <section aria-labelledby="catalogue">
          <h2 id="catalogue" className="mb-2 text-lg font-medium text-ink">{t('common:catalogue')}</h2>
          <ul className="grid grid-cols-2 gap-4">{cards.map(([word, search, count]) => <li key={search}>
            <Link to={{ search }} className="flex h-full items-baseline justify-between gap-2 rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-brand laptop:p-6">
              <span className="text-[15px] font-medium text-ink">{word}</span>
              <span className="text-sm text-ink-3 tabular-nums">{count}</span>
            </Link>
          </li>)}</ul>
        </section>
      </div>
    </div>
    <NavBar role="player" activeTab="/player/trainings" onNavigate={navigate} />
  </MobileShell>
}
