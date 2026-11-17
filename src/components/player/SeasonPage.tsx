import type { UseQueryResult } from '@tanstack/react-query'
import { Badge } from '@/components/arc/badge/badge'
import { LoadError } from '@/components/trak'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { FamilyPage } from '@/components/trak/FamilyPage'
import { SeasonCards } from '@/components/player/SeasonPlanSections'
import { evalDay } from '@/lib/evaluation'
import { useTranslation } from '@/lib/i18n'
import { nextEvaluation, seasonYears, type MySeason } from '@/lib/my-season'

/** TRAK-441 slice 5 (mockup, 12 Nov): My season, or a parent's "Giourkas’s season", in the coach's page header: the
 *  season's years as its badge and the next evaluation under the title. Same read as today's page (TRAK-398, TRAK-400);
 *  "Set by Coach …" is left out, as the spec's list of things not to say. */
export function SeasonPage({ query, home, child }: { query: UseQueryResult<MySeason | null>; home: string; child?: string }) {
  const { t } = useTranslation()
  const title = child ? t('common:childSeason', { name: child }) : t('common:mySeason')
  const plan = query.data
  if (query.isPending) return <LoadingSkeleton className="pt-12" label={t('common:loadingSeason')} lines={4} />
  const years = plan && seasonYears(plan)
  const next = plan && nextEvaluation(plan)
  return <FamilyPage title={title} from={{ label: t('nav:home'), href: home }}
    status={years ? <Badge>{years}</Badge> : undefined}
    details={next ? <span>{t('common:nextEvaluation')} <strong>{evalDay(next)}</strong></span> : undefined}>
    {query.isError ? <LoadError what={child ? title : t('common:yourSeason')} onRetry={() => { void query.refetch() }} retrying={query.isFetching} />
      : plan ? <SeasonCards plan={plan} child={child} />
        : <p className="text-[15px] text-ink-2">{child ? t('common:childSeasonNotShared', { name: child }) : t('common:seasonNotShared')}</p>}
  </FamilyPage>
}
