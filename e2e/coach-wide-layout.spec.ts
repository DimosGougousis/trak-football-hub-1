import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// TRAK-199 (team decision, 21 Oct): a coach's screens use a tablet's or a laptop's
// width; a phone, upright or sideways, keeps today's layout, and so does every
// player and parent screen. Layout only. Production build, synthetic intercepted backend.
const ids = { coach: '97199000-0000-4000-8000-000000000001', player: '97199000-0000-4000-8000-000000000002' }
type Role = keyof typeof ids
const players = ['Hugo Lloris', 'Bukayo Saka', 'Beth Mead', 'Cole Palmer', 'Ella Toone', 'Declan Rice'].map((name, i) => ({
  id: `sq-${i + 1}`, coach_user_id: ids.coach, player_name: name, position: 'Defender', age_group: 'U16', shirt_number: i + 1,
  status: 'active', linked_player_id: `sq-${i + 1}-user`, created_at: '2026-10-01T08:00:00Z',
}))

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
    if (path === '/rest/v1/squad_players' && role === 'coach') {
      const one = url.searchParams.get('id')?.replace(/^eq\./, '')
      return json(one ? players.filter(p => p.id === one) : players)
    }
    if (path === '/rest/v1/rpc/my_consent_status') return json({ required: false, granted: true, invited_parent: null })
    if (path === '/rest/v1/rpc/my_session_is_live' || path === '/rest/v1/rpc/feature_on') return json(true)
    if (path.startsWith('/rest/v1/rpc/coach_squad_player_consent_required')) return json(false)
    // TRAK-250: the Squad tabs' reads. Two latest bands for three children, so Snapshot has columns to show.
    if (path === '/rest/v1/coach_assessments') return json(role === 'coach' ? [
      { squad_player_id: 'sq-1', coach_rating: 9, created_at: '2026-10-10T10:00:00Z', work_rate: 4, technical: 4, physical: 4, coachability: 4, attitude: 4, tactical: 4 },
      { squad_player_id: 'sq-2', coach_rating: 7, created_at: '2026-10-10T10:00:00Z', work_rate: 3, technical: 3, physical: 3, coachability: 3, attitude: 3, tactical: 3 },
      { squad_player_id: 'sq-3', coach_rating: 5, created_at: '2026-10-10T10:00:00Z', work_rate: 2, technical: 3, physical: 2, coachability: 3, attitude: 2, tactical: 3 },
    ] : [])
    if (['/rest/v1/coach_sessions', '/rest/v1/session_attendance', '/rest/v1/rpc/coach_squad_season', '/rest/v1/coach_calendar_events',
      '/rest/v1/event_confirmations', '/rest/v1/event_absences'].includes(path)) return json([])
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

    // TRAK-254: no side-menu-only Calendar tab off a laptop.
    await expect(page.locator('nav.trak-nav button')).toHaveText([/Home/i, /Squad/i, /Feedback/i, /Trainings/i, /Profile/i])
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

test('coach Home on a laptop: a side menu with words on the left, the page beside it', async ({ page, context }) => {
  const { unexpected, errors } = await open(page, context, 'coach', '/coach/home', 1440, 900)
  await expect(page.getByRole('button', { name: 'Assess a player' })).toBeVisible()

  const nav = await box(page, 'nav.trak-nav')
  expect([nav.x, nav.y, nav.width, nav.height].map(Math.round)).toEqual([0, 0, 232, 900])
  // TRAK-254: the tabs in words, one under the other, with the Calendar; Profile at the bottom.
  await expect(page.locator('nav.trak-nav')).toContainText('TRAK')
  const tabs = page.locator('nav.trak-nav button')
  await expect(tabs).toHaveText(['Home', 'Calendar', 'Squad', 'Feedback', 'Trainings', 'Profile'])
  const [first, second] = [(await tabs.nth(0).boundingBox())!, (await tabs.nth(1).boundingBox())!]
  expect(second.y).toBeGreaterThan(first.y + first.height - 1)
  expect(first.x).toBe(second.x)
  const profile = (await tabs.last().boundingBox())!
  expect(profile.y + profile.height).toBeGreaterThan(900 - 60)
  // "+ Create" at the top of the side menu, above the tabs; it opens the same menu.
  const create = page.getByRole('button', { name: 'Quick add' })
  const createBox = (await create.boundingBox())!
  expect(createBox.x + createBox.width).toBeLessThanOrEqual(232)
  expect(createBox.y + createBox.height).toBeLessThan(first.y)
  await expect(create).toContainText('Create')
  await create.click()
  await expect(page.getByRole('menu', { name: 'Quick add' })).toBeVisible()

  const shell = await box(page, '.trak-page')
  expect(Math.round(shell.width)).toBe(720)
  expect(Math.round(shell.x + shell.width / 2)).toBe(232 + (1440 - 232) / 2)
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
  expect(unexpected).toEqual([])
  expect(errors).toEqual([])
})

