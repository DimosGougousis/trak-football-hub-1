import { describe, expect, it } from 'vitest'
import { blankForm, formToRow, rowToForm, seriesRows } from '../coach-events'
import { toPlayerEvent } from '../player-events'
import { KIT_COLLECTIONS, copyKitSet, snapshotKit, readKitSnapshot, describeEventKit } from '../kit-templates'

describe('saved event kits', () => {
  it('keeps the selected design through save, edit and family reads, independent of later team edits', () => {
    const kits = copyKitSet(KIT_COLLECTIONS[0].kits)
    const snapshot = snapshotKit(kits, 'away')
    const form = { ...blankForm('2026-11-20'), time: '17:00', kitSnapshot: snapshot }
    const saved = { ...formToRow(form), id: 'event', published: true }
    kits.away.shirt = '#123456'
    expect(saved.kit_snapshot?.design.shirt).not.toBe(kits.away.shirt)
    expect(saved.kit).toBe(describeEventKit(snapshot))
    expect(rowToForm(saved).kitSnapshot).toEqual(snapshot)
    expect(toPlayerEvent(saved)?.kitSnapshot).toEqual(snapshot)
    expect(seriesRows(form, { on: true, days: [4], until: '2026-11-27' }, 'series')).toHaveLength(2)
    expect(seriesRows(form, { on: true, days: [4], until: '2026-11-27' }, 'series')[1].kit_snapshot).toEqual(snapshot)
  })

  it('preserves legacy text and rejects unrecognized snapshots without inventing a kit', () => {
    const row = { ...formToRow({ ...blankForm('2026-11-20'), time: '17:00', kit: 'Green bibs' }), id: 'old', published: true }
    expect(row.kit_snapshot).toBeNull()
    expect(toPlayerEvent(row)?.kit).toBe('Green bibs')
    expect(rowToForm(row).kitSnapshot).toBeNull()
    for (const invalid of [null, {}, { version: 2 }, { ...snapshotKit(KIT_COLLECTIONS[0].kits, 'home'), url: 'https://example.com' }]) {
      expect(readKitSnapshot(invalid)).toBeNull()
    }
  })
})
