import { afterEach, describe, expect, it } from 'vitest'
import { i18n, showLanguage, SOURCE_LANGUAGE } from '@/lib/i18n'
import { squadSubtitle } from '@/lib/squad/subtitle'

/* Design standard step 3: the Squad page's header names the squad in view and its size, as the mockup's
   "U16 · 15 players". With All squads there is no single squad, so no subtitle. */

afterEach(async () => { await i18n.changeLanguage(SOURCE_LANGUAGE); localStorage.clear() })

describe("the Squad page's subtitle", () => {
  it('names the squad and its size', () => {
    expect(squadSubtitle('U16', 15)).toBe('U16 · 15 players')
  })
  it('one player is singular', () => {
    expect(squadSubtitle('U16', 1)).toBe('U16 · 1 player')
  })
  it('no subtitle with All squads', () => {
    expect(squadSubtitle(null, 41)).toBeNull()
  })
  it('in Greek', async () => {
    await showLanguage('el')
    expect(squadSubtitle('U16', 15)).toBe('U16 · 15 παίκτες')
  })
})
