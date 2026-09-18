import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards K8 (X4).
 *
 * `parse-schedule` had no authentication of any kind — no getUser, no 401 —
 * with `verify_jwt = false`, so any unauthenticated request on the internet
 * could spend LOVABLE_API_KEY on the Lovable gateway, image input included.
 * `coach-assistant` called getUser() but only to personalise the prompt: no
 * user meant an empty context block and the request proceeded anyway.
 *
 * The reason both survived is worth encoding rather than just fixing:
 * `supabase/config.toml` described coach-assistant as "calls getUser() itself
 * and 401s without a valid user". It did not. A comment asserting a safety
 * property the code does not have is the actual defect — the same shape as the
 * false claim in 20260917000002 that Imad's F4 caught.
 *
 * Static checks over the function sources. They cannot prove the deployed
 * functions reject; they fail if a function that spends the AI key stops
 * checking who is calling.
 */

const FUNCTIONS = join(process.cwd(), 'supabase', 'functions')

function source(name: string): string {
  return readFileSync(join(FUNCTIONS, name, 'index.ts'), 'utf8')
}

/**
 * The source with comments stripped.
 *
 * For assertions about what the code *does*, prose must not count. A comment
 * explaining why a dangerous line was removed otherwise re-triggers the very
 * check that caught it — which is how the first version of the noteRow
 * assertion below failed against its own fix.
 */
function code(name: string): string {
  return source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Functions that spend LOVABLE_API_KEY and must therefore prove a session. */
function aiFunctions(): string[] {
  return readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => source(name).includes('LOVABLE_API_KEY'))
}

describe('edge functions that spend the AI key require a session', () => {
  const names = aiFunctions()

  it('finds the AI functions to check', () => {
    // If this drops to zero the suite below silently proves nothing.
    expect(names.length, 'no function references LOVABLE_API_KEY — did the env var get renamed?').toBeGreaterThan(0)
  })

  for (const name of names) {
    it(`${name}: rejects a request with no user`, () => {
      const sql = source(name)
      expect(
        sql.includes('auth.getUser('),
        `${name} spends LOVABLE_API_KEY without ever calling getUser(). Anyone on the internet ` +
          `can invoke it and run up the bill.`,
      ).toBe(true)

      // getUser() alone is what coach-assistant already did. The rejection is
      // the part that was missing, so require the 401 too.
      expect(
        /status:\s*401/.test(sql),
        `${name} calls getUser() but never returns 401. Fetching the user to personalise a ` +
          `prompt is not authentication — the request still reaches the paid gateway.`,
      ).toBe(true)
    })

    it(`${name}: counts the call against a per-user daily cap`, () => {
      expect(
        source(name).includes('claim_ai_call'),
        `${name} has no daily cap. Authentication stops strangers; it does not stop one ` +
          `authenticated coach spending without limit.`,
      ).toBe(true)
    })
  }

  it('player-feedback does not dereference an absent coach note', () => {
    // maybeSingle() returns null when the coach assessed without writing a
    // note, which the function's own comment calls the common case. The
    // response block dereferenced noteRow.note anyway, throwing into the outer
    // catch — so the documented fallback produced a 500 rather than the
    // note-less feedback it was written to produce, after the AI call had
    // already been paid for.
    expect(
      /noteRow\.note/.test(code('player-feedback')),
      'player-feedback dereferences noteRow.note without a guard. maybeSingle() returns null ' +
        'when there is no note, so the feedback screen 500s in exactly the case the fallback ' +
        'above it exists to handle. Use coachNote, which is already "" when absent.',
    ).toBe(false)
  })

  it('config.toml does not claim a protection the code lacks', () => {
    const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8')
    // The specific false sentence that let this survive. Its return would mean
    // the file is describing an intention rather than the code again.
    expect(
      /calls getUser\(\) itself and 401s/.test(config) && !source('coach-assistant').includes('status: 401'),
      'config.toml claims a function 401s without a valid user while that function has no 401. ' +
        'A comment asserting a safety property the code does not have is how X4 went unnoticed.',
    ).toBe(false)
  })
})
