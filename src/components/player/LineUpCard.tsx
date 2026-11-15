import { useTranslation } from '@/lib/i18n'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import type { LineUp } from '@/lib/games/share'
import { BoardFace, BoardPitch } from '@/components/coach/squad/formations/FormationBoard'
import { Badge } from '@/components/arc/badge/badge'

/* TRAK-441 slice 3 (Imad, 12 Nov): the player sees the whole line-up of a shared plan, on the coach's own pitch, read
   only: the starters in their places, his own marked "You", and the bench. Names and places only (the database's
   copy holds nothing else): nobody's job, note or expectation, and nobody who was left out. A parent's page has no
   line-up. */

const first = (name: string) => name.split(/\s+/)[0] ?? name
const chips = 'mt-2 flex flex-wrap gap-2'

export function LineUpCard({ lineUp }: { lineUp: LineUp }) {
  const { t } = useTranslation()
  const wide = useSideMenuScreen()
  const { formation, starters, bench } = lineUp
  const shown = (player: { name: string; you: boolean }) => (player.you ? t('common:you') : first(player.name))
  // A shape's numbers are its lines from the back; the keeper comes on top (lib/games/formations).
  const format = formation ? 1 + formation.split('-').reduce((sum, line) => sum + Number(line), 0) : 0
  return (
    <section aria-labelledby="line-up" className="arc rounded-2xl border border-line bg-surface p-5 laptop:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="line-up" className="text-[17px] font-medium text-ink">{t('common:lineUp')}</h2>
        {formation && <span className="text-sm text-ink-3">{formation}</span>}
      </div>
      {formation ? <BoardPitch className="mt-3" label={t('common:startingLineUp', { formation })} shape={formation} format={format} place={(slot, at) => {
        const player = starters.get(slot)
        return player && <div key={slot} style={at}
          className={`absolute grid w-[56px] -translate-x-1/2 -translate-y-1/2 justify-items-center gap-1 rounded-xl p-1 tablet:w-[76px] ${player.you ? 'bg-brand/15 ring-2 ring-brand' : ''}`}>
          <BoardFace name={player.name} size={wide ? 'md' : 'sm'} />
          <span className="max-w-full truncate rounded bg-surface/90 px-0.5 text-[11px] font-medium leading-4 text-ink tablet:text-[12px]">{shown(player)}</span>
        </div>
      }} />
        // A plan saved with no formation has no pitch to draw: the starters as a list.
        : starters.size > 0 && <>
          <h3 className="mt-4 text-sm font-medium text-ink">{t('common:starting')}</h3>
          <ul aria-label={t('common:starting')} className={chips}>
            {[...starters].sort(([a], [b]) => a - b).map(([slot, player]) => <li key={slot}><Badge tone={player.you ? 'success' : 'neutral'}>{shown(player)}</Badge></li>)}
          </ul>
        </>}
      {bench.length > 0 && <>
        <h3 className="mt-4 text-sm font-medium text-ink">{t('common:bench')}</h3>
        <ul aria-label={t('common:bench')} className={chips}>
          {bench.map((player, i) => <li key={i}><Badge tone={player.you ? 'success' : 'neutral'}>{shown(player)}</Badge></li>)}
        </ul>
      </>}
    </section>
  )
}
