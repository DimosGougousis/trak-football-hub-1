import { forwardRef, type CSSProperties } from 'react'
import { ElasticSlider } from '@/components/arc/elastic-slider/elastic-slider'
import { BANDS } from '@/lib/types'
import { scoreToBand } from '@/lib/rating-engine'

interface SliderInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  /** Arc's slider isn't a native input, so a locked fieldset can't disable it: pass the lock here. */
  disabled?: boolean
}

function bandConfig(value: number) {
  const band = scoreToBand(value)
  return BANDS.find(b => b.word.toLowerCase() === band) ?? BANDS[BANDS.length - 1]
}

// TRAK-182 (Imad, 15 Oct): Arc's elastic slider. The thumb clicks into each
// band's lower edge (2, 4, 6, 7, 8, 9), the fill takes the band's colour, and
// the readout says the score and its band, e.g. "7 · Good".
const BAND_EDGES = [...new Set(BANDS.map(b => b.minScore).filter(score => score > 0))].sort((a, b) => a - b)

export const SliderInput = forwardRef<HTMLDivElement, SliderInputProps>(
  function SliderInput({ label, value, onChange, disabled }, ref) {
    const cfg = bandConfig(value)
    return (
      <div ref={ref} className={`arc${disabled ? ' opacity-40 grayscale' : ''}`}
        style={{ '--control-fill': cfg.color } as CSSProperties}>
        <ElasticSlider label={label} value={value} onValueChange={onChange} min={0} max={10} step={1}
          marks={BAND_EDGES} format={score => `${score} · ${bandConfig(score).word}`} disabled={disabled} />
      </div>
    )
  },
)
