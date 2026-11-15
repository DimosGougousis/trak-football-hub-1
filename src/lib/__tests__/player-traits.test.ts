import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PLAYER_TRAITS, OPPOSITE_TRAITS, toggleTrait } from '../player-traits'
import { NATIONALITIES } from '../constants'

// TRAK-260: the app offers these lists and the database refuses anything else,
// so the two copies must stay equal or a coach's tap gets refused.
const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261022200000_coach_player_profiles.sql'),
  'utf8',
)
const quoted = (text: string) => [...text.matchAll(/'((?:[^']|'')+)'/g)].map(m => m[1].replace(/''/g, "'"))
const between = (start: string, end: string) => {
  const from = sql.indexOf(start)
  return sql.slice(from + start.length, sql.indexOf(end, from))
}

describe('player traits', () => {
  it('the database checks exactly the app\'s list, in order', () => {
    expect(quoted(between('traits_listed CHECK (traits <@ ARRAY[', ']::text[]'))).toEqual([...PLAYER_TRAITS])
  })

  it('the database refuses exactly the app\'s opposite pairs', () => {
    const pairs = [...sql.matchAll(/traits @> ARRAY\[([^\]]+)\]/g)].map(m => quoted(m[1]))
    expect(pairs).toEqual(OPPOSITE_TRAITS.map(pair => [...pair]))
  })

  it('the database checks exactly the signup nationalities', () => {
    expect(quoted(between('nationality_listed CHECK (nationality = ANY (ARRAY[', ']::text[]'))).toEqual([...NATIONALITIES])
  })

  it('every pair is two listed traits', () => {
    for (const pair of OPPOSITE_TRAITS) for (const trait of pair) expect(PLAYER_TRAITS).toContain(trait)
    expect(new Set(PLAYER_TRAITS).size).toBe(PLAYER_TRAITS.length)
  })

  it('a tap picks a trait, a second tap unpicks it', () => {
    expect(toggleTrait([], 'Places shots')).toEqual(['Places shots'])
    expect(toggleTrait(['Places shots'], 'Places shots')).toEqual([])
  })

  it('picking one of a pair unpicks the other', () => {
    expect(toggleTrait(['Dives into tackles', 'Places shots'], 'Does not dive into tackles'))
      .toEqual(['Places shots', 'Does not dive into tackles'])
  })

  it('keeps the list order whatever the tap order', () => {
    expect(toggleTrait(['Places shots'], 'Plays one-twos')).toEqual(['Plays one-twos', 'Places shots'])
  })
})
