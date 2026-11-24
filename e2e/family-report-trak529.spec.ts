import { test, expect, type BrowserContext, type Page } from '@playwright/test'

// TRAK-529 (Reports 6/10): the report a player and his parent read, in a real browser at 1280 and 390, in the family's
// new look. Home's Latest report opens it. The player reads his copy, with his job and the coach's note; the parent
// reads the parents' copy, with the report's note to both (TRAK-531) and no job, and never asks for the player's.
// Production build, synthetic intercepted backend. Test people are footballers.
const paolo = '97529000-0000-4000-8000-000000000002', cesare = '97529000-0000-4000-8000-000000000001'
const NOTE = 'A big month, Paolo. Keep talking to Nesta and the line holds itself.'
const FAMILY_NOTE = 'A big month for Paolo: the back line listens to him now.'
const six = (work_rate: number, technical: number, physical: number, coachability: number, attitude: number, tactical: number) =>
  ({ work_rate, technical, physical, coachability, attitude, tactical })
const match = (event_id: string, day: string, opponent: string, home_away: string, our: number, their: number, job: string,
  did_job: string | null, against: string | null) =>
  ({ event_id, day, opponent, home_away, our_score: our, their_score: their, job, played: !!did_job, did_job, against_expectation: against })
const REPORT = {
  squad_player_id: 'sq-529', player_name: 'Paolo Maldini', squad: 'U16',
  season_starts_on: '2026-08-01', period_from: '2026-09-28', report_day: '2026-10-25', last_report_day: '2026-09-27',
  assessments: [{ id: 'a-aug', day: '2026-08-30', ...six(6, 6, 7, 7, 5, 5) }, { id: 'a-sep', day: '2026-09-27', ...six(7, 7, 7, 8, 6, 6) },
    { id: 'a-oct', day: '2026-10-25', ...six(8, 7, 7, 9, 8, 7) }],
  before_season: null,
  matches: [match('m-oly', '2026-10-04', 'Olympiacos', 'home', 2, 1, 'Win every header at the back post', 'partly', 'above'),
    match('m-aek', '2026-10-11', 'AEK Athens', 'away', 1, 1, 'Hold the line with Nesta', 'yes', 'met'),
    match('m-pao', '2026-10-18', 'Panathinaikos', 'away', 0, 0, 'Mark their number nine', null, null)],
  objectives: [{ id: 'o1', title: 'Talk to the back line at every set piece', at_last_report: 'some_progress', now: 'on_track' },
    { id: 'o2', title: 'Use the weaker foot under pressure', at_last_report: 'not_yet', now: 'some_progress' }],
  trainings: { attended: 7, total: 8 },
}
const SENT = '2026-10-25T18:00:00Z'
const familyCopy = { ...REPORT, matches: REPORT.matches.map(({ job: _job, did_job: _did, ...rest }) => rest) }

