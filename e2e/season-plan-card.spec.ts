import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// TRAK-361 (Season plan 13/18): Home's Season plan card in a real browser, on a laptop, a tablet and a phone. Folded it
// is one line; open it shows the season objectives, the player objectives row and View plan; a reload keeps it open.
// Under All, one folded card per squad. Production build, synthetic intercepted backend.
const coachId = '97361000-0000-4000-8000-000000000001'
type Row = Record<string, unknown>

// TRAK-549: a squad can have no plan yet ('none') or one not shared yet ('draft'); the rest are shared.
async function backend(context: BrowserContext, unexpected: string[], squads: string[], states: Record<string, 'none' | 'draft'> = {}) {
  const players: Row[] = squads.flatMap((squad, s) => ['Goalkeeper', 'Defender', 'Midfielder'].map((position, i) => ({
    id: `sq-${s}-${i}`, coach_user_id: coachId, player_name: `Synthetic Player ${squad} ${i + 1}`, position, age_group: squad,
    shirt_number: i + 1, status: 'active', linked_player_id: `child-${s}-${i}`, created_at: '2026-10-01T08:00:00Z',
  })))
  const plan = (squad: string): Row => ({ id: `plan-${squad}`, squad, starts_on: '2026-09-01', ends_on: '2027-06-30', shared_at: '2026-11-01T10:00:00Z',
    positions_known: 'yes', watch_rule: 't2', last_shared_at: '2026-11-01T10:00:00Z', unshared_parts: [], unshared_players: [],
    ...(states[squad] === 'draft' && { shared_at: null, last_shared_at: null }) })
  const user = { id: coachId, email: 'coach@card361.test', email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: coachId, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-card361-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const path = url.pathname, method = req.method()
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/telemetry_events') return route.fulfill({ status: 201, body: '' })
    if (path === '/rest/v1/profiles') return json([{ user_id: coachId, id: coachId, role: 'coach', full_name: 'Synthetic Coach' }])
    if (path === '/rest/v1/coach_details') return json([{ user_id: coachId, organization_id: 'org-361', coach_role: 'Head Coach', team: squads[0] }])
    if (path === '/rest/v1/squad_players') return json(players)
    if (path === '/rest/v1/rpc/my_session_is_live') return json(true)
    if (path === '/rest/v1/rpc/feature_on') return json(['events', 'games', 'season_plan'].includes(req.postDataJSON()?.p_feature))
    if (path === '/rest/v1/rpc/coach_squad_player_consent_required') return json(false)
    // TRAK-312: the whole roster in one check; the ids still waiting.
    if (path === '/rest/v1/rpc/coach_squad_players_consent_pending') return json([])
    if (path === '/rest/v1/season_plans' && method === 'GET') {
      const squad = url.searchParams.get('squad')?.replace(/^eq\./, '')
      return json(squads.filter(s => (!squad || s === squad) && states[s] !== 'none').map(plan))
    }
    if (path === '/rest/v1/season_objectives' && method === 'GET')
      return json([{ id: `so-${(url.searchParams.get('plan_id') ?? '').replace(/^eq\./, '')}`, place: 1, title: 'Stay compact', looks_like: '', status: 'open', created_at: '2026-09-01T08:00:00Z', retired_at: null }])
    // TRAK-362: one published match with two instructions, and a draft that never shows.
    if (path === '/rest/v1/coach_calendar_events' && method === 'GET') return json(['m-1', 'm-draft'].map((id, i) => ({
      id, coach_user_id: coachId, event_type: 'match', squad: squads[0], title: i ? 'vs Synthetic Draft' : 'vs Synthetic United', published: true,
      status: 'scheduled', starts_at: `2026-10-1${i}T15:00:00Z`, ends_at: `2026-10-1${i}T16:30:00Z`, event_date: `2026-10-1${i}`, start_time: '15:00',
      opponent: i ? 'Synthetic Draft' : 'Synthetic United', home_away: 'home', venue: 'Synthetic Park', competition: 'league' })))
    if (path === '/rest/v1/game_evaluations' && method === 'GET') return json([
      { event_id: 'm-1', saved_at: '2026-10-11T10:00:00Z', published_at: '2026-10-11T10:00:00Z', our_score: 2, their_score: 1, plan_worked: ['worked', 'partly'] },
      { event_id: 'm-draft', saved_at: '2026-10-12T10:00:00Z', published_at: null, our_score: 0, their_score: 0, plan_worked: [] }]
      .filter(e => { const asked = url.searchParams.get('event_id'); return !asked || asked.replace(/^(eq\.|in\.\()|\)$/g, '').split(',').includes(e.event_id) }))
    if (path === '/rest/v1/game_plans' && method === 'GET')
      // TRAK-363: the first instruction carries the squad's season objective.
      return json([{ event_id: 'm-1', saved_at: '2026-10-09T10:00:00Z', goals: [{ title: 'Press as one', looks_like: '', season_objective_id: `so-plan-${squads[0]}` }, { title: 'Win the second ball', looks_like: '' }] }])
    if (path === '/rest/v1/player_objectives') return json([{ id: 'po-1', squad_player_id: 'sq-0-1', title: 'Holds the line together', source: 'library', season_objective_id: null, created_at: '2026-11-01T08:00:00Z', status: 'open', retired_at: null }])
    if (path === '/rest/v1/objective_progress') return json([])
    if (path === '/rest/v1/rpc/stuck_player_objectives') return json([])
    // Every other read is empty: this is about the card, not the rest of Home.
    if (path.startsWith('/rest/v1/') && (method === 'GET' || path.startsWith('/rest/v1/rpc/'))) return json([])
    unexpected.push(`${method} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const foldOf = (page: Page, squad: string) => page.getByRole('region', { name: `${squad} season plan` }).locator('button[aria-expanded]').first()

for (const [width, height] of [[1280, 800], [834, 1112], [390, 844]] as const) {
  test(`the Season plan card at ${width} px: folds, opens, and stays open after a reload`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U16'])
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    const card = page.getByRole('region', { name: 'U16 season plan' })
    // TRAK-549: a green label, the weeks left beside it, and the season as a bar; View plan at the top on a laptop.
    await expect(card.getByText('Shared 1 Nov', { exact: true })).toBeVisible()
    await expect(card.getByText(/^\d+ weeks? left$/)).toBeVisible()
    await expect(card.getByRole('img', { name: /^Season from \d+ \w+ to \d+ \w+, \d+ weeks? left$/ })).toBeVisible()
    await expect(foldOf(page, 'U16')).toHaveAttribute('aria-expanded', 'false')
    await expect(card.getByRole('button', { name: 'View plan' })).toHaveCount(width >= 1024 ? 1 : 0)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`card-folded-${width}.png`) })

    await foldOf(page, 'U16').click()
    // TRAK-363: measured from the one published match that carried it.
    await expect(card.getByText('Worked in 1 of 1 match · 100%')).toBeVisible()
    await card.getByRole('button', { name: 'Show players' }).click()
    await expect(card.getByText('Holds the line together')).toBeVisible()
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`card-open-${width}.png`) })

    // TRAK-362: the published match only, folded; opened, how each instruction went.
    const result = card.getByRole('button', { name: /^vs Synthetic United/ })
    await expect(card.getByText('vs Synthetic Draft')).toHaveCount(0)
    // TRAK-552: named as Matches home says it; on screen, the score leads with its word under it.
    await expect(result).toHaveAccessibleName(/, Won 2–1$/)
    await expect(result).toContainText('2–1Won')
    await result.click()
    await expect(card.getByText('Press as one')).toBeVisible()
    await expect(card.getByText('Partly')).toBeVisible()
    // TRAK-363: the instruction names its season objective, which is measured from that match.
    await expect(card.getByText('Season objective: Stay compact')).toBeVisible()
    await expect(card.getByRole('button', { name: /^Stay compact/ })).toContainText('Worked in 1 of 1 match · 100%')
    await expect(card.getByRole('figure', { name: 'Times each season objective worked' })).toBeVisible()
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await result.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`card-results-${width}.png`) })

    await page.reload()
    await expect(foldOf(page, 'U16')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('region', { name: 'U16 season plan' }).getByRole('button', { name: 'View plan' })).toBeVisible()
    expect(unexpected).toEqual([])
  })
}

test('under All, one folded card per squad, each opening on its own', async ({ context, page }, testInfo) => {
  const unexpected: string[] = []
  await backend(context, unexpected, ['U14', 'U16'])
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/coach/home')
  await expect(foldOf(page, 'U14')).toHaveAttribute('aria-expanded', 'false')
  await expect(foldOf(page, 'U16')).toHaveAttribute('aria-expanded', 'false')
  await foldOf(page, 'U16').click()
  await expect(foldOf(page, 'U16')).toHaveAttribute('aria-expanded', 'true')
  await expect(foldOf(page, 'U14')).toHaveAttribute('aria-expanded', 'false')
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
  await page.getByRole('region', { name: 'Season plans' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('cards-all-1280.png') })
  expect(unexpected).toEqual([])
})

// TRAK-549 (Kostas's 21 Nov mockup): before it's shared the card is one line, its next step on it: Start for a squad with
// no plan, Continue for one not shared yet. Nothing to fold; no season bar; nothing scrolls sideways.
for (const [width, height] of [[1280, 800], [390, 844]] as const) {
  test(`not started and not shared yet at ${width} px: one line each, Start or Continue on it`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U14', 'U16'], { U14: 'none', U16: 'draft' })
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    for (const [squad, state, action] of [['U14', 'Not started', 'Start'], ['U16', 'Not shared yet', 'Continue']] as const) {
      const card = page.getByRole('region', { name: `${squad} season plan` })
      await expect(card.getByText(state, { exact: true })).toBeVisible()
      await expect(card.locator('button[aria-expanded]')).toHaveCount(0)
      await expect(card.getByRole('img', { name: /^Season from/ })).toHaveCount(0)
      // On the title's line: the button's middle falls within the title's height band.
      const [title, button] = [(await card.getByText(`${squad} season plan`, { exact: true }).boundingBox())!, (await card.getByRole('button', { name: action }).boundingBox())!]
      const middle = button.y + button.height / 2
      expect(middle, `${action} at ${Math.round(middle)}, title ${Math.round(title.y)}–${Math.round(title.y + title.height + 30)}`).toBeGreaterThan(title.y)
      expect(middle).toBeLessThan(title.y + title.height + 30)
      expect(button.x).toBeGreaterThan(title.x + title.width)
    }
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await page.getByRole('region', { name: 'Season plans' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`cards-before-sharing-${width}.png`) })
    expect(unexpected).toEqual([])
  })
}

// TRAK-550 (Season plan card 2/5): open, each part is a panel. Where the card is wide enough, Season objectives and
// Results sit side by side, Player objectives across the bottom; a tablet and a phone keep one column, in today's order.
for (const [width, height, beside] of [[1280, 800, true], [834, 1112, false], [390, 844, false]] as const) {
  test(`the open card's panels at ${width} px: ${beside ? 'side by side' : 'one column'}`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U16'])
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    const card = page.getByRole('region', { name: 'U16 season plan' })
    await foldOf(page, 'U16').click()
    await expect(card.getByText('Worked in 1 of 1 match · 100%')).toBeVisible()
    const panelOf = (title: string) => card.getByRole('region', { name: title })
    const [objectives, results, players] = await Promise.all(['Season objectives', 'Results', 'Player objectives'].map(t => panelOf(t).boundingBox()))
    if (beside) {
      expect(Math.abs(objectives!.y - results!.y), 'the two panels share a top').toBeLessThanOrEqual(1)
      expect(results!.x).toBeGreaterThan(objectives!.x + objectives!.width)
      expect(players!.y).toBeGreaterThanOrEqual(Math.max(objectives!.y + objectives!.height, results!.y + results!.height))
      expect(Math.abs(players!.width - (results!.x + results!.width - objectives!.x)), 'Player objectives spans both').toBeLessThanOrEqual(1)
    } else {
      expect(results!.y).toBeGreaterThanOrEqual(objectives!.y + objectives!.height)
      expect(players!.y).toBeGreaterThanOrEqual(results!.y + results!.height)
      expect(Math.abs(objectives!.width - results!.width)).toBeLessThanOrEqual(1)
    }
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`card-panels-${width}.png`), fullPage: true })
    expect(unexpected).toEqual([])
  })
}

