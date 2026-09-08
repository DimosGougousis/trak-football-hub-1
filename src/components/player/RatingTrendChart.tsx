import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { scoreToBand } from '@/lib/rating-engine'
import { BANDS } from '@/lib/types'

interface MatchPoint {
  created_at: string
  computed_rating: number
}

interface Props {
  matches: MatchPoint[]
}

const THRESHOLD_LINES = [
  { y: 9.0, color: '#C8F25A' },
  { y: 8.0, color: '#86efac' },
  { y: 7.0, color: '#4ade80' },
  { y: 6.0, color: '#60a5fa' },
  { y: 4.8, color: '#fb923c' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface ChartDatum {
  label: string
  rating: number
  color: string
  band: string
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload as ChartDatum
  return (
    <div
      className="rounded-lg px-3 py-2 border border-white/[0.07]"
      style={{ background: '#18181b', fontFamily: "'DM Sans', sans-serif" }}
    >
      <p className="text-[10px] text-white/35 mb-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
        {d.label}
      </p>
      <p className="text-[13px] font-semibold" style={{ color: d.color }}>
        {d.band}
      </p>
    </div>
  )
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.color}
      stroke="#0a0a0b"
      strokeWidth={2}
    />
  )
}

export default function RatingTrendChart({ matches }: Props) {
  const data: ChartDatum[] = matches.map((m) => {
    const band = scoreToBand(m.computed_rating)
    const bandConfig = BANDS.find((b) => b.word.toLowerCase() === band)
    return {
      label: formatDate(m.created_at),
      rating: m.computed_rating,
      color: bandConfig?.color ?? 'rgba(255,255,255,0.4)',
      band: bandConfig?.word ?? 'Difficult',
    }
  })

  // Show at most ~5 X-axis date labels regardless of total count
  const interval = data.length <= 5 ? 0
    : data.length <= 10 ? 1
    : Math.ceil(data.length / 5) - 1

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <XAxis
          dataKey="label"
          interval={interval}
          tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 9, fontFamily: "'DM Mono', monospace" }}
          axisLine={{ stroke: 'rgba(255,255,255,0.04)' }}
          tickLine={false}
        />
        {/* Y-axis hidden — reference lines carry the band context visually */}
        <YAxis hide domain={[4, 10]} />
        {THRESHOLD_LINES.map((t) => (
          <ReferenceLine
            key={t.y}
            y={t.y}
            stroke={t.color}
            strokeDasharray="4 4"
            strokeOpacity={0.18}
          />
        ))}
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <Line
          type="monotone"
          dataKey="rating"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 6, stroke: '#C8F25A', strokeWidth: 2, fill: '#0a0a0b' }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
