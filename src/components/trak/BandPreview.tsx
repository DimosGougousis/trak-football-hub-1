import { computeMatchScore, scoreToBand } from '@/lib/rating-engine'
import { BandPill } from './BandPill'
import { BANDS } from '@/lib/types'
import type { MatchInput } from '@/lib/types'

interface BandPreviewProps {
  matchInput: Partial<MatchInput>
  visible: boolean
}

export function BandPreview({ matchInput, visible }: BandPreviewProps) {
  if (!visible) return null

  const score = computeMatchScore(matchInput as MatchInput)
  const band = scoreToBand(score)
  const config = BANDS.find(b => b.word.toLowerCase() === band)!

  return (
    <div className="fixed bottom-20 left-0 right-0 mx-auto max-w-[430px] px-5 z-40">
      <div
        className="flex items-center justify-center gap-3 py-3 rounded-[14px] border"
        style={{ background: config.bg, borderColor: config.border }}
      >
        <span className="text-[9px] font-medium tracking-[0.12em] uppercase text-line-strong" style={{ fontFamily: 'var(--t-font-mono)' }}>
          CURRENT BAND
        </span>
        <BandPill band={band} />
      </div>
    </div>
  )
}
