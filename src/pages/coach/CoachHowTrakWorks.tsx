import type { ComponentType, ReactNode } from 'react'
import { ArrowRight, CalendarDays, ClipboardCheck, House, LayoutGrid, Lock, Settings, Target, TrafficCone, Users } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { WIDE_COLUMN } from '@/components/trak'
import { CoachTrail } from '@/components/coach/CoachTrail'
import { useFeature } from '@/components/trak/parked'
import { PitchIcon } from '@/components/icons/PitchIcon'
import { useTranslation } from '@/lib/i18n'
import { TILE_TONES, type TileTone } from '@/lib/types'
import type words from '@/locales/en/coachHowTrakWorks.json'
import { PageTop } from '@/components/coach/PageTop'

/* TRAK-418 (11 Nov review; Kostas, 12 Nov: option A, a coach's own page). Settings › How Trak works opened a page
   written for players; a coach now reads this one. It reads in the order a coach meets Trak: first, before the season,
   the squad, the season plan and Formations; then every week, Trak's four core jobs. A part or line for something the
   academy has switched off doesn't show, so the page never describes what the coach can't open. Players and parents
   keep their own page (/how-it-works).
   Kostas, 16 Nov: too text-heavy; make it appealing to the eye. Each job now has its own colour and the menu's icon,
   one short line, and its steps drawn as a row of tags with arrows, in place of paragraphs. Kostas, 16 Nov (later):
   the steps are plain, not coloured, and no row of the four jobs under the intro: it was too colourful. The colours are
   the assessment bands' readable shades and tints (lib/types.ts), as the Library's tiles use. */

type Word = keyof typeof words
type Icon = ComponentType<LucideProps>
type Tone = { text: string; bg: string }

const tone = (band: TileTone): Tone => {
  const found = TILE_TONES[band]
  return { text: found.text, bg: found.bg }
}
// The four jobs, each in its own colour; the season's first steps in calmer ones.
const TONES = {
  scheduling: tone('Good'), assessing: tone('Steady'), training: tone('Developing'), matches: tone('Exceptional'),
  squad: tone('Standout'), plan: tone('Mixed'), formations: tone('Exceptional'),
}

/** An icon on its colour's tint, in its colour. */
const Badge = ({ icon: Icon, tone: { text, bg }, size = 'md' }: { icon: Icon; tone: Tone; size?: 'md' | 'lg' }) =>
  <span aria-hidden="true" className={`grid flex-none place-items-center rounded-xl ${size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'}`}
    style={{ background: bg, color: text }}>
    <Icon size={size === 'lg' ? 24 : 20} strokeWidth={1.75} />
  </span>

/** A stage of the coach's year: its number and its name. */
const Stage = ({ id, step, title, intro, children }: { id: string; step?: number; title: Word; intro?: Word; children: ReactNode }) => {
  const { t } = useTranslation()
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <div>
        <h2 id={id} className="flex items-center gap-2.5 text-[19px] font-medium text-ink">
          {step && <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full text-[14px]"
            style={{ background: 'rgb(var(--t-brand))', color: 'rgb(var(--t-on-brand))' }}>{step}</span>}
          {t(`coachHowTrakWorks:${title}`)}
        </h2>
        {intro && <p className="mt-2 text-[15px] text-ink-2">{t(`coachHowTrakWorks:${intro}`)}</p>}
      </div>
      {children}
    </section>
  )
}

/** One of the season's first steps: an icon, a name and one line. */
const First = ({ icon, tone: colour, title, line }: { icon: Icon; tone: Tone; title: Word; line: Word }) => {
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
      <Badge icon={icon} tone={colour} />
      <div className="grid min-w-0 gap-1">
        <p className="text-[16px] font-medium text-ink">{t(`coachHowTrakWorks:${title}`)}</p>
        <p className="text-[14px] leading-snug text-ink-2">{t(`coachHowTrakWorks:${line}`)}</p>
      </div>
    </li>
  )
}

/** A job's steps, left to right: plain tags joined by arrows (Kostas, 16 Nov: the job's colour stays on its icon and edge). */
const Steps = ({ steps }: { steps: Word[] }) => {
  const { t } = useTranslation()
  return (
    <ol aria-label={t('coachHowTrakWorks:steps')} className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {steps.map((step, index) =>
        <li key={step} className="flex items-center gap-1.5">
          <span className="rounded-full border border-line bg-raised px-3 py-1 text-[13px] font-medium text-ink">{t(`coachHowTrakWorks:${step}`)}</span>
          {/* The arrow ends its step, so a row that wraps on a phone starts with a step, never an arrow. */}
          {index < steps.length - 1 && <ArrowRight aria-hidden="true" size={14} className="text-ink-3" />}
        </li>)}
    </ol>
  )
}

