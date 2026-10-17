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
  { y: 9.0, color: 'rgb(var(--t-brand))' },
  { y: 8.0, color: 'rgb(var(--t-success))' },
  { y: 7.0, color: 'rgb(var(--t-success))' },
  { y: 6.0, color: 'rgb(var(--t-info))' },
  { y: 4.8, color: 'rgb(var(--t-orange))' },
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
      className="rounded-lg px-3 py-2 border border-line"
      style={{ background: 'rgb(var(--t-raised))', fontFamily: 'var(--t-font)' }}
    >
      <p className="text-[10px] text-ink-3 mb-0.5" style={{ fontFamily: 'var(--t-font-mono)' }}>
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
      stroke="rgb(var(--t-ground))"
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
      color: bandConfig?.color ?? 'rgb(var(--t-ink-3))',
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
          tick={{ fill: 'rgb(var(--t-ink-3))', fontSize: 9, fontFamily: 'var(--t-font-mono)' }}
          axisLine={{ stroke: 'rgb(var(--t-ink-3))' }}
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
          stroke="rgb(var(--t-ink-3))"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 6, stroke: 'rgb(var(--t-brand))', strokeWidth: 2, fill: 'rgb(var(--t-ground))' }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
