import { getDailyMessage, getWeeklyTip } from '@/lib/playerMessages'

interface Props {
  variant: 'daily' | 'weekly'
}

export function MentorCard({ variant }: Props) {
  const isDaily = variant === 'daily'
  const accent = isDaily ? 'rgb(var(--t-brand))' : 'rgb(var(--t-info))'
  const label = isDaily ? 'Today' : 'This week'
  const text = isDaily ? getDailyMessage() : getWeeklyTip()

  return (
    <div
      style={{
        background: 'rgb(var(--t-surface))',
        borderTop: '1px solid rgb(var(--t-line))',
        borderRight: '1px solid rgb(var(--t-line))',
        borderBottom: '1px solid rgb(var(--t-line))',
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
          fontFamily: 'var(--t-font-mono)',
          fontSize: 9,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'rgb(var(--t-ink-3))',
        }}
      >
        {label}
      </div>
      <p
        style={{
          fontFamily: 'var(--t-font)',
          fontSize: 12,
          lineHeight: 1.7,
          fontStyle: 'italic',
          color: 'rgb(var(--t-ink))',
          marginTop: 6,
        }}
      >
        {text}
      </p>
    </div>
  )
}
