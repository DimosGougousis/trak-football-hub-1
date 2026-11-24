import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/arc/button/button'
import { PlayerFace } from '@/components/trak/PlayerFace'
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area'
import { BandChip, type SquadPlayer } from '@/components/arc/blocks/team-directory/squad-directory'
import { CoachAssessmentCard } from '@/components/coach/CoachAssessmentCard'
import { LoadError } from '@/components/trak/LoadError'
import { ATTRIBUTES } from '@/lib/squad/attributes'
import { bornLine } from '@/lib/squad/format'
import { loadPlayerAssessments } from '@/lib/coach-assessments'
import { PlayerFactsEditor } from './PlayerFactsEditor'
import type { PlayerFacts } from './usePlayerFacts'
import { MorphBlock, SkeletonMorph } from '@/components/arc/skeleton-morph/skeleton-morph'
import { PlayerObjectivesSection } from '@/components/coach/season-plan/PlayerObjectivesSection'
import { isPosition } from '@/lib/positions'
import { PositionAndRolesSheet } from './PositionAndRolesSheet'
import { SentReports } from './PlayerReport'
import { usePlayerRoles } from './usePlayerRoles'
import { useTranslation } from '@/lib/i18n'
import { POSITION_WORD } from '@/lib/position-words'
import { ATTRIBUTE_WORD } from '@/lib/squad/attribute-words'
import { ROLE_WORD, TRAIT_WORD, shown } from '@/lib/squad/trait-words'
import { EditIcon } from '@/components/trak/IconAction'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'
import { SECTION_LABEL } from '@/components/trak/standard'

const FOOT = { left: 'coachSquad:footLeft', right: 'coachSquad:footRight', both: 'coachSquad:footBoth' } as const
/** TRAK-451 (walk-through of 11 Nov): every block on the page has the same bold title, and the page's smaller cards sit
 *  inside its own card (corners and room from TRAK-464). TRAK-546: Position and roles, and About, are a card each. */
const TITLE = SECTION_LABEL
const INNER = 'rounded-xl border border-line p-4'

/** TRAK-461: while a part of the page loads, a placeholder its size stands in its place and grows into it. */
function Grows({ loading, label, height, children }: { loading: boolean; label: string; height: number; children: ReactNode }) {
  return <SkeletonMorph loading={loading} stagger={0} loadingLabel={label}>
    <MorphBlock height={height} radius={12} style={{ width: '100%' }}>{children}</MorphBlock>
  </SkeletonMorph>
}
/** The assessments shown at first, newest first. TRAK-368: "All N" shows the rest here too. */
const SHOWN = 6

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 border-b border-line py-2.5 last:border-b-0">
    {/* TRAK-511 (Imad, 21 Nov): the label reads apart from its value, also when the value is a grey "No position yet". Bold, not
        medium: on Apple devices Trak's font is Futura, whose lightest face is Medium, so medium looks like regular. */}
    <dt className="text-sm font-semibold text-ink-3">{label}</dt>
    <dd className="m-0 min-w-0 text-[15px] text-ink">{children}</dd>
  </div>
}

/**
 * TRAK-263 (Imad, 22 Oct): one player's profile in Squad's Players view. Foot, nationality, born and traits (the
 * coach edits all but the date of birth, which is the academy roster's); the coach's assessment card exactly as it is
 * elsewhere. TRAK-546 (Kostas, 22 Nov): no "Season so far" radar here; the hexagon lives only in the report. Imad, 23 Oct: one row of cards, the latest first, swiping to
 * earlier ones, with no date line above them (the card's quick look has the date and session).
 */
