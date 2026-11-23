import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useFeatureState } from '@/components/trak/parked'
import { loadSeasonPlan, seasonPlanKey, type SeasonPlan } from '@/lib/season-plan'
import { squadEvaluation, type EvaluationDue } from '@/lib/evaluation'
import { isProgress, type Progress } from '@/lib/objective-progress'
import { dayIn } from '@/lib/watch-first'
import { useAcademyTimeZone } from './useWatching'

/* TRAK-364 (Season plan 16/18): where each of the coach's squads stands with its evaluation. Only where the season
   plan is on, and only for a squad whose plan is shared: there the evaluation replaces the per-player Assess
   reminders (TRAK-197). Days are the academy's, in its time zone; the evaluations and the time zone are read only
   once some plan is shared, so a coach without one asks for nothing new. */

export const seasonEvaluationsKey = (coachId: string | undefined) => ['coach', coachId, 'season-evaluations'] as const

/** The coach's report days sent: which plan, the date, and whether the squad's Send has closed it (TRAK-531: sending
 *  one player first leaves it open). */
export async function loadSeasonEvaluations(): Promise<{ id: string; plan_id: string; due_on: string; closed_at: string | null }[]> {
  const { data, error } = await supabase.from('season_evaluations').select('id, plan_id, due_on, closed_at').retry(false)
  if (error) throw error
  return data ?? []
}

/** Each squad's plan, read only where the switch is on (the same reads as useSeasonPlan(), so they're shared). `shared`
 *  names the squads whose plan is shared; `ready` is false until the switch and every plan have answered. */
