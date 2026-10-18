import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { MobileShell, LoadError, NavBar } from '@/components/trak'
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area'
import { CoachAssessmentCard, type CoachAssessment } from '@/components/coach/CoachAssessmentCard'

type Row = CoachAssessment & { squad_players: { player_name: string; age_group: string | null } | null }

/**
 * TRAK-200 (Imad, 18 Oct): Home's "Player Assessments". Assess player, then the
 * recent assessments as swipe cards (the family carousel's format), each saying
 * Draft or Published, so a draft is found and published from here.
 */
export default function CoachAssessmentsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { inSquad } = useCoachSquad(user?.id)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return
    setFailed(false)
    const { data, error } = await supabase.from('coach_assessments')
      .select('id, created_at, published_at, work_rate, tactical, attitude, technical, physical, coachability, squad_players(player_name, age_group), coach_sessions(title, session_date)')
      .eq('coach_user_id', user.id).order('created_at', { ascending: false }).limit(20)
    if (error) { setFailed(true); return }
    const list = (data ?? []) as unknown as Row[]
    const ids = list.map(r => r.id)
    const [shared, private_] = ids.length ? await Promise.all([
      supabase.from('coach_shared_feedback' as never).select('assessment_id, body').in('assessment_id', ids),
      supabase.from('coach_assessment_notes').select('assessment_id, note').in('assessment_id', ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }]
    if (shared.error || private_.error) { setFailed(true); return }
    setMessages(Object.fromEntries(((shared.data ?? []) as { assessment_id: string; body: string }[]).map(m => [m.assessment_id, m.body])))
    setNotes(Object.fromEntries(((private_.data ?? []) as { assessment_id: string; note: string }[]).map(n => [n.assessment_id, n.note])))
    setRows(list)
  }, [user])
  useEffect(() => { void load() }, [load])

  // TRAK-176: with two squads, the squad picked on Home.
  const cards = (rows ?? []).filter(r => inSquad(r.squad_players?.age_group)).slice(0, 10)
  const move = (next: number) => {
    const index = Math.max(0, Math.min(cards.length - 1, next))
    setActive(index)
    viewport.current?.scrollTo({ left: index * viewport.current.clientWidth, behavior: 'instant' })
  }

  return (
    <MobileShell>
      <div className="pt-3 pb-24 space-y-4">
        <button type="button" onClick={() => { if (location.key !== 'default') navigate(-1); else navigate('/coach/home') }}
          className="inline-flex min-h-11 items-center gap-1 text-[13px] text-muted-foreground rounded-md focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronLeft size={16} aria-hidden="true" /> Home
        </button>
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-foreground">Player Assessments</h1>
        <Link to="/coach/assess"
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-[15px] font-medium focus-visible:ring-2 focus-visible:ring-primary">
          Assess player
        </Link>
        <section aria-label="Recent assessments" className="arc space-y-2">
          <h2 className="text-[13px] font-medium text-muted-foreground">Recent assessments</h2>
          {failed ? <LoadError what="your assessments" onRetry={() => void load()} />
            : rows === null ? <p role="status" className="text-[13px] text-muted-foreground py-2">Loading…</p>
            : !cards.length ? <p className="text-[13px] text-muted-foreground py-2">No assessments yet.</p>
            : <>
              <ScrollArea orientation="horizontal" snap="x mandatory" fade={0} label="Assessment cards"
                viewportRef={viewport} viewportClassName="flex focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                onScroll={event => {
                  const node = event.currentTarget
                  if (node.clientWidth) setActive(Math.max(0, Math.min(cards.length - 1, Math.round(Math.abs(node.scrollLeft) / node.clientWidth))))
                }}>
                {cards.map((row, index) => <div key={row.id} className="min-w-0 px-0.5"
                  style={{ flex: '0 0 100%', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}>
                  <CoachAssessmentCard assessment={row} coachId={user!.id} playerName={row.squad_players?.player_name}
                    message={messages[row.id]} note={notes[row.id]} />
                </div>)}
              </ScrollArea>
              <div className="flex items-center justify-between gap-3">
                <button type="button" aria-label="Previous assessment" disabled={active === 0} onClick={() => move(active - 1)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft size={18} aria-hidden="true" /></button>
                <p className="text-xs text-muted-foreground" aria-live="polite">{active + 1} of {cards.length}</p>
                <button type="button" aria-label="Next assessment" disabled={active === cards.length - 1} onClick={() => move(active + 1)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight size={18} aria-hidden="true" /></button>
              </div>
            </>}
        </section>
      </div>
      <NavBar role="coach" activeTab="/coach/home" onNavigate={navigate} />
    </MobileShell>
  )
}