export function PlayerProfile({ player, squad, coachId, facts, factsFailed, onRetryFacts, placement, onViewReport, onOpenReport }: {
  player: SquadPlayer
  squad: string | null
  coachId: string
  facts: PlayerFacts | undefined
  factsFailed: boolean
  onRetryFacts: () => void
  /** TRAK-353, TRAK-354: where the season plan is on, the roster's position; the player's position and roles, and their objectives, show here. */
  placement?: { position: string | null }
  /** TRAK-527 (Reports 4/10): where the squad's plan is shared, the player's report, under Assess. */
  onViewReport?: () => void
  /** TRAK-528 (Reports 5/10): the reports he was sent, under his assessments, each opening by its evaluation. */
  onOpenReport?: (evaluationId: string) => void
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const notSet = <span className="text-ink-3">{t('coachSchedule:notSet')}</span>
  const client = useQueryClient()
  const first = player.name.split(' ')[0]
  const key = ['coach', coachId, 'player-assessments', player.id]
  const assessments = useQuery({ queryKey: key, queryFn: () => loadPlayerAssessments(player.id, coachId), enabled: !player.waiting })
  const list = assessments.data?.list ?? []
  // TRAK-368: the whole history, in place. The address keeps it open, so coming back from an assessment (or a reload)
  // finds the list as it was left.
  const [params, setParams] = useSearchParams()
  const all = params.get('history') === 'all'
  const showAll = (on: boolean) => setParams(current => {
    const next = new URLSearchParams(current)
    if (on) next.set('history', 'all')
    else next.delete('history')
    return next
  }, { replace: true })
  const card = (assessment: (typeof list)[number]) => <CoachAssessmentCard assessment={assessment} playerName={player.name}
    message={assessments.data?.messages[assessment.id]} messageFailed={assessments.data?.sent === undefined} note={assessments.data?.notes[assessment.id]}
    objectives={assessments.data?.objectives?.[assessment.id]} objectivesFailed={!!assessments.data && assessments.data.objectives === undefined}
    onChanged={() => { void client.invalidateQueries({ queryKey: key }) }} />

  const header = <div className="flex items-center gap-4">
    <PlayerFace name={player.name} size="lg" />
    <div className="grid min-w-0 gap-2">
      {/* TRAK-428: a long name wraps beside the band, never cut ("Giourkas Sei…" on a phone). */}
      <h3 className="break-words text-xl font-bold tracking-[-0.01em] text-ink">{player.name}</h3>
      <p className="text-sm text-ink-2">{[player.shirt != null && `#${player.shirt}`, player.position, squad].filter(Boolean).join(' · ')}</p>
    </div>
    <span className="ml-auto"><BandChip band={player.band} move={player.move} waiting={player.waiting} /></span>
  </div>

  // As everywhere in the coach's app: nothing is recorded about a player still waiting for consent.
  if (player.waiting) return <>{header}<p className="text-sm text-ink-2">{t('coachSquad:waitingConsentBody', { name: first })}</p></>

  return <>
    {header}

    {/* TRAK-546 (Kostas, 22 Nov): Position and roles, and About, a card each; on a laptop side by side, the same height. */}
    <div className={`grid gap-4 ${placement ? 'laptop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
      {placement && <div data-inner-card className={INNER}><PositionAndRoles coachId={coachId} id={player.id} name={player.name} position={placement.position} /></div>}
      <section data-inner-card aria-labelledby={`about-${player.id}`} className={`${INNER} grid content-start gap-2`}>
        {/* TRAK-546: About's pencil right of its title, as Position and roles' is. */}
        <div className="flex items-baseline justify-between gap-3">
          <h4 id={`about-${player.id}`} className={TITLE}>{t('coachSquad:aboutName', { name: first })}</h4>
          {facts && !factsFailed && <PlayerFactsEditor playerId={player.id} name={player.name} coachId={coachId} facts={facts} />}
        </div>
        {factsFailed ? <LoadError what={t('coachSquad:profileWhat', { name: first })} onRetry={onRetryFacts} />
          : <Grows loading={!facts} label={t('coachSquad:loadingProfile', { name: first })} height={196}>{facts && <dl className="m-0 border-t border-line">
              <Fact label={t('coachSquad:preferredFoot')}>{facts.foot ? t(FOOT[facts.foot]) : notSet}</Fact>
              <Fact label={t('coachSquad:nationality')}>{facts.nationality ?? notSet}</Fact>
              <Fact label={t('coachSquad:born')}>{facts.born ? bornLine(facts.born, new Date()) : notSet}</Fact>
              <Fact label={t('coachSquad:traits')}>{facts.traits.length
                ? <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t('coachSquad:traitsOf', { name: first })}>
                    {facts.traits.map(trait => <li key={trait} className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-sm text-ink">{shown(TRAIT_WORD, trait)}</li>)}
                  </ul>
                : <span className="text-ink-3">{t('coachSquad:nonePicked')}</span>}</Fact>
            </dl>}</Grows>}
      </section>
    </div>

    {placement && <PlayerObjectivesSection coachId={coachId} id={player.id} name={player.name} position={placement.position} squad={squad} />}

    {assessments.isError ? <LoadError what={t('coachSquad:assessmentsWhat', { name: first })} onRetry={() => { void assessments.refetch() }} />
      : <Grows loading={!assessments.data} label={t('coachSquad:loadingAssessments', { name: first })} height={280}>{assessments.data && <section aria-labelledby={`assessments-${player.id}`} className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h4 id={`assessments-${player.id}`} className={TITLE}>{t('coachSquad:assessments')}</h4>
          {/* TRAK-568 (phone review, 23 Nov): no "Swipe for earlier" line; the slider bar under the cards already says so. */}
          {list.length > SHOWN && <button type="button" onClick={() => showAll(!all)} className="text-sm font-medium text-brand">{all ? t('coachSquad:showLatest', { count: SHOWN }) : t('coachSquad:allCount', { count: list.length })}</button>}
        </div>
        {/* TRAK-501 (Imad, 19 Nov): before the first assessment, the six bands empty, where the first card will be. */}
        {list.length === 0 ? <div role="group" aria-label={t('coachSquad:noAssessmentYet')} className={`${INNER} grid gap-2.5 laptop:w-[calc(50%-6px)]`}>
            {ATTRIBUTES.map(([k]) => <CategoryBar key={k} label={t(ATTRIBUTE_WORD[k])} />)}
          </div>
          : all && list.length > SHOWN ? <ol className="m-0 grid list-none gap-3 p-0 laptop:grid-cols-2" aria-label={t('coachSquad:allAssessmentsOf', { name: first })}>
            {list.map(assessment => <li key={assessment.id} className="min-w-0">{card(assessment)}</li>)}
          </ol>
          : <div className="arc">
            {/* As ParentAssessmentCarousel: the viewport is the row, so 88% is of what's visible and the next card peeks in. */}
            {/* Imad, 24 Oct: room above and below, so a card lifted on hover keeps its edge and shadow; firm snapping only
                under a finger: on a trackpad or wheel any snapping pulled the row back mid-swipe. */}
            <ScrollArea orientation="horizontal" snap="x mandatory" fade={0} label={t('coachSquad:assessmentsOf', { name: first })} className="-mt-2 -mb-4" viewportClassName="flex gap-3 pt-2 pb-4">
              {list.slice(0, SHOWN).map((assessment, index) => <div key={assessment.id} role="group" aria-label={t('coachSquad:assessmentNofM', { n: index + 1, total: Math.min(list.length, SHOWN) })}
                className="min-w-0 basis-[88%] laptop:basis-[calc(50%-6px)] shrink-0 grow-0" style={{ scrollSnapAlign: 'start' }}>
                {card(assessment)}
              </div>)}
            </ScrollArea>
          </div>}
      </section>}</Grows>}

    {onOpenReport && <SentReports playerId={player.id} name={player.name} coachId={coachId} onOpen={onOpenReport} />}

    {/* TRAK-423: the same small button as Home's Needs you, named for the player. TRAK-501: in the page's grid,
        justify-self keeps its own width (self-start only set its height, so it spanned the page). */}
    <Button size={NEXT_STEP_SIZE} className={`justify-self-start ${NEXT_STEP_WIDTH}`} aria-label={t('coachSquad:assessName', { name: first })}
      onClick={() => navigate('/coach/assess', { state: { preselectedPlayerId: player.id } })}>
      {t('coachHome:assess')}
    </Button>
    {onViewReport && <Button variant="secondary" size={NEXT_STEP_SIZE} className={`-mt-3 justify-self-start ${NEXT_STEP_WIDTH} laptop:-mt-5`}
      aria-label={t('coachSquad:viewReportName', { name: first })} onClick={onViewReport}>
      {t('coachSquad:viewReport')}
    </Button>}
  </>
}

/** TRAK-353: the player's main position, roles and Can also play, with one Edit for all three (the mockup's profile). */
function PositionAndRoles({ coachId, id, name, position }: { coachId: string; id: string; name: string; position: string | null }) {
  const [editing, setEditing] = useState(false)
  const { t } = useTranslation()
  const roles = usePlayerRoles(coachId)
  const first = name.split(' ')[0]
  const { also, roles: held } = roles.of(id)
  return <section aria-labelledby={`position-${id}`} className="grid gap-2">
    <div className="flex items-baseline justify-between gap-3">
      <h4 id={`position-${id}`} className={TITLE}>{t('coachSquad:positionAndRoles')}</h4>
      <EditIcon label={t('coachSquad:editPositionRoles', { name: first })} haspopup onClick={() => setEditing(true)} />
    </div>
    {roles.isError ? <LoadError what={t('coachSquad:rolesWhat', { name: first })} onRetry={() => { void roles.refetch() }} />
      : <Grows loading={!roles.data} label={t('coachSquad:loadingRoles', { name: first })} height={138}>{roles.data && <dl className="m-0 border-t border-line">
        <Fact label={t('coachSquad:mainPosition')}>{isPosition(position) ? t(POSITION_WORD[position]) : <span className="text-ink-3">{t('coachSquad:noPositionYet')}</span>}</Fact>
        <Fact label={t('coachSquad:roles')}>{held.length ? held.map(role => shown(ROLE_WORD, role)).join(', ') : <span className="text-ink-3">{t('coachSquad:noRoleYet')}</span>}</Fact>
        <Fact label={t('coachSquad:canAlsoPlay')}>{also.length ? also.map(p => t(POSITION_WORD[p])).join(', ') : <span className="text-ink-3">{t('coachSquad:noneYet')}</span>}</Fact>
      </dl>}</Grows>}
    <PositionAndRolesSheet coachId={coachId} player={{ id, name, position }} open={editing} onOpenChange={setEditing} saveNeedsChange
      onSaved={() => setEditing(false)} />
  </section>
}
