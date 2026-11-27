import { format } from 'date-fns'
import { fullTime } from '@/lib/games/loop'
import { trainingEnd } from '@/lib/training/sessions'
import { dateLocale, useTranslation } from '@/lib/i18n'
import type { HomeDay } from './useHomeTodos'

/* TRAK-608 (New Home 2/8): the top of Home, as the 26 Nov mockup: the day and time, "Good morning, Jürgen", and one line
   for the kind of day: nothing on, a training (before, during, after), a match (the same), or the day after a match. */

export function HomeGreeting({ name, day }: { name: string; day: HomeDay | null }) {
  const { t } = useTranslation()
  const now = day?.now ?? Date.now()
  const hour = new Date(now).getHours()
  const first = name.trim().split(/\s+/)[0] ?? ''
  const greeting = t(hour >= 18 ? 'coachHome:greetEvening' : hour >= 12 ? 'coachHome:greetAfternoon' : 'coachHome:greetMorning', { name: first })
  return <section aria-labelledby="home-greeting" className="grid gap-1">
    <p className="text-[13px] font-medium text-ink-3 tabular-nums">{format(new Date(now), 'EEEE d MMMM · HH:mm', { locale: dateLocale() })}</p>
    <h2 id="home-greeting" className="text-[26px] font-semibold leading-tight tracking-tight text-ink laptop:text-[30px]">{greeting}</h2>
    {day && <p className="text-base text-ink-2 laptop:text-[17px]">{t(dayLine(day))}</p>}
  </section>
}

type DayLine = 'coachHome:dayQuiet' | 'coachHome:dayTrainingBefore' | 'coachHome:dayTrainingDuring' | 'coachHome:dayTrainingAfter'
  | 'coachHome:dayMatchBefore' | 'coachHome:dayMatchDuring' | 'coachHome:dayMatchAfter' | 'coachHome:dayAfterMatch'

/** The line under the greeting: a match day first, then a training day, then the day after a match. */
function dayLine({ trainings, matches, matchYesterday, now }: HomeDay): DayLine {
  const match = matches[0]
  if (match) {
    const game = { id: match.id, published: !!match.published, starts_at: match.starts_at!, ends_at: match.ends_at ?? null }
    return now < Date.parse(game.starts_at) ? 'coachHome:dayMatchBefore' : now < fullTime(game) ? 'coachHome:dayMatchDuring' : 'coachHome:dayMatchAfter'
  }
  const training = trainings[0]
  if (training) {
    const end = trainingEnd({ id: training.id, starts_at: training.starts_at!, ends_at: training.ends_at ?? null, start_time: training.start_time ?? null })
    return now < Date.parse(training.starts_at!) ? 'coachHome:dayTrainingBefore' : now < end ? 'coachHome:dayTrainingDuring' : 'coachHome:dayTrainingAfter'
  }
  return matchYesterday ? 'coachHome:dayAfterMatch' : 'coachHome:dayQuiet'
}
