import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMATION, FORMATIONS, lineName, slotsOf } from '../formations'
import { fitFormat, place, playerPlan, rowsToSave, setRole, startersWithJob, takeOff, type PlayerPlans } from '../lineup'

/* TRAK-285 (Games 3/8): the line-up as the coach builds it. A slot holds one player and a player one slot; someone
   who can come and isn't on the pitch is on the bench until the coach says otherwise (Imad, 28 Oct). */

describe('formations (TRAK-285)', () => {
  it('every shape fits its format: its lines add up to the outfield players', () => {
    for (const [format, shapes] of Object.entries(FORMATIONS)) {
      for (const shape of shapes) expect(shape.split('-').map(Number).reduce((a, b) => a + b, 0)).toBe(Number(format) - 1)
      expect(shapes).toContain(DEFAULT_FORMATION[Number(format) as keyof typeof DEFAULT_FORMATION])
    }
  })

  it('numbers the slots as the database keeps them: 1 is the keeper, then each line from the back, left to right', () => {
    const slots = slotsOf('4-3-3')
    expect(slots).toHaveLength(11)
    expect(slots[0]).toEqual({ slot: 1, x: 50, y: 8 })
    expect(slots.slice(1, 5).map(s => s.y)).toEqual([28, 28, 28, 28])
    expect(slots.slice(1, 5).map(s => s.x)).toEqual([20, 40, 60, 80])
    expect(slots.at(-1)!.y).toBeGreaterThan(slots[5].y)
    expect(slotsOf('2-2')).toHaveLength(5)
  })

  it('names a slot by its line', () => {
    expect([1, 2, 6, 11].map(slot => lineName('4-2-3-1', slot))).toEqual(['Goalkeeper', 'Defender', 'Midfielder', 'Forward'])
  })
})

describe('the line-up (TRAK-285)', () => {
  const ids = ['zagorakis', 'charisteas', 'nikopolidis']

  it('a player with nothing set is on the bench, with a usual expectation', () => {
    expect(playerPlan({}, 'zagorakis')).toEqual({ role: 'bench', slot: null, job: '', note: '', context: [], expectation: 'usual' })
  })

  it('a slot holds one player: placing someone there sends whoever was in it to the bench', () => {
    let plans: PlayerPlans = place({}, 'nikopolidis', 1)
    plans = place(plans, 'zagorakis', 1)
    expect(playerPlan(plans, 'zagorakis')).toMatchObject({ role: 'starter', slot: 1 })
    expect(playerPlan(plans, 'nikopolidis')).toMatchObject({ role: 'bench', slot: null })
  })

  it('a player holds one slot: placing them elsewhere moves them, and two starters swap', () => {
    let plans = place(place({}, 'zagorakis', 4), 'charisteas', 7)
    plans = place(plans, 'zagorakis', 7)
    expect(playerPlan(plans, 'zagorakis').slot).toBe(7)
    expect(playerPlan(plans, 'charisteas').slot).toBe(4)
  })

  it('taking a starter off puts them on the bench; leaving one out keeps only their note', () => {
    let plans = place({}, 'zagorakis', 4)
    plans = { ...plans, zagorakis: { ...plans.zagorakis, job: 'Right-back', note: 'Well played', context: ['first_start'], expectation: 'stretch' } }
    expect(playerPlan(takeOff(plans, 'zagorakis'), 'zagorakis')).toMatchObject({ role: 'bench', slot: null, job: 'Right-back' })
    expect(playerPlan(setRole(plans, 'zagorakis', 'not_selected'), 'zagorakis'))
      .toEqual({ role: 'not_selected', slot: null, job: '', note: 'Well played', context: [], expectation: 'usual' })
  })

  it('a smaller format sends the starters beyond it to the bench', () => {
    const plans = fitFormat(place(place({}, 'zagorakis', 7), 'charisteas', 9), 7)
    expect(playerPlan(plans, 'zagorakis')).toMatchObject({ role: 'starter', slot: 7 })
    expect(playerPlan(plans, 'charisteas')).toMatchObject({ role: 'bench', slot: null })
  })

  it('counts the starters with a job out of the format', () => {
    let plans = place(place({}, 'zagorakis', 4), 'charisteas', 9)
    plans = { ...plans, zagorakis: { ...plans.zagorakis, job: 'Stay tight to their winger' } }
    expect(startersWithJob(plans, 11)).toBe(1)
    expect(startersWithJob({ ...plans, charisteas: { ...plans.charisteas, job: '   ' } }, 11)).toBe(1)
  })

  it('saves a row for each player the coach set, trimmed, for this match', () => {
    const plans = { ...place({}, 'nikopolidis', 1), charisteas: { ...playerPlan({}, 'charisteas'), role: 'not_selected' as const, note: '  Not this week  ' } }
    expect(rowsToSave('m1', plans, new Set(ids))).toEqual([
      { event_id: 'm1', squad_player_id: 'nikopolidis', role: 'starter', slot: 1, job: '', note: '', context: [], expectation: 'usual' },
      { event_id: 'm1', squad_player_id: 'charisteas', role: 'not_selected', slot: null, job: '', note: 'Not this week', context: [], expectation: 'usual' },
    ])
    expect(rowsToSave('m1', plans, new Set(['nikopolidis']))).toHaveLength(1)
  })
})
