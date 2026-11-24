import { i18n } from '@/lib/i18n'

/** Design standard step 3: the Squad page's subtitle, "U16 · 15 players", in the language showing. Null when no single
 *  squad is in view (All squads). */
export function squadSubtitle(squad: string | null, count: number): string | null {
  if (!squad) return null
  return `${squad} · ${i18n.t('coachMatches:playersCount', { count })}`
}
