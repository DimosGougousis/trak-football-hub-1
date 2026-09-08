import { supabase } from '@/integrations/supabase/client'

/**
 * Pilot instrumentation.
 *
 * Every behavioural number on the pilot scorecard comes from this file. Events
 * are appended to `telemetry_events` (migration 20260901000001); users may
 * insert but never read, and the founder queries them through the pilot views.
 *
 * A failed event must never interrupt what the user was doing — but during the
 * pilot a silently missing table is far more dangerous than a console error, so
 * failures are loud in development and counted in production. Call
 * `telemetryHealth()` to confirm events are actually landing.
 */

/** Set by AuthProvider so events carry a role without a lookup per event. */
let currentRole: string | null = null

export function setTelemetryRole(role: string | null): void {
  currentRole = role
}

let sent = 0
let failed = 0
let lastError: string | null = null

export function telemetryHealth() {
  return { sent, failed, lastError }
}

export async function trackEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('telemetry_events' as never).insert({
      user_id: user.id,
      role: currentRole,
      event_type: eventType,
      metadata,
    } as never)

    if (error) throw error
    sent += 1
  } catch (err) {
    failed += 1
    lastError = err instanceof Error ? err.message : String(err)
    // Loud in dev, silent for the user in production — but never rethrown, so
    // telemetry cannot break a coach mid-assessment on a cold touchline.
    if (import.meta.env.DEV) {
      console.error(`[telemetry] "${eventType}" failed:`, lastError)
    }
  }
}

/**
 * Fires `app_opened` at most once per browser session per user.
 *
 * This is the sole source for scorecard metrics 6 and 7 (player and parent
 * week-6 return). Without it there is no way to distinguish a user who stopped
 * coming back from one who came back and did nothing.
 */
export function trackSessionOpen(userId: string, role: string | null): void {
  const key = `trak_session_open:${userId}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    // Private mode or storage disabled — fall through and send the event.
  }
  void trackEvent('app_opened', { role })
}

/**
 * Wall-clock timer for the duration metrics.
 *
 *   const done = startTimer()
 *   ...
 *   trackEvent('assessment_submitted', { duration_ms: done() })
 */
export function startTimer(): () => number {
  const t0 = Date.now()
  return () => Date.now() - t0
}
