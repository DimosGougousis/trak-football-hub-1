import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertsBell } from '@/components/trak/AlertsBell'
import { ParentAssessmentBands, ParentLoadError, ParentLoading } from '@/components/parent/ParentFamily'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { useParentDevelopment, useParentEvents, useParentMatches } from '@/hooks/useParentData'
import { parentAlerts } from '@/lib/parent-data'
import { noteFirstSeen, readFirstSeen } from '@/lib/player-events'
import { trackEvent } from '@/lib/telemetry'

/* TRAK-74 (decision 25 Sep): the parent's alerts are a bell on Home instead of
   a tab. It counts the selected child's matches, assessments and events
   (TRAK-134) recorded or changed since the bell last closed on this device,
   and lists them: a match or event opens its page, an assessment shows its
   bands (never the coach's message, TRAK-63). Awards stay out while they're
   parked (TRAK-31). TRAK-163: the panel is Arc's notification center. */

export function ParentAlertsBell() {
  const navigate = useNavigate()
  const { parentId, selectedChild } = useParentChildren()
  const matches = useParentMatches()
  const development = useParentDevelopment()
  const events = useParentEvents()
  const firstSeenKey = parentId ? `trak:parent-alerts-events:${parentId}` : null
  useEffect(() => { if (firstSeenKey && events.data) noteFirstSeen(firstSeenKey, events.data) }, [firstSeenKey, events.data])
  if (!parentId || !selectedChild || !firstSeenKey) return null

  const failed = matches.isError || development.isError || events.isError
  const loading = matches.isPending || development.isPending || events.isPending
  // Read before this render's events are recorded as first seen.
  const alerts = failed || loading ? [] : parentAlerts(matches.data ?? [], development.data,
    { awards: false, events: events.data ?? [], eventsFirstSeen: readFirstSeen(firstSeenKey) })

  return (
    <AlertsBell storageKey={`trak:parent-alerts-seen:${parentId}:${selectedChild.id}`}
      notice={failed ? <ParentLoadError message="Couldn't load alerts."
        onRetry={() => { void matches.refetch(); void development.refetch(); void events.refetch() }} />
        : loading ? <ParentLoading /> : undefined}
      onOpen={() => { if (alerts.length) void trackEvent('alert_opened', { count: alerts.length }) }}
      alerts={alerts.map(alert => {
        const assessment = alert.kind === 'assessment'
          ? development.data?.assessments.find(item => item.id === alert.targetId) : undefined
        return {
          ...alert,
          tone: alert.cancelled ? 'warning' as const : undefined,
          details: assessment && <section aria-label="Assessment bands"><ParentAssessmentBands assessment={assessment} /></section>,
          action: alert.kind === 'match' || alert.kind === 'event' ? {
            label: alert.kind === 'event' ? 'Open event' : 'Open match',
            onSelect: () => navigate(`/parent/${alert.kind}/${alert.targetId}`),
          } : undefined,
        }
      })} />
  )
}
