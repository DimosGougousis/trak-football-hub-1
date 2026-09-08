import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, BandPill } from '@/components/trak'
import { BANDS } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

export default function ParentMatches() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [matches, setMatches] = useState<any[]>([])
  const [childName, setChildName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('player_parent_links').select('player_user_id').eq('parent_user_id', user.id).then(async ({ data: links }) => {
      if (!links?.length) { setLoading(false); return }
      const childId = links[0].player_user_id

      // Fetch child name (first name only)
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', childId).maybeSingle()
      if (profile) setChildName(profile.full_name?.split(' ')[0] || 'Child')

      const { data } = await supabase.from('matches')
        .select('id, team_score, opponent_score, competition, venue, minutes_played, computed_rating, created_at, position, opponent')
        .eq('user_id', childId).order('created_at', { ascending: false })
      setMatches(data || [])
      setLoading(false)
    })
  }, [user])

  return (
    <MobileShell>
      <div className="pt-3 pb-4">

        {/* ── Topbar ── */}
        <div className="flex items-center gap-2 mb-5 pt-1">
          <button
            onClick={() => navigate('/parent/home')}
            className="text-white/45 text-sm"
          >
            &larr;
          </button>
          <span
            className="text-[15px] font-medium text-white/88"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {childName || 'Child'} &middot; Matches
          </span>
        </div>

        {/* ── Match list ── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-[10px] bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[28px] mb-2">&#9917;</p>
            <p className="text-sm text-white/45" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              No matches yet.
            </p>
          </div>
        ) : (
          <div>
            {matches.map(m => {
              const band = scoreToBand(m.computed_rating || 6.5)
              const bandConfig = BANDS.find(b => b.word.toLowerCase() === band)!
              const formattedDate = new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              const hasScore = m.team_score != null && m.opponent_score != null
              const resultLabel = !hasScore ? null
                : m.team_score > m.opponent_score ? 'W'
                : m.team_score < m.opponent_score ? 'L' : 'D'
              const opponentName = m.opponent || m.competition || 'Match'

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 py-[13px] border-b border-white/[0.04] last:border-b-0"
                >
                  {/* Match icon */}
                  <div className="w-[34px] h-[34px] rounded-[10px] bg-white/[0.04] flex items-center justify-center text-[15px] flex-shrink-0">
                    &#9917;
                  </div>

                  {/* Opponent + meta */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[13px] font-medium text-white/88 truncate"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {opponentName}
                    </p>
                    <p
                      className="text-[9px] text-white/22 mt-[3px] tracking-[0.04em]"
                      style={{ fontFamily: "'DM Mono', monospace" }}
                    >
                      {formattedDate} &middot; {m.competition || 'Match'} &middot; {m.venue || 'Home'}
                    </p>
                  </div>

                  {/* Band pill + score */}
                  <div className="text-right flex-shrink-0 ml-auto">
                    <BandPill band={band} />
                    <p
                      className="text-[9px] text-white/22 mt-1 tracking-[0.04em] text-right"
                      style={{ fontFamily: "'DM Mono', monospace" }}
                    >
                      {resultLabel}{hasScore ? ` ${m.team_score}–${m.opponent_score}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <NavBar role="parent" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
