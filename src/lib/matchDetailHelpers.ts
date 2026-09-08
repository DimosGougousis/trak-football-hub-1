import { type Band } from '@/lib/clubMock'

export const BAND_COLORS: Record<Band, string> = {
  Exceptional: '#C8F25A',
  Standout: '#86efac',
  Good: '#4ade80',
  Steady: '#60a5fa',
  Mixed: '#fb923c',
  Developing: '#a78bfa',
  Difficult: 'rgba(255,255,255,0.4)',
}

// Self-rating mapping
export const SELF_RATING_BAND: Record<string, Band> = {
  excellent: 'Exceptional',
  good: 'Good',
  average: 'Steady',
  poor: 'Mixed',
}

// Map a 1–10 coach category score to a band word
export function categoryScoreToBand(score: number): Band {
  if (score >= 9) return 'Exceptional'
  if (score >= 8) return 'Standout'
  if (score >= 7) return 'Good'
  if (score >= 6) return 'Steady'
  if (score >= 5) return 'Mixed'
  if (score >= 4) return 'Developing'
  return 'Difficult'
}
