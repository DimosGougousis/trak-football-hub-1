import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// TRAK-283 (Games 1/8): Games home and a game's page with the academy's games switch on, at a phone's and a
// laptop's width: no sideways scroll, and the keyboard reaches every control. TRAK-284: plan step 1, opponent and
// goals, saved as a draft; what was typed survives a look at another tab. Production build, synthetic intercepted
// backend; test people are named after footballers.
test.use({ timezoneId: 'Asia/Dubai' })

const COACH = '97283000-0000-4000-8000-000000000001'
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** A Dubai academy's match (UTC+4 all year): the wall clock typed and its instant. */
function match(id: string, squad: string | null, days: number, hhmm: string, over: Record<string, unknown> = {}) {
  const date = new Date(Date.now() + 4 * 60 * MINUTE + days * DAY).toISOString().slice(0, 10)
  const starts = Date.parse(`${date}T${hhmm}:00+04:00`)
  return {
    id, coach_user_id: COACH, squad, title: 'Match', event_type: 'match', published: true, status: 'scheduled',
    starts_at: new Date(starts).toISOString(), ends_at: new Date(starts + 90 * MINUTE).toISOString(), event_date: date,
    start_time: `${hhmm}:00`, end_time: null, meet_time: null, opponent: 'Synthetic Rovers U16', home_away: 'home',
    venue: 'Rehearsal Park', kit: 'Blue shirts', kit_snapshot: null, family_note: 'Bring water', notes: null, series_id: null,
    training_theme: null, cancel_reason: null, source: 'manual', organization_id: 'org-283', ...over,
  }
}
const MATCHES = [
  match('m-next', 'U16', 3, '11:00', { opponent: 'Parkview Athletic U16' }),
  match('m-draft', 'U14', 6, '17:30', { opponent: 'Synthetic United U14', published: false, home_away: 'away', venue: 'United Ground' }),
  match('m-past', 'U16', -5, '10:00', { opponent: 'Lakeside FC U16' }),
  match('m-old', null, -12, '18:00', { opponent: 'Riverside Academy' }),
]
const players = [['Theodoros Zagorakis', 'U16'], ['Angelos Charisteas', 'U16'], ['Giorgos Karagounis', 'U14']].map(([name, squad], i) => ({
  id: `sq-${i + 1}`, coach_user_id: COACH, player_name: name, position: 'Midfielder', age_group: squad, shirt_number: i + 1,
  status: 'active', linked_player_id: null, created_at: '2026-10-01T08:00:00Z',
}))

/** game_plans as the database keeps them: one row per match, written by the app's upsert. */
type Plans = Map<string, Record<string, unknown>>

