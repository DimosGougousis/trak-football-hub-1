import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { composeEventEmail, type ClaimedNotice, type EventFields } from '../../supabase/functions/_shared/event-email'
import { composeReminderEmails, type ReminderEvent } from '../../supabase/functions/_shared/event-reminder'
import { emailProblem, sendPlainEmail } from '../../supabase/functions/_shared/send-email'
import {
  handleInviteRequest, invitedByChild, type InviteDeliveryDependencies,
} from '../../supabase/functions/send-parent-invite/handler'
import { forAcademySignIn } from '../../supabase/functions/send-roster-invites/handler'

// TRAK-190: every email in one design (Imad approved, 17 Nov), Kostas's own
// words (approved 17 Nov), a plain-text part with the same words.
// TRAK-475: a parent invited by their child is told which child, and only that child.

// ── reading an email the way a person does ─────────────────────────────────

/** What a reader sees: tags gone, entities decoded, one space between words. */
function visible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
const words = (text: string) => text.replace(/\s+/g, ' ').trim()
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])

/**
 * Enough of Go's text/template (what Supabase Auth runs) for these four files:
 * if / else if / else / end, eq, printf "%v", and .Field lookups.
 */
type Data = Record<string, string | null | undefined>
function render(template: string, data: Data): string {
  const ctx = { Data: data, Token: '481926', SiteURL: 'https://trakfootball.com', Email: 'parent@example.test', RedirectTo: 'x', TokenHash: 'h' }
  const parts = template.replace(/<!--[\s\S]*?-->/g, '').split(/(\{\{[\s\S]*?\}\})/)
  let i = 0
  const lookup = (path: string): unknown => path.slice(1).split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ctx)
  const value = (expr: string): unknown => {
    let m = expr.match(/^eq \(printf "%v" (\.[\w.]+)\) "([^"]*)"$/)
    if (m) return String(lookup(m[1]) ?? '<nil>') === m[2]
    m = expr.match(/^eq (\.[\w.]+) "([^"]*)"$/)
    if (m) return lookup(m[1]) === m[2]
    if (/^\.[\w.]+$/.test(expr)) return lookup(expr)
    throw new Error(`unsupported action: ${expr}`)
  }
  const block = (run: boolean): { out: string; stop: string } => {
    let out = ''
    while (i < parts.length) {
      const part = parts[i++]
      const action = part.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/)?.[1]
      if (action === undefined) { if (run) out += part; continue }
      if (action === 'end' || action === 'else' || action.startsWith('else if ')) return { out, stop: action }
      if (action.startsWith('if ')) { out += chain(run, action.slice(3)); continue }
      if (run) out += String(value(action) ?? '')
    }
    return { out, stop: 'eof' }
  }
  const chain = (run: boolean, first: string): string => {
    let cond: string | null = first
    let taken = false
    let result = ''
    for (;;) {
      const go = run && !taken && (cond === null || !!value(cond))
      const { out, stop } = block(go)
      if (go) { result = out; taken = true }
      if (stop === 'end') return result
      if (stop === 'else') cond = null
      else if (stop.startsWith('else if ')) cond = stop.slice('else if '.length)
      else throw new Error('an if without end')
    }
  }
  const { out, stop } = block(true)
  if (stop !== 'eof') throw new Error(`stray ${stop}`)
  return out
}
const template = (name: string) => readFileSync(join(__dirname, '..', '..', 'email-templates', name), 'utf8')
const read = (name: string, data: Data = {}) => visible(render(template(name), data))

const CODE_LINE = 'Tap the button, then type the code. It works once and expires after an hour.'
const SPAM = 'To keep Trak emails out of spam, add noreply@trakfootball.com to your contacts.'

// ── the four Auth emails (pasted into Supabase by hand) ────────────────────

