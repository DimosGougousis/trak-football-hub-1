import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { BAND_COLORS, SELF_RATING_BAND, categoryScoreToBand } from '@/lib/matchDetailHelpers'
import type { Band } from '@/lib/clubMock'

interface Props {
  matchId: string
  selfRating?: string | null
  note?: string | null
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'work_rate', label: 'Work Rate' },
  { key: 'tactical', label: 'Tactical' },
  { key: 'attitude', label: 'Attitude' },
  { key: 'technical', label: 'Technical' },
  { key: 'physical', label: 'Physical' },
  { key: 'coachability', label: 'Coachability' },
]

export function MatchDetailExtras({ matchId, selfRating, note }: Props) {
  const [assessment, setAssessment] = useState<any>(null)

  useEffect(() => {
    if (!matchId) return
    // Best-effort lookup: there is no direct match→assessment link in schema,
    // so we just check if any assessment exists for this player. Safe no-op
    // if none found.
    supabase
      .from('coach_assessments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAssessment(data))
  }, [matchId])

  const selfBand = selfRating ? SELF_RATING_BAND[selfRating.toLowerCase()] : null

  return (
    <div className="space-y-4 mt-4">
      {/* 1. How you felt */}
      {selfBand && (
        <section>
          <Label>How you felt</Label>
          <div className="mt-2">
            <BandPill band={selfBand} />
          </div>
        </section>
      )}

      {/* 2. Private note */}
      {note && note.trim().length > 0 && (
        <section
          className="p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 8,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.22)',
            }}
          >
            Your note
          </div>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.6,
              marginTop: 6,
            }}
          >
            {note}
          </p>
        </section>
      )}

      {/* 3 & 4. Coach assessment — pending or full */}
      {assessment ? (
        <section>
          <Label>Coach Assessment</Label>
          <div className="mt-3 space-y-2.5">
            {CATEGORIES.map(c => {
              const score = assessment[c.key] ?? 5
              const band = categoryScoreToBand(score)
              const color = BAND_COLORS[band]
              return (
                <div key={c.key} className="flex items-center gap-3">
                  <div
                    style={{
                      flex: '0 0 90px',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {c.label}
                  </div>
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <div
                      style={{
                        width: `${(score / 10) * 100}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      flex: '0 0 80px',
                      fontSize: 11,
                      textAlign: 'right',
                      color,
                    }}
                  >
                    {band}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-2">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.35)',
              animation: 'pulse 1.6s ease-in-out infinite',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            Coach assessment pending
          </span>
        </section>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.22)',
      }}
    >
      {children}
    </div>
  )
}

function BandPill({ band }: { band: Band }) {
  const color = BAND_COLORS[band]
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs"
      style={{
        color,
        background: `${color}1F`,
        border: `1px solid ${color}40`,
      }}
    >
      {band}
    </span>
  )
}