async function backend(context: BrowserContext, unexpected: string[], plans: Plans) {
  const user = { id: COACH, email: 'coach@games283.test', email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z',
    aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: COACH, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-games283-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    const json = (rows: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows), headers: { 'content-range': '0-0/1' } })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const path = url.pathname
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/telemetry_events') return route.fulfill({ status: 201, body: '' })
    if (path === '/rest/v1/profiles') return json([{ user_id: COACH, id: COACH, role: 'coach', full_name: 'Fernando Santos' }])
    if (path === '/rest/v1/coach_details') return json([{ user_id: COACH, organization_id: 'org-283', coach_role: 'Head Coach', team: 'U16' }])
    if (path === '/rest/v1/organizations') return json([{ id: 'org-283', name: 'Rehearsal FC', logo_url: null }])
    if (path === '/rest/v1/squad_players') return json(players)
    if (path === '/rest/v1/rpc/my_consent_status') return json({ required: false, granted: true, invited_parent: null })
    if (path === '/rest/v1/rpc/my_session_is_live' || path === '/rest/v1/rpc/feature_on') return json(true)
    if (path === '/rest/v1/coach_calendar_events') {
      const one = url.searchParams.get('id')?.replace(/^eq\./, '')
      return json(one ? MATCHES.filter(m => m.id === one) : MATCHES)
    }
    if (path === '/rest/v1/game_plans' && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      plans.set(body.event_id as string, { ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return route.fulfill({ status: 201, body: '' })
    }
    if (path === '/rest/v1/game_plans') {
      const one = url.searchParams.get('event_id')?.replace(/^eq\./, '')
      return json([...plans.values()].filter(plan => !one || plan.event_id === one))
    }
    // Every other read is empty.
    if (path.startsWith('/rest/v1/')) return json(req.method() === 'GET' || path.startsWith('/rest/v1/rpc/') ? [] : null)
    unexpected.push(`${req.method()} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

async function open(page: Page, context: BrowserContext, path: string, width: number, height: number, plans: Plans = new Map()) {
  const unexpected: string[] = [], errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height })
  await backend(context, unexpected, plans)
  await page.goto(path)
  return { unexpected, errors }
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/** Tab from the top of the page; every control in `scope` must take focus at least once. A tab list is one stop
 *  (roving focus): its other tabs are reached with the arrow keys, which the tests check separately. So is a radio
 *  group, when `fields` adds a form's inputs. */
async function everyControlByKeyboard(page: Page, scope: string, fields = false) {
  const kinds = `a[href], button:not([disabled]), [tabindex="0"]${fields ? ', input:not([type="radio"]), textarea' : ''}`
  const controls = await page.locator(`${scope} :is(${kinds}):not([tabindex="-1"], [role="tablist"])`).evaluateAll(els =>
    els.filter(el => (el as HTMLElement).offsetParent !== null && el.getAttribute('aria-hidden') !== 'true')
      .map((el, i) => { (el as HTMLElement).dataset.kb = String(i); return String(i) }))
  const reached = new Set<string>()
  await page.locator('body').focus()
  for (let i = 0; i < 120 && reached.size < controls.length; i++) {
    await page.keyboard.press('Tab')
    const kb = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kb)
    if (kb) reached.add(kb)
  }
  const missed = controls.filter(kb => !reached.has(kb))
  const names = await Promise.all(missed.map(kb => page.locator(`[data-kb="${kb}"]`).first().evaluate(el => el.outerHTML.slice(0, 120))))
  return { count: controls.length, missed: names }
}

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`Games home at ${width} px: the next game, open drafts and the squad's matches`, async ({ page, context }, testInfo) => {
    const plans: Plans = new Map([['m-next', { event_id: 'm-next', strength: null, their_formation: null, key_players: [], scouting: '',
      goals: [{ title: 'Win it back in their half', looks_like: '' }], created_at: '2026-10-27T17:00:00Z', updated_at: '2026-10-27T17:40:00Z' }]])
    const { unexpected, errors } = await open(page, context, '/coach/games', width, height, plans)
    await expect(page.getByRole('heading', { level: 1, name: 'Games' })).toBeVisible()
    const next = page.getByRole('region', { name: 'Next game' })
    await expect(next.getByText('vs Parkview Athletic U16')).toBeVisible()
    await expect(next.getByText('Plan not shared')).toBeVisible()
    await expect(next.getByRole('button', { name: 'Write the plan' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Open drafts' }).getByRole('button', { name: 'Open the plan, vs Parkview Athletic U16' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Your games' }).getByRole('link')).toHaveCount(4)
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath(`games-home-${width}.png`), fullPage: true })
    expect(await sideways(page)).toBeLessThanOrEqual(0)
    const keyboard = await everyControlByKeyboard(page, '.max-w-\\[1280px\\]')
    expect(keyboard.count).toBeGreaterThan(5)
    expect(keyboard.missed).toEqual([])
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

  test(`a game's page at ${width} px: Logistics, then Game plan and Evaluation`, async ({ page, context }, testInfo) => {
    const { unexpected, errors } = await open(page, context, '/coach/games/m-draft', width, height)
    await expect(page.getByRole('heading', { level: 1, name: 'vs Synthetic United U14' })).toBeVisible()
    await expect(page.getByText('Logistics not shared')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath(`game-logistics-${width}.png`), fullPage: true })
    expect(await sideways(page)).toBeLessThanOrEqual(0)
    const keyboard = await everyControlByKeyboard(page, '.max-w-\\[960px\\]')
    expect(keyboard.missed).toEqual([])

    // The keyboard moves between the panels (Arc tabs).
    await page.getByRole('tab', { name: 'Logistics' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: 'Your goals' })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: 'Evaluate it after full time' })).toBeVisible()
    expect(page.url()).toContain('?tab=evaluation')
    expect(await sideways(page)).toBeLessThanOrEqual(0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

  test(`a game's plan at ${width} px: opponent and goals, kept across tabs and saved as a draft`, async ({ page, context }, testInfo) => {
    const plans: Plans = new Map()
    const { unexpected, errors } = await open(page, context, '/coach/games/m-next?tab=plan', width, height, plans)
    await expect(page.getByRole('heading', { name: 'Your goals' })).toBeVisible()
    await expect(page.getByText('Plan not written')).toBeVisible()
    const goal = page.getByRole('group', { name: 'Goal 1' })
    await goal.getByLabel('Goal').fill('Win it back in their half')
    await goal.getByLabel('What it looks like').fill('Press when their keeper plays short.')
    await page.getByText('Stronger', { exact: true }).click()
    await page.getByRole('button', { name: 'Add a key player' }).click()
    const player = page.getByRole('group', { name: 'Key player 1' })
    await player.getByLabel('Number').fill('9')
    await player.getByLabel('Position').fill('Striker')
    await player.getByLabel('Note').fill('Quick. Runs in behind.')
    await page.getByLabel('What you know about them').fill('Their keeper plays short to the left centre-back.')

    // A look at Logistics, with the panel's exit animation, keeps every field.
    await page.getByRole('tab', { name: 'Logistics' }).click()
    await expect(page.getByText('Shared with families')).toBeVisible()
    await page.waitForTimeout(600)
    await page.getByRole('tab', { name: 'Game plan' }).click()
    await expect(goal.getByLabel('Goal')).toHaveValue('Win it back in their half')
    await expect(player.getByLabel('Number')).toHaveValue('9')

    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()
    await expect(page.getByText('Plan not shared')).toBeVisible()
    expect(plans.get('m-next')).toMatchObject({ strength: 'stronger', key_players: [{ number: 9, position: 'Striker', note: 'Quick. Runs in behind.' }],
      goals: [{ title: 'Win it back in their half', looks_like: 'Press when their keeper plays short.' }] })
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath(`game-plan-${width}.png`), fullPage: true })
    expect(await sideways(page)).toBeLessThanOrEqual(0)
    const keyboard = await everyControlByKeyboard(page, '[role="tabpanel"]:not([hidden])', true)
    expect(keyboard.count).toBeGreaterThan(10)
    expect(keyboard.missed).toEqual([])
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
