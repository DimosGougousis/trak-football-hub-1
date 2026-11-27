import { describe, it, expect } from 'vitest'
import { homeTodos, startOfNextDay, upcomingSteps, type HomeMatch, type HomeTraining, type HomeReport } from '../home-todos'

// TRAK-607: the coach's To-do, one test per row of the 26 Nov rules (TRAK-606). Days are the academy's: Athens, which
// is UTC+2 in November. Wed 25 Nov 2026 is a training day; Sat 28 Nov a match day.
const Z = 'Europe/Athens'
const t = (local: string) => Date.parse(`${local}+02:00`)

const training = (id: string, date: string, extra: Partial<HomeTraining> = {}): HomeTraining => ({
  id, squad: 'U17', starts_at: `${date}T07:00:00+02:00`, ends_at: `${date}T08:15:00+02:00`, start_time: '07:00',
  published: true, cancelled: false, planned: true, registeredAt: null, notedAt: null, ...extra,
})
const match = (id: string, date: string, extra: Partial<HomeMatch> = {}): HomeMatch => ({
  id, squad: 'U17', starts_at: `${date}T16:00:00+02:00`, ends_at: `${date}T17:30:00+02:00`, published: true, cancelled: false,
  plan: { drafted: true, shared: true }, evaluatedAt: null, publishedAt: null, remindAt: null, ...extra,
})
const todos = (now: string, { trainings = [], matches = [], reports = [], inView }: {
  trainings?: HomeTraining[]; matches?: HomeMatch[]; reports?: HomeReport[]; inView?: (s: string | null) => boolean
} = {}) => homeTodos({ trainings, matches, reports, now: t(now), zone: Z, inView })
const keys = (now: string, data: Parameters<typeof todos>[1]) => todos(now, data).map(todo => todo.key)
const one = (now: string, data: Parameters<typeof todos>[1], key: string) => todos(now, data).find(todo => todo.key === key)

describe("Today's training plan (rank 2)", () => {
  it('shows from 00:00 on the training day, not the day before', () => {
    expect(keys('2026-11-24T23:59', { trainings: [training('w', '2026-11-25')] })).not.toContain('training-plan:w')
    expect(keys('2026-11-25T00:00', { trainings: [training('w', '2026-11-25')] })).toContain('training-plan:w')
  })

  it('goes Plan, Share, ✓ Shared; urgent only with no plan', () => {
    const at = '2026-11-25T06:30'
    expect(one(at, { trainings: [training('w', '2026-11-25', { planned: false })] }, 'training-plan:w')).toMatchObject({ step: 'plan', urgent: true, done: false })
    expect(one(at, { trainings: [training('w', '2026-11-25', { published: false })] }, 'training-plan:w')).toMatchObject({ step: 'share', urgent: false, done: false })
    expect(one(at, { trainings: [training('w', '2026-11-25')] }, 'training-plan:w')).toMatchObject({ step: 'shared', urgent: false, done: true })
  })

  it("once players can read plans (TRAK-601), Shared is the plan's own share", () => {
    const shareLater = training('w', '2026-11-25', { sharedAt: '2026-11-25T06:45:00+02:00' })
    expect(one('2026-11-25T06:30', { trainings: [shareLater] }, 'training-plan:w')).toMatchObject({ step: 'share', done: false })
    expect(one('2026-11-25T06:50', { trainings: [shareLater] }, 'training-plan:w')).toMatchObject({ step: 'shared', done: true })
  })

  it('leaves at the start when not shared; a shared one stays ticked all day', () => {
    const notShared = training('w', '2026-11-25', { published: false })
    expect(one('2026-11-25T06:59', { trainings: [notShared] }, 'training-plan:w')?.leavesAt).toBe(t('2026-11-25T07:00'))
    expect(keys('2026-11-25T07:00', { trainings: [notShared] })).not.toContain('training-plan:w')
    expect(one('2026-11-25T23:59', { trainings: [training('w', '2026-11-25')] }, 'training-plan:w')).toMatchObject({ done: true })
    expect(keys('2026-11-26T00:00', { trainings: [training('w', '2026-11-25')] })).not.toContain('training-plan:w')
  })

  it('a training with no time can be planned until its day ends', () => {
    const allDay = training('w', '2026-11-25', { starts_at: '2026-11-25T00:00:00+02:00', ends_at: null, start_time: null, planned: false })
    expect(keys('2026-11-25T20:00', { trainings: [allDay] })).toContain('training-plan:w')
  })
})

