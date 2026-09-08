import { useEffect, useState } from 'react'

interface Props {
  bandWord: string
  bandColor: string
  newMatchCount: number
  latestMatch: any
  onDismiss: () => void
}

export default function CardRevealModal({ bandWord, bandColor, newMatchCount, latestMatch, onDismiss }: Props) {
  const [showBand, setShowBand] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showTap, setShowTap] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowBand(true), 300)
    const t2 = setTimeout(() => setShowDetails(true), 650)
    const t3 = setTimeout(() => setShowTap(true), 1000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const matchLabel = latestMatch?.opponent
    ? `vs ${latestMatch.opponent}${latestMatch.team_score != null ? ` · ${latestMatch.team_score}–${latestMatch.opponent_score}` : ''}`
    : newMatchCount === 1
      ? '1 new match logged'
      : `${newMatchCount} new matches logged`

  return (
    <>
      <style>{`
        @keyframes cardReveal {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Full-screen overlay — tap anywhere to dismiss */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-6"
        style={{ background: 'rgba(0,0,0,0.88)' }}
        onClick={onDismiss}
      >
        {/* Card */}
        <div
          className="w-full max-w-[300px] rounded-[28px] px-8 py-10 text-center"
          style={{
            background: '#101012',
            border: `1px solid ${bandColor}4D`,
            animation: 'cardReveal 400ms cubic-bezier(0.16,1,0.3,1) forwards',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top label */}
          <p
            className="text-[8px] tracking-[0.2em] uppercase text-white/30 mb-7"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            YOUR CARD HAS BEEN UPDATED
          </p>

          {/* Band word */}
          <p
            className="text-[64px] leading-none mb-7 transition-all duration-500"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              letterSpacing: '-0.04em',
              color: bandColor,
              filter: showBand ? `drop-shadow(0 0 24px ${bandColor}70)` : 'none',
              opacity: showBand ? 1 : 0,
              transform: showBand ? 'translateY(0)' : 'translateY(6px)',
            }}
          >
            {bandWord}
          </p>

          {/* Divider */}
          <div className="h-px mb-5" style={{ background: 'rgba(255,255,255,0.06)' }} />

          {/* Match info */}
          <p
            className="text-[11px] text-white/40 mb-8 transition-opacity duration-500"
            style={{
              fontFamily: "'DM Mono', monospace",
              opacity: showDetails ? 1 : 0,
            }}
          >
            {matchLabel}
          </p>

          {/* Tap cue */}
          <p
            className="text-[8px] tracking-[0.14em] uppercase text-white/18 transition-opacity duration-500"
            style={{
              fontFamily: "'DM Mono', monospace",
              opacity: showTap ? 1 : 0,
            }}
          >
            TAP ANYWHERE TO CONTINUE
          </p>
        </div>
      </div>
    </>
  )
}
