import { useId, useState } from 'react'
import { NumberField } from '@/components/arc/number-field/number-field'
import { CUSTOM_WEEKS, EVAL_MONTHS, WEEKDAYS, weeksOf, type EvalEvery } from '@/lib/evaluation'
import { useTranslation } from '@/lib/i18n'

/* TRAK-364 (Season plan 16/18): "Evaluate each player", the season's rhythm and the day (the last one of the month for
   the month choices). The line under it says the first or next date, or why there's none. The set-up's step 1 and
   View plan's Edit both use it. TRAK-525 (Reports 2/10): every month, every 3 months, every 6 months or Custom, a number
   of weeks from 2 to 26; a plan saved as every 2 or 6 weeks shows as Custom. */

// TRAK-503 (Imad, 19 Nov): the options fill their row, never half of it. The frequencies grow to fill each line they
// wrap onto; the seven days are one row of equal cells at any width, so a cell carries no side padding.
const chip = (on: boolean, fit: string) =>
  `${fit} min-h-10 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink'}`

const MONTH_LABEL = { month: 'coachSquad:rhythmMonth', '3m': 'coachSquad:rhythm3Months', '6m': 'coachSquad:rhythm6Months' } as const

export function EvaluationRhythm({ every, day, onChange, line }: {
  every: EvalEvery
  day: number
  onChange: (next: { every: EvalEvery; day: number }) => void
  /** The first or next date, as the screen works it out. */
  line: string
}) {
  const id = useId()
  const { t } = useTranslation()
  const weeks = weeksOf(every)
  // Back on Custom after a month choice, the weeks the coach last had.
  const [lastWeeks, setLastWeeks] = useState(weeks ?? CUSTOM_WEEKS.start)
  const setWeeks = (next: number) => { setLastWeeks(next); onChange({ every: `${next}w`, day }) }
  return (
    <div className="grid gap-3">
      <div role="group" aria-labelledby={`${id}-every`} className="grid gap-2">
        <span id={`${id}-every`} className="text-sm font-medium text-ink">Send each player a report</span>
        <div className="flex flex-wrap gap-2">
          {EVAL_MONTHS.map(value => <button key={value} type="button" aria-pressed={every === value} className={chip(every === value, 'grow px-3.5')}
            onClick={() => onChange({ every: value, day })}>{t(MONTH_LABEL[value])}</button>)}
          <button type="button" aria-pressed={weeks !== null} className={chip(weeks !== null, 'grow px-3.5')}
            onClick={() => onChange({ every: `${lastWeeks}w`, day })}>{t('coachSquad:rhythmCustom')}</button>
        </div>
      </div>
      {weeks !== null && <div className="arc">
        <NumberField label={t('coachSquad:rhythmWeeks')} value={weeks} min={CUSTOM_WEEKS.min} max={CUSTOM_WEEKS.max}
          suffix={` ${t('coachSquad:rhythmWeeksUnit')}`} onValueChange={setWeeks} />
      </div>}
      <div role="group" aria-labelledby={`${id}-day`} className="grid gap-2">
        <span id={`${id}-day`} className="text-sm font-medium text-ink">{weeks === null ? 'On the last' : 'On a'}</span>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((name, index) => <button key={name} type="button" aria-pressed={day === index} aria-label={name} className={chip(day === index, 'min-w-0 px-0')}
            onClick={() => onChange({ every, day: index })}>{name.slice(0, 3)}</button>)}
        </div>
      </div>
      <p className="text-sm text-ink-3">{line}</p>
    </div>
  )
}
