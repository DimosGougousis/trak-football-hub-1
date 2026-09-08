import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { ClubShell, ClubCard, SectionLabel } from '@/components/club/ClubShell'
import { supabase } from '@/integrations/supabase/client'
import { scoreToBand } from '@/lib/rating-engine'
import { BANDS } from '@/lib/types'

const THRESHOLD = 7.5
const MIN_ASSESSMENTS = 2
const DAYS = 60

type RadarPlayer = {
  id: string
  name: string
  position: string
  team: string
  coachName: string
  avgScore: number
  assessmentCount: number
  band: string
  bandColor: string
}

function initials(name: string) {
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2)
}

export default function ClubRadar() {
  const [players, setPlayers] = useState<RadarPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()

    // 1. Fetch all assessments in last 60 days
    const { data: assessments } = await supabase
      .from('coach_assessments')
      .select('squad_player_id, work_rate, tactical, attitude, technical, physical, coachability')
      .gte('created_at', since)

    if (!assessments || assessments.length === 0) {
      setLoading(false)
      return
    }

    // 2. Group by player — compute average per-assessment then average those
    type Agg = { sum: number; count: number }
    const agg: Record<string, Agg> = {}
    for (const a of assessments) {
      const scores = [a.work_rate, a.tactical, a.attitude, a.technical, a.physical, a.coachability]
        .filter((v): v is number => v !== null && v !== undefined)
      if (scores.length === 0) continue
      const sessionAvg = scores.reduce((s, n) => s + n, 0) / scores.length
      if (!agg[a.squad_player_id]) agg[a.squad_player_id] = { sum: 0, count: 0 }
      agg[a.squad_player_id].sum += sessionAvg
      agg[a.squad_player_id].count += 1
    }

    // 3. Filter: >= MIN_ASSESSMENTS and avg >= THRESHOLD, sorted best first
    const qualifying = Object.entries(agg)
      .map(([id, { sum, count }]) => ({ id, avg: sum / count, count }))
      .filter(p => p.count >= MIN_ASSESSMENTS && p.avg >= THRESHOLD)
      .sort((a, b) => b.avg - a.avg)

    if (qualifying.length === 0) {
      setLoading(false)
      return
    }

    const qualifyingIds = qualifying.map(p => p.id)

    // 4. Fetch squad player details
    const { data: squadPlayers } = await supabase
      .from('squad_players')
      .select('id, player_name, position, coach_user_id')
      .in('id', qualifyingIds)

    if (!squadPlayers) { setLoading(false); return }

    const coachIds = [...new Set(squadPlayers.map(s => s.coach_user_id))]

    // 5. Fetch coach names + team in parallel
    const [{ data: profiles }, { data: coachDetails }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name').in('user_id', coachIds),
      supabase.from('coach_details').select('user_id, team').in('user_id', coachIds),
    ])

    const coachNameMap: Record<string, string> = {}
    for (const p of profiles ?? []) coachNameMap[p.user_id] = p.full_name || 'Coach'
    const coachTeamMap: Record<string, string> = {}
    for (const cd of coachDetails ?? []) coachTeamMap[cd.user_id] = cd.team || '—'

    // 6. Build final list, preserving sort order from qualifying
    const playerMap: Record<string, typeof squadPlayers[0]> = {}
    for (const sp of squadPlayers) playerMap[sp.id] = sp

    const radarPlayers: RadarPlayer[] = qualifying
      .map(q => {
        const sp = playerMap[q.id]
        if (!sp) return null
        const band = scoreToBand(q.avg)
        const bandCfg = BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[3]
        return {
          id: sp.id,
          name: sp.player_name,
          position: sp.position || '—',
          team: coachTeamMap[sp.coach_user_id] || '—',
          coachName: coachNameMap[sp.coach_user_id] || 'Coach',
          avgScore: q.avg,
          assessmentCount: q.count,
          band: bandCfg.word,
          bandColor: bandCfg.color,
        }
      })
      .filter(Boolean) as RadarPlayer[]

    setPlayers(radarPlayers)
    setLoading(false)
  }

  return (
    <ClubShell>
      {/* Page header */}
      <div className="pb-5">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp size={13} color="#C8F25A" />
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
          }}>
            Movement Radar
          </span>
        </div>
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 28,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.88)',
          lineHeight: 1.15,
        }}>
          Players to Watch
        </h1>
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: 'rgba(255,255,255,0.28)',
          marginTop: 5,
        }}>
          Avg score ≥ 7.5 · 2+ assessments · last 60 days
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, paddingTop: 8 }}>Loading…</div>
      ) : players.length === 0 ? (
        <ClubCard className="p-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <TrendingUp size={20} color="rgba(255,255,255,0.2)" />
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
              No players above the threshold yet
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>
              Players need at least 2 assessments in the last 60 days to appear here. Keep your coaches assessing regularly.
            </p>
          </div>
        </ClubCard>
      ) : (
        <>
          <SectionLabel>
            {players.length} {players.length === 1 ? 'player' : 'players'} flagged
          </SectionLabel>
          <div className="mt-3 space-y-2">
            {players.map(p => (
              <ClubCard key={p.id} className="p-3 flex items-center gap-3">
                {/* Avatar */}
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: 'rgba(200,242,90,0.1)',
                    color: '#C8F25A',
                    fontSize: 13,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {initials(p.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.88)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                    {p.position} · {p.team}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 3 }}>
                    {p.assessmentCount} assessments · speak to {p.coachName}
                  </div>
                </div>

                {/* Band badge */}
                <span
                  className="shrink-0 px-2.5 py-1 rounded-full"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    color: p.bandColor,
                    background: `${p.bandColor}1F`,
                    border: `1px solid ${p.bandColor}40`,
                  }}
                >
                  {p.band}
                </span>
              </ClubCard>
            ))}
          </div>
        </>
      )}
    </ClubShell>
  )
}
