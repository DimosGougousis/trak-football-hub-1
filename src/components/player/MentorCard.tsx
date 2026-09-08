import { getDailyMessage, getWeeklyTip } from '@/lib/playerMessages'

interface Props {
  variant: 'daily' | 'weekly'
}

export function MentorCard({ variant }: Props) {
  const isDaily = variant === 'daily'
  const accent = isDaily ? '#C8F25A' : '#60a5fa'
  const label = isDaily ? 'Today' : 'This week'
  const text = isDaily ? getDailyMessage() : getWeeklyTip()

  return (
    <div
      style={{
        background: '#101012',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${accent}`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: 14,
        borderBottomRightRadius: 14,
        padding: '14px 16px',
      }}
    >
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
        {label}
      </div>
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          lineHeight: 1.7,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.88)',
          marginTop: 6,
        }}
      >
        {text}
      </p>
    </div>
  )
}
