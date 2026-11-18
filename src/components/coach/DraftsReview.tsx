import { useState } from 'react'
import { Alert } from '@/components/arc/alert/alert'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { formatEventDay, type EventRow } from '@/lib/coach-events'
import { displayEventTime } from '@/lib/event-time'
import { draftsByMonth } from '@/lib/draft-review'
import { currentLanguage, useTranslation } from '@/lib/i18n'

/* TRAK-154 (J8.6): the drafts still to come, always in view at the top of Events, so publishing never depends on the
   coach remembering each draft. Review lists them all, ticked, and publishes the ticked ones in one tap. */

export function DraftsStrip({ count, onReview }: { count: number; onReview: () => void }) {
  const { t } = useTranslation()
  if (count === 0) return null
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
    <p className="text-[14px] text-ink">{t('coachSchedule:draftsWaiting', { count })}</p>
    <Button type="button" size="sm" variant="secondary" onClick={onReview}>{t('coachSchedule:reviewDrafts')}</Button>
  </div>
}

const monthName = (month: string) => new Date(`${month}-15T12:00:00`)
  .toLocaleDateString(currentLanguage() === 'en' ? 'en-GB' : currentLanguage(), { month: 'long', year: 'numeric' })

/** `ticked`: the drafts ticked when it opens (an import's fixtures); every draft when null. */
export function DraftsReviewSheet({ drafts, ticked, problem, publishing, onClose, onPublish }: {
  drafts: EventRow[]
  ticked: string[] | null
  problem: string | null
  publishing: boolean
  onClose: () => void
  onPublish: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState(() => new Set(ticked ?? drafts.map(row => row.id)))
  const toggle = (id: string, on: boolean) =>
    setPicked(was => { const next = new Set(was); if (on) next.add(id); else next.delete(id); return next })
  // Only what is listed goes out: a ticked id that is no longer a draft to come is dropped.
  const ids = drafts.filter(row => picked.has(row.id)).map(row => row.id)

  return <BottomSheet className="arc" detents={[0.92]} open onOpenChange={open => { if (!open) onClose() }}
    title={t('coachSchedule:reviewDraftsTitle')} description={t('coachSchedule:reviewDraftsHelp')}>
    <div className="grid gap-4 pb-4">
      {drafts.length === 0 ? <p className="text-sm text-ink-2">{t('coachSchedule:noDraftsLeft')}</p>
        : draftsByMonth(drafts).map(([month, rows]) =>
          <div key={month} role="group" aria-label={monthName(month)} className="grid gap-3">
            <p className="text-[13px] font-medium text-ink-2">{monthName(month)}</p>
            {rows.map(row => {
              const { date, time } = displayEventTime(row)
              return <Checkbox key={row.id} label={row.title} checked={picked.has(row.id)} onCheckedChange={on => toggle(row.id, on === true)}
                description={`${formatEventDay(date)} · ${time ?? t('coachSchedule:fxTimeTbc')}`} />
            })}
          </div>)}
      {problem && <Alert tone="danger" title={problem} />}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>{t('coachSchedule:notNow')}</Button>
        <Button type="button" onClick={() => onPublish(ids)} disabled={ids.length === 0} loading={publishing}>
          {t('coachSchedule:publishCount', { count: ids.length })}</Button>
      </div>
    </div>
  </BottomSheet>
}