describe('the Auth emails, in the approved design and words (TRAK-190)', () => {
  it('all four use the design: brand green, no old lime button, the TRAK wordmark once, "Hello," first', () => {
    for (const name of ['invite-parent.html', 'magic-link.html', 'reset-password.html', 'confirm-signup.html']) {
      const html = template(name)
      expect(html).toContain('#0B6623')
      expect(html).toContain('#F6F5F1')
      expect(html).not.toMatch(/#C8F25A/i)
      expect(read(name).startsWith('TRAK Hello')).toBe(true)
    }
  })

  it('confirm sign-up reads as approved', () => {
    expect(read('confirm-signup.html')).toBe(words(`TRAK Hello, Tap the button to activate your Trak account.
      You'll then sign in with the password you chose. Confirm email
      If you didn't create a Trak account, ignore this email and nothing happens. ${SPAM}`))
  })

  it('reset password reads as approved: the code under its own line, "after an hour", "nothing happens"', () => {
    expect(read('reset-password.html')).toBe(words(`TRAK Hello, We received a request to reset the password for your Trak account.
      If you didn't ask to reset your password, ignore this email and nothing happens.
      Your code to reset your password: 481926 Set new password ${CODE_LINE} ${SPAM}`))
  })

  it('the player invitation says "Hello Sam," and is two sentences', () => {
    expect(read('invite-parent.html', { invited_as: 'player', child_first_name: 'Sam', academy_name: 'Rehearsal FC' })).toBe(words(`TRAK
      Hello Sam, Rehearsal FC has added you to Trak. On Trak, you'll see your coach's assessments and the matches you play.
      Your code to set up your account: 481926 Set up your account ${CODE_LINE}
      You're receiving this because Rehearsal FC gave Trak this email address. If you weren't expecting it, ignore this email and nothing happens. ${SPAM}`))
  })

  it('the parent invitations keep their words', () => {
    expect(read('invite-parent.html', { invited_as: 'parent', child_first_name: 'Leo', academy_name: 'Rehearsal FC' }))
      .toContain("Hello, Rehearsal FC has added you to Trak as Leo's parent or guardian. On Trak, Leo's coach records assessments and matches.")
    expect(read('invite-parent.html', { invited_as: 'parent', invited_by: 'player', player_first_name: 'Leo' }))
      .toContain("Hello, Leo has invited you to Trak as their parent or guardian. On Trak, Leo's coach records assessments and matches.")
  })

  it('the sign-in code for a second child still names that child and academy (TRAK-118)', () => {
    expect(read('magic-link.html', { invited_as: 'parent', child_first_name: 'Mia', academy_name: 'Rehearsal FC' })).toBe(words(`TRAK
      Hello, Rehearsal FC has added Mia to Trak. Sign in with the code below to approve Mia. Nothing about Mia is shared
      until you approve, and you can withdraw at any time. Your code to sign in: 481926 Sign in ${CODE_LINE}
      If you didn't ask to sign in, ignore this email and nothing happens. ${SPAM}`))
  })
})

// ── TRAK-475: the sign-in code after a child's invitation ──────────────────

describe('a parent invited by their child, who already has an account (TRAK-475)', () => {
  const academyEarlier = { invited_as: 'parent', child_first_name: 'Mia', academy_name: 'Rehearsal FC' }

  it('the code email says which child invited them, in the invitation\'s words', () => {
    const text = read('magic-link.html', { ...invitedByChild('Leo') })
    expect(text).toContain("Hello, Leo has invited you to Trak as their parent or guardian. On Trak, Leo's coach records assessments and matches. The coach can't record anything until you approve it, and you can withdraw at any time.")
    expect(text).toContain('Your code to sign in: 481926')
  })

  it('a parent the academy added earlier sees only the child who invited them now', () => {
    // Auth merges the keys: the earlier academy details are overwritten with nothing.
    const text = read('magic-link.html', { ...academyEarlier, ...invitedByChild('Leo') })
    expect(text).toContain('Leo has invited you')
    expect(text).not.toMatch(/Mia|Rehearsal FC/)
  })

  it('the academy\'s later second-child email names only its own child', () => {
    const text = read('magic-link.html', { ...invitedByChild('Leo'), ...forAcademySignIn(academyEarlier) })
    expect(text).toContain('Rehearsal FC has added Mia to Trak.')
    expect(text).not.toMatch(/Leo/)
  })

  it('no name read: "Your child", never an empty name', () => {
    expect(invitedByChild('').player_first_name).toBeNull()
    expect(read('magic-link.html', { ...invitedByChild('') })).toContain('Your child has invited you to Trak')
  })

  const pending = {
    id: '40000000-0000-0000-0000-000000000001', invite_token: '50000000-0000-4000-8000-000000000001',
    player_user_id: '10000000-0000-0000-0000-000000000001', parent_email: 'guardian@example.test',
    status: 'pending', expires_at: '2026-09-25T00:00:00Z',
  }
  const deps = () => ({
    siteUrl: 'https://trakfootball.test',
    now: () => Date.parse('2026-09-18T00:00:00Z'),
    getCaller: vi.fn<InviteDeliveryDependencies['getCaller']>().mockResolvedValue({
      data: { id: pending.player_user_id, email: 'player@example.test', email_confirmed_at: '2026-09-17T00:00:00Z' }, error: null }),
    getRole: vi.fn<InviteDeliveryDependencies['getRole']>().mockResolvedValue({ data: 'player', error: null }),
    listInvites: vi.fn<InviteDeliveryDependencies['listInvites']>().mockResolvedValue({ data: [pending], error: null }),
    resendInvite: vi.fn<InviteDeliveryDependencies['resendInvite']>().mockResolvedValue({ data: [pending], error: null }),
    getFirstName: vi.fn<NonNullable<InviteDeliveryDependencies['getFirstName']>>().mockResolvedValue('Leo Synthetic'),
    sendInvite: vi.fn<InviteDeliveryDependencies['sendInvite']>().mockResolvedValue({ error: { message: 'User already registered', code: 'email_exists' } }),
    sendMagicLink: vi.fn<InviteDeliveryDependencies['sendMagicLink']>().mockResolvedValue({ error: null }),
    labelAccount: vi.fn<NonNullable<InviteDeliveryDependencies['labelAccount']>>().mockResolvedValue(undefined),
  })
  const post = () => new Request('https://edge.example.test/send-parent-invite', { method: 'POST', headers: { Authorization: 'Bearer s' } })

  it('send-parent-invite saves the inviting child on the account before the code goes', async () => {
    const d = deps()
    expect(await (await handleInviteRequest(post(), d)).json()).toMatchObject({ sent: true, via: 'magic_link' })
    expect(d.labelAccount).toHaveBeenCalledWith('guardian@example.test', invitedByChild('Leo'))
    expect(d.labelAccount.mock.invocationCallOrder[0]).toBeLessThan(d.sendMagicLink.mock.invocationCallOrder[0])
  })

  it('a failed save still sends the code', async () => {
    const d = deps()
    d.labelAccount.mockRejectedValue(new Error('Auth admin unavailable'))
    expect(await (await handleInviteRequest(post(), d)).json()).toMatchObject({ sent: true, via: 'magic_link' })
    expect(d.sendMagicLink).toHaveBeenCalledOnce()
  })
})

// ── the event emails Trak sends itself ─────────────────────────────────────

const event = (over: Partial<EventFields> = {}): EventFields => ({
  title: 'Training', event_type: 'training', opponent: null, home_away: null, status: 'scheduled',
  starts_at: '2026-11-25T15:00:00Z', event_date: '2026-11-25', start_time: '17:00:00', end_time: '18:30:00',
  meet_time: '16:45:00', venue: 'Academy Pitch 2', cancel_reason: null, ...over,
})
const notice = (kind: ClaimedNotice['kind'], before: Partial<EventFields>, now: Partial<EventFields>, childNames: string[] = []): ClaimedNotice => ({
  notice_id: 'n-1', kind, before: event(before), event: event(now), squad: 'U14', academy: 'Rehearsal FC',
  child_names: childNames, recipients: [{ user_id: 'g-1', email: 'guardian@example.test' }],
})
const match = { event_type: 'match', title: 'vs Panionios U14', opponent: 'Panionios U14', home_away: 'away', kit: 'Away kit (white)' }

/** Every email: a valid message, plain ASCII HTML, one link, the same words as its text. */
function checkEvery(email: { subject: string; text: string; html?: string }, onlyInText: string[] = []) {
  expect(emailProblem({ to: 'guardian@example.test', ...email })).toBeNull()
  const html = email.html!
  expect(html).toBeTruthy()
  expect([...html].filter(ch => ch.charCodeAt(0) > 0x7e)).toEqual([])
  expect(hrefs(html)).toEqual(['https://trakfootball.com'])
  expect(email.text.startsWith('Hello,\n\n')).toBe(true)
  const seen = visible(html)
  for (const line of email.text.split('\n').filter(l => l.trim() && !onlyInText.some(skip => l.startsWith(skip)))) {
    expect(seen).toContain(words(line))
  }
}

describe('event emails: the designed part, word for word the text (TRAK-190)', () => {
  it('a new match: the bold opener, the box with the match name first', () => {
    const email = composeEventEmail('guardian@example.test', [notice('published', match, match)])!
    expect(email.subject).toBe('New match on Wed 25 Nov')
    checkEvery(email)
    expect(email.html).toMatch(/font-weight:600;[^"]*">Your coach has added a match\.<\/p>/)
    expect(email.html).toMatch(/<div style="font-weight:600;">Match vs Panionios U14 \(away\)<\/div>/)
    expect(visible(email.html!)).toContain('Kit: Away kit (white)')
  })

  it('a change: the old value crossed out, the new one marked, no "What changed:" list (layout A)', () => {
    const email = composeEventEmail('guardian@example.test', [notice('changed', {},
      { start_time: '18:00:00', end_time: '19:30:00', meet_time: '17:45:00', venue: 'Alimos Municipal' })])!
    expect(email.subject).toBe('Training changed on Wed 25 Nov')
    // The plain text keeps its "What changed:" lines for inboxes that show only text.
    expect(email.text).toContain('What changed:\nTime: 17:00 – 18:30 → 18:00 – 19:30')
    checkEvery(email, ['What changed:', 'Time:', 'Meet:', 'Venue:', 'Wednesday', 'Please arrive'])
    const html = email.html!
    expect(visible(html)).not.toContain('What changed')
    expect(html).toMatch(/line-through[^"]*">17:00 &#8211; 18:30<\/span><span style="background:#FBF1DD;[^"]*">18:00 &#8211; 19:30</)
    expect(html).toMatch(/line-through[^"]*">16:45<\/span><span[^>]*>17:45</)
    expect(html).toMatch(/line-through[^"]*">Academy Pitch 2<\/span><span[^>]*>Alimos Municipal</)
    // The day didn't move: shown once, not crossed out.
    expect(html).toContain('<div>Wednesday 25 November, <span')
  })

  it('a cancellation: CANCELLED in red, date and place crossed out, the reason readable', () => {
    const email = composeEventEmail('guardian@example.test', [notice('cancelled', {}, { status: 'cancelled', cancel_reason: 'Pitch closed' })])!
    expect(email.subject).toBe('Training cancelled on Wed 25 Nov')
    checkEvery(email)
    const html = email.html!
    expect(html).toContain('Your coach has <span style="color:#B42318;">CANCELLED</span> a training session.')
    expect(html).toContain('<div style="color:#6B736F;text-decoration:line-through;">Wednesday 25 November, 17:00 &#8211; 18:30</div>')
    expect(html).toContain('<div style="color:#6B736F;text-decoration:line-through;">Academy Pitch 2</div>')
    expect(html).toContain('<div style="font-weight:600;margin-top:6px;">Reason: Pitch closed</div>')
    expect(visible(html)).not.toContain('Please arrive')
  })

  it('several events: each in its own box, the shared reason once', () => {
    const two = ['2026-11-25', '2026-11-27'].map((day, n) => ({ ...notice('cancelled', { event_date: day }, { event_date: day, status: 'cancelled', cancel_reason: 'Pitch closed' }), notice_id: `n-${n}` }))
    const email = composeEventEmail('guardian@example.test', two)!
    expect(email.subject).toBe('2 trainings cancelled on Trak')
    checkEvery(email)
    expect(email.html!.match(/border-radius:10px;font-size:15px/g)).toHaveLength(2)
    expect(visible(email.html!).match(/Reason: Pitch closed/g)).toHaveLength(1)
  })

  it('never names a child, in the subject or either part; coach-typed HTML is shown as text', () => {
    const email = composeEventEmail('guardian@example.test', [notice('published', {},
      { title: 'Extra session for Lucas', venue: '<b>Pitch 2</b> & café' }, ['Lucas Hernandez'])])!
    checkEvery(email)
    expect(`${email.subject}\n${email.text}\n${email.html}`).not.toMatch(/Lucas/)
    expect(email.html).toContain('&lt;b&gt;Pitch 2&lt;/b&gt; &amp; caf&#233;')
    expect(email.html).not.toContain('<b>Pitch 2')
  })

  it('the reminder: "Coming up:" in bold, the box, the turn-off line in the grey footer', () => {
    const e: ReminderEvent = { ...event(match), id: 'ev-1', kit: 'Away kit (white)', squad: 'U14', academy: 'Rehearsal FC', child_names: [] }
    const [{ email }] = composeReminderEmails({ user_id: 'g-1', email: 'guardian@example.test', day: '2026-11-25', events: [e] })
    expect(email.subject).toBe('Match reminder on Wed 25 Nov')
    checkEvery(email)
    const at = email.html!.indexOf('<div style="margin-top:20px;')
    const [body, foot] = [email.html!.slice(0, at), email.html!.slice(at)]
    expect(visible(body)).toContain('Hello, Coming up: match vs Panionios U14 (away).')
    expect(visible(foot).startsWith('Turn these reminders off in Trak: Settings → Notifications.')).toBe(true)
  })
})

describe('sending the designed part', () => {
  const sender = (fetch: typeof globalThis.fetch) => ({ apiKey: 're_test', from: 'Trak Football <noreply@trakfootball.com>', fetch })

  it('posts the HTML beside the text', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'e-1' })))
    const message = { to: 'guardian@example.test', subject: 'Training cancelled on Wed 25 Nov', text: 'Hello,', html: '<p>Hello,</p>' }
    expect(await sendPlainEmail(message, sender(fetch))).toEqual({ sent: true, id: 'e-1' })
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ text: 'Hello,', html: '<p>Hello,</p>' })
  })

  it('refuses HTML with a link a scanner could use up', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const message = { to: 'guardian@example.test', subject: 'Hi', text: 'Hello,', html: '<a href="https://trakfootball.com/x?token=1">x</a>' }
    expect(emailProblem(message)).toMatch(/trakfootball\.com links/)
    expect(await sendPlainEmail(message, sender(fetch))).toEqual({ sent: false, reason: 'invalid_email' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
