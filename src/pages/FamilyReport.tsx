import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { MobileShell, NavBar } from '@/components/trak'
import { ParentFamilyContent } from '@/components/parent/ParentFamily'
import { FamilyPage } from '@/components/trak/FamilyPage'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { Badge } from '@/components/arc/badge/badge'
import { ReportBody } from '@/components/coach/squad/PlayerReport'
import { reportDate, reportMonth, useFamilyReports } from '@/lib/player-report'
import { markOpened, wasOpened } from '@/lib/games/news'
import { firstName } from '@/lib/parent-data'
import { useTranslation } from '@/lib/i18n'

/* TRAK-529 (Reports 6/10, Imad 21 Nov): one sent report as the player and his parents read it, opened from Home's
   Latest report. The coach's report (ReportBody) under the family's page header: the player's own copy, with his job
   and the note; a parent's copy, without them. New look only: the old evaluation pages stay for old links. */

type As = 'player' | 'parent'

function Report({ as, childId, readerId, childName }: { as: As; childId: string; readerId: string; childName?: string }) {
  const { evaluationId = '' } = useParams<{ evaluationId: string }>()
  const { t } = useTranslation()
  const reports = useFamilyReports(childId, as === 'player')
  const one = reports.data?.find(r => r.evaluation_id === evaluationId)
  // "New" as the page opened: showing it marks it opened for Home's card, and New stays for this visit. Marked no
  // earlier than its sending, so a phone whose clock runs slow still clears it.
  const fresh = useRef<boolean>()
  if (fresh.current === undefined && one) fresh.current = !wasOpened(readerId, childId, 'report', one.evaluation_id, one.sent_at)
  useEffect(() => {
    if (one) markOpened(readerId, childId, 'report', one.evaluation_id, Math.max(Date.now(), Date.parse(one.sent_at)))
  }, [one, readerId, childId])

  if (reports.isPending) return <LoadingSkeleton className="pt-12" label={t('common:loadingReport')} lines={4} />
  const title = one ? t('coachSquad:sentReportName', { month: reportMonth(one.report.report_day) }) : t('coachSquad:report')
  return <FamilyPage title={title} from={{ label: t('nav:home'), href: `/${as}/home` }}
    status={fresh.current ? <Badge tone="success" dot>{t('common:new')}</Badge> : undefined}
    details={one && <>
      <span><strong>{`${reportDate(one.report.period_from)} – ${reportDate(one.report.report_day)}`}</strong></span>
      {childName && <span><UserRound size={14} strokeWidth={1.75} aria-hidden="true" />{childName}</span>}
    </>}>
    {reports.isError ? <p role="alert" className="text-[15px] text-ink-2">{t('common:couldntLoadReport')}{' '}
      <button type="button" onClick={() => { void reports.refetch() }} className="font-medium text-brand">{t('coachTraining:tryAgain')}</button></p>
      : one ? <ReportBody report={one.report} name={one.report.player_name} note={one.note} reader={as} />
      : <p className="text-[15px] text-ink-2">{t('coachSquad:reportNotFound')}</p>}
  </FamilyPage>
}

function PlayerReportPage() {
  const { user } = useAuth()
  return user ? <Report as="player" childId={user.id} readerId={user.id} /> : null
}

/** The child chosen in the picker; his name in the header, as on the parent's other pages. */
function ParentReportPage() {
  const { selectedChild, parentId } = useParentChildren()
  return <ParentFamilyContent>
    {selectedChild && parentId && <Report key={selectedChild.id} as="parent" childId={selectedChild.id} readerId={parentId} childName={firstName(selectedChild)} />}
  </ParentFamilyContent>
}

export default function FamilyReport({ as }: { as: As }) {
  const navigate = useNavigate()
  return <MobileShell width="wide">
    <div className="pb-28">{as === 'player' ? <PlayerReportPage /> : <ParentReportPage />}</div>
    <NavBar role={as} activeTab={`/${as}/home`} onNavigate={navigate} />
  </MobileShell>
}