async function backend(context: BrowserContext, as: 'player' | 'parent', unexpected: string[], reads: string[]) {
  const me = as === 'player' ? paolo : cesare
  const user = { id: me, email: `${as}@report529.test`, email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: me, exp, role: 'authenticated' }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
  await context.addInitScript(session => localStorage.setItem('sb-xbykbqolvqyqmipikuae-auth-token', JSON.stringify(session)),
    { access_token: token, refresh_token: 'synthetic-report529', expires_in: 3600, expires_at: exp, token_type: 'bearer', user })
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin === 'http://127.0.0.1:4189') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    if (url.hostname !== 'xbykbqolvqyqmipikuae.supabase.co') { unexpected.push(req.url()); return route.abort() }
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const rows = (all: Record<string, unknown>[]) => json(req.headers()['accept']?.includes('vnd.pgrst.object') ? all[0] ?? null : all)
    const path = url.pathname
    if (path === '/rest/v1/telemetry_events' && req.method() === 'POST') return route.fulfill({ status: 201, body: '' })
    if (path === '/auth/v1/user') return json(user)
    if (path === '/rest/v1/profiles') {
      if (as === 'player') return rows([{ id: paolo, user_id: paolo, role: 'player', full_name: 'Paolo Maldini' }])
      if ((url.searchParams.get('user_id') ?? '') === `eq.${cesare}`) return rows([{ id: cesare, user_id: cesare, role: 'parent', full_name: 'Cesare Maldini', nationality: null }])
      return rows([{ user_id: paolo, full_name: 'Paolo Maldini' }])
    }
    if (path === '/rest/v1/player_parent_links') return json([{ player_user_id: paolo }])
    if (path === '/rest/v1/rpc/guardian_consent_applies') return json(true)
    if (path === '/rest/v1/rpc/my_session_is_live') return json(true)
    if (path === '/rest/v1/rpc/my_consent_status') return json({ required: false, invited_parent: null })
    if (path === '/rest/v1/rpc/family_feature_on') return json(true)
    if (path === '/rest/v1/player_details') return rows([{ position: 'Defender', current_club: 'Rehearsal FC', age_group: 'U16' }])
    if (path === '/rest/v1/squad_players') return rows([{ id: 'sq-529', coach_user_id: 'coach-529' }])
    if (path === '/rest/v1/report_for_player' || path === '/rest/v1/report_for_family') {
      reads.push(`${path.slice(9)}?${url.searchParams.toString()}`)
      return path === '/rest/v1/report_for_player'
        ? rows([{ evaluation_id: 'ev-oct', sent_at: SENT, report: REPORT, note: NOTE }])
        : rows([{ evaluation_id: 'ev-oct', sent_at: SENT, report: familyCopy, note: FAMILY_NOTE }])
    }
    // Every other read is empty: this is about the report.
    if (path.startsWith('/rest/v1/') && (req.method() === 'GET' || path.startsWith('/rest/v1/rpc/'))) return rows([])
    unexpected.push(`${req.method()} ${path}`)
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Unmocked request blocked"}' })
  })
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

for (const as of ['player', 'parent'] as const) for (const [width, height] of [[1280, 800], [390, 844]] as const) {
  test(`the ${as}'s report at ${width} px: Home's Latest report opens it`, async ({ context, page }, testInfo) => {
    const unexpected: string[] = [], errors: string[] = [], reads: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await backend(context, as, unexpected, reads)
    // The radar grows in once scrolled to; drawn at once, so the full-page pictures show it.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height })
    await page.goto(`/${as}/home`)
    const card = page.getByRole('region', { name: 'Latest report' })
    await expect(card.getByText('October')).toBeVisible()
    await expect(card.getByText('New')).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`home-${as}-${width}.png`) })
    await card.getByRole('link', { name: 'Open report' }).click()

    await expect(page).toHaveURL(new RegExp(`/${as}/report/ev-oct$`))
    await expect(page.getByRole('heading', { name: 'October report', level: 1 })).toBeVisible()
    await expect(page.getByText('Moved up: Attitude, Tactical')).toBeVisible()
    const matches = page.getByRole('region', { name: 'Match by match' })
    await expect(matches.getByText('Above')).toBeVisible()
    if (as === 'player') {
      await expect(page.getByRole('region', { name: 'From your coach' })).toContainText(NOTE)
      await expect(matches.getByText('Job: Hold the line with Nesta')).toBeVisible()
    } else {
      await expect(page.getByRole('region', { name: 'Note from the coach' })).toContainText(FAMILY_NOTE)
      expect(await page.locator('body').innerText()).not.toMatch(/\bjobs?\b/i)
      for (const read of reads) expect(read).toMatch(/^report_for_family\?/)
    }
    expect(reads.length).toBeGreaterThan(0)
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath(`report-${as}-${width}.png`), fullPage: true })

    // Back on Home, the card no longer says New.
    await page.goto(`/${as}/home`)
    await expect(page.getByRole('region', { name: 'Latest report' }).getByText('October')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Latest report' }).getByText('New')).toHaveCount(0)
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