describe('Take the register (rank 3)', () => {
  it('shows on the training day, its button opening at the start', () => {
    expect(one('2026-11-25T06:30', { trainings: [training('w', '2026-11-25')] }, 'register:w')).toMatchObject({ opensAt: t('2026-11-25T07:00'), urgent: false })
    expect(one('2026-11-25T07:30', { trainings: [training('w', '2026-11-25')] }, 'register:w')).toMatchObject({ opensAt: null, urgent: false })
  })

  it('is urgent once the session has ended', () => {
    expect(one('2026-11-25T08:15', { trainings: [training('w', '2026-11-25')] }, 'register:w')).toMatchObject({ urgent: true })
  })

  it('leaves 48 h after the session ends', () => {
    const w = training('w', '2026-11-25')
    expect(one('2026-11-27T08:14', { trainings: [w] }, 'register:w')).toMatchObject({ urgent: true, leavesAt: t('2026-11-27T08:15') })
    expect(keys('2026-11-27T08:15', { trainings: [w] })).not.toContain('register:w')
  })

  it('done today stays ticked until midnight; done on an earlier day is gone', () => {
    const w = training('w', '2026-11-25', { registeredAt: '2026-11-25T08:20:00+02:00' })
    expect(one('2026-11-25T23:59', { trainings: [w] }, 'register:w')).toMatchObject({ done: true, urgent: false })
    expect(keys('2026-11-26T00:00', { trainings: [w] })).not.toContain('register:w')
  })

  it("a training never published asks for no register and no notes: its plan's Share comes first", () => {
    const draft = training('w', '2026-11-25', { published: false })
    expect(keys('2026-11-25T09:00', { trainings: [draft] })).toEqual([])
    expect(keys('2026-11-25T06:00', { trainings: [draft] })).toEqual(['training-plan:w'])
  })

  it('notes saved or skipped close the training, so no register is owed', () => {
    const w = training('w', '2026-11-25', { notedAt: '2026-11-25T08:30:00+02:00' })
    expect(keys('2026-11-25T09:00', { trainings: [w] })).not.toContain('register:w')
  })
})

describe('Write session notes (rank 6)', () => {
  it('opens at the end, is never urgent, and leaves 48 h after the end', () => {
    const w = training('w', '2026-11-25')
    expect(one('2026-11-25T07:30', { trainings: [w] }, 'notes:w')).toMatchObject({ opensAt: t('2026-11-25T08:15'), urgent: false })
    expect(one('2026-11-26T12:00', { trainings: [w] }, 'notes:w')).toMatchObject({ opensAt: null, urgent: false })
    expect(keys('2026-11-27T08:15', { trainings: [w] })).not.toContain('notes:w')
  })

  it('skipped or saved today stays ticked until midnight', () => {
    const w = training('w', '2026-11-25', { notedAt: '2026-11-25T09:00:00+02:00' })
    expect(one('2026-11-25T20:00', { trainings: [w] }, 'notes:w')).toMatchObject({ done: true })
    expect(keys('2026-11-26T00:00', { trainings: [w] })).not.toContain('notes:w')
  })
})

describe('Match plan (rank 1)', () => {
  it('shows from 00:00 on match day and is urgent until shared', () => {
    const notShared = match('m', '2026-11-28', { plan: { drafted: true } })
    expect(keys('2026-11-27T23:59', { matches: [notShared] })).not.toContain('match-plan:m')
    expect(one('2026-11-28T00:00', { matches: [notShared] }, 'match-plan:m')).toMatchObject({ step: 'planDraft', urgent: true, done: false })
    expect(one('2026-11-28T09:00', { matches: [match('m', '2026-11-28', { plan: {} })] }, 'match-plan:m')).toMatchObject({ step: 'plan', urgent: true })
  })

  it('a scheduled share counts as shared; changes not shared do not', () => {
    const scheduled = match('m', '2026-11-28', { plan: { drafted: true, shared: true, sharedAt: '2026-11-28T14:00:00+02:00' } })
    expect(one('2026-11-28T09:00', { matches: [scheduled] }, 'match-plan:m')).toMatchObject({ step: 'scheduled', done: true, urgent: false })
    const changed = match('m', '2026-11-28', { plan: { drafted: true, shared: true, changes: 2 } })
    expect(one('2026-11-28T09:00', { matches: [changed] }, 'match-plan:m')).toMatchObject({ step: 'changes', done: false, urgent: true })
  })

  it('leaves at kick-off when not shared; a shared one stays ticked until midnight', () => {
    const notShared = match('m', '2026-11-28', { plan: { drafted: true } })
    expect(keys('2026-11-28T16:00', { matches: [notShared] })).not.toContain('match-plan:m')
    expect(one('2026-11-28T20:00', { matches: [match('m', '2026-11-28')] }, 'match-plan:m')).toMatchObject({ step: 'shared', done: true })
  })
})

