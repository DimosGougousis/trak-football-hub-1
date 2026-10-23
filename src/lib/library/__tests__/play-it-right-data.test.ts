import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPlayItRight } from '../../../../scripts/play-it-right-read.mjs'
import content from '../play-it-right.json'
import { MOMENTS, PARTS, momentsOf, seniorOf, shownOrder, speaker } from '../play-it-right'
import { BANDS } from '@/lib/types'

/**
 * TRAK-268: the coach's Play It Right reads the old page's own content. If
 * public/trainings/play-it-right.html changes, run `node scripts/play-it-right-data.mjs`.
 */

const html = readFileSync(resolve(__dirname, '../../../../public/trainings/play-it-right.html'), 'utf8')

describe('TRAK-268: Play It Right\'s content is the old page\'s', () => {
  it('holds exactly the page\'s code, match moments (with their weeks) and senior stories', () => {
    expect(content).toEqual(readPlayItRight(html))
    expect(MOMENTS).toHaveLength(180)
  })

  it('has 30 moments for each of the six parts, each option with its feedback', () => {
    expect(PARTS.map(p => p.name)).toEqual(['Commitment', 'Behaviour and attitude', 'Sportsmanship', 'Training conduct', 'Match day', 'Off the field'])
    for (const part of PARTS) expect(momentsOf(part), part.name).toHaveLength(30)
    for (const m of MOMENTS) {
      expect(m.fb, m.id).toHaveLength(m.opts.length)
      expect(m.type === 'rank' ? m.opts.length === 3 : m.opts.length >= 3, m.id).toBe(true)
      if (m.next) expect(m.next.fb, `${m.id} next`).toHaveLength(m.next.opts.length)
    }
    expect(new Set(MOMENTS.map(m => m.wk))).toEqual(new Set(Array.from({ length: 18 }, (_, i) => i + 1)))
  })

  it('gives every part a story for ages 17–20 with three steps and three quick calls', () => {
    for (const part of PARTS) {
      const story = seniorOf(part)
      expect(story.steps, part.name).toHaveLength(3)
      expect(story.qs, part.name).toHaveLength(3)
      expect(story.stepLabels).toEqual(['Dilemma', 'Leader’s move', 'Outcome'])
    }
  })
})

describe('TRAK-268: the tiles and the calls', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  it('uses the assessment colours, mostly green, never the same colour side by side (2 or 3 a row)', () => {
    const words = PARTS.map(p => BANDS.find(b => b.text === p.colour)?.word)
    expect(words.filter(w => ['Exceptional', 'Standout'].includes(w!))).toHaveLength(4)
    expect(words.filter(w => w === 'Steady')).toHaveLength(1)
    expect(words.filter(w => w === 'Mixed')).toHaveLength(1)
    const colours = PARTS.map(p => p.colour)
    for (const columns of [2, 3]) {
      colours.forEach((colour, i) => {
        if ((i + 1) % columns !== 0 && i + 1 < colours.length) expect(colours[i + 1], `${columns} a row, tile ${i + 1}`).not.toBe(colour)
        if (i + columns < colours.length) expect(colours[i + columns], `${columns} a row, under tile ${i + 1}`).not.toBe(colour)
      })
    }
    for (const part of PARTS) expect(1.05 / (luminance(part.colour) + 0.05), part.name).toBeGreaterThanOrEqual(4.5)
  })

  it('shows the options in the old page\'s own order, so the best call isn\'t always first', () => {
    for (const m of MOMENTS) expect([...shownOrder(m.id, m.opts.length)].sort()).toEqual(m.opts.map((_, i) => i))
    expect(shownOrder('c1', 4)).toEqual(shownOrder('c1', 4))
    const bestFirst = MOMENTS.filter(m => shownOrder(m.id, m.opts.length)[0] === 0).length
    expect(bestFirst).toBeLessThan(MOMENTS.length / 2)
  })

  it('gives each speaker the same badge every time', () => {
    expect(speaker('Kai')).toEqual(speaker('Kai'))
    expect(speaker('Kai').initials).toBe('KA')
    expect(BANDS.map(b => b.text)).toContain(speaker('Amara').colour)
  })
})