export function useSharedPlans(coachId: string | undefined, squads: string[]) {
  const { on, known } = useFeatureState('season_plan')
  const reads = useQueries({
    queries: squads.map(squad => ({
      queryKey: seasonPlanKey(coachId, squad),
      queryFn: () => loadSeasonPlan(coachId!, squad),
      enabled: on && !!coachId,
    })),
  })
  const plans = reads.flatMap((read, i) => (read.data?.shared_at ? [{ squad: squads[i], plan: read.data }] : []))
  // A read that has failed once counts as failed: Home never waits through its retries (the plan's card says so).
  const failed = on && reads.some(read => read.isError || read.failureCount > 0)
  const ready = known && (!on || failed || reads.every(read => !read.isPending))
  const key = plans.map(p => `${p.squad}:${p.plan.id}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the shared plans themselves, not the array's identity
  const shared = useMemo(() => new Set(plans.map(p => p.squad)), [key])
  return { on, plans, shared, ready, failed, retry: () => { reads.forEach(read => { void read.refetch() }) } }
}

/** `sharedOn` and `lastDueOn` are what the dates count from: the day the plan was first shared, the last evaluation.
 *  `sentDays` are every closed report day's date, oldest first: the report days actually sent (TRAK-545). `openId` is
 *  the report day some players were already sent, which stays due until the squad's Send (TRAK-531). */
export type SquadEvaluation = { squad: string; plan: SeasonPlan; due: EvaluationDue; sharedOn: string; lastDueOn: string | null; sentDays: string[]; openId: string | null }

/** Each shared plan's evaluation: what's due and what's next, on the academy's `today`. */
export function useSquadEvaluations(coachId: string | undefined, squads: string[]) {
  const shared = useSharedPlans(coachId, squads)
  const some = shared.plans.length > 0
  const zone = useAcademyTimeZone(coachId, some)
  const evaluations = useQuery({ queryKey: seasonEvaluationsKey(coachId), queryFn: loadSeasonEvaluations, enabled: some && !!coachId })
  const failed = shared.failed || (some && (zone.isError || zone.failureCount > 0 || evaluations.isError || evaluations.failureCount > 0))
  const ready = shared.ready && (failed || !some || (!zone.isPending && !evaluations.isPending))
  const now = new Date()
  const today = dayIn(zone.zone, now)
  const list: SquadEvaluation[] = !ready || failed ? [] : shared.plans.map(({ squad, plan }) => {
    const mine = (evaluations.data ?? []).filter(e => e.plan_id === plan.id)
    const sentDays = mine.filter(e => e.closed_at !== null).map(e => e.due_on).sort()
    const lastDueOn = sentDays.at(-1) ?? null
    const open = mine.find(e => e.closed_at === null) ?? null
    const { due: scheduled, sharedOn } = squadEvaluation({ plan: { ...plan, shared_at: plan.shared_at! }, lastDueOn, zone: zone.zone, now })
    // The open day is the one due, even after a later date passes: its other players still get that day's report.
    const due = open ? { ...scheduled, dueOn: open.due_on, since: scheduled.since ?? open.due_on } : scheduled
    return { squad, plan, sharedOn, lastDueOn, sentDays, due, openId: open?.id ?? null }
  })
  return {
    list, today, zone: zone.zone, ready, failed,
    /** The squads whose per-player Assess reminders give way to the evaluation: the plan is shared. */
    evaluated: shared.shared,
    retry: () => { shared.retry(); void zone.refetch(); void evaluations.refetch() },
  }
}

/** TRAK-531: the players already sent their report on the report day still open (send one player). */
export const sentOnDayKey = (coachId: string | undefined, evaluationId: string | null) => ['coach', coachId, 'sent-on-day', evaluationId] as const
export function useSentOnDay(coachId: string | undefined, evaluationId: string | null) {
  const query = useQuery({
    queryKey: sentOnDayKey(coachId, evaluationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('report_for_player').select('squad_player_id').eq('evaluation_id', evaluationId!)
      if (error) throw error
      return new Set((data ?? []).map(r => r.squad_player_id))
    },
    enabled: !!coachId && !!evaluationId,
  })
  return { ...query, sent: query.data ?? NOBODY, isPending: !!evaluationId && query.isPending }
}
const NOBODY = new Set<string>()

/** TRAK-531: where report day starts each player's objectives: his latest answer to each, from an assessment since the
 *  last report day (`after`, or from the season's first day `from`), in the academy's `zone`. */
export const reportDayAnswersKey = (coachId: string | undefined, from: string | null) => ['coach', coachId, 'report-day-answers', from] as const
export function useReportDayAnswers(coachId: string | undefined, { after, from, zone }: { after: string | null; from: string | null; zone: string }) {
  const since = after ?? from
  return useQuery({
    queryKey: reportDayAnswersKey(coachId, since),
    queryFn: async () => {
      // A day early on the server, whatever the zone; the academy's day decides below.
      const coarse = new Date(Date.parse(`${since}T00:00:00Z`) - 86_400_000).toISOString()
      const { data, error } = await supabase.from('assessment_objectives' as never)
        .select('player_objective_id, status, coach_assessments!inner(squad_player_id, created_at)')
        .gte('coach_assessments.created_at', coarse).not('status', 'is', null).retry(false)
      if (error) throw error
      type Row = { player_objective_id: string | null; status: string | null; coach_assessments: { squad_player_id: string | null; created_at: string } }
      const latest = new Map<string, Map<string, { at: string; status: Progress }>>()
      for (const row of (data ?? []) as unknown as Row[]) {
        const { squad_player_id: player, created_at: at } = row.coach_assessments
        const day = dayIn(zone, new Date(at))
        if (!player || !row.player_objective_id || !isProgress(row.status) || (after ? day <= after : day < since!)) continue
        const mine = latest.get(player) ?? new Map()
        const seen = mine.get(row.player_objective_id)
        if (!seen || seen.at < at) mine.set(row.player_objective_id, { at, status: row.status })
        latest.set(player, mine)
      }
      return new Map([...latest].map(([player, answers]) => [player, Object.fromEntries([...answers].map(([id, a]) => [id, a.status]))]))
    },
    enabled: !!coachId && !!since,
  })
}
