import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ClipboardList, Zap } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { HomeHeader } from '@/components/trak/HomeHeader'
import { CoachSquadSwitcher } from '@/components/coach/CoachSquadSwitcher'
import { CoachWeekStrip } from '@/components/coach/CoachWeekStrip'
import { useCoachSquad } from '@/lib/coach-squad'
import { remember, remembered } from '@/lib/screen-memory'

/* TRAK-197 (Kostas's 16 Oct list, items 9 + 10): coach Home is the week, then
   the two things a coach does most. The season card, the counts, Recent
   assessments and the band chart went: each is in Squad or Sessions. TRAK-211:
   who needs attention went to its own tab, Feedback and assessment
   (CoachFeedbackPage). TRAK-196 (item 8): one quiet line replaces the greeting
   and the chips that looked like buttons. With two squads, the line follows the
   squad picked in the header (TRAK-176). */

type HomeMemory = { line: string }

export default function CoachHomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const coachSquad = useCoachSquad(user?.id)
  // TRAK-182 part 8: a quick-add draft shows in the week at once.
  const [weekVersion, setWeekVersion] = useState(0)
  // TRAK-180: a revisit starts from the line Home last showed this coach.
  const [seed] = useState(() => remembered<HomeMemory>('coach-home', user?.id))
  const [details, setDetails] = useState<{ coach_role: string | null; team: string | null; academy: string | null } | null>(null)

  // The quiet line's facts: role and academy. A failure here leaves the line shorter.
  useEffect(() => {
    if (!user) return
    let stale = false
    ;(async () => {
      const { data } = await supabase.from('coach_details').select('coach_role, team, organization_id').eq('user_id', user.id).maybeSingle()
      const orgId = (data as { organization_id?: string | null } | null)?.organization_id
      const org = orgId ? (await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()).data : null
      if (!stale) setDetails({ coach_role: data?.coach_role ?? null, team: data?.team ?? null, academy: (org as { name?: string } | null)?.name ?? null })
    })()
    return () => { stale = true }
  }, [user])

  // "Head Coach · Rehearsal Athens · U16": the squad picked, else the coach's team.
  const line = [details?.coach_role, details?.academy, coachSquad.squad ?? details?.team].filter(Boolean).join(' · ')

  useEffect(() => {
    if (user && line) remember<HomeMemory>('coach-home', user.id, { line })
  }, [user, line])

  return (
    <MobileShell>
      {/* TRAK-212: the "+" (QuickAdd) is pinned to the header's empty right slot. */}
      <div className="pt-3 pb-24">
        {/* TRAK-163: the calendar is top left; TRAK-176: the squad switcher in the middle. */}
        <HomeHeader calendarTo="/coach/schedule" center={<CoachSquadSwitcher coachId={user?.id} name={profile?.full_name || 'Coach'} />} />
        {/* TRAK-196: one quiet line, as player and parent Home have it. */}
        {(line || seed?.line) && <p className="text-xs text-muted-foreground text-center -mt-1 pb-4">{line || seed?.line}</p>}
        {user && <CoachWeekStrip coachId={user.id} version={weekVersion} />}

        {/* The two things a coach does most (item 10). The "+" stays for quick versions. */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={() => navigate('/coach/assess')}
            className="rounded-[14px] border p-4 text-left active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(200,242,90,0.06)', borderColor: 'rgba(200,242,90,0.2)' }}>
            <Zap size={16} color="#C8F25A" fill="#C8F25A" strokeWidth={1.5} aria-hidden="true" />
            <span className="block mt-2 text-[14px] font-semibold text-[#C8F25A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assess a player</span>
          </button>
          <button type="button" onClick={() => navigate('/coach/sessions')}
            className="rounded-[14px] border border-white/[0.07] p-4 text-left active:scale-[0.98] transition-transform"
            style={{ background: '#101012' }}>
            <ClipboardList size={16} color="rgba(255,255,255,0.8)" strokeWidth={1.75} aria-hidden="true" />
            <span className="block mt-2 text-[14px] font-semibold text-white/85" style={{ fontFamily: "'DM Sans', sans-serif" }}>Log a match or training</span>
          </button>
        </div>
      </div>
      <QuickAdd corner="top" onSaved={() => setWeekVersion(v => v + 1)} />
      <NavBar role="coach" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
