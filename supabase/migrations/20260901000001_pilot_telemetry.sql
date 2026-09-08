-- Pilot telemetry — the events table src/lib/telemetry.ts has always written to.
--
-- trackEvent() swallows its own errors so a missing table is indistinguishable
-- from a working one. Until this migration is applied every call is a no-op,
-- which makes metrics 4, 6 and 7 of the pilot scorecard unanswerable.
--
-- Rows are ops data, not player data: insert-only for users, readable only via
-- the service role (SQL editor / dashboard), never through the app.

CREATE TABLE IF NOT EXISTS public.telemetry_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text,
  event_type text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- Users may only append their own events. No SELECT policy exists on purpose:
-- with RLS on and no policy, authenticated reads return zero rows, while the
-- service role used by the SQL editor bypasses RLS entirely.
DROP POLICY IF EXISTS "Users can append own telemetry" ON public.telemetry_events;
CREATE POLICY "Users can append own telemetry" ON public.telemetry_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS telemetry_events_created_idx
  ON public.telemetry_events (created_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_type_created_idx
  ON public.telemetry_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_events_user_created_idx
  ON public.telemetry_events (user_id, created_at DESC);

COMMENT ON TABLE public.telemetry_events IS
  'Pilot instrumentation. Insert-only for authenticated users; read via service role only.';