describe('Evaluate the game (rank 4) and Publish the evaluation (rank 5)', () => {
  it('Evaluate shows on match day, its button opening at full time', () => {
    expect(one('2026-11-28T09:00', { matches: [match('m', '2026-11-28')] }, 'evaluate:m')).toMatchObject({ opensAt: t('2026-11-28T17:30'), urgent: false })
    expect(one('2026-11-28T18:00', { matches: [match('m', '2026-11-28')] }, 'evaluate:m')).toMatchObject({ opensAt: null, urgent: false })
  })

  it('a match never published asks for no evaluation', () => {
    expect(keys('2026-11-28T18:00', { matches: [match('m', '2026-11-28', { published: false })] })).not.toContain('evaluate:m')
  })

  it('Evaluate leaves 7 days after kick-off; saved today, it stays ticked', () => {
    expect(keys('2026-12-05T15:59', { matches: [match('m', '2026-11-28')] })).toContain('evaluate:m')
    expect(keys('2026-12-05T16:00', { matches: [match('m', '2026-11-28')] })).not.toContain('evaluate:m')
    const drafted = match('m', '2026-11-28', { evaluatedAt: '2026-11-28T19:00:00+02:00' })
    expect(one('2026-11-28T22:00', { matches: [drafted] }, 'evaluate:m')).toMatchObject({ done: true })
    expect(keys('2026-11-29T09:00', { matches: [drafted] })).not.toContain('evaluate:m')
  })

  it('Publish shows once the draft is saved and is urgent from its 09:00 reminder', () => {
    const drafted = match('m', '2026-11-28', { evaluatedAt: '2026-11-28T19:00:00+02:00', remindAt: '2026-11-29T09:00:00+02:00' })
    expect(keys('2026-11-28T18:00', { matches: [match('m', '2026-11-28')] })).not.toContain('publish:m')
    expect(one('2026-11-29T08:59', { matches: [drafted] }, 'publish:m')).toMatchObject({ urgent: false, done: false })
    expect(one('2026-11-29T09:00', { matches: [drafted] }, 'publish:m')).toMatchObject({ urgent: true, leavesAt: t('2026-12-05T16:00') })
    expect(keys('2026-12-05T16:00', { matches: [drafted] })).not.toContain('publish:m')
  })

  it('published today stays ticked until midnight', () => {
    const published = match('m', '2026-11-28', { evaluatedAt: '2026-11-28T19:00:00+02:00', publishedAt: '2026-11-29T10:00:00+02:00' })
    expect(one('2026-11-29T12:00', { matches: [published] }, 'publish:m')).toMatchObject({ done: true, urgent: false })
    expect(keys('2026-11-30T00:00', { matches: [published] })).not.toContain('publish:m')
  })
})

describe('Reports ready (rank 7)', () => {
  it('shows from the report day until sent, urgent once the day has passed', () => {
    expect(keys('2026-11-25T09:00', { reports: [{ squad: 'U17', since: '2026-11-26' }] })).toEqual([])
    expect(one('2026-11-26T09:00', { reports: [{ squad: 'U17', since: '2026-11-26' }] }, 'reports:U17')).toMatchObject({ urgent: false, group: 'players' })
    expect(one('2026-11-27T09:00', { reports: [{ squad: 'U17', since: '2026-11-26' }] }, 'reports:U17')).toMatchObject({ urgent: true })
  })
})

describe('Next training or match, on a day with no events (rank 8)', () => {
  const data = { trainings: [training('w', '2026-11-25', { planned: false })], matches: [match('m', '2026-11-28', { plan: {} })] }

  it("takes the next training's plan and the next match's next step, soonest first", () => {
    const list = todos('2026-11-23T08:00', data)
    expect(list.map(todo => todo.key)).toEqual(['next-training:w', 'next-match:m'])
    expect(list[0]).toMatchObject({ step: 'plan', rank: 8, leavesAt: t('2026-11-24T00:00') })
    expect(list[1]).toMatchObject({ step: 'plan', rank: 8 })
  })

  it('not on a day with a training or a match', () => {
    const busy = { ...data, trainings: [...data.trainings, training('today', '2026-11-23')] }
    expect(keys('2026-11-23T06:00', busy).filter(key => key.startsWith('next'))).toEqual([])
  })

  it('only while the step is missing, and only within 7 days', () => {
    expect(keys('2026-11-23T08:00', { trainings: [training('w', '2026-11-25')], matches: [match('m', '2026-11-28')] })).toEqual([])
    expect(keys('2026-11-17T08:00', data)).toEqual([])
  })
})

