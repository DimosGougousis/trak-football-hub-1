import { describe, expect, it } from 'vitest'
import { SUPABASE_FUNCTIONS_URL } from '@/integrations/supabase/client'
import { calendarApps, feedLinks } from '../calendar-link'

// TRAK-133 (J8.10): "Add Trak to my calendar" in one tap. The feed is
// TRAK-132's calendar-feed Edge Function; each app gets the link it expects.

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123_'
// Host and path, without the scheme: https://<project>.supabase.co/functions/v1/calendar-feed.
const FEED = `${SUPABASE_FUNCTIONS_URL.replace(/^https?:\/\//, '')}/calendar-feed`

describe('feedLinks: one link per calendar app, all for the same feed', () => {
  const links = feedLinks(TOKEN)

  it('opens the iPhone and Mac Calendar app with webcal://', () => {
    expect(links.apple).toBe(`webcal://${FEED}/${TOKEN}.ics`)
  })

  it('opens Google Calendar\'s subscribe prompt with the feed', () => {
    expect(links.google).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${FEED}/${TOKEN}.ics`)}`)
  })

  it('opens Outlook\'s add-from-the-web prompt, personal and work or school', () => {
    const feed = encodeURIComponent(`webcal://${FEED}/${TOKEN}.ics`)
    expect(links.outlook).toBe(`https://outlook.live.com/calendar/0/addfromweb?url=${feed}&name=Trak`)
    expect(links.outlookWork).toBe(`https://outlook.office.com/calendar/0/addfromweb?url=${feed}&name=Trak`)
  })

  it('offers the plain https link to copy into any other calendar', () => {
    expect(links.copy).toBe(`https://${FEED}/${TOKEN}.ics`)
  })
})

describe('calendarApps: the device\'s own calendar first', () => {
  it('puts Apple first on an iPhone, iPad or Mac', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
    ]) expect(calendarApps(ua)[0]).toBe('apple')
  })

  it('puts Google first on Android', () => {
    expect(calendarApps('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')[0]).toBe('google')
  })

  it('puts Outlook first on Windows', () => {
    expect(calendarApps('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')[0]).toBe('outlook')
  })

  it('always offers all three', () => {
    for (const ua of ['iPhone', 'Android', 'Windows NT', 'something else']) {
      expect([...calendarApps(ua)].sort()).toEqual(['apple', 'google', 'outlook'])
    }
  })
})
