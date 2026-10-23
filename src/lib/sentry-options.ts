import type { BrowserOptions, Breadcrumb } from '@sentry/react'

/* What Trak sends to Sentry (US, no EU region). main.tsx passes these to
   Sentry.init; the test pins them.

   TRAK-251 (Imad, 21 Oct, legal pack v1.2): crash reports only for the Athens
   pilot. No page-load timing (browserTracingIntegration and tracesSampleRate
   are gone, so no performance transactions are sent) and personal data stays
   off (sendDefaultPii unset: no IP address, no cookies or user). Usage numbers
   come from Trak's own telemetry_events (J7), not from Sentry. */

export interface SentryEnv {
  dsn: string | undefined
  prod: boolean
  mode: string
}

const withoutQuery = (url: unknown) => (typeof url === 'string' ? url.split(/[?#]/)[0] : url)

/**
 * The trail of what happened before an error, without anything personal.
 * Clicks and typing are dropped: Sentry names the element by its aria-label,
 * title and alt, and Trak's carry children's names ("One more goals for …",
 * an avatar's alt). Requests and page changes keep their path but lose the
 * query, where database filters can hold a name.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category?.startsWith('ui.')) return null
  if (!breadcrumb.data) return breadcrumb
  const data = { ...breadcrumb.data }
  if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') data.url = withoutQuery(data.url)
  if (breadcrumb.category === 'navigation') {
    data.from = withoutQuery(data.from)
    data.to = withoutQuery(data.to)
  }
  return { ...breadcrumb, data }
}

export function sentryOptions(env: SentryEnv): BrowserOptions {
  return {
    dsn: env.dsn,
    enabled: env.prod && !!env.dsn,
    environment: env.mode,
    beforeBreadcrumb: scrubBreadcrumb,
    // No session replay. The option is deliberately absent rather than set to 0:
    // replaysOnErrorSampleRate was here without replayIntegration(), so nothing
    // recorded — but anyone adding that integration would have silently begun
    // capturing children's screens, free text included, and shipping them to a
    // US provider with no EU region. Removing the line removes the invitation.
  }
}
