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

async function coachBackend(context: BrowserContext, unexpected: string[], withMatch = false) {
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
    // withMatch: a published away match tonight, changed 3 h ago; Beth can't make it, Thiago's consent isn't active.
    const match = { id: 'ev-182', coach_user_id: ids.coach, event_type: 'match', title: 'League', event_date: day, start_time: '20:00:00',
      meet_time: '19:15:00', starts_at: `${day}T16:00:00Z`, venue: 'Rivals Park', kit: 'White shirts, black shorts', opponent: 'Rivals FC',
      home_away: 'away', status: 'scheduled', published: true, family_note: 'Bring water and shin pads', sequence: 1,
      updated_at: new Date(Date.now() - 3 * 3600_000).toISOString() }
    if (withMatch && path === '/rest/v1/coach_sessions' && url.searchParams.has('event_id')) return json([])
    if (withMatch && path === '/rest/v1/coach_calendar_events') return json([match])
    if (withMatch && path === '/rest/v1/event_absences') return json([{ squad_player_id: 'sq-3', reason: 'School trip' }])
    if (withMatch && path.startsWith('/rest/v1/rpc/coach_squad_player_consent_required')) return json(req.postDataJSON()?.p_squad_player_id === 'sq-5')
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

  // Imad, 16 Oct: the event sheet's layout, with the names folded behind the avatars and opened.
  test('coach event sheet, a published away match', async ({ page, context }, testInfo) => {
    const unexpected: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await coachBackend(context, unexpected, true)
    await page.goto('/coach/home')
    await page.getByRole('button', { name: /Rivals FC/ }).click()
    const sheet = page.getByRole('dialog', { name: 'vs Rivals FC' })
    await expect(sheet.getByText('Coming · 3')).toBeVisible()
    await expect(sheet.getByText('Attendance excludes players who are not using Trak')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath('coach-event-sheet-1.png') })
    await sheet.getByRole('button', { name: 'Expand sheet' }).click()
    await sheet.getByRole('button', { name: 'Show names: Coming' }).click()
    await expect(sheet.getByRole('list', { name: 'Coming' }).getByRole('listitem')).toHaveCount(3)
    await page.mouse.move(0, 0) // a phone has no hover; keep the avatar tooltip out of the shot
    await sheet.getByText('Attending', { exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: testInfo.outputPath('coach-event-sheet-2-names.png') })
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

  // TRAK-182 part 8: the quick-add's four faces: "+", menu, form, check.
  test('coach quick add, its four states', async ({ page, context }, testInfo) => {
    const unexpected: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await coachBackend(context, unexpected)
    // The draft's insert answers like PostgREST.
    await context.route(url => url.pathname === '/rest/v1/coach_calendar_events', route =>
      route.request().method() === 'POST' ? route.fulfill({ status: 201, contentType: 'application/json', body: '[{"id":"new-1"}]' }) : route.fallback())
    await page.goto('/coach/schedule')
    const plus = page.getByRole('button', { name: 'Quick add' })
    await expect(plus).toBeVisible()
    const settle = async () => {
      // motion's springs run in JavaScript: wait until the surface stops moving.
      let last = ''
      for (let i = 0; i < 20; i++) {
        const box = JSON.stringify(await page.locator('[data-quick-add] > div').first().boundingBox())
        if (box === last) return
        last = box; await page.waitForTimeout(80)
      }
    }
    await settle(); await page.screenshot({ path: testInfo.outputPath('quick-add-1-plus.png') })
    await plus.click()
    await expect(page.getByRole('menu', { name: 'Quick add' })).toBeVisible()
    await settle(); await page.screenshot({ path: testInfo.outputPath('quick-add-2-menu.png') })
    await page.getByRole('menuitem', { name: 'New event' }).click()
    const form = page.getByRole('dialog', { name: 'New event' })
    await expect(form).toBeVisible()
    await settle(); await page.screenshot({ path: testInfo.outputPath('quick-add-3-form.png') })
    // The pickers open upward, whole, inside the screen (Imad, 16 Oct).
    await form.getByRole('button', { name: /^Date\b/ }).click()
    const calendar = page.getByRole('dialog', { name: 'Date calendar' })
    await expect(calendar).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('quick-add-3b-calendar.png') })
    const box = await calendar.boundingBox()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.keyboard.press('Escape')
    await form.getByRole('button', { name: /^Start\b/ }).click()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: testInfo.outputPath('quick-add-3c-times.png') })
    const listBox = await list.boundingBox()
    expect(listBox!.y).toBeGreaterThanOrEqual(0)
    await list.getByRole('option', { name: '5:00 PM' }).click()
    await form.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeAttached()
    await page.waitForTimeout(300)
    await page.screenshot({ path: testInfo.outputPath('quick-add-4-check.png') })
    await expect(page.getByRole('button', { name: 'Quick add' })).toBeVisible({ timeout: 3000 })
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })

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
    await page.getByLabel(/^Private note/).fill('Work on the first touch under pressure.')
    await page.waitForTimeout(300)
    await page.screenshot({ path: testInfo.outputPath('coach-assess-message.png'), fullPage: true })
    // Message and private note share a step (Imad, 16 Oct); Next goes to Review.
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
