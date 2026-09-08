import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, MetadataLabel, CategoryBar, BandPill } from '@/components/trak'
import { scoreToBand } from '@/lib/rating-engine'
import { BANDS } from '@/lib/types'
import { ChevronLeft, Trophy } from 'lucide-react'

function avgScore(a: any) {
  return (a.work_rate + a.tactical + a.attitude + a.technical + a.physical + a.coachability) / 6
}

export default function CoachPlayerProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [player, setPlayer] = useState<any>(null)
  const [assessments, setAssessments] = useState<any[]>([])
  const [notesById, setNotesById] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id || !user) return
    supabase.from('squad_players').select('*').eq('id', id).eq('coach_user_id', user.id).maybeSingle().then(({ data }) => setPlayer(data))
    supabase.from('coach_assessments').select('*').eq('squad_player_id', id).eq('coach_user_id', user.id)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const list = data || []
        setAssessments(list)
        if (list.length) {
          const { data: notes } = await supabase.from('coach_assessment_notes')
            .select('assessment_id, note')
            .in('assessment_id', list.map((a: any) => a.id))
          const map: Record<string, string> = {}
          notes?.forEach((n: any) => { map[n.assessment_id] = n.note })
          setNotesById(map)
        }
      })
  }, [id, user])

  if (!player) return (
    <MobileShell>
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#C8F25A] border-t-transparent rounded-full animate-spin" />
      </div>
    </MobileShell>
  )

  const latest = assessments[0]
  const initials = player.player_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex flex-col mx-auto max-w-[430px] bg-[#0A0A0B]" style={{ height: '100dvh' }}>
      {/* Header — always visible, never scrolls */}
      <div className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/coach/squad')}
          className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] bg-[#17171a] border border-white/[0.11]">
          <ChevronLeft size={16} className="text-white/70" />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-white/90 -ml-[34px] pointer-events-none">
          {player.player_name.split(' ')[0]}
        </h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 space-y-4">

        {/* Player identity */}
        <div className="flex items-center gap-4 py-2">
          <div className="flex items-center justify-center w-[52px] h-[52px] rounded-[16px] text-[18px] font-bold flex-shrink-0"
            style={{ background: 'rgba(200,242,90,0.14)', color: '#C8F25A' }}>
            {initials}
          </div>
          <div>
            <p className="text-[22px] font-light text-white/88 leading-tight"
              style={{ fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.02em' }}>
              {player.player_name}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {player.position && (
                <span className="h-5 px-2.5 rounded-full bg-white/[0.06] border border-white/[0.07] text-[8px] font-medium tracking-[0.06em] uppercase text-white/45 inline-flex items-center"
                  style={{ fontFamily: "'DM Mono', monospace" }}>{player.position}</span>
              )}
              {player.shirt_number && (
                <span className="h-5 px-2.5 rounded-full bg-white/[0.06] border border-white/[0.07] text-[8px] font-medium tracking-[0.06em] uppercase text-white/45 inline-flex items-center"
                  style={{ fontFamily: "'DM Mono', monospace" }}>#{player.shirt_number}</span>
              )}
              <span className="h-5 px-2.5 rounded-full bg-white/[0.06] border border-white/[0.07] text-[8px] font-medium tracking-[0.06em] uppercase text-white/45 inline-flex items-center"
                style={{ fontFamily: "'DM Mono', monospace" }}>
                {assessments.length} assessments
              </span>
            </div>
          </div>
        </div>

        {/* Latest assessment */}
        {latest && (
          <div className="rounded-[18px] p-4"
            style={{ background: '#101012', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <MetadataLabel text="LATEST ASSESSMENT" />
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/22"
                  style={{ fontFamily: "'DM Mono', monospace" }}>
                  {new Date(latest.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <BandPill band={scoreToBand(avgScore(latest))} />
              </div>
            </div>
            {/* Scores */}
            <div className="space-y-2.5 mt-1">
              <CategoryBar label="Work Rate"    score={latest.work_rate}    />
              <CategoryBar label="Technical"    score={latest.technical}    />
              <CategoryBar label="Physical"     score={latest.physical}     />
              <CategoryBar label="Coachability" score={latest.coachability} />
              <CategoryBar label="Attitude"     score={latest.attitude}     />
              <CategoryBar label="Tactical"     score={latest.tactical}     />
            </div>
            {notesById[latest.id] && (
              <p className="text-[11px] text-white/45 mt-3 italic"
                style={{ fontFamily: "'DM Sans', sans-serif" }}>"{notesById[latest.id]}"</p>
            )}
          </div>
        )}

        {/* Assessment history */}
        {assessments.length > 1 && (
          <div className="space-y-2">
            <MetadataLabel text="ASSESSMENT HISTORY" />
            {assessments.slice(1).map(a => {
              const band = scoreToBand(avgScore(a))
              const bandColor = BANDS.find(b => b.word.toLowerCase() === band)?.color
              return (
                <div key={a.id} className="flex items-center justify-between rounded-[12px] px-4 py-3"
                  style={{ background: '#101012', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div>
                    <p className="text-[12px] text-white/60"
                      style={{ fontFamily: "'DM Mono', monospace" }}>
                      {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </p>
                    {a.appearance && (
                      <p className="text-[10px] text-white/35 mt-0.5 capitalize">{a.appearance}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium" style={{ color: bandColor }}>
                      {avgScore(a).toFixed(1)}
                    </span>
                    <BandPill band={band} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => navigate('/coach/assess', { state: { preselectedPlayerId: player.id } })}
            className="flex-[2] py-3.5 rounded-[10px] bg-[#C8F25A] text-black font-bold text-sm active:scale-[0.97] transition-transform">
            Assess {player.player_name.split(' ')[0]} →
          </button>
          <button
            onClick={() => navigate('/coach/award', { state: { preselectedPlayerId: player.id } })}
            className="flex-1 py-3.5 rounded-[10px] border border-white/[0.1] text-white/60 text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
            style={{ background: 'transparent' }}>
            <Trophy size={14} />
            Award
          </button>
        </div>
      </div>
    </div>
  )
}
