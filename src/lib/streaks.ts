export interface Streak {
  current: number       // Current consecutive weeks with a match
  best: number          // All-time best streak
  lastMatchDate: string // ISO date of last match
  isActive: boolean     // Streak is current (not broken this week)
}

/**
 * Get the ISO week number for a given date.
 * ISO weeks start on Monday; week 1 contains the first Thursday of the year.
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Generate ordered week keys from a start week going back N weeks.
 * Returns keys from oldest to newest.
 */
function getPreviousWeekKeys(fromDate: Date, count: number): string[] {
  const keys: string[] = []
  const d = new Date(fromDate)
  for (let i = 0; i < count; i++) {
    keys.unshift(getISOWeekKey(d))
    d.setDate(d.getDate() - 7)
  }
  return keys
}

/**
 * Calculate streak information from a list of matches.
 * Matches must have a `created_at` ISO date string.
 */
export function calculateStreak(matches: { created_at: string }[]): Streak {
  if (matches.length === 0) {
    return { current: 0, best: 0, lastMatchDate: '', isActive: false }
  }

  // Collect all unique week keys that have at least one match
  const weeksWithMatches = new Set<string>()
  let latestDate = ''

  for (const m of matches) {
    const d = new Date(m.created_at)
    weeksWithMatches.add(getISOWeekKey(d))
    if (m.created_at > latestDate) latestDate = m.created_at
  }

  const now = new Date()
  const currentWeekKey = getISOWeekKey(now)
  const lastWeekDate = new Date(now)
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeekKey = getISOWeekKey(lastWeekDate)

  // Determine if the streak is active: match in current or previous week
  const hasCurrentWeek = weeksWithMatches.has(currentWeekKey)
  const hasLastWeek = weeksWithMatches.has(lastWeekKey)
  const isActive = hasCurrentWeek || hasLastWeek

  // Count current streak: walk backwards from the most recent week that has a match
  // Start from current week if it has a match, otherwise from last week
  let startDate: Date
  if (hasCurrentWeek) {
    startDate = now
  } else if (hasLastWeek) {
    startDate = lastWeekDate
  } else {
    // Streak is broken; find the best streak from all matches
    const best = findBestStreak(weeksWithMatches)
    return { current: 0, best, lastMatchDate: latestDate, isActive: false }
  }

  // Walk backwards from startDate week by week
  let current = 0
  const walker = new Date(startDate)
  while (true) {
    const weekKey = getISOWeekKey(walker)
    if (weeksWithMatches.has(weekKey)) {
      current++
      walker.setDate(walker.getDate() - 7)
    } else {
      break
    }
  }

  const best = findBestStreak(weeksWithMatches)

  return {
    current,
    best: Math.max(best, current),
    lastMatchDate: latestDate,
    isActive,
  }
}

/**
 * Find the longest consecutive week streak in a set of week keys.
 */
function findBestStreak(weeksWithMatches: Set<string>): number {
  if (weeksWithMatches.size === 0) return 0

  // Sort all week keys chronologically
  const sortedKeys = Array.from(weeksWithMatches).sort()

  let best = 1
  let run = 1

  for (let i = 1; i < sortedKeys.length; i++) {
    const prev = sortedKeys[i - 1]
    const curr = sortedKeys[i]

    // Check if curr is exactly 1 week after prev
    if (isConsecutiveWeek(prev, curr)) {
      run++
      if (run > best) best = run
    } else {
      run = 1
    }
  }

  return best
}

/**
 * Check if two ISO week keys (YYYY-Wnn) are consecutive.
 */
function isConsecutiveWeek(a: string, b: string): boolean {
  // Parse week keys and compare by advancing the earlier date by 7 days
  const dateA = weekKeyToDate(a)
  const dateB = weekKeyToDate(b)
  // They are consecutive if dateB is 7 days after dateA
  const diff = dateB.getTime() - dateA.getTime()
  return diff === 7 * 24 * 60 * 60 * 1000
}

/**
 * Convert YYYY-Wnn to a Date (the Monday of that ISO week).
 */
function weekKeyToDate(key: string): Date {
  const [yearStr, weekStr] = key.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)

  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7 // Mon=1 .. Sun=7
  // Monday of week 1
  const monday1 = new Date(jan4)
  monday1.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1))
  // Monday of target week
  const target = new Date(monday1)
  target.setUTCDate(monday1.getUTCDate() + (week - 1) * 7)
  return target
}
