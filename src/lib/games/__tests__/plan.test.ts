import { describe, expect, it } from 'vitest'
import { formToPlan, numberProblem, planToForm } from '../plan'

/* TRAK-284 (Games 2/8): the plan's first step as the coach types it and as game_plans keeps it. */

const saved = {
  strength: 'stronger', their_formation: '4-3-3', scouting: 'Their keeper plays short.',
  key_players: [{ number: 9, position: 'Striker', note: 'Quick.' }, { number: null, position: 'Left wing', note: '' }],
  goals: [{ title: 'Win it back in their half', looks_like: 'Press when their keeper plays short.' }],
}

describe('TRAK-284: the plan form', () => {
  it('no plan yet is an empty form with one goal to fill and no key players', () => {
    expect(planToForm(null)).toEqual({
      strength: null, theirFormation: null, keyPlayers: [], scouting: '', goals: [{ title: '', looksLike: '' }],
    })
  })

  it('a saved plan comes back as it was saved', () => {
    const form = planToForm(saved)
    expect(form.keyPlayers).toEqual([{ number: '9', position: 'Striker', note: 'Quick.' }, { number: '', position: 'Left wing', note: '' }])
    expect(formToPlan(form)).toEqual(saved)
  })

  it('drops rows left empty and trims what was typed', () => {
    expect(formToPlan({
      strength: null, theirFormation: null, scouting: '  Watch their 7  ',
      keyPlayers: [{ number: '', position: ' ', note: '' }, { number: '07', position: ' Keeper ', note: '' }],
      goals: [{ title: '', looksLike: '' }, { title: ' Keep it tight ', looksLike: '' }, { title: '', looksLike: 'Switch play early.' }],
    })).toEqual({
      strength: null, their_formation: null, scouting: 'Watch their 7',
      key_players: [{ number: 7, position: 'Keeper', note: '' }],
      goals: [{ title: 'Keep it tight', looks_like: '' }, { title: '', looks_like: 'Switch play early.' }],
    })
  })

  it('a shirt number is blank (not known) or 1 to 99', () => {
    expect(['', '1', '07', '9', '99'].map(numberProblem)).toEqual([null, null, null, null, null])
    expect(['0', '00', '100', '9a'].map(numberProblem)).toEqual(['From 1 to 99', 'From 1 to 99', 'From 1 to 99', 'From 1 to 99'])
  })
})
