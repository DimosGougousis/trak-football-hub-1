// Run from the repository root. Uses the UI renderer to keep saved assets in sync.
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { KitIllustration } = await server.ssrLoadModule('/src/components/trak/kits/KitIllustration.tsx')
  const { KIT_COLLECTIONS, KIT_SLOTS, KIT_PATTERNS, KIT_SLOT_LABELS, BLANK_KIT, teamKitSetSchema } = await server.ssrLoadModule('/src/lib/kit-templates.ts')
  const root = 'public/kits'
  const render = (kit, label, animated = true) => renderToStaticMarkup(createElement(KitIllustration, { kit, label, animated })) + '\n'
  await mkdir(`${root}/blank`, { recursive: true })
  for (const pattern of KIT_PATTERNS) {
    await writeFile(`${root}/blank/${pattern}.svg`, render({ ...BLANK_KIT, pattern }, `Blank ${pattern} kit`, false))
  }
  for (const collection of KIT_COLLECTIONS) {
    teamKitSetSchema.parse(collection.kits)
    await mkdir(`${root}/${collection.id}`, { recursive: true })
    for (const slot of KIT_SLOTS) {
      await writeFile(`${root}/${collection.id}/${slot}.svg`, render(collection.kits[slot], `${collection.name} ${KIT_SLOT_LABELS[slot]} kit`))
    }
  }
  await writeFile(`${root}/catalog.json`, JSON.stringify({ version: 1, collections: KIT_COLLECTIONS.map(collection => ({
    ...collection,
    assets: Object.fromEntries(KIT_SLOTS.map(slot => [slot, `/kits/${collection.id}/${slot}.svg`])),
  })) }, null, 2) + '\n')
  console.log(`Exported ${KIT_COLLECTIONS.length * KIT_SLOTS.length} kit SVGs, ${KIT_PATTERNS.length} blank templates, and catalog.json to ${root}.`)
} finally {
  await server.close()
}