describe('the order and the squads', () => {
  it('urgent first, then by rank, then the earlier event', () => {
    // The day after a match, with that morning's training still owing its register (urgent) and notes, and a report day.
    const data = {
      trainings: [training('w', '2026-11-28')],
      matches: [match('m', '2026-11-28', { evaluatedAt: '2026-11-28T19:00:00+02:00', remindAt: '2026-11-29T09:00:00+02:00' })],
      reports: [{ squad: 'U17', since: '2026-11-29' }],
    }
    expect(keys('2026-11-29T10:00', data)).toEqual(['register:w', 'publish:m', 'notes:w', 'reports:U17'])
  })

  it('same rank: the earlier event first', () => {
    const data = { trainings: [training('late', '2026-11-25', { starts_at: '2026-11-25T18:00:00+02:00', ends_at: '2026-11-25T19:00:00+02:00', start_time: '18:00' }), training('early', '2026-11-25')] }
    expect(keys('2026-11-25T06:00', data).filter(key => key.startsWith('register'))).toEqual(['register:early', 'register:late'])
  })

  it('one squad picked shows its own; All shows each with its squad', () => {
    const data = { trainings: [training('a', '2026-11-25'), training('b', '2026-11-25', { squad: 'U16' })] }
    expect(keys('2026-11-25T06:00', { ...data, inView: s => s === 'U16' })).toEqual(['training-plan:b', 'register:b', 'notes:b'])
    expect(todos('2026-11-25T06:00', data).map(todo => todo.squad)).toEqual(['U17', 'U16', 'U17', 'U16', 'U17', 'U16'])
  })

  it('a cancelled event takes all its to-dos off at once', () => {
    expect(keys('2026-11-25T09:00', { trainings: [training('w', '2026-11-25', { cancelled: true })] })).toEqual([])
    expect(keys('2026-11-28T18:00', { matches: [match('m', '2026-11-28', { cancelled: true })] })).toEqual([])
  })
})

describe('upcoming steps (TRAK-610)', () => {
  const steps = (now: string, trainings: HomeTraining[], matches: HomeMatch[] = [], training = true) =>
    upcomingSteps({ trainings, matches, now: t(now), zone: Z, training }).map(s => `${s.key}:${s.step}`)

  it('every training and match from tomorrow to 7 days ahead still missing a step, soonest first', () => {
    const list = steps('2026-11-24T09:00', [training('wed', '2026-11-25', { planned: false }), training('fri', '2026-11-27', { planned: false })],
      [match('sat', '2026-11-28', { plan: { drafted: true } }), match('dec5', '2026-12-05', { plan: {} })])
    expect(list).toEqual(['next-training:wed:plan', 'next-training:fri:plan', 'next-match:sat:planDraft'])
  })

  it('a planned training still a draft asks to be shared (TRAK-611)', () => {
    expect(steps('2026-11-24T09:00', [training('w', '2026-11-25', { published: false })])).toEqual(['next-training:w:share'])
    expect(steps('2026-11-24T09:00', [training('w', '2026-11-25', { published: false, planned: false })])).toEqual(['next-training:w:plan'])
  })

  it('not today, not one with nothing missing, not a cancelled one, and no plans where Training is off', () => {
    expect(steps('2026-11-25T06:00', [training('w', '2026-11-25', { planned: false })])).toEqual([])
    expect(steps('2026-11-24T09:00', [training('w', '2026-11-25')], [match('m', '2026-11-28')])).toEqual([])
    expect(steps('2026-11-24T09:00', [training('w', '2026-11-25', { planned: false, cancelled: true })])).toEqual([])
    expect(steps('2026-11-24T09:00', [training('w', '2026-11-25', { planned: false })], [], false)).toEqual([])
  })
})

describe('where Training is off (TRAK-608)', () => {
  it('a training asks only for its register: no plan, no notes, no next plan', () => {
    const off = (now: string, trainings: HomeTraining[]) => homeTodos({ trainings, matches: [], now: t(now), zone: Z, training: false }).map(todo => todo.key)
    expect(off('2026-11-25T09:00', [training('w', '2026-11-25', { planned: false })])).toEqual(['register:w'])
    expect(off('2026-11-23T08:00', [training('w', '2026-11-25', { planned: false })])).toEqual([])
  })
})

describe("the academy's midnight", () => {
  it('is the next day at 00:00, also across a clock change', () => {
    expect(startOfNextDay(t('2026-11-25T10:00'), Z)).toBe(t('2026-11-26T00:00'))
    // Athens turns its clocks back on Sun 25 Oct 2026, so that day is 25 hours long.
    expect(startOfNextDay(Date.parse('2026-10-25T00:30:00+03:00'), Z)).toBe(Date.parse('2026-10-26T00:00:00+02:00'))
  })
})
