import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, BandPill, MetadataLabel } from '@/components/trak'
import { CardSkeleton, Skeleton } from '@/components/trak'
import { BANDS, type BandType } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

export default function ParentHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [childName, setChildName] = useState('')
  const [childDetails, setChildDetails] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [assessment, setAssessment] = useState<any>(null)
  const [coachName, setCoachName] = useState('')
  const [latestAward, setLatestAward] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('player_parent_links').select('player_user_id').eq('parent_user_id', user.id).then(async ({ data: links }) => {
      if (!links?.length) { setLoading(false); return }
      const childId = links[0].player_user_id

      // Child profile
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', childId).maybeSingle()
      if (profile) setChildName(profile.full_name)

      // Child details
      const { data: details } = await supabase.from('player_details').select('position, current_club, age_group').eq('user_id', childId).maybeSingle()
      if (details) setChildDetails(details)

      // Matches (column-filtered for parent)
      const { data: matchData } = await supabase.from('matches')
        .select('id, team_score, opponent_score, competition, venue, created_at, opponent, computed_rating')
        .eq('user_id', childId).order('created_at', { ascending: false })
      if (matchData) setMatches(matchData)

      // Assessments + award via squad_players link
      const { data: squadRows } = await supabase.from('squad_players').select('id').eq('linked_player_id', childId)
      if (squadRows?.length) {
        const ids = squadRows.map((r: any) => r.id)
        const { data: assessments } = await supabase.from('coach_assessments')
          .select('*').in('squad_player_id', ids)
          .order('created_at', { ascending: false }).limit(1)
        if (assessments?.length) {
          setAssessment(assessments[0])
          const { data: coachProfile } = await supabase.from('profiles').select('full_name').eq('user_id', assessments[0].coach_user_id).maybeSingle()
          if (coachProfile) setCoachName(coachProfile.full_name)
        }

        const { data: awards } = await supabase.from('recognition_awards')
          .select('award_type, awarded_for, note, created_at')
          .in('squad_player_id', ids)
          .order('created_at', { ascending: false }).limit(1)
        if (awards?.length) setLatestAward(awards[0])
      }

      setLoading(false)
    })
  }, [user])

  const firstName = childName?.split(' ')[0] || 'your child'

  // Season summary (simple, observational)
  const scoredMatches = matches.filter(m => m.team_score != null && m.opponent_score != null)
  const wins = scoredMatches.filter(m => m.team_score > m.opponent_score).length
  const draws = scoredMatches.filter(m => m.team_score === m.opponent_score).length
  const losses = scoredMatches.filter(m => m.team_score < m.opponent_score).length

  const seasonAvg = matches.length
    ? matches.reduce((s, m) => s + (m.computed_rating || 6.5), 0) / matches.length
    : 0
  const seasonBand: BandType = (matches.length ? scoreToBand(seasonAvg) : 'steady') as BandType

  if (loading) return (
    <MobileShell>
      <div className="pt-12 pb-4 space-y-6">
        <CardSkeleton />
        <Skeleton className="h-3 w-28" />
        <CardSkeleton />
      </div>
      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )

  // No child linked
  if (!childName) {
    return (
      <MobileShell>
        <div className="pt-12 pb-4 text-center px-2">
          <p className="section-label mb-3">PARENT</p>
          <h1 className="text-[24px] text-white/85 leading-tight mb-3" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: '-0.02em' }}>
            No child linked yet
          </h1>
          <p className="text-[13px] text-white/45 max-w-[280px] mx-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Ask your child to send you a parent invite from their Trak account.
          </p>
        </div>
        <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
      </MobileShell>
    )
  }

  return (
    <MobileShell>
      <div className="pt-3 pb-4">

        {/* ── Header ── */}
        <div className="pt-2 pb-5">
          <p className="section-label mb-1.5">FOLLOWING</p>
          <h1
            className="text-[28px] text-white/88 leading-tight"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: '-0.03em' }}
          >
            {childName}
          </h1>
          {childDetails && (
            <p className="text-[12px] text-white/45 mt-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {[childDetails.position, childDetails.current_club, childDetails.age_group].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* ── Season at a glance ── */}
        {matches.length > 0 && (
          <div className="rounded-[14px] p-5 mb-3 bg-[#101012] border border-white/[0.07]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <MetadataLabel text="THIS SEASON" />
                <p
                  className="text-[32px] leading-none mt-2"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 300,
                    letterSpacing: '-0.03em',
                    color: BANDS.find(b => b.word.toLowerCase() === seasonBand)?.color,
                  }}
                >
                  {BANDS.find(b => b.word.toLowerCase() === seasonBand)?.word}
                </p>
              </div>
              <div className="text-right">
                <MetadataLabel text="MATCHES" />
                <p className="text-[32px] leading-none mt-2 text-white/85" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: '-0.03em' }}>
                  {matches.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-white/[0.05]">
              <Stat label="W" value={wins} color="#86efac" />
              <Stat label="D" value={draws} color="rgba(255,255,255,0.55)" />
              <Stat label="L" value={losses} color="#fb923c" />
            </div>
          </div>
        )}

        {/* ── Latest coach assessment ── */}
        {assessment && (
          <div className="mt-5">
            <MetadataLabel text="LATEST COACH ASSESSMENT" />
            <div className="rounded-[14px] p-5 mt-2 bg-[#101012] border border-white/[0.07]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[13px] font-medium text-white/85" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {coachName || 'Coach'}
                  </p>
                  <p className="text-[11px] text-white/35 mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {assessment.created_at ? new Date(assessment.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                  </p>
                </div>
                <BandPill band={scoreToBand(
                  ((assessment.work_rate || 0) + (assessment.tactical || 0) + (assessment.attitude || 0) +
                   (assessment.technical || 0) + (assessment.physical || 0) + (assessment.coachability || 0)) / 6
                ) as BandType} />
              </div>

              <div className="space-y-2.5 mt-4">
                {[
                  { label: 'Work Rate', score: assessment.work_rate },
                  { label: 'Tactical', score: assessment.tactical },
                  { label: 'Attitude', score: assessment.attitude },
                  { label: 'Technical', score: assessment.technical },
                  { label: 'Physical', score: assessment.physical },
                  { label: 'Coachability', score: assessment.coachability },
                ].map(cat => {
                  const band = scoreToBand(cat.score || 6.5)
                  const cfg = BANDS.find(b => b.word.toLowerCase() === band)!
                  return (
                    <div key={cat.label} className="flex items-center gap-3">
                      <span className="w-[88px] flex-shrink-0 text-[10px] font-medium tracking-[0.1em] uppercase text-white/45" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {cat.label}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#202024] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((cat.score || 6.5) / 10) * 100}%`, backgroundColor: cfg.color }} />
                      </div>
                      <span className="text-[11px] flex-shrink-0 w-[68px] text-right" style={{ fontFamily: "'DM Sans', sans-serif", color: cfg.color }}>
                        {cfg.word}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent recognition ── */}
        {latestAward && (
          <div className="mt-5">
            <MetadataLabel text="RECOGNITION" />
            <div className="rounded-[14px] p-4 mt-2 bg-[#101012] border border-white/[0.07]">
              <p className="text-[13px] text-white/85 font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {formatAward(latestAward.award_type)}
              </p>
              {latestAward.awarded_for && (
                <p className="text-[11px] text-white/45 mt-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {latestAward.awarded_for}
                </p>
              )}
              {latestAward.note && (
                <p className="text-[12px] text-white/65 mt-2 italic leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  &ldquo;{latestAward.note}&rdquo;
                </p>
              )}
              <p className="text-[10px] text-white/30 mt-2" style={{ fontFamily: "'DM Mono', monospace" }}>
                {new Date(latestAward.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>
        )}

        {/* ── Recent matches (compact list) ── */}
        {matches.length > 0 && (
          <div className="mt-5">
            <MetadataLabel text="RECENT MATCHES" />
            <div className="rounded-[14px] mt-2 bg-[#101012] border border-white/[0.07] overflow-hidden">
              {matches.slice(0, 5).map((m, i) => {
                const band = scoreToBand(m.computed_rating || 6.5) as BandType
                const cfg = BANDS.find(b => b.word.toLowerCase() === band)!
                const result = m.team_score > m.opponent_score ? 'W' : m.team_score < m.opponent_score ? 'L' : 'D'
                const resultColor = result === 'W' ? '#86efac' : result === 'L' ? '#fb923c' : 'rgba(255,255,255,0.55)'
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < Math.min(matches.length, 5) - 1 ? 'border-b border-white/[0.05]' : ''}`}
                  >
                    <span
                      className="w-5 text-[11px] font-medium text-center flex-shrink-0"
                      style={{ fontFamily: "'DM Mono', monospace", color: resultColor }}
                    >
                      {result}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white/85 truncate" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {m.opponent || m.competition || 'Match'}
                      </p>
                      <p className="text-[10px] text-white/35 mt-0.5 tracking-[0.04em]" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {m.team_score}–{m.opponent_score}
                      </p>
                    </div>
                    <span className="text-[11px] flex-shrink-0" style={{ fontFamily: "'DM Sans', sans-serif", color: cfg.color }}>
                      {cfg.word}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty matches */}
        {matches.length === 0 && (
          <div className="rounded-[14px] p-5 text-center bg-[#101012] border border-white/[0.07] mt-3">
            <p className="text-sm text-white/45" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              No matches yet. When {firstName} logs a match, it will appear here.
            </p>
          </div>
        )}

      </div>

      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[18px] font-light" style={{ fontFamily: "'DM Sans', sans-serif", color, letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span className="text-[10px] tracking-[0.12em] uppercase text-white/35" style={{ fontFamily: "'DM Mono', monospace" }}>
        {label}
      </span>
    </div>
  )
}

function formatAward(type: string): string {
  const map: Record<string, string> = {
    player_of_week: 'Player of the Week',
    player_of_month: 'Player of the Month',
    most_improved: 'Most Improved',
    top_scorer: 'Top Scorer',
    captain: 'Captain',
  }
  return map[type] || type.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}
