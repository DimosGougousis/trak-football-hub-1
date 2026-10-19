import { useState } from 'react'
import { KIT_COLORS, KIT_COLLECTIONS, KIT_PATTERNS, KIT_PATTERN_LABELS, KIT_SLOT_LABELS, copyKitSet, kitColorName, type KitColorPart, type KitDesign, type KitSlot, type TeamKitSet } from '@/lib/kit-templates'
import { KitPicker } from './KitPicker'

const parts: { id: KitColorPart; label: string }[] = [
  { id: 'shirt', label: 'Shirt' }, { id: 'secondary', label: 'Pattern' }, { id: 'trim', label: 'Trim' },
  { id: 'shorts', label: 'Shorts' }, { id: 'socks', label: 'Socks' },
]

export function TeamKitEditor({ value, onChange, disabled }: { value: TeamKitSet; onChange: (kits: TeamKitSet) => void; disabled: boolean }) {
  const [slot, setSlot] = useState<KitSlot>('home')
  const [part, setPart] = useState<KitColorPart>('shirt')
  const kit = value[slot]
  const activePart = part === 'secondary' && kit.pattern === 'solid' ? 'shirt' : part
  const update = (patch: Partial<KitDesign>) => onChange({ ...value, [slot]: { ...kit, ...patch } })

  return <fieldset disabled={disabled} className="trak-team-kit-editor space-y-4 min-w-0">
    <legend className="sr-only">Customize team kits</legend>
    <label className="block text-sm">Start with a color set
      <select className="trak-kit-select mt-1" value="" onChange={e => {
        const collection = KIT_COLLECTIONS.find(item => item.id === e.target.value)
        if (collection) onChange(copyKitSet(collection.kits))
      }}>
        <option value="">Choose a preset (replaces all three)</option>
        {KIT_COLLECTIONS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <KitPicker kits={value} value={slot} onChange={setSlot} />
    <label className="block text-sm">{KIT_SLOT_LABELS[slot]} shirt style
      <select className="trak-kit-select mt-1" value={kit.pattern} onChange={e => update({ pattern: e.target.value as KitDesign['pattern'] })}>
        {KIT_PATTERNS.map(pattern => <option key={pattern} value={pattern}>{KIT_PATTERN_LABELS[pattern]}</option>)}
      </select>
    </label>
    <div role="group" aria-label="Part to color" className="flex flex-wrap gap-2">
      {parts.filter(p => p.id !== 'secondary' || kit.pattern !== 'solid').map(p => <button type="button" key={p.id}
        aria-pressed={activePart === p.id} className="trak-kit-part" onClick={() => setPart(p.id)}>{p.label}</button>)}
    </div>
    <div role="group" aria-label={`${KIT_SLOT_LABELS[slot]} ${activePart} color`} className="trak-kit-swatches">
      {KIT_COLORS.map(color => <button key={color.hex} type="button" aria-label={color.name} title={color.name}
        aria-pressed={kit[activePart].toLowerCase() === color.hex.toLowerCase()} className="trak-kit-swatch"
        onClick={() => update({ [activePart]: color.hex })}><span style={{ background: color.hex }} /></button>)}
    </div>
    <label className="flex items-center justify-between gap-3 text-sm">Custom {activePart} color
      <span className="flex items-center gap-2"><span>{kitColorName(kit[activePart])}</span><input type="color" value={kit[activePart]}
        className="h-11 w-12 bg-transparent" onChange={e => update({ [activePart]: e.target.value.toUpperCase() })} /></span>
    </label>
  </fieldset>
}
