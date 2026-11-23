import { i18n, SOURCE_LANGUAGE } from '@/lib/i18n'
import type { LibraryDrill } from './drills'

/* TRAK-409 (Languages 4/8): a Library drill's own words (name, rule, targets, why, how to play, watch for) in the
   language showing, from src/locales/<language>/drills.json; English is ./drills.ts's, read from the English file.
   Only for showing and searching: a plan saves the English drill (fromLibrary) and Who's here compares English with
   English, so switching language never makes a planned drill look changed. */

type DrillWords = Pick<LibraryDrill, 'name' | 'rule' | 'targets' | 'why' | 'how' | 'watch' | 'topics'>

/** The drill as the coach reads it now. Its search words keep the English ones, so an English word still finds it. */
export function shownDrill(d: LibraryDrill): LibraryDrill {
  const language = i18n.language
  if (!language || language === SOURCE_LANGUAGE) return d
  const words = i18n.getResource(language, 'drills', d.id) as Partial<DrillWords> | undefined
  if (!words) return d
  return { ...d, ...words, topics: [d.topics, words.topics].filter(Boolean).join(' ') }
}
