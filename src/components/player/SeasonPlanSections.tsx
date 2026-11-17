import { Badge } from '@/components/arc/badge/badge'
import { ObjectiveStatusChip } from '@/components/player/ObjectiveStatusChip'
import { familyCard, familyColumns, familyH2, familyStack } from '@/components/trak/FamilyPage'
import { useTranslation } from '@/lib/i18n'
import { evalDay } from '@/lib/evaluation'
import { nextEvaluation, objectiveWord, type MySeason } from '@/lib/my-season'

/* TRAK-398, TRAK-400 (Season plan 18/18 builds 3 and 5, spec TRAK-366): the body of the season page, shared by the
   player's My season and the family's "Alex's season". Same read, same words; only the headings change. `child` is the
   child's first name on the family page and absent for the player ("Your position"). */

const font = { fontFamily: 'var(--t-font)' }
const card = 'rounded-2xl border border-line bg-surface p-4 grid gap-3'
const heading = 'text-[15px] font-medium text-ink-2'

/** "Set by Coach Rami. Next evaluation Sun 29 Nov 2026." The date is left out once none is left or the next is waiting on the coach. */
export function seasonSubtitle(plan: MySeason): string {
  const by = plan.coach_name ? `Set by ${plan.coach_name}.` : 'Set by your coach.'
  const next = nextEvaluation(plan)
  return next ? `${by} Next evaluation ${evalDay(next, true)}.` : by
}

export function SeasonPlanSections({ plan, child }: { plan: MySeason; child?: string }) {
  const own = child ? `${child}'s` : 'Your'
  return <>
    <section aria-label={`${own} position`} className={card}>
      <h2 className={heading} style={font}>{own} position</h2>
      <div className="flex flex-wrap gap-2">
        {[plan.position, ...plan.also_plays.map(p => `Can also play ${p}`), ...plan.roles].filter(Boolean).map((text, i) => (
          <span key={`${text}-${i}`} className={`rounded-full border border-line bg-surface px-3 py-1 text-[14px] text-ink ${i === 0 ? 'font-medium' : ''}`} style={font}>{text}</span>
        ))}
      </div>
    </section>
    <section aria-label="Squad objectives" className={card}>
      <h2 className={heading} style={font}>Squad objectives</h2>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {plan.season_objectives.map(o => (
          <li key={o.id} className="grid gap-1">
            <span className="text-[16px] font-medium text-ink" style={font}>{o.title}</span>
            {o.looks_like && <span className="text-[14px] text-ink-2" style={font}>{o.looks_like}</span>}
          </li>
        ))}
      </ul>
    </section>
    {plan.objectives.length > 0 && (
      <section aria-label={`${own} objectives`} className={card}>
        <h2 className={heading} style={font}>{own} objectives</h2>
        <ul className="m-0 grid list-none gap-3.5 p-0">
          {plan.objectives.map(o => {
            const word = objectiveWord(o)
            return (
              <li key={o.id} className="grid gap-1.5">
                <div className="flex items-start justify-between gap-2.5">
                  <span className="text-[16px] font-medium text-ink" style={font}>{o.title}</span>
                  {word && <ObjectiveStatusChip status={word} />}
                </div>
                {o.history.length > 0 && (
                  <ul aria-label={`History of ${o.title}`} className="m-0 grid list-none gap-1 p-0">
                    {o.history.map(h => (
                      <li key={h.due_on} className="flex items-center justify-between gap-2 text-[14px] text-ink-2" style={font}>
                        <span>{evalDay(h.due_on)}</span>
                        <ObjectiveStatusChip status={h.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    )}
  </>
}

/** TRAK-441 slice 5 (mockup, 12 Nov): the same plan in the coach's cards. The position as chips, the player's objectives
 *  with their word, the squad's with what each looks like; two columns on a laptop. The per-evaluation history is on
 *  each evaluation's page (Progress), so it isn't said again here. */
export function SeasonCards({ plan, child }: { plan: MySeason; child?: string }) {
  const { t } = useTranslation()
  const own = (key: 'Position' | 'Objectives') => child ? t(`common:child${key}`, { name: child }) : t(`common:your${key}`)
  const chips = [plan.position, ...plan.also_plays.map(position => t('common:canAlsoPlay', { position })), ...plan.roles].filter(Boolean)
  const card = (title: string, body: JSX.Element) => <section aria-label={title} className={familyCard}><h2 className={familyH2}>{title}</h2>{body}</section>
  return <div className={familyColumns}>
    <div className={familyStack}>
      {chips.length > 0 && card(own('Position'), <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((text, i) => <Badge key={`${text}-${i}`} size="lg" pill outline={i > 0}>{text}</Badge>)}
      </div>)}
      {plan.objectives.length > 0 && card(own('Objectives'), <ul className="mt-2 divide-y divide-line">
        {plan.objectives.map(o => {
          const word = objectiveWord(o)
          return <li key={o.id} className="flex items-center justify-between gap-3 py-3">
            <span className="text-[15px] text-ink">{o.title}</span>{word && <ObjectiveStatusChip status={word} />}
          </li>
        })}
      </ul>)}
    </div>
    {card(t('common:squadObjectives'), <ul className="mt-3 grid gap-4">
      {plan.season_objectives.map(o => <li key={o.id} className="grid gap-1">
        <span className="text-[15px] font-medium text-ink">{o.title}</span>
        {o.looks_like && <span className="text-[14px] text-ink-2">{o.looks_like}</span>}
      </li>)}
    </ul>)}
  </div>
}
