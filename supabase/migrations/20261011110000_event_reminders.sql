-- TRAK-136 (J8.13): one reminder email per person per day, 2 days before each
-- event (Dubai), and a scheduler for it and for J8.12's lost-signal gap.
--
-- Who: J8.12's rule, trak_private.event_change_recipients() (consent, the
-- coach's squad in the event's academy, never a username login or a .test
-- address), for every published, scheduled event on that day, minus anyone
-- who turned reminders off in Settings. One email per person lists all their
-- children's events that day. Cancelled events and drafts are never reminded.
--
-- Never twice: event_reminder_sends has one row per person and day, made when
-- the reminder is claimed, so a second claim for that day hands out nobody.
-- A failure stays visible as "failed" with a reason code and is retried at
-- most 3 times, a minute apart; a send whose function died is taken back
-- after 10 minutes (the email's idempotency key stops a second copy).
--
-- The scheduler (Imad, 10 Oct: pg_cron approved; pg_net is the part that lets
-- the database call an Edge Function, flagged on the PR): every minute it
-- calls send-event-emails if a change email is due, failed and retryable, or
-- stuck; every 5 minutes, between 09:00 and 20:00 Dubai, it calls
-- send-event-reminders if anyone is due. Each call carries the scheduler's
-- own token (x-trak-cron), read from Vault at run time (trak_functions_url,
-- trak_cron_token; setup in docs/pilot-runbook.md), never a project key:
-- pg_net keeps each request's headers in net.http_request_queue, which any
-- database login can read, and the token can only start a run (Imad, #271). The extensions and schedules are only
-- created where pg_cron and pg_net exist: the test databases have neither,
-- and every function below works without them.

-- ── Settings: reminders are on unless the person turns them off ────────────
CREATE TABLE public.notification_settings (
  user_id         uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_reminders boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_settings TO authenticated;
CREATE POLICY "Own notification settings: read" ON public.notification_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own notification settings: create" ON public.notification_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own notification settings: change" ON public.notification_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── One row per person and day: what was sent, or why not ────────────────
CREATE TABLE public.event_reminder_sends (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_day date NOT NULL,
  status       text NOT NULL DEFAULT 'sending'
               CHECK (status IN ('sending', 'sent', 'failed', 'nothing_to_send')),
  attempts     integer NOT NULL DEFAULT 1,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  event_count  integer NOT NULL DEFAULT 0,
  provider_id  text,
  -- A reason code from the sender (delivery_failed:429). Never an address.
  last_error   text,
  PRIMARY KEY (user_id, reminder_day)
);
CREATE INDEX event_reminder_sends_by_status ON public.event_reminder_sends (reminder_day, status);
ALTER TABLE public.event_reminder_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_reminder_sends FROM PUBLIC, anon, authenticated;

-- Who is due a reminder for a day, and for which events: one row per person
-- and event. Doesn't look at what was sent; the claim and the scheduler do.
CREATE FUNCTION trak_private.event_reminder_due(p_day date)
RETURNS TABLE (user_id uuid, email text, event_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT r.user_id, r.email, e.id
  FROM public.coach_calendar_events e
  CROSS JOIN LATERAL trak_private.event_change_recipients(e.id) r
  WHERE e.published
    AND e.status = 'scheduled'
    AND trak_private.event_day(e) = p_day
    AND NOT EXISTS (SELECT 1 FROM public.notification_settings s
                    WHERE s.user_id = r.user_id AND NOT s.event_reminders);
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_reminder_due(date) FROM PUBLIC, anon, authenticated;

-- Claim the reminders for a day (2 days from today in Dubai unless given):
-- everyone due who has no row yet, a failure a minute old with tries left,
-- and a send stuck for 10 minutes. Each comes with their address and that
-- day's events, as the change emails get them (fields, squad, academy, the
-- squad's child names so coach-typed text naming a child can be left out).
CREATE FUNCTION public.claim_event_reminders(p_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'Asia/Dubai')::date + 2);
  v_users uuid[];
BEGIN
  WITH fresh AS (
    INSERT INTO public.event_reminder_sends (user_id, reminder_day)
    SELECT DISTINCT d.user_id, v_day FROM trak_private.event_reminder_due(v_day) d
    ON CONFLICT (user_id, reminder_day) DO NOTHING
    RETURNING user_id
  ), retried AS (
    UPDATE public.event_reminder_sends s
    SET status = 'sending', attempts = s.attempts + 1, claimed_at = now(), finished_at = NULL
    WHERE s.reminder_day = v_day
      AND ((s.status = 'failed' AND s.attempts < 3 AND s.finished_at <= now() - interval '1 minute')
        OR (s.status = 'sending' AND s.claimed_at <= now() - interval '10 minutes'))
    RETURNING s.user_id
  )
  SELECT array_agg(u) INTO v_users FROM (SELECT user_id AS u FROM fresh UNION SELECT user_id FROM retried) x;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'email', p.email,
      'day', v_day,
      'events', p.events
    ) ORDER BY p.user_id)
    FROM (
      SELECT d.user_id, min(d.email) AS email,
        jsonb_agg(trak_private.event_email_fields(e) || jsonb_build_object(
          'id', e.id,
          -- A match's kit belongs in a reminder; change emails don't need it.
          'kit', e.kit,
          'squad', NULLIF(btrim(cd.team), ''),
          'academy', o.name,
          'child_names', COALESCE((
            SELECT jsonb_agg(DISTINCT sp.player_name) FROM public.squad_players sp
            WHERE sp.coach_user_id = e.coach_user_id AND NULLIF(btrim(sp.player_name), '') IS NOT NULL
          ), '[]'::jsonb)
        ) ORDER BY e.start_time NULLS LAST, e.starts_at, e.id) AS events
      FROM trak_private.event_reminder_due(v_day) d
      JOIN public.coach_calendar_events e ON e.id = d.event_id
      LEFT JOIN public.coach_details cd ON cd.user_id = e.coach_user_id
      LEFT JOIN public.organizations o ON o.id = e.organization_id
      WHERE d.user_id = ANY (v_users)
      GROUP BY d.user_id
    ) p
  ), '[]'::jsonb);
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_event_reminders(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_reminders(date) TO service_role;

-- A claimed reminder's outcome. A failure stays visible for the operator.
CREATE FUNCTION public.finish_event_reminder(p_user_id uuid, p_day date, p_status text,
  p_event_count integer, p_provider_id text, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'nothing_to_send') THEN
    RAISE EXCEPTION 'unknown_reminder_status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.event_reminder_sends s
  SET status = p_status, finished_at = now(), event_count = GREATEST(COALESCE(p_event_count, 0), 0),
      provider_id = p_provider_id, last_error = p_error
  WHERE s.user_id = p_user_id AND s.reminder_day = p_day AND s.status = 'sending';
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_event_reminder(uuid, date, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_event_reminder(uuid, date, text, integer, text, text) TO service_role;

-- ── The scheduler's questions: is there anything to send? ────────────────
-- J8.12: a change email due, a failure with tries left, or a stuck send.
-- The same conditions claim_event_change_notices() claims by.
CREATE FUNCTION trak_private.event_change_work_due()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.event_change_notices n
    WHERE (n.status = 'pending' AND n.due_at <= now())
       OR (n.status = 'failed' AND n.attempts < 3 AND n.finished_at <= now() - interval '1 minute')
       OR (n.status = 'sending' AND n.claimed_at <= now() - interval '10 minutes'));
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_change_work_due() FROM PUBLIC, anon, authenticated;

-- J8.13: between 09:00 and 20:00 Dubai, someone due for 2 days out has no
-- reminder yet, or one failed with tries left, or one is stuck. p_at picks the
-- clock and the day (tests); how long a send has waited is real time.
CREATE FUNCTION trak_private.event_reminder_work_due(p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH at AS (
    SELECT (p_at AT TIME ZONE 'Asia/Dubai')::time AS clock,
           (p_at AT TIME ZONE 'Asia/Dubai')::date + 2 AS day
  )
  SELECT at.clock >= time '09:00' AND at.clock < time '20:00'
     AND (EXISTS (SELECT 1 FROM trak_private.event_reminder_due(at.day) d
                  WHERE NOT EXISTS (SELECT 1 FROM public.event_reminder_sends s
                                    WHERE s.user_id = d.user_id AND s.reminder_day = at.day))
       OR EXISTS (SELECT 1 FROM public.event_reminder_sends s
                  WHERE s.reminder_day = at.day
                    AND ((s.status = 'failed' AND s.attempts < 3 AND s.finished_at <= now() - interval '1 minute')
                      OR (s.status = 'sending' AND s.claimed_at <= now() - interval '10 minutes'))))
  FROM at;
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_reminder_work_due(timestamptz) FROM PUBLIC, anon, authenticated;

-- The address of one of our Edge Functions from the Vault base address. A
-- value pasted into Vault with spaces, a line break or a trailing slash still
-- makes the right address (the first prod paste ended in a line break).
CREATE FUNCTION trak_private.scheduled_function_url(p_base text, p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT rtrim(btrim(p_base, E' \t\r\n'), '/') || '/' || p_name;
$fn$;
REVOKE ALL ON FUNCTION trak_private.scheduled_function_url(text, text) FROM PUBLIC, anon, authenticated;

-- Calls one of our Edge Functions as the scheduler: POST {} with the
-- scheduler's own token on x-trak-cron, never an API key. Both values come
-- from Vault at run time, so no token is in the repo or in cron's job table. A
-- missing secret fails loudly in cron.job_run_details. Needs pg_net.
CREATE FUNCTION trak_private.call_trak_function(p_name text)
RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_url text;
  v_token text;
BEGIN
  IF p_name NOT IN ('send-event-emails', 'send-event-reminders') THEN
    RAISE EXCEPTION 'call_trak_function: % is not a scheduled function', p_name USING ERRCODE = '22023';
  END IF;
  SELECT s.decrypted_secret INTO v_url FROM vault.decrypted_secrets s WHERE s.name = 'trak_functions_url';
  SELECT btrim(s.decrypted_secret, E' \t\r\n') INTO v_token FROM vault.decrypted_secrets s WHERE s.name = 'trak_cron_token';
  IF v_url IS NULL OR v_token IS NULL THEN
    RAISE EXCEPTION 'Vault secrets trak_functions_url and trak_cron_token are needed to call %', p_name;
  END IF;
  RETURN net.http_post(
    url := trak_private.scheduled_function_url(v_url, p_name),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trak-cron', v_token),
    timeout_milliseconds := 5000
  );
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.call_trak_function(text) FROM PUBLIC, anon, authenticated;

-- ── The schedules, where the extensions exist ─────────────────────────────
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    EXECUTE $sql$SELECT cron.schedule('trak-event-change-sweep', '* * * * *',
      'SELECT trak_private.call_trak_function(''send-event-emails'') WHERE trak_private.event_change_work_due()')$sql$;
    EXECUTE $sql$SELECT cron.schedule('trak-event-reminders', '*/5 * * * *',
      'SELECT trak_private.call_trak_function(''send-event-reminders'') WHERE trak_private.event_reminder_work_due()')$sql$;
    -- pg_cron keeps a row per run; a week is enough to see what happened.
    EXECUTE $sql$SELECT cron.schedule('trak-cron-history-cleanup', '17 3 * * *',
      'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''7 days''')$sql$;
  END IF;
END
$do$;
