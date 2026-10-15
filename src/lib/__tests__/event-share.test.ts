import { describe, expect, it } from 'vitest'
import { familyNoteProblem, shareableFromRow, squadLabelFrom, whatsAppShareText, whatsAppShareUrl, type ShareableEvent } from '../event-share'

// TRAK-139 (J8.16): "Share to WhatsApp" pre-writes the event for the coach's
// group. The coach picks the chat and taps send; nothing is sent by Trak.

const training: ShareableEvent = {
  id: 'ev-13',
  kind: 'training',
  squadLabel: 'U15',
  date: '2026-10-13',
  startTime: '18:00',
  meetTime: null,
  opponent: null,
  homeAway: null,
  venue: 'Main pitch',
  kit: null,
  status: 'scheduled',
  cancelReason: null,
}
const opts = { childNames: [] as string[] }

// TRAK-168 part 2: Tarek's templates (13 Oct), for the founders to agree.
// The first line is bold (WhatsApp *...*) so it reads in the chat preview.
describe('whatsAppShareText: the team-group templates', () => {
  const link = 'https://trakfootball.com/event/ev-13'

  it('writes a training', () => {
    expect(whatsAppShareText(training, opts)).toBe([
      '*⚽ TRAINING | U15 Training*',
      '📅 When: Tue, 13 Oct @ 18:00',
      '🏟️ Venue: Main pitch',
      `🔗 Event details & Availability: ${link}`,
    ].join('\n'))
  })

  it('writes a match with meet time, kick-off and kit', () => {
    const text = whatsAppShareText({
      ...training, kind: 'match', opponent: 'Rivals FC', homeAway: 'away',
      venue: 'Rivals Sports Park', meetTime: '17:15', kit: 'White',
    }, opts)
    expect(text).toBe([
      '*⚔️ MATCH | U15 Match vs Rivals FC (Away)*',
      '📅 When: Tue, 13 Oct',
      '⏰ Meet Time: 17:15 | Kick-off: 18:00',
      '🏟️ Venue: Rivals Sports Park',
      '👕 Kit: White',
      `🔗 Confirm availability: ${link}`,
    ].join('\n'))
  })

  it('a match with no meet time gives the kick-off alone', () => {
    const text = whatsAppShareText({ ...training, kind: 'match', opponent: 'Rivals FC', homeAway: 'home' }, opts)
    expect(text).toContain('⏰ Kick-off: 18:00')
    expect(text).not.toContain('Meet Time')
  })

  it('writes a cancellation with its reason', () => {
    expect(whatsAppShareText({ ...training, status: 'cancelled', cancelReason: 'Pitch waterlogged' }, opts)).toBe([
      '*❌ CANCELLED | U15 Training*',
      '📅 Date: Tue, 13 Oct',
      '🏟️ Venue: Main pitch',
      '📌 Reason: Pitch waterlogged',
      'Please note this session will not go ahead as scheduled.',
      `🔗 Updated event info: ${link}`,
    ].join('\n'))
  })

  it('a cancelled match names the opponent, and a cancellation without a reason has no reason line', () => {
    const text = whatsAppShareText({ ...training, kind: 'match', opponent: 'Rivals FC', homeAway: 'away', status: 'cancelled' }, opts)
    expect(text.split('\n')[0]).toBe('*❌ CANCELLED | U15 Match vs Rivals FC*')
    expect(text).not.toContain('Reason:')
  })

  // Imad, 14 Oct (#292): 24-hour times, as the app shows them.
  it('writes times on a 24-hour clock', () => {
    expect(whatsAppShareText({ ...training, startTime: '00:30' }, opts)).toContain('@ 00:30')
    expect(whatsAppShareText({ ...training, startTime: '12:00' }, opts)).toContain('@ 12:00')
    expect(whatsAppShareText({ ...training, startTime: '18:05:00' }, opts).split('\n')[1]).toBe('📅 When: Tue, 13 Oct @ 18:05')
  })

  // Imad, 14 Oct (#292): a training's earlier meet time goes with its start,
  // in the match template's own pattern.
  it('gives a training its meet time alongside the start', () => {
    expect(whatsAppShareText({ ...training, meetTime: '17:45' }, opts)).toBe([
      '*⚽ TRAINING | U15 Training*',
      '📅 When: Tue, 13 Oct',
      '⏰ Meet Time: 17:45 | Start: 18:00',
      '🏟️ Venue: Main pitch',
      '🔗 Event details & Availability: https://trakfootball.com/event/ev-13',
    ].join('\n'))
  })

  it('keeps the one-line When for a training whose meet time is its start, or that has none', () => {
    expect(whatsAppShareText({ ...training, meetTime: '18:00' }, opts)).toContain('📅 When: Tue, 13 Oct @ 18:00')
    expect(whatsAppShareText({ ...training, meetTime: '18:00' }, opts)).not.toContain('Meet Time')
    expect(whatsAppShareText({ ...training, meetTime: '  ' }, opts)).not.toContain('Meet Time')
  })

  it('never shows midnight for an event with no time yet', () => {
    expect(whatsAppShareText({ ...training, startTime: null }, opts)).toContain('📅 When: Tue, 13 Oct @ time to be confirmed')
  })

  it('leaves out lines with nothing to say, in every layout', () => {
    for (const shape of [{}, { kind: 'match' as const }, { status: 'cancelled' as const }, { kind: 'match' as const, status: 'cancelled' as const }]) {
      const text = whatsAppShareText({ ...training, ...shape, venue: '  ', kit: '' }, opts)
      expect(text).not.toContain('Venue:')
      expect(text).not.toContain('Kit:')
    }
  })

  it('names an opponent only on a match, even one left over from before the coach changed the type', () => {
    expect(whatsAppShareText({ ...training, opponent: 'Rivals FC' }, opts).split('\n')[0]).toBe('*⚽ TRAINING | U15 Training*')
  })

  it('crosses a month end and names the weekday correctly', () => {
    expect(whatsAppShareText({ ...training, date: '2026-11-01' }, opts)).toContain('Sun, 1 Nov')
  })

  it('carries no child names: an event has no field for one, and no absence list is added', () => {
    const withExtras = { ...training, absent: ['Omar Haddad'], players: ['Lucas Petit'], notes: 'Omar back' }
    const text = whatsAppShareText(withExtras as ShareableEvent, opts)
    expect(text).not.toMatch(/Omar|Lucas|absent|can't make it/i)
  })
})

// Imad's 10 Oct rule, as in the calendar feed (#258) and the change emails
// (#264): coach-typed text that names a child on the squad, or a cancel
// reason with a link, never reaches the group chat.
describe('whatsAppShareText: no child names in coach-typed text', () => {
  const squad = { ...opts, childNames: ['Omar Haddad', 'Lucas Petit'] }
  const cancelled = { ...training, status: 'cancelled' as const }

  it('leaves out a cancel reason that names a child on the squad, by first name or surname', () => {
    for (const reason of ["Training off, Omar's family away", 'Petit injured, pitch too small']) {
      const text = whatsAppShareText({ ...cancelled, cancelReason: reason }, squad)
      expect(text).not.toContain('Reason:')
      expect(text).not.toMatch(/Omar|Petit/)
    }
  })

  it('keeps a clean reason', () => {
    expect(whatsAppShareText({ ...cancelled, cancelReason: 'Pitch closed' }, squad)).toContain('Reason: Pitch closed')
  })

  it('leaves out a reason with a link, bare or full', () => {
    for (const reason of ['Moved, see maps.app.goo.gl/abc', 'Details: https://example.com/x', 'Ask on www.example.org']) {
      expect(whatsAppShareText({ ...cancelled, cancelReason: reason }, squad)).not.toContain('Reason:')
    }
  })

  it('leaves out the reason while the squad\'s names are unknown (the read failed)', () => {
    expect(whatsAppShareText({ ...cancelled, cancelReason: 'Pitch closed' }, { ...opts, childNames: null })).not.toContain('Reason:')
  })

  it('leaves out a venue, kit or opponent that names a child, as the calendar feed does', () => {
    const text = whatsAppShareText({
      ...training, kind: 'match', opponent: 'Haddad Select', homeAway: 'home', venue: "Omar's garden", kit: 'Lucas kit',
    }, squad)
    expect(text).not.toMatch(/Omar|Haddad|Lucas/)
    expect(text.split('\n')[0]).toBe('*⚔️ MATCH | U15 Match (Home)*')
  })

  it('reads a name as a whole word only, at either end', () => {
    const text = whatsAppShareText({ ...training, venue: 'Omarina Park' }, { ...opts, childNames: ['Omar Example', 'Rina Example'] })
    expect(text).toContain('Venue: Omarina Park')
  })

  it('never reads a particle such as "Abu" or "Bin" as a name', () => {
    const text = whatsAppShareText({ ...training, kind: 'match', venue: 'Abu Dhabi Sports City', kit: 'Bin Hendi blue' },
      { ...opts, childNames: ['Zaid Abu Example', 'Rashid Bin Example'] })
    expect(text).toContain('Venue: Abu Dhabi Sports City')
    expect(text).toContain('Kit: Bin Hendi blue')
  })
})

describe('whatsAppShareUrl', () => {
  it('uses WhatsApp\'s standard share link with the text encoded, and no phone number', () => {
    const url = whatsAppShareUrl({ ...training, kind: 'match', opponent: 'Al Wasl & Co', homeAway: 'home' }, opts)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    const text = decodeURIComponent(url.slice('https://wa.me/?text='.length))
    expect(text).toBe(whatsAppShareText({ ...training, kind: 'match', opponent: 'Al Wasl & Co', homeAway: 'home' }, opts))
    expect(url).not.toContain('&')
    expect(url).not.toContain(' ')
    expect(url).not.toContain('\n')
  })
})

describe('shareableFromRow: a saved event on the coach schedule', () => {
  const row = {
    id: 'ev-1', title: 'League', event_type: 'match', starts_at: '2026-10-13T14:00:00Z',
    event_date: '2026-10-13', start_time: '18:00:00', venue: 'Rivals Park', opponent: 'Rivals FC',
    published: true, meet_time: '17:15:00', kit: 'White', home_away: 'away', status: 'scheduled', cancel_reason: null,
  }

  it('reads the wall clock the coach typed and every match detail', () => {
    expect(shareableFromRow(row, 'U15')).toEqual({
      id: 'ev-1', kind: 'match', squadLabel: 'U15', date: '2026-10-13', startTime: '18:00', meetTime: '17:15',
      opponent: 'Rivals FC', homeAway: 'away', venue: 'Rivals Park', kit: 'White', status: 'scheduled', cancelReason: null,
    })
  })

  it('carries a cancellation and its reason', () => {
    expect(shareableFromRow({ ...row, status: 'cancelled', cancel_reason: 'Pitch closed' }, 'U15'))
      .toMatchObject({ status: 'cancelled', cancelReason: 'Pitch closed' })
  })

  it('reads an unknown type as other, and an untimed event as time to be confirmed', () => {
    expect(shareableFromRow({ ...row, event_type: 'gala', start_time: null }, 'U15'))
      .toMatchObject({ kind: 'other', startTime: null })
  })
})

describe('squadLabelFrom: the coach\'s squad, for the message title', () => {
  it('is the age group most of the squad is in', () => {
    expect(squadLabelFrom(['U15', 'U15', 'U14', null].map(age_group => ({ age_group })))).toBe('U15')
  })
  it('leaves out players whose coach has departed (Imad, #266)', () => {
    expect(squadLabelFrom([{ age_group: 'U14', status: 'coach_departed' }, { age_group: 'U14', status: 'coach_departed' },
      { age_group: 'U15', status: 'active' }])).toBe('U15')
  })
  it('falls back to "Squad" when no age group is known', () => {
    expect(squadLabelFrom([])).toBe('Squad')
    expect(squadLabelFrom([{ age_group: null }, { age_group: '  ' }])).toBe('Squad')
  })
})

// TRAK-161 follow-up (Kostas, #293): the coach learns as they type that a
// note won't reach families, by the same rule child_events() applies.
describe('familyNoteProblem: why families won\'t see a note', () => {
  const squad = ['Omar Haddad', 'Lucas Petit']

  it('says a note with a link is hidden', () => {
    for (const note of ['Directions: maps.app.goo.gl/abc', 'See https://example.com/x', 'www.example.org']) {
      expect(familyNoteProblem(note, squad)).toBe('link')
    }
  })

  it('says a note naming a player on the squad is hidden, by first name or surname', () => {
    expect(familyNoteProblem('Omar brings the bibs', squad)).toBe('name')
    expect(familyNoteProblem('Petit is captain', squad)).toBe('name')
  })

  it('has nothing to say about a clean note, a blank one, or a word that only contains a name', () => {
    expect(familyNoteProblem('Bring extra water, it\'s a hot day', squad)).toBeNull()
    expect(familyNoteProblem('   ', squad)).toBeNull()
    expect(familyNoteProblem('Omarina Park entrance', squad)).toBeNull()
    expect(familyNoteProblem('Abu Dhabi trip', ['Zaid Abu Example'])).toBeNull()
  })

  it('still catches a link while the squad\'s names are unknown, and claims nothing about names', () => {
    expect(familyNoteProblem('maps.app.goo.gl/abc', null)).toBe('link')
    expect(familyNoteProblem('Omar brings the bibs', null)).toBeNull()
  })
})
