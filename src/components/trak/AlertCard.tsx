import { TrakCard } from './TrakCard'
import { MetadataLabel } from './MetadataLabel'

interface AlertCardProps {
  type: 'match_logged' | 'assessment'
  childName: string
  detail: string
  timestamp: string
}

export function AlertCard({ type, childName, detail, timestamp }: AlertCardProps) {
  const labels: Record<string, string> = {
    match_logged: 'Match logged',
    assessment: 'New assessment',
  }
  return (
    <TrakCard>
      <div className="space-y-1">
        <MetadataLabel text={`${labels[type]} \u00b7 ${new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`} />
        <p className="text-sm text-[rgba(255,255,255,0.88)]">{childName} {detail}</p>
      </div>
    </TrakCard>
  )
}
