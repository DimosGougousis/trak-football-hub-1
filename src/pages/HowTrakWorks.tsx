import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { MobileShell, NavBar, MetadataLabel } from '@/components/trak'
import { useAuth } from '@/contexts/AuthContext'
import { BANDS } from '@/lib/types'

const BAND_DESCRIPTIONS: Record<string, string> = {
  exceptional: 'Outstanding — everything clicked',
  standout: 'Excellent — clearly above the norm',
  good: 'Solid positive — contributing well',
  steady: 'Reliable — did the job',
  mixed: 'Moments and struggles — inconsistent',
  developing: 'Below target — room to grow',
  difficult: 'Tough match — part of the journey',
}

const RANGES: Record<string, string> = {
  exceptional: '9.0 – 10.0',
  standout:    '8.0 – 8.9',
  good:        '7.0 – 7.9',
  steady:      '6.0 – 6.9',
  mixed:       '4.0 – 5.9',
  developing:  '2.0 – 3.9',
  difficult:   '0.0 – 1.9',
}

export default function HowTrakWorks() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()
  const role = profile?.role === 'coach' ? 'coach' : profile?.role === 'parent' ? 'parent' : 'player'

  return (
    <MobileShell>
      {/* Top bar */}
      <div className="pt-3 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center"
          style={{
            width: 32, height: 32, borderRadius: 999,
            background: '#101012', border: '1px solid rgba(255,255,255,0.07)',
            color: 'rgba(255,255,255,0.88)',
          }}
          aria-label="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-[16px] font-medium text-white/88" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          How TRAK works
        </span>
      </div>

      <div className="pt-2 pb-6 space-y-3">
        {/* Intro */}
        <div className="rounded-[18px] p-4 border border-white/[0.07] bg-[#101012]">
          <MetadataLabel text="THE IDEA" />
          <p className="text-[13px] text-white/70 mt-2.5 leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            TRAK turns every match into a story, not a number. Instead of a raw score,
            your performance lands in a <span className="text-white/88 font-medium">Performance Band</span>,
            a word that captures how the game went and how you grew.
          </p>
        </div>

        {/* Bands */}
        <div className="rounded-[18px] p-4 border border-white/[0.07] bg-[#101012]">
          <MetadataLabel text="PERFORMANCE BANDS" />
          <div className="mt-3 space-y-2.5">
            {BANDS.map(b => {
              const key = b.word.toLowerCase()
              return (
                <div key={key} className="flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center h-6 px-2.5 rounded-lg text-[11px] font-semibold flex-shrink-0"
                    style={{ background: b.bg, color: b.color, border: `1px solid ${b.border}`, minWidth: 92 }}
                  >
                    {b.word}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-white/80" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {BAND_DESCRIPTIONS[key]}
                    </p>
                    <p className="text-[9px] text-white/30 mt-0.5 tracking-[0.08em]"
                      style={{ fontFamily: "'DM Mono', monospace" }}>
                      RATING {RANGES[key]}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rating Engine */}
        <div className="rounded-[18px] p-4 border border-white/[0.07] bg-[#101012]">
          <MetadataLabel text="THE RATING ENGINE" />
          <div className="mt-2.5 space-y-2.5 text-[12px] text-white/70 leading-relaxed"
            style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <p>
              Every match starts at a baseline of <span className="text-white/88 font-medium">6.5</span>,
              a steady, average performance.
            </p>
            <p>
              From there, the engine adjusts up or down based on what actually happened on the pitch:
              goals and assists, minutes played, the result, your position-specific contribution, and how
              honestly you self-rated.
            </p>
            <p>
              Coaches can add their own assessment across work rate, tactical, attitude, technical, physical,
              and coachability, which builds a fuller picture over time.
            </p>
          </div>
        </div>

        {/* Why bands not numbers */}
        <div className="rounded-[18px] p-4 border border-white/[0.07] bg-[#101012]">
          <MetadataLabel text="WHY WORDS, NOT NUMBERS" />
          <p className="text-[12px] text-white/70 mt-2.5 leading-relaxed"
            style={{ fontFamily: "'DM Sans', sans-serif" }}>
            A 7.2 and a 7.4 feel the same on the pitch, but a number invites comparison and pressure.
            Bands keep the focus on growth: how often you reach <span style={{ color: '#4ade80' }}>Good</span>,
            how you bounce back from a <span style={{ color: '#fb923c' }}>Mixed</span> match, and when you
            break into <span style={{ color: '#C8F25A' }}>Exceptional</span>.
          </p>
        </div>
      </div>

      <NavBar role={role} activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
