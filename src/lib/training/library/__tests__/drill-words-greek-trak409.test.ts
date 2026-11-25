/**
 * TRAK-409 (Languages 4/8): the Library drills' own words in Greek. A drill shows in the language showing; search finds
 * it by Greek words (with or without accents) and still by English ones; and a plan always saves the English drill, so
 * Who's here never sees a planned drill as changed when the coach switches language.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { i18n, showLanguage, SOURCE_LANGUAGE } from '@/lib/i18n'
import { LIBRARY, libraryDrill, searchDrills, shownDrill, START_LEVEL } from '@/lib/training/library'
import { fromLibrary } from '@/lib/training/parts'
import english from '@/locales/en/drills.json'

afterEach(async () => { await i18n.changeLanguage(SOURCE_LANGUAGE) })

const squad = { players: 12, level: START_LEVEL }
const keepTheBall = libraryDrill('lib-keep-the-ball')!

describe('TRAK-409: a Library drill in Greek', () => {
  it('reads its English words from the English file, for every drill', () => {
    for (const d of LIBRARY) expect(d.name).toBe((english as Record<string, { name: string }>)[d.id].name)
    expect(Object.keys(english)).toHaveLength(59)
  })

  it('shows as it is in English, and in Greek once Greek is picked', async () => {
    expect(shownDrill(keepTheBall)).toBe(keepTheBall)
    await showLanguage('el')
    const shown = shownDrill(keepTheBall)
    expect(shown.name).toBe('Κράτα τη μπάλα')
    expect(shown.how[0]).toBe('Οι επιθετικοί απλώνονται γύρω από το τετράγωνο, οι αμυντικοί ξεκινούν στη μέση.')
    expect(shown.id).toBe(keepTheBall.id)
    expect(shown.template).toBe(keepTheBall.template)
  })

  it('is found by a Greek word, with or without its accents, and still by an English one', async () => {
    await showLanguage('el')
    for (const query of ['ρόντο', 'ροντο', 'Κράτα τη μπάλα', 'rondo']) {
      expect(searchDrills(query, squad).map(d => d.id), query).toContain('lib-keep-the-ball')
    }
    // The Library's own drill comes back, never the Greek copy.
    expect(searchDrills('ροντο', squad).every(d => d === libraryDrill(d.id))).toBe(true)
  })

  it('a plan saves the English drill, whatever language is showing', async () => {
    const before = fromLibrary(keepTheBall, 12, START_LEVEL)
    await showLanguage('el')
    expect(fromLibrary(keepTheBall, 12, START_LEVEL)).toEqual(before)
    expect(before.name).toBe('Keep the ball')
  })
})