// TRAK-551 (Season plan card 3/5): the donut is smaller and sits beside its list where the panel has room (above it,
// centred, on a phone); each objective's square is its donut slice's colour, a Trak green.
for (const [width, height, beside] of [[1280, 800, true], [390, 844, false]] as const) {
  test(`season objectives at ${width} px: the donut ${beside ? 'beside' : 'above'} its list, each square its slice's colour`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U16'])
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    await foldOf(page, 'U16').click()
    const panel = page.getByRole('region', { name: 'U16 season plan' }).getByRole('region', { name: 'Season objectives' })
    const donut = panel.getByRole('figure', { name: 'Times each season objective worked' })
    const row = panel.getByRole('button', { name: /^Stay compact/ })
    await expect(row).toContainText('Worked in 1 of 1 match · 100%')
    await donut.scrollIntoViewIfNeeded()
    // The slice grows in once the donut is on screen: wait until it's drawn, then read its colour.
    await expect(donut.locator('path').first()).toHaveAttribute('d', /.{40,}/)
    await expect(donut.locator('path').first()).toHaveCSS('fill', 'rgb(11, 102, 35)')
    await expect(row.locator('span[aria-hidden="true"]').first()).toHaveCSS('background-color', 'rgb(11, 102, 35)')
    // The words in the middle show whole at this size (at 148 px "Times it worked" read "Times it wo…").
    expect(await donut.evaluate(el => [...el.querySelectorAll('span')].filter(s => s.children.length === 0 && s.textContent === 'Times worked')
      .map(s => s.scrollWidth <= s.clientWidth))).toEqual([true])
    const [d, r] = [(await donut.boundingBox())!, (await row.boundingBox())!]
    expect(d.width).toBeLessThanOrEqual(150)
    if (beside) expect(r.x).toBeGreaterThan(d.x + d.width)
    else expect(r.y).toBeGreaterThan(d.y + d.height - 1)
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await page.waitForTimeout(1000) // the slice's sweep, for the picture only
    await page.screenshot({ path: testInfo.outputPath(`season-objectives-${width}.png`) })
    expect(unexpected).toEqual([])
  })
}

