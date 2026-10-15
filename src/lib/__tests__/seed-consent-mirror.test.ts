import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONSENT_NOTICE_VERSION, CONSENT_STATEMENT_TEMPLATE } from '../consent'

// seed-pilot-rehearsal.mjs records consent through the same RPC as the parent
// screen and must store the same notice version and wording, or a seeded
// consent reconstructs against text nobody was shown.
describe('rehearsal seed mirrors the consent wording', () => {
  const seed = readFileSync('seed-pilot-rehearsal.mjs', 'utf8')

  it('carries the current notice version', () => {
    expect(seed).toContain(`const CONSENT_NOTICE_VERSION = '${CONSENT_NOTICE_VERSION}'`)
  })

  it('carries the current consent statement template, verbatim', () => {
    // Evaluate the declaration itself: scanning every quote in the file breaks
    // on an apostrophe in a comment.
    const declared = /const CONSENT_STATEMENT_TEMPLATE =([\s\S]*?)\n(?:const|\/\/|$)/.exec(seed)?.[1]
    expect(declared).toBeDefined()
    expect(new Function(`return ${declared!.trim()}`)()).toBe(CONSENT_STATEMENT_TEMPLATE)
  })

})