test('a coach page without the bottom bar keeps the side menu on a laptop, not on a phone', async ({ page, context }) => {
  await open(page, context, 'coach', '/settings', 1440, 900)
  await expect(page.getByText('Synthetic Coach').first()).toBeVisible()
  await expect(page.locator('nav.trak-nav')).toBeVisible()
  await expect(page.locator('nav.trak-nav button[aria-current="page"]')).toHaveText('Profile')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('nav.trak-nav')).toHaveCount(0)
  await expect(page.locator('[data-quick-add]')).toHaveCount(0)
})

test("a coach's form and Settings keep a reading column on a laptop", async ({ page, context }) => {
  const { unexpected } = await open(page, context, 'coach', '/settings', 1440, 900)
  await expect(page.getByText('Synthetic Coach').first()).toBeVisible()
  const column = await box(page, '.trak-read')
  expect(Math.round(column.width)).toBe(640)
  expect(Math.round(column.x + column.width / 2)).toBe(232 + (1440 - 232) / 2)
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

// TRAK-250 (Dimos, 22 Oct: tabs only): Squad is a tabbed coach workspace in place
// of TRAK-252's list. On a tablet or a laptop it uses the room: the four tabs, a
// page wider than the phone column, and Snapshot's band columns side by side.
const BAND_WORDS = ['Exceptional', 'Standout', 'Good', 'Steady', 'Mixed', 'Developing', 'Difficult']
// [screen, width, height, rail, band columns]
for (const [label, width, height, rail, columns] of [
  ['an upright tablet', 820, 1180, 0, 4],
  ['a laptop', 1440, 900, 232, 7],
] as const) {
  test(`coach Squad on ${label}: the four tabs across a wide page, Snapshot's bands in ${columns} columns, no sheet`, async ({ page, context }) => {
    const { unexpected, errors } = await open(page, context, 'coach', '/coach/squad', width, height)
    const tabs = page.getByRole('tablist', { name: 'Squad views' }).getByRole('tab')
    await expect(tabs).toHaveText(['Snapshot', 'Attributes', 'Availability', 'Games Statistics'])
    await expect(page.getByRole('heading', { name: 'Squad snapshot' })).toBeVisible()

    // The wide page, right of the side menu on a laptop: no 430 px column.
    const panel = await box(page, '#squad-panel')
    expect(Math.round(panel.width)).toBe(Math.min(1280, width - rail) - 64)
    expect(Math.round(panel.x)).toBeGreaterThanOrEqual(rail)

    // Every band is a column; on a laptop all seven stand in one row.
    const lefts = new Set<number>()
    for (const word of BAND_WORDS) lefts.add(Math.round((await page.getByRole('group', { name: word }).boundingBox())!.x))
    expect(lefts.size).toBe(columns)

    // Each tab opens in place: no Arc sheet, and no read the backend does not answer.
    for (const name of ['Attributes', 'Availability', 'Games Statistics', 'Snapshot']) {
      await tabs.filter({ hasText: name }).click()
      await expect(tabs.filter({ hasText: name })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel').getByText(/^(Loading|Checking) /)).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}

test('Feedback on a laptop: a table with a filter by level and Assess on each row', async ({ page, context }) => {
  const { unexpected } = await open(page, context, 'coach', '/coach/feedback', 1440, 900)
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['Player', 'Status', 'Why', 'Assess'])
  await expect(table.getByRole('row')).toHaveCount(1 + players.length)
  await expect(table.getByRole('button', { name: 'Assess' })).toHaveCount(players.length)
  await expect(page.getByRole('radio', { name: `All ${players.length}` }).or(page.getByRole('tab', { name: `All ${players.length}` })).or(page.getByRole('button', { name: `All ${players.length}` }))).toBeVisible()
  expect(unexpected).toEqual([])
})

test('Feedback on a phone keeps its list', async ({ page, context }) => {
  await open(page, context, 'coach', '/coach/feedback', 390, 844)
  await expect(page.getByText('Hugo Lloris')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

for (const [label, width, height, beside] of [['an upright tablet', 820, 1180, false], ['a laptop', 1440, 900, true]] as const) {
  test(`the Calendar on ${label}: the chosen day ${beside ? 'beside' : 'under'} the month`, async ({ page, context }) => {
    const { unexpected } = await open(page, context, 'coach', '/coach/schedule', width, height)
    const month = (await page.getByRole('grid').boundingBox())!
    const day = (await page.getByText('Nothing planned. Tap + Add to schedule an event.').boundingBox())!
    if (beside) {
      expect(day.x).toBeGreaterThan(month.x + month.width)
      expect(day.y).toBeLessThan(month.y + month.height)
    } else expect(day.y).toBeGreaterThan(month.y + month.height)
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    expect(unexpected).toEqual([])
  })
}
