import { KIT_SLOT_LABELS, KIT_PATTERN_LABELS, kitColorName, type KitDesign, type KitSlot } from '@/lib/kit-templates'
import { KitIllustration } from './KitIllustration'
import './kits.css'

/** Same family-safe content for coach, parent and player event sheets. */
export function KitAnnouncement({ kit, slot, animated = true }: { kit?: KitDesign | null; slot?: KitSlot; animated?: boolean }) {
  if (!kit || !slot) return <p className="trak-kit-unspecified">Kit to be confirmed by the coach.</p>
  return <section className="trak-kit-announcement" aria-label="What to wear">
    <div className="trak-kit-announcement-art"><KitIllustration kit={kit} label={`${KIT_SLOT_LABELS[slot]} kit`} animated={animated} /></div>
    <div className="trak-kit-announcement-copy">
      <p className="trak-kit-eyebrow">What to wear</p>
      <h3>{KIT_SLOT_LABELS[slot]} kit</h3>
      <dl>{(['shirt', 'shorts', 'socks'] as const).map(part => <div key={part}>
        <dt><span aria-hidden="true" style={{ backgroundColor: kit[part] }} />{part.charAt(0).toUpperCase() + part.slice(1)}</dt>
        <dd>{kitColorName(kit[part])}</dd>
      </div>)}</dl>
      {kit.pattern !== 'solid' && <p className="trak-kit-pattern">{kitColorName(kit.secondary)} {KIT_PATTERN_LABELS[kit.pattern].toLowerCase()}</p>}
      <p className="trak-kit-pattern">{kitColorName(kit.trim)} trim</p>
    </div>
  </section>
}
