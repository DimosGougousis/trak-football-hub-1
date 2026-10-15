import { test, expect, type BrowserContext } from '@playwright/test'

// TRAK-182: the coach screens the Arc refresh touches, on the production build
// with a synthetic, intercepted backend. Screenshots at phone width for review;
// no console errors and no unmocked request. Not a deployed-phone acceptance.
const ids = { coach: '97182000-0000-4000-8000-000000000001' }
const players = [
  { id: 'sq-1', player_name: 'Hugo Lloris', position: 'Goalkeeper', age_group: 'U16', shirt_number: 1 },
  { id: 'sq-2', player_name: 'Bukayo Saka', position: 'Defender', age_group: 'U16', shirt_number: 4 },
  { id: 'sq-3', player_name: 'Beth Mead', position: 'Midfielder', age_group: 'U16', shirt_number: 8 },
  { id: 'sq-4', player_name: 'Cole Palmer', position: 'Forward', age_group: 'U16', shirt_number: 9 },
  { id: 'sq-5', player_name: 'Thiago Silva', position: 'Midfielder', age_group: 'U16', shirt_number: 10 },
].map(p => ({ ...p, coach_user_id: ids.coach, status: 'active', linked_player_id: `${p.id}-user`, created_at: '2026-10-01T08:00:00Z' }))

async function coachBackend(context: BrowserContext, unexpected: string[]) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
  const user = { id: ids.coach, email: 'coach@arc182.test', email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: ids.coach, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-arc182-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  const assessments = players.slice(0, 3).map((p, i) => ({ id: `as-${i}`, squad_player_id: p.id, coach_user_id: ids.coach,
    created_at: `${day}T0${8 - i}:00:00Z`, coach_rating: 8 - i, work_rate: 8, tactical: 7, attitude: 8, technical: 7, physical: 7, coachability: 8,
    squad_players: { player_name: p.player_name } }))
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    const json = (rows: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows), headers: { 'content-range': '0-0/1' } })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const path = url.pathname
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/profiles') return json([{ user_id: ids.coach, id: ids.coach, role: 'coach', full_name: 'Synthetic Coach' }])
    if (path === '/rest/v1/coach_details') return json([{ user_id: ids.coach, organization_id: 'org-182' }])
    if (path === '/rest/v1/squad_players') {
      const one = url.searchParams.get('id')?.replace(/^eq\./, '')
      return json(one ? players.filter(p => p.id === one) : players)
    }
    // A lookup for one player's session is a first assessment here; lists get the recent three.
    if (path === '/rest/v1/coach_assessments') return json(url.searchParams.has('session_id') ? [] : assessments)
    if (path === '/rest/v1/coach_sessions') return json([{ id: 'session-1', coach_user_id: ids.coach, title: 'Finishing', session_type: 'training', session_date: day, venue: 'Synthetic pitch' }])
    if (path === '/rest/v1/coach_calendar_events') return json([])
    if (path === '/rest/v1/telemetry_events') return route.fulfill({ status: 201, body: '' })
    if (path.startsWith('/rest/v1/rpc/coach_squad_player_consent_required')) return json(false)
    if (path === '/rest/v1/rpc/my_session_is_live' || path === '/rest/v1/rpc/feature_on') return json(true)
    if (path.startsWith('/rest/v1/rpc/')) return json([])
    if (path === '/rest/v1/session_attendance') return json(players.map(p => ({ session_id: 'session-1', squad_player_id: p.id, status: 'present' })))
    if (['matches', 'event_absences', 'recognition_awards', 'coach_shared_feedback', 'player_details', 'coach_assessment_notes'].some(t => path === `/rest/v1/${t}`)) return json([])
    unexpected.push(`${req.method()} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

test.describe('TRAK-182 coach screens', () => {
  test.use({ timezoneId: 'Asia/Dubai' })
  for (const [name, path, ready] of [
    ['home', '/coach/home', 'Hugo Lloris'],
    ['squad', '/coach/squad', 'Bukayo Saka'],
    ['assess', '/coach/assess', 'Assessment'],
    ['player', '/coach/player/sq-2', 'Bukayo Saka'],
  ] as const) {
    test(`coach ${name}`, async ({ page, context }, testInfo) => {
      const unexpected: string[] = [], errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      await coachBackend(context, unexpected)
      await page.goto(path)
      await expect(page.getByText(ready).first()).toBeVisible()
      await page.waitForTimeout(400) // let springs settle for the screenshot
      await page.screenshot({ path: testInfo.outputPath(`coach-${name}.png`), fullPage: true })
      expect(unexpected).toEqual([])
      expect(errors).toEqual([])
    })
  }

  // TRAK-182 part 7: Schedule's event form one step per screen, ending in Review.
  test('coach schedule, through the steps', async ({ page, context }, testInfo) => {
    const unexpected: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await coachBackend(context, unexpected)
    await page.goto('/coach/schedule')
    await page.getByRole('button', { name: 'Add event' }).click()
    const sheet = page.getByRole('dialog', { name: 'New event' })
    await sheet.getByRole('button', { name: 'Match' }).click()
    await sheet.getByLabel('Opponent').fill('Synthetic Rovers')
    await sheet.getByRole('button', { name: 'Away' }).click()
    await sheet.getByLabel('Venue').fill('Rovers Park')
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('coach-schedule-what.png') })
    await sheet.getByRole('button', { name: 'Next' }).click()
    await sheet.getByRole('button', { name: /^Kickoff\b/ }).click()
    await page.getByRole('listbox').getByRole('option', { name: '4:00 PM' }).click()
    await sheet.getByRole('button', { name: 'Next' }).click()
    await sheet.getByLabel('Kit').fill('Red shirts, black shorts')
    await sheet.getByRole('button', { name: 'Next' }).click()
    await expect(sheet.getByRole('button', { name: 'Publish' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Save draft' })).toBeVisible()
    await expect(sheet.getByText('Synthetic Rovers (Away)')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('coach-schedule-review.png') })
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

  // TRAK-182 part 7: the assessment one step per screen, ending in Review.
  test('coach assess, through the steps', async ({ page, context }, testInfo) => {
    const unexpected: string[] = [], errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await coachBackend(context, unexpected)
    await page.goto('/coach/assess')
    await page.getByRole('combobox', { name: 'Player' }).selectOption({ label: 'Bukayo Saka' })
    await page.getByRole('combobox', { name: 'Session' }).selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Next' }).click()
    const slider = page.getByRole('slider', { name: 'Work Rate' })
    await slider.focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuenow', '8')
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('coach-assess-ratings.png'), fullPage: true })
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel(/^Message to/).fill('Great pressing today.')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible()
    await expect(page.getByText('Great pressing today.')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('coach-assess-review.png'), fullPage: true })
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
})
