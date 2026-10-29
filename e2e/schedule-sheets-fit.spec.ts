import { test, expect, type BrowserContext, type Page, type Locator } from '@playwright/test'

// Dimos, 29 Oct: Schedule's Edit, Take register and Cancel sheets show everything at once, with no scrolling, on a
// phone and on a tablet either way up. Production build, synthetic intercepted backend, a full squad of 24.
const COACH = '97290000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-29T12:00:00')
const names = ['Ada Brook', 'Ben Carter', 'Cal Moss', 'Dev Patel', 'Eli Grant', 'Finn Hale', 'Gus Ives', 'Hal Jones',
  'Ivo Kerr', 'Jon Lane', 'Kai Mills', 'Leo Nash', 'Max Owen', 'Ned Price', 'Oli Quinn', 'Pip Reed', 'Rex Shaw',
  'Sam Todd', 'Teo Urban', 'Uri Vance', 'Vic Wells', 'Wes Young', 'Xan Zane', 'Zac Abbott']
const players = names.map((name, i) => ({
  id: `sq-${i + 1}`, coach_user_id: COACH, player_name: name, position: 'Midfielder', age_group: 'U14', shirt_number: i + 1,
  status: 'active', linked_player_id: `sq-${i + 1}-user`, created_at: '2026-10-01T08:00:00Z',
}))
const at = (time: string) => new Date(`2026-10-29T${time}:00`).toISOString()
const event = (id: string, title: string, time: string, over: Record<string, unknown> = {}) => ({
  id, coach_user_id: COACH, squad: null, title, event_type: 'training', starts_at: at(time), ends_at: null, event_date: '2026-10-29',
  start_time: `${time}:00`, end_time: null, venue: 'North Pitch', opponent: null, notes: null, published: true, source: 'manual',
  meet_time: null, kit: 'Green bibs, shin guards', family_note: 'Bring extra water', home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, training_theme: null, competition: null, ...over,
})
const events = [
  event('ev-morning', 'Morning training', '09:00'),
  event('ev-evening', 'Evening training', '18:00', { series_id: 'series-1', meet_time: '17:30:00' }),
  event('ev-match', 'vs Rovers', '16:00', { event_type: 'match', opponent: 'Rovers', home_away: 'away', competition: 'league', kit: 'Red shirts, black shorts' }),
]

async function backend(context: BrowserContext, unexpected: string[]) {
  const user = { id: COACH, email: 'coach@sheets-fit.test', email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(NOW.getTime() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: COACH, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-sheets-fit-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    const json = (rows: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows), headers: { 'content-range': '0-0/1' } })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const path = url.pathname
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/telemetry_events') return route.fulfill({ status: 201, body: '' })
    if (path === '/rest/v1/profiles') return json([{ user_id: COACH, id: COACH, role: 'coach', full_name: 'Synthetic Coach' }])
    if (path === '/rest/v1/coach_details') return json([{ user_id: COACH, organization_id: 'org-fit', coach_role: 'Head Coach', team: 'U14' }])
    if (path === '/rest/v1/squad_players') return json(players)
    if (path === '/rest/v1/coach_calendar_events') return json(events)
    // Two families said their child can't come, one with a reason.
    if (path === '/rest/v1/event_absences') return json([{ squad_player_id: 'sq-3', reason: 'Dentist appointment' }, { squad_player_id: 'sq-9', reason: null }])
    if (path === '/rest/v1/rpc/my_consent_status') return json({ required: false, granted: true, invited_parent: null })
    if (path === '/rest/v1/rpc/my_session_is_live') return json(true)
    if (path === '/rest/v1/rpc/feature_on') return json(req.postDataJSON()?.p_feature === 'events')
    if (path.startsWith('/rest/v1/rpc/coach_squad_player_consent_required')) return json(false)
    if (path.startsWith('/rest/v1/')) return json(req.method() === 'GET' || path.startsWith('/rest/v1/rpc/') ? [] : null)
    unexpected.push(`${req.method()} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

/** Everything in the sheet is on screen: it has nothing hidden to scroll to, and none of it is cut off by the screen. */
async function fits(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible()
  // Let the sheet settle (it slides up) before measuring.
  await page.waitForTimeout(400)
  return sheet.evaluate(el => {
    const scrollers = [el, ...el.querySelectorAll<HTMLElement>('*')]
      .filter(node => node.scrollHeight - node.clientHeight > 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY))
      .map(node => `${node.getAttribute('role') ?? node.tagName.toLowerCase()} hides ${node.scrollHeight - node.clientHeight}px`)
    const box = el.getBoundingClientRect()
    if (box.top < 0) scrollers.push(`top ${Math.round(-box.top)}px above the screen`)
    if (box.bottom > window.innerHeight + 1) scrollers.push(`bottom ${Math.round(box.bottom - window.innerHeight)}px below the screen`)
    return scrollers
  })
}

for (const [label, width, height] of [
  ['a phone', 390, 844],
  ['a small phone', 375, 667],
  ['an upright tablet', 768, 1024],
  ['an upright large tablet', 820, 1180],
  ['a sideways tablet', 1024, 768],
  ['a sideways large tablet', 1180, 820],
] as const) {
  test(`Schedule's sheets show everything without scrolling on ${label}`, async ({ page, context }, testInfo) => {
    const unexpected: string[] = []
    await page.clock.setFixedTime(NOW)
    await page.setViewportSize({ width, height })
    await backend(context, unexpected)
    await page.goto('/coach/schedule')
    await expect(page.getByRole('button', { name: 'Edit Evening training' })).toBeVisible()
    const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}-${width}x${height}.png`) })
    await shot('calendar')

    await page.getByRole('button', { name: 'Take register for Morning training' }).click()
    const register = page.getByRole('dialog', { name: 'Take register' })
    await expect(register.getByText('22 present, 2 absent')).toBeVisible()
    await shot('register')
    expect.soft(await fits(page, register), 'Take register').toEqual([])
    await register.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Cancel Evening training' }).click()
    const cancel = page.getByRole('dialog', { name: 'Cancel event' })
    await shot('cancel')
    expect.soft(await fits(page, cancel), 'Cancel').toEqual([])
    await cancel.getByRole('button', { name: 'Keep event' }).click()

    await page.getByRole('button', { name: 'Edit Evening training' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit event' })
    for (const step of ['What', 'When', 'Details', 'Review']) {
      await shot(`edit-${step}`)
      expect.soft(await fits(page, edit), `Edit, ${step}`).toEqual([])
      if (step !== 'Review') await edit.getByRole('button', { name: 'Next' }).click()
    }
    await edit.getByRole('button', { name: 'Close' }).click()

    // A match asks for its opponent, home or away and competition instead of a theme.
    await page.getByRole('button', { name: 'Edit vs Rovers' }).click()
    const match = page.getByRole('dialog', { name: 'Edit event' })
    for (const step of ['What', 'When', 'Details', 'Review']) {
      await shot(`match-${step}`)
      expect.soft(await fits(page, match), `Edit match, ${step}`).toEqual([])
      if (step !== 'Review') await match.getByRole('button', { name: 'Next' }).click()
    }
    expect(unexpected).toEqual([])
  })
}