/** One of the four jobs: a coloured edge, its icon, its name, one line, its steps and up to two notes. */
const Job = ({ id, icon, tone: colour, title, line, steps, notes }: {
  id: string; icon: Icon; tone: Tone; title: Word; line: Word; steps: Word[]; notes: (Word | false)[]
}) => {
  const { t } = useTranslation()
  const shown = notes.filter((note): note is Word => !!note)
  return (
    <section aria-labelledby={id} className="relative grid content-start gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-5 laptop:p-6">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: colour.text }} />
      <div className="flex items-center gap-3">
        <Badge icon={icon} tone={colour} size="lg" />
        <div className="grid min-w-0 gap-1">
          <h3 id={id} className="text-[17px] font-medium text-ink">{t(`coachHowTrakWorks:${title}`)}</h3>
          <p className="text-[14px] leading-snug text-ink-2">{t(`coachHowTrakWorks:${line}`)}</p>
        </div>
      </div>
      <Steps steps={steps} />
      {shown.length > 0 && <ul className="grid gap-2">
        {shown.map(note =>
          <li key={note} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2">
            <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: colour.text }} />
            {t(`coachHowTrakWorks:${note}`)}
          </li>)}
      </ul>}
    </section>
  )
}

/** A line worth knowing, with its icon. */
const Good = ({ icon: Icon, line }: { icon: Icon; line: Word }) => {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-raised text-ink-2"><Icon size={18} strokeWidth={1.75} /></span>
      <span className="text-[15px] leading-snug text-ink">{t(`coachHowTrakWorks:${line}`)}</span>
    </li>
  )
}

export default function CoachHowTrakWorks() {
  const { t } = useTranslation()
  const on = {
    events: useFeature('events'), games: useFeature('games'), training: useFeature('training'), season: useFeature('season_plan'),
  }

  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className={WIDE_COLUMN}>
        <PageTop className="arc" menu={false} title={t('coachHowTrakWorks:title')} trail={<CoachTrail current={t('coachHowTrakWorks:title')} />}
          below={<p className="mb-4 max-w-[60ch] text-[15px] text-ink-2 laptop:mb-6">{t('coachHowTrakWorks:intro')}</p>} />
        <div className="grid gap-8 laptop:gap-10">
          <Stage id="how-before" step={1} title="beforeTitle">
            <ul className={`grid gap-4 ${on.season ? 'tablet:grid-cols-3' : 'tablet:grid-cols-2'}`}>
              <First icon={Users} tone={TONES.squad} title="beforeSquadTitle" line="beforeSquad" />
              {on.season && <First icon={Target} tone={TONES.plan} title="beforePlanTitle" line="beforePlan" />}
              <First icon={LayoutGrid} tone={TONES.formations} title="beforeFormationsTitle" line="beforeFormations" />
            </ul>
          </Stage>
          <Stage id="how-week" step={2} title="weekTitle" intro="weekIntro">
            <div className="grid gap-4 tablet:grid-cols-2">
              {on.events && <Job id="how-scheduling" icon={CalendarDays} tone={TONES.scheduling} title="schedulingTitle" line="schedulingLine"
                steps={['schedulingStep1', 'schedulingStep2', 'schedulingStep3']} notes={['schedulingNote']} />}
              <Job id="how-assessing" icon={ClipboardCheck} tone={TONES.assessing} title="assessingTitle" line="assessingLine"
                steps={['assessingStep1', 'assessingStep2', 'assessingStep3']} notes={[on.season && 'assessingDue', on.season && 'assessingObjectives']} />
              {on.training && <Job id="how-training" icon={TrafficCone} tone={TONES.training} title="trainingTitle" line="trainingLine"
                steps={['trainingStep1', 'trainingStep2', 'trainingStep3']} notes={['trainingNote']} />}
              {on.games && <Job id="how-matches" icon={PitchIcon} tone={TONES.matches} title="matchesTitle" line="matchesLine"
                steps={['matchesStep1', 'matchesStep2', 'matchesStep3']} notes={['matchesNote']} />}
            </div>
          </Stage>
          <Stage id="how-good" title="goodTitle">
            <ul className="grid gap-4 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
              <Good icon={Lock} line="goodFamilies" />
              <Good icon={House} line="goodHome" />
              <Good icon={Settings} line="goodSettings" />
            </ul>
          </Stage>
        </div>
      </div>
    </div>
  )
}
