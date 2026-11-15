import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as Sentry from '@sentry/react'
import type { Envelope } from '@sentry/core'
import { sentryOptions } from '@/lib/sentry-options'

/**
 * TRAK-251 (Imad, 21 Oct, legal pack v1.2): for real children Sentry sends
 * crash reports only. No page-load timing (performance traces), no session
 * replay, no personal data turned on. And a crash report carries no child's
 * name: Sentry's click trail records each button's aria-label, title and alt,
 * and Trak's say "One more goals for Kostas Tsimikas" or a child's avatar alt.
 */

const options = sentryOptions({ dsn: 'https://public@o0.ingest.sentry.io/0', prod: true, mode: 'production' })

describe('Sentry options (TRAK-251)', () => {
  it('sends no performance traces and no replay', () => {
    const names = ((options.integrations ?? []) as { name: string }[]).map(i => i.name)
    expect(names).not.toContain('BrowserTracing')
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options).not.toHaveProperty('tracesSampler')
    expect(Object.keys(options).filter(k => /replay/i.test(k))).toEqual([])
    expect(names.filter(n => /replay/i.test(n))).toEqual([])
  })

  it('leaves personal data off', () => {
    expect(options.sendDefaultPii).toBeFalsy()
  })

  it('is on only in production with a DSN', () => {
    expect(sentryOptions({ dsn: 'https://public@o0.ingest.sentry.io/0', prod: false, mode: 'development' }).enabled).toBe(false)
    expect(sentryOptions({ dsn: undefined, prod: true, mode: 'production' }).enabled).toBe(false)
    expect(options.enabled).toBe(true)
  })
})

describe('what a crash report carries (TRAK-251, real Sentry client)', () => {
  const sent: Envelope[] = []

  beforeAll(() => {
    globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch
    Sentry.init({
      ...options,
      transport: () => ({
        send: async (envelope: Envelope) => { sent.push(envelope); return {} },
        flush: async () => true,
      }),
    })
  })
  afterAll(async () => { await Sentry.close() })

  it('reports the error, with no transaction and no child name from the clicks', async () => {
    document.body.innerHTML = `
      <button type="button" aria-label="One more goals for Kostas Tsimikas">+</button>
      <img alt="Kostas Tsimikas" src="data:," />`
    document.querySelector('button')!.click()
    document.querySelector('img')!.click()
    await fetch('https://example.supabase.co/rest/v1/squad_players?full_name=ilike.*Tsimikas*&select=id')

    Sentry.captureException(new Error('boom'))
    await Sentry.flush(2000)

    // Each envelope is [headers, [[itemHeader, payload], …]].
    const items = sent.flatMap(envelope => envelope[1] as unknown as [{ type: string }, unknown][])
    const kinds = items.map(([header]) => header.type)
    expect(kinds).toContain('event')
    expect(kinds).not.toContain('transaction')

    const event = items.find(([header]) => header.type === 'event')![1] as Sentry.ErrorEvent
    expect(event.exception?.values?.[0]?.value).toBe('boom')
    // The trail is still there (requests, by path) but says nothing personal.
    expect(JSON.stringify(event)).not.toContain('Tsimikas')
    expect(event.breadcrumbs?.map(b => b.category)).not.toContain('ui.click')
    expect(event.breadcrumbs?.find(b => b.category === 'fetch')?.data?.url)
      .toBe('https://example.supabase.co/rest/v1/squad_players')
    expect(event.user?.ip_address).toBeUndefined()
    expect(event.sdk?.integrations).not.toContain('BrowserTracing')
  })
})
