import type { FC } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssessmentScores = {
  work_rate:    number
  technical:    number
  physical:     number
  coachability: number
  attitude:     number
  tactical:     number
}

// ── Layout ────────────────────────────────────────────────────────────────────

const VW = 260, VH = 230
const CX = 130, CY = 118
const MAX_R = 78   // outer ring radius (score = 10)
const RINGS = [2, 4, 6, 8, 10]

// Axes go clockwise starting from the top (-90°)
const AXES: { key: keyof AssessmentScores; label: string[]; anchor: string; dy?: number }[] = [
  { key: 'work_rate',    label: ['WORK', 'RATE'],    anchor: 'middle', dy: -4 },
  { key: 'technical',    label: ['TECHNICAL'],        anchor: 'start',  dy: 0  },
  { key: 'physical',     label: ['PHYSICAL'],         anchor: 'start',  dy: 4  },
  { key: 'coachability', label: ['COACH', 'ABILITY'], anchor: 'middle', dy: 10 },
  { key: 'attitude',     label: ['ATTITUDE'],         anchor: 'end',    dy: 4  },
  { key: 'tactical',     label: ['TACTICAL'],         anchor: 'end',    dy: 0  },
]

const toRad = (deg: number) => deg * (Math.PI / 180)

function axisPoint(idx: number, radius: number): [number, number] {
  const angle = toRad(-90 + idx * 60)
  return [
    CX + radius * Math.cos(angle),
    CY + radius * Math.sin(angle),
  ]
}

function polygonPoints(scores: AssessmentScores): string {
  return AXES.map((a, i) => {
    const raw = scores[a.key] ?? 0
    const clamped = Math.max(0, Math.min(10, raw))
    const [x, y] = axisPoint(i, (clamped / 10) * MAX_R)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function ringPoints(value: number): string {
  const r = (value / 10) * MAX_R
  return AXES.map((_, i) => {
    const [x, y] = axisPoint(i, r)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

// ── Component ─────────────────────────────────────────────────────────────────

export const AssessmentRadar: FC<{ scores: AssessmentScores; prevScores?: AssessmentScores }> = ({
  scores,
  prevScores,
}) => {
  const LABEL_R = MAX_R + 20   // label distance from centre

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Player assessment radar chart"
    >
      {/* ── Grid rings ── */}
      {RINGS.map(v => (
        <polygon
          key={v}
          points={ringPoints(v)}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}

      {/* ── Axis spokes ── */}
      {AXES.map((_, i) => {
        const [ox, oy] = axisPoint(i, 0)
        const [ex, ey] = axisPoint(i, MAX_R)
        return (
          <line key={i}
            x1={ox.toFixed(1)} y1={oy.toFixed(1)}
            x2={ex.toFixed(1)} y2={ey.toFixed(1)}
            stroke="rgba(255,255,255,0.09)" strokeWidth="1"
          />
        )
      })}

      {/* ── Previous scores (ghost) ── */}
      {prevScores && (
        <polygon
          points={polygonPoints(prevScores)}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}

      {/* ── Current score polygon ── */}
      <polygon
        points={polygonPoints(scores)}
        fill="rgba(200,242,90,0.14)"
        stroke="rgba(200,242,90,0.7)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* ── Score dots ── */}
      {AXES.map((a, i) => {
        const raw = scores[a.key] ?? 0
        const clamped = Math.max(0, Math.min(10, raw))
        const [x, y] = axisPoint(i, (clamped / 10) * MAX_R)
        return (
          <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.5"
            fill="#C8F25A" stroke="#0c160c" strokeWidth="1.5" />
        )
      })}

      {/* ── Score values near dots ── */}
      {AXES.map((a, i) => {
        const raw = scores[a.key] ?? 0
        const clamped = Math.max(0, Math.min(10, raw))
        // Position label slightly further out from the dot
        const [x, y] = axisPoint(i, (clamped / 10) * MAX_R + 14)
        return (
          <text key={i}
            x={x.toFixed(1)} y={y.toFixed(1)}
            textAnchor="middle"
            style={{
              fontSize: 8,
              fontWeight: 700,
              fontFamily: 'monospace',
              fill: '#C8F25A',
              userSelect: 'none',
            }}
          >
            {clamped.toFixed(0)}
          </text>
        )
      })}

      {/* ── Axis labels ── */}
      {AXES.map((a, i) => {
        const [lx, ly] = axisPoint(i, LABEL_R)
        return (
          <text key={i}
            x={lx.toFixed(1)}
            y={(ly + (a.dy ?? 0) - (a.label.length > 1 ? 5 : 0)).toFixed(1)}
            textAnchor={a.anchor}
            style={{
              fontSize: 7.5,
              fontWeight: 600,
              fontFamily: "'DM Mono', monospace",
              fill: 'rgba(255,255,255,0.38)',
              userSelect: 'none',
              letterSpacing: '0.05em',
            }}
          >
            {a.label.map((line, li) => (
              <tspan key={li} x={lx.toFixed(1)} dy={li === 0 ? 0 : 9}>
                {line}
              </tspan>
            ))}
          </text>
        )
      })}
    </svg>
  )
}