// TRAK-552 (Season plan card 4/5): each result is a white tile that leads with the score, WON / DREW / LOST under it in
// green, grey or red; opened, how each instruction went, in its colour.
for (const [width, height] of [[1280, 800], [390, 844]] as const) {
  test(`results at ${width} px: the score leads, the word under it in the result's colour`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U16'])
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    await foldOf(page, 'U16').click()
    const panel = page.getByRole('region', { name: 'U16 season plan' }).getByRole('region', { name: 'Results' })
    const row = panel.getByRole('button', { name: /^vs Synthetic United, / })
    const [score, word, opponent] = [row.getByText('2–1', { exact: true }), row.getByText('Won', { exact: true }), row.getByText('vs Synthetic United', { exact: true })]
    await expect(word).toHaveCSS('color', await page.evaluate(() => `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--t-success').trim().split(/\s+/).join(', ')})`))
    const [s, w, o] = [(await score.boundingBox())!, (await word.boundingBox())!, (await opponent.boundingBox())!]
    expect(w.y).toBeGreaterThanOrEqual(s.y + s.height - 1)
    expect(o.x).toBeGreaterThan(Math.max(s.x + s.width, w.x + w.width))
    await row.click()
    await expect(panel.getByText('Partly', { exact: true })).toHaveCSS('color', await page.evaluate(() => `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--t-warning').trim().split(/\s+/).join(', ')})`))
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`results-${width}.png`) })
    expect(unexpected).toEqual([])
  })
}

