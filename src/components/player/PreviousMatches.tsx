import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Badge } from '@/components/arc/badge/badge'
import { dateLocale, useTranslation } from '@/lib/i18n'
import { competitionLabel } from '@/lib/coach-events'
import { COMPETITION_WORD } from '@/lib/games/match-words'
import { matchResult } from '@/lib/games/results'
import { wasOpened } from '@/lib/games/news'
import type { ParentMatch } from '@/lib/parent-data'

/* TRAK-441 slice 4 (mockup, Imad 12 Nov): a child's played matches in one list card, newest first: who, the day and
   the competition, "Review in" while the coach's review hasn't been opened on this device (as the match page's New),
   and the result. The four latest, then All. No rating (TRAK-435). */

const SHOWN = 4
const EVER = new Date(0).toISOString()

export function PreviousMatches({ matches, reviewed, readerId, childId, open }: {
  matches: ParentMatch[]
  /** A match's session → its event, for the matches whose review is published (fetchReviews' bySession). */
  reviewed: Map<string, string> | undefined
  readerId: string
  childId: string
  /** Where a row goes, given its review's event when there is one. */
  open: (match: ParentMatch, eventId: string | undefined) => { to: string; state?: unknown }
}) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  if (!matches.length) return null
  return <section aria-labelledby="previous-matches">
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 id="previous-matches" className="text-lg font-medium text-ink">{t('coachMatches:previousMatches')}</h2>
      {!all && matches.length > SHOWN && <button type="button" onClick={() => setAll(true)}
        className="rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {t('common:allMatches', { count: matches.length })}</button>}
    </div>
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {(all ? matches : matches.slice(0, SHOWN)).map(match => {
        const eventId = match.session_id ? reviewed?.get(match.session_id) : undefined
        const link = open(match, eventId)
        const day = match.match_date ?? match.created_at
        const competition = competitionLabel(match.competition)
        const word = COMPETITION_WORD[competition.toLowerCase() as keyof typeof COMPETITION_WORD]
        return <li key={match.id}>
          <Link to={link.to} state={link.state}
            className="flex items-center gap-3 rounded-2xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-[15px] font-medium text-ink">{match.opponent ? `vs ${match.opponent}` : competition || t('coachSchedule:kindMatch')}</span>
              <span className="truncate text-sm text-ink-3">
                {[day && format(parseISO(day), 'EEE d MMM', { locale: dateLocale() }), word ? t(word) : competition].filter(Boolean).join(' · ')}
              </span>
            </span>
            {eventId && !wasOpened(readerId, childId, 'review', eventId, EVER) && <Badge tone="success" size="sm">{t('common:reviewIn')}</Badge>}
            {match.team_score != null && match.opponent_score != null && <Badge size="sm">{matchResult(match.team_score, match.opponent_score).label}</Badge>}
          </Link>
        </li>
      })}
    </ul>
  </section>
}
