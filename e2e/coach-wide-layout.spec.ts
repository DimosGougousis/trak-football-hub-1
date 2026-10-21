import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// TRAK-199 (team decision, 21 Oct): a coach's screens use a tablet's or a laptop's
// width; a phone, upright or sideways, keeps today's layout, and so does every
// player and parent screen. Layout only. Production build, synthetic intercepted backend.
const ids = { coach: '97199000-0000-4000-8000-000000000001', player: '97199000-0000-4000-8000-000000000002' }
type Role = keyof typeof ids

async function backend(context: BrowserContext, role: Role, unexpected: string[]) {
  const id = ids[role]
  const user = { id, email: `${role}@wide199.test`, email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-wide199-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    const json = (rows: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows), headers: { 'content-range': '0-0/1' } })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const path = url.pathname
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/telemetry_events') return route.fulfill({ status: 201, body: '' })
    if (path === '/rest/v1/profiles') return json([{ user_id: id, id, role, full_name: role === 'coach' ? 'Synthetic Coach' : 'Synthetic Player' }])
    if (path === '/rest/v1/coach_details') return json([{ user_id: ids.coach, organization_id: 'org-199', coach_role: 'Head Coach', team: 'U16' }])
    if (path === '/rest/v1/rpc/my_consent_status') return json({ required: false, granted: true, invited_parent: null })
    if (path === '/rest/v1/rpc/my_session_is_live' || path === '/rest/v1/rpc/feature_on') return json(true)
    if (path.startsWith('/rest/v1/rpc/coach_squad_player_consent_required')) return json(false)
    // Layout only: every other read is empty.
    if (path.startsWith('/rest/v1/')) return json(req.method() === 'GET' || path.startsWith('/rest/v1/rpc/') ? [] : null)
    unexpected.push(`${req.method()} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

async function open(page: Page, context: BrowserContext, role: Role, path: string, width: number, height: number) {
  const unexpected: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height })
  await backend(context, role, unexpected)
  await page.goto(path)
  return { unexpected, errors }
}

// [screen, width, height, page width]
for (const [label, width, height, pageWidth] of [
  ['a phone', 390, 844, 390],
  ['a phone turned sideways', 844, 390, 430],
  ['an upright tablet', 820, 1180, 720],
] as const) {
  test(`coach Home on ${label}: the page and the bottom bar share one column`, async ({ page, context }) => {
    const { unexpected, errors } = await open(page, context, 'coach', '/coach/home', width, height)
    await expect(page.getByRole('button', { name: 'Assess a player' })).toBeVisible()

    const shell = await box(page, '.trak-page')
    expect(Math.round(shell.width)).toBe(pageWidth)
    expect(Math.round(shell.x + shell.width / 2)).toBe(Math.round(width / 2))
    const nav = await box(page, 'nav.trak-nav')
    expect([Math.round(nav.x), Math.round(nav.width), Math.round(nav.y + nav.height)]).toEqual([Math.round(shell.x), pageWidth, height])
    // The "+" keeps 16 px from the page's right edge.
    const plus = await box(page, '[data-quick-add]')
    expect(Math.round(shell.x + shell.width - (plus.x + plus.width))).toBe(16)
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}

test('coach Home on a laptop: the tabs stand in a rail on the left, the page beside it', async ({ page, context }) => {
  const { unexpected, errors } = await open(page, context, 'coach', '/coach/home', 1440, 900)
  await expect(page.getByRole('button', { name: 'Assess a player' })).toBeVisible()

  const nav = await box(page, 'nav.trak-nav')
  expect([nav.x, nav.y, nav.width, nav.height].map(Math.round)).toEqual([0, 0, 96, 900])
  // The same five tabs, one under the other.
  const tabs = page.locator('nav.trak-nav button')
  await expect(tabs).toHaveText([/Home/i, /Squad/i, /Feedback/i, /Trainings/i, /Profile/i])
  const [first, second] = [(await tabs.nth(0).boundingBox())!, (await tabs.nth(1).boundingBox())!]
  expect(second.y).toBeGreaterThan(first.y + first.height - 1)

  const shell = await box(page, '.trak-page')
  expect(Math.round(shell.width)).toBe(720)
  expect(Math.round(shell.x + shell.width / 2)).toBe(96 + (1440 - 96) / 2)
  const plus = await box(page, '[data-quick-add]')
  expect(Math.round(shell.x + shell.width - (plus.x + plus.width))).toBe(16)
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})

test("a coach's form and Settings keep a reading column on a laptop", async ({ page, context }) => {
  const { unexpected } = await open(page, context, 'coach', '/settings', 1440, 900)
  await expect(page.getByText('Synthetic Coach').first()).toBeVisible()
  const column = await box(page, '.trak-read')
  expect(Math.round(column.width)).toBe(640)
  expect(Math.round(column.x + column.width / 2)).toBe(96 + (1440 - 96) / 2)
  expect(unexpected).toEqual([])
})

test("the Calendar's sheets stop at the Arc bottom sheet's width on a tablet", async ({ page, context }) => {
  const { unexpected } = await open(page, context, 'coach', '/coach/schedule', 820, 1180)
  await page.getByRole('button', { name: 'Add event' }).click()
  const sheet = (await page.getByRole('dialog', { name: 'New event' }).boundingBox())!
  expect(Math.round(sheet.width)).toBe(576)
  expect(Math.round(sheet.x + sheet.width / 2)).toBe(410)
  expect(unexpected).toEqual([])
})

test("a player's Home keeps the phone column on a laptop", async ({ page, context }) => {
  const { unexpected } = await open(page, context, 'player', '/player/home', 1440, 900)
  await expect(page.locator('nav.trak-nav')).toBeVisible()
  const shell = await box(page, '.trak-page')
  expect([Math.round(shell.width), Math.round(shell.x + shell.width / 2)]).toEqual([430, 720])
  const nav = await box(page, 'nav.trak-nav')
  expect([Math.round(nav.width), Math.round(nav.y + nav.height)]).toEqual([430, 900])
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBeUndefined()
  expect(unexpected).toEqual([])
})
