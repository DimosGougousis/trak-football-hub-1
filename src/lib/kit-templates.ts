import { z } from 'zod'

export const KIT_SLOTS = ['home', 'away', 'alternate'] as const
export type KitSlot = typeof KIT_SLOTS[number]
export const KIT_SLOT_LABELS: Record<KitSlot, string> = { home: 'Home', away: 'Away', alternate: 'Alternate' }
export const KIT_PATTERNS = ['solid', 'stripes', 'hoops', 'sash', 'halves', 'chest-band'] as const
export const KIT_PATTERN_LABELS: Record<typeof KIT_PATTERNS[number], string> = {
  solid: 'Plain', stripes: 'Stripes', hoops: 'Hoops', sash: 'Sash', halves: 'Halves', 'chest-band': 'Chest band',
}

const hexColor = z.string().regex(/^#[\da-f]{6}$/i, 'Use a six-digit hex color, such as #781D32')
export const kitDesignSchema = z.object({
  pattern: z.enum(KIT_PATTERNS),
  shirt: hexColor, secondary: hexColor, trim: hexColor, shorts: hexColor, socks: hexColor,
}).strict()
export type KitDesign = z.infer<typeof kitDesignSchema>
export const teamKitSetSchema = z.object({
  version: z.literal(1),
  home: kitDesignSchema, away: kitDesignSchema, alternate: kitDesignSchema,
}).strict()
export type TeamKitSet = z.infer<typeof teamKitSetSchema>
export const eventKitSnapshotSchema = z.object({
  version: z.literal(1), slot: z.enum(KIT_SLOTS), design: kitDesignSchema,
}).strict()
export type EventKitSnapshot = z.infer<typeof eventKitSnapshotSchema>

export function readKitSnapshot(value: unknown): EventKitSnapshot | null {
  const result = eventKitSnapshotSchema.safeParse(value)
  return result.success ? result.data : null
}

/** Parsing makes an independent copy, so editing team templates cannot change an event. */
export function snapshotKit(kits: TeamKitSet, slot: KitSlot): EventKitSnapshot {
  return eventKitSnapshotSchema.parse({ version: 1, slot, design: kits[slot] })
}

export function describeEventKit(snapshot: EventKitSnapshot): string {
  return `${KIT_SLOT_LABELS[snapshot.slot]} kit: ${describeKit(snapshot.design)}`
}
export type KitColorPart = Exclude<keyof KitDesign, 'pattern'>

export const KIT_COLORS = [
  { name: 'White', hex: '#F5F3EC' }, { name: 'Black', hex: '#24272C' },
  { name: 'Silver', hex: '#B8BEC8' }, { name: 'Slate', hex: '#596779' },
  { name: 'Navy', hex: '#182D50' }, { name: 'Royal blue', hex: '#245BC4' },
  { name: 'Sky blue', hex: '#76BDE8' }, { name: 'Ice blue', hex: '#C5E5ED' },
  { name: 'Red', hex: '#D93642' }, { name: 'Burgundy', hex: '#781D32' },
  { name: 'Coral', hex: '#F17C72' }, { name: 'Pink', hex: '#ED94BC' },
  { name: 'Orange', hex: '#ED762B' }, { name: 'Amber', hex: '#EDB52D' },
  { name: 'Yellow', hex: '#F4DF48' }, { name: 'Gold', hex: '#CBA654' },
  { name: 'Forest green', hex: '#226348' }, { name: 'Green', hex: '#32A066' },
  { name: 'Mint', hex: '#9AD8BE' }, { name: 'Lime', hex: '#C4EB60' },
  { name: 'Teal', hex: '#19888B' }, { name: 'Turquoise', hex: '#50CBCC' },
  { name: 'Purple', hex: '#7151AC' }, { name: 'Lavender', hex: '#B8A5DD' },
] as const

export function kitColorName(hex: string): string {
  return KIT_COLORS.find(color => color.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex.toUpperCase()
}

export function describeKit(kit: KitDesign): string {
  const pattern = kit.pattern === 'solid' ? '' : ` with ${kitColorName(kit.secondary).toLowerCase()} ${KIT_PATTERN_LABELS[kit.pattern].toLowerCase()}`
  return `${kitColorName(kit.shirt)} shirt${pattern}, ${kitColorName(kit.trim).toLowerCase()} trim, ${kitColorName(kit.shorts).toLowerCase()} shorts, ${kitColorName(kit.socks).toLowerCase()} socks`
}

const white = '#F5F3EC'
const dark = '#24272C'
function teamSet(primary: string, accent: string, third: string, pattern: KitDesign['pattern'] = 'solid'): TeamKitSet {
  return {
    version: 1,
    home: { pattern, shirt: primary, secondary: white, trim: accent, shorts: white, socks: primary },
    away: { pattern: 'solid', shirt: white, secondary: primary, trim: primary, shorts: primary, socks: white },
    alternate: { pattern: 'solid', shirt: third, secondary: accent, trim: accent, shorts: third, socks: third },
  }
}

export const KIT_COLLECTIONS = [
  { id: 'burgundy-gold', name: 'Burgundy & gold', kits: teamSet('#781D32', '#CBA654', '#182D50') },
  { id: 'royal-white', name: 'Royal & white', kits: teamSet('#245BC4', white, '#F4DF48') },
  { id: 'forest-white', name: 'Forest & white', kits: teamSet('#226348', white, '#24272C', 'hoops') },
  { id: 'red-white', name: 'Red & white', kits: teamSet('#D93642', white, '#182D50', 'stripes') },
  { id: 'sky-navy', name: 'Sky & navy', kits: teamSet('#76BDE8', '#182D50', '#7151AC') },
  { id: 'amber-black', name: 'Amber & black', kits: teamSet('#EDB52D', dark, '#596779') },
  { id: 'orange-navy', name: 'Orange & navy', kits: teamSet('#ED762B', '#182D50', '#9AD8BE') },
  { id: 'purple-white', name: 'Purple & white', kits: teamSet('#7151AC', white, '#182D50') },
  { id: 'teal-navy', name: 'Teal & navy', kits: teamSet('#19888B', '#182D50', '#F17C72') },
  { id: 'black-white', name: 'Black & white', kits: teamSet(dark, '#B8BEC8', '#C4EB60', 'stripes') },
  { id: 'navy-gold', name: 'Navy & gold', kits: teamSet('#182D50', '#CBA654', '#C5E5ED', 'chest-band') },
  { id: 'pink-black', name: 'Pink & black', kits: teamSet('#ED94BC', dark, '#50CBCC') },
] as const

export const BLANK_KIT: KitDesign = {
  pattern: 'solid', shirt: white, secondary: '#B8BEC8', trim: white, shorts: white, socks: white,
}

/** Copy a catalog entry before editing; never mutate the shared templates. */
export function copyKitSet(kits: TeamKitSet): TeamKitSet {
  return teamKitSetSchema.parse(kits)
}
