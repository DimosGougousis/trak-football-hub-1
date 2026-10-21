import { KIT_SLOTS, KIT_SLOT_LABELS, type KitSlot, type TeamKitSet } from '@/lib/kit-templates'
import { KitIllustration } from './KitIllustration'
import './kits.css'

/** Controlled selector: the caller owns the selection and persistence. */
export function KitPicker({ kits, value, onChange }: { kits: TeamKitSet; value: KitSlot | null; onChange: (slot: KitSlot) => void }) {
  const name = useId()
  return <fieldset className="trak-kit-picker">
    <legend className="sr-only">Choose the event kit</legend>
    {KIT_SLOTS.map(slot => <label key={slot} className={`trak-kit-option ${value === slot ? 'is-selected' : ''}`}>
      <input type="radio" name={name} value={slot} checked={value === slot} onChange={() => onChange(slot)} />
      <span className="trak-kit-option-label">{KIT_SLOT_LABELS[slot]}<span className="trak-kit-radio" aria-hidden="true">{value === slot ? '✓' : ''}</span></span>
      <KitIllustration kit={kits[slot]} label={`${KIT_SLOT_LABELS[slot]} kit`} />
    </label>)}
  </fieldset>
}
import { useId } from 'react'
