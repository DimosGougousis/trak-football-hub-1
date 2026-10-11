import { beforeEach, describe, expect, it } from 'vitest'
import { dismissAlert, isAlertRead, markAllSeen, readBellState, relativeLabel, setAlertRead } from '../alert-read-state'

// TRAK-163: the bell's read state, per device, for parents and players.
describe('alert read state', () => {
  const key = 'trak:test-bell'
  const old = { id: 'a', date: '2026-10-10T10:00:00Z' }
  const fresh = { id: 'b', date: '2026-10-11T10:00:00Z' }
  beforeEach(() => localStorage.clear())

  it('counts everything as unread before the first open', () => {
    const state = readBellState(key)
    expect(isAlertRead(old, state)).toBe(false)
    expect(isAlertRead(fresh, state)).toBe(false)
  })

  it('closing the bell reads everything up to the newest alert, keeping the parent seen key', () => {
    markAllSeen(key, [old, fresh])
    expect(localStorage.getItem(key)).toBe(String(Date.parse(fresh.date)))
    const state = readBellState(key)
    expect(isAlertRead(old, state)).toBe(true)
    expect(isAlertRead(fresh, state)).toBe(true)
    expect(isAlertRead({ id: 'c', date: '2026-10-12T10:00:00Z' }, state)).toBe(false)
  })

  it('a changed event (new date on the same id) is unread again', () => {
    markAllSeen(key, [fresh])
    expect(isAlertRead({ ...fresh, date: '2026-10-12T09:00:00Z' }, readBellState(key))).toBe(false)
  })

  it('remembers one alert marked read or unread', () => {
    setAlertRead(key, fresh, true)
    expect(isAlertRead(fresh, readBellState(key))).toBe(true)
    markAllSeen(key, [fresh])
    setAlertRead(key, fresh, false)
    expect(isAlertRead(fresh, readBellState(key))).toBe(false)
  })

  it('remembers a dismissed alert until it changes', () => {
    dismissAlert(key, old)
    const state = readBellState(key)
    expect(state.dismissed.has('a@2026-10-10T10:00:00Z')).toBe(true)
    expect(state.dismissed.has('a@2026-10-12T10:00:00Z')).toBe(false)
  })

  it('works without storage', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      expect(isAlertRead(old, readBellState(key))).toBe(false)
    } finally {
      Storage.prototype.getItem = original
    }
  })
})

describe('relativeLabel', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  it.each([
    ['2026-10-12T11:59:30Z', 'Just now'],
    ['2026-10-12T11:15:00Z', '45m'],
    ['2026-10-12T07:00:00Z', '5h'],
    ['2026-10-11T09:00:00Z', 'Yesterday'],
    ['2026-10-03T09:00:00Z', '3 Oct'],
  ])('%s reads %s', (date, label) => expect(relativeLabel(date, now)).toBe(label))
  it('says nothing for a missing date', () => expect(relativeLabel(null, now)).toBe(''))
})