// TRAK-553 (Season plan card 5/5): the squad at a glance, one bar split by group with a legend in the same colours;
// Show players opens the names, one column per group, side by side on a laptop and stacked on a phone.
for (const [width, height, beside] of [[1280, 800, true], [390, 844, false]] as const) {
  test(`player objectives at ${width} px: one bar, a legend, and Show players in ${beside ? 'columns' : 'one column'}`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = []
    await backend(context, unexpected, ['U16'])
    await page.setViewportSize({ width, height })
    await page.goto('/coach/home')
    await foldOf(page, 'U16').click()
    const panel = page.getByRole('region', { name: 'U16 season plan' }).getByRole('region', { name: 'Player objectives' })
    const bar = panel.getByRole('img', { name: / of 3 players$/ })
    await expect(bar).toBeVisible()
    // Each part of the bar is its group's legend colour, in the same order.
    const parts = await bar.locator('span').evaluateAll(spans => spans.map(s => getComputedStyle(s).backgroundColor))
    const keys = await panel.locator('ul[aria-hidden="true"] i').evaluateAll(marks => marks.map(m => getComputedStyle(m).backgroundColor))
    expect(parts.length).toBeGreaterThan(1)
    expect(parts).toEqual(keys)
    await panel.getByRole('button', { name: 'Show players' }).click()
    const columns = panel.getByRole('heading', { level: 4 })
    await expect(columns.first()).toBeVisible()
    const boxes = await columns.evaluateAll(hs => hs.map(h => { const r = h.parentElement!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width } }))
    if (beside) expect(new Set(boxes.map(b => Math.round(b.y))).size, 'the columns share a top').toBe(1)
    else expect(boxes.every((b, i) => i === 0 || b.y > boxes[i - 1].y)).toBe(true)
    await expect(panel.getByText('Holds the line together')).toBeVisible()
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await panel.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`player-objectives-${width}.png`) })
    expect(unexpected).toEqual([])
  })
}
