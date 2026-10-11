-- TRAK-135 (J8.12): a cancellation (any date) or a today/tomorrow change to a
-- published event emails every affected guardian, and the player when they
-- have their own email, within 60 seconds.
--
-- The database decides what needs an email, so no app path can skip it: an
-- AFTER UPDATE trigger queues one pending notice per event, keeping the
-- event as families last saw it. Further edits update the same notice and
-- push its send time 15 s later, so three quick edits make one email with
-- the final state. The send-event-emails function claims due notices, works
-- out the recipients at send time (so a withdrawal before sending counts),
-- sends, and records each delivery, so a retry never mails anyone twice.
--
-- The coach's app asks the function to send after each save. A notice whose
-- call never came stays pending and goes on the next call. App roles can
-- neither read nor write these tables.
--
-- Version 20261010140000: #258's calendar_links took 20261010090000 first.

CREATE TABLE public.event_change_notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('cancelled', 'changed')),
  -- The event as families last saw it: what the email's "old" side shows.
  before      jsonb NOT NULL,
  due_at      timestamptz NOT NULL,
  -- nothing_to_send: by send time the edits had cancelled each other out.
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'nothing_to_send')),
  attempts    integer NOT NULL DEFAULT 0,
  claimed_at  timestamptz,
  finished_at timestamptz,
  sent_count  integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  -- A reason code from the sender (delivery_failed:429, invalid_email). Never an address.
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One open notice per event: later edits join it instead of queuing another email.
CREATE UNIQUE INDEX event_change_notices_one_pending
  ON public.event_change_notices (event_id) WHERE status = 'pending';
CREATE INDEX event_change_notices_by_status ON public.event_change_notices (status, due_at);
ALTER TABLE public.event_change_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_change_notices FROM PUBLIC, anon, authenticated;

-- Who has had which notice. One email can cover several notices (a series
-- cancelled at once), so it adds a row for each.
CREATE TABLE public.event_change_deliveries (
  notice_id         uuid NOT NULL REFERENCES public.event_change_notices(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id       text,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, recipient_user_id)
);
ALTER TABLE public.event_change_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_change_deliveries FROM PUBLIC, anon, authenticated;

-- The fields an email talks about. Never notes. The cancel reason goes in, and
-- the email shows it only if it names no squad child and has no link (Imad,
-- 10 Oct); the same check drops a title, opponent or venue naming a child.
CREATE FUNCTION trak_private.event_email_fields(e public.coach_calendar_events)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'title', e.title, 'event_type', e.event_type, 'opponent', e.opponent,
    'home_away', e.home_away, 'status', e.status, 'starts_at', e.starts_at,
    'event_date', e.event_date, 'start_time', e.start_time, 'end_time', e.end_time,
    'meet_time', e.meet_time, 'venue', e.venue, 'cancel_reason', e.cancel_reason);
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_email_fields(public.coach_calendar_events) FROM PUBLIC, anon, authenticated;

-- The event's day in Dubai. event_date is the coach's local date; the oldest
-- rows have only starts_at.
CREATE FUNCTION trak_private.event_day(e public.coach_calendar_events)
RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT COALESCE(e.event_date, (e.starts_at AT TIME ZONE 'Asia/Dubai')::date);
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_day(public.coach_calendar_events) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION trak_private.queue_event_change_notice()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Dubai')::date;
  v_kind text;
BEGIN
  -- Families only ever had a published event. Publishing itself isn't a change.
  IF NOT (OLD.published AND NEW.published) THEN
    RETURN NULL;
  END IF;

  IF OLD.status = 'scheduled' AND NEW.status = 'cancelled' THEN
    -- A called-off fixture never just disappears, whatever its date (Imad, 9 Oct).
    v_kind := 'cancelled';
  ELSIF OLD.status = 'scheduled' AND NEW.status = 'scheduled'
    AND (OLD.event_date, OLD.start_time, OLD.end_time, OLD.meet_time, OLD.venue, OLD.starts_at)
        IS DISTINCT FROM (NEW.event_date, NEW.start_time, NEW.end_time, NEW.meet_time, NEW.venue, NEW.starts_at)
    -- Moved onto, or away from, today or tomorrow: either way families need to know now.
    AND (trak_private.event_day(OLD) IN (v_today, v_today + 1)
         OR trak_private.event_day(NEW) IN (v_today, v_today + 1)) THEN
    v_kind := 'changed';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.event_change_notices (event_id, kind, before, due_at)
  VALUES (NEW.id, v_kind, trak_private.event_email_fields(OLD), now() + interval '15 seconds')
  ON CONFLICT (event_id) WHERE status = 'pending'
  -- Keep the first "before"; the email shows the final state against it.
  DO UPDATE SET kind = EXCLUDED.kind, due_at = EXCLUDED.due_at;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.queue_event_change_notice() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_queue_event_change_notice
  AFTER UPDATE ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.queue_event_change_notice();

-- Who is emailed about an event: exactly the people who may read it in the
-- app. J8.2's rule itself, trak_private.family_reads_event_for (#258), which
-- the RLS policy and the calendar feed share, not a copy that could drift
-- (Tarek, #264): a consented child on a squad row of that coach in the
-- event's academy that isn't coach_departed, and that child's guardians. The
-- candidates are the children and guardians on the coach's squad rows; the
-- rule decides. One row per address. A no-email child's username login
-- (@child.trakfootball.com) and .test addresses are never mailed: nobody
-- reads them.
CREATE FUNCTION trak_private.event_change_recipients(p_event_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH ev AS (
    SELECT e.coach_user_id, e.organization_id
    FROM public.coach_calendar_events e
    WHERE e.id = p_event_id AND e.published
  ), candidates AS (
    SELECT sp.linked_player_id AS person_id
    FROM ev JOIN public.squad_players sp ON sp.coach_user_id = ev.coach_user_id
    WHERE sp.linked_player_id IS NOT NULL
    UNION
    SELECT ppl.parent_user_id
    FROM ev JOIN public.squad_players sp ON sp.coach_user_id = ev.coach_user_id
    JOIN public.player_parent_links ppl ON ppl.player_user_id = sp.linked_player_id
  )
  SELECT DISTINCT ON (lower(btrim(u.email))) u.id, btrim(u.email)
  FROM candidates c
  CROSS JOIN ev
  JOIN auth.users u ON u.id = c.person_id
  WHERE trak_private.family_reads_event_for(c.person_id, ev.coach_user_id, ev.organization_id)
    AND NULLIF(btrim(u.email), '') IS NOT NULL
    AND lower(btrim(u.email)) NOT LIKE '%@child.trakfootball.com'
    AND lower(btrim(u.email)) NOT LIKE '%.test'
  ORDER BY lower(btrim(u.email)), u.id;
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_change_recipients(uuid) FROM PUBLIC, anon, authenticated;

-- Claim every notice that is due, for send-event-emails (service role only).
-- Also takes back a failed notice for another try (3 in all, a minute apart)
-- and a "sending" one whose function died (10 min, longer than any function
-- runs). Each comes with the event now, the squad, the recipients who
-- haven't had it yet, and child_names: every child on the coach's squad rows
-- (any academy, departed too), so the email can drop coach-typed text that
-- names one, as #258's calendar feed does.
CREATE FUNCTION public.claim_event_change_notices()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  WITH due AS (
    SELECT n.id FROM public.event_change_notices n
    WHERE (n.status = 'pending' AND n.due_at <= now())
       OR (n.status = 'failed' AND n.attempts < 3 AND n.finished_at <= now() - interval '1 minute')
       OR (n.status = 'sending' AND n.claimed_at <= now() - interval '10 minutes')
    ORDER BY n.due_at
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.event_change_notices n
    SET status = 'sending', claimed_at = now(), attempts = n.attempts + 1
    FROM due WHERE n.id = due.id
    RETURNING n.id
  )
  SELECT array_agg(claimed.id) INTO v_ids FROM claimed;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'notice_id', n.id,
      'kind', n.kind,
      'before', n.before,
      'event', trak_private.event_email_fields(e),
      'squad', NULLIF(btrim(cd.team), ''),
      'academy', o.name,
      'child_names', COALESCE((
        SELECT jsonb_agg(DISTINCT sp.player_name)
        FROM public.squad_players sp
        WHERE sp.coach_user_id = e.coach_user_id AND NULLIF(btrim(sp.player_name), '') IS NOT NULL
      ), '[]'::jsonb),
      'recipients', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', r.email) ORDER BY r.email)
        FROM trak_private.event_change_recipients(e.id) r
        WHERE NOT EXISTS (SELECT 1 FROM public.event_change_deliveries d
                          WHERE d.notice_id = n.id AND d.recipient_user_id = r.user_id)
      ), '[]'::jsonb)
    ) ORDER BY n.due_at)
    FROM public.event_change_notices n
    JOIN public.coach_calendar_events e ON e.id = n.event_id
    LEFT JOIN public.coach_details cd ON cd.user_id = e.coach_user_id
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    WHERE n.id = ANY (v_ids)
  ), '[]'::jsonb);
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_event_change_notices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_change_notices() TO service_role;

-- Seconds until the last pending notice is due, or null when none is
-- pending: send-event-emails waits that long so quick edits arrive as one.
CREATE FUNCTION public.event_change_notices_wait()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT GREATEST(0, EXTRACT(EPOCH FROM max(n.due_at) - now()))::numeric
  FROM public.event_change_notices n WHERE n.status = 'pending';
$fn$;
REVOKE ALL ON FUNCTION public.event_change_notices_wait() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_change_notices_wait() TO service_role;

-- One email went to this person, covering these notices.
CREATE FUNCTION public.record_event_change_delivery(p_notice_ids uuid[], p_recipient_user_id uuid, p_provider_id text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $fn$
  INSERT INTO public.event_change_deliveries (notice_id, recipient_user_id, provider_id)
  SELECT id, p_recipient_user_id, p_provider_id FROM unnest(p_notice_ids) AS id
  ON CONFLICT (notice_id, recipient_user_id) DO NOTHING;
$fn$;
REVOKE ALL ON FUNCTION public.record_event_change_delivery(uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_change_delivery(uuid[], uuid, text) TO service_role;

-- The outcome of a claimed notice. sent_count is everyone who has had it,
-- across tries. A failure stays visible here for the operator.
CREATE FUNCTION public.finish_event_change_notice(p_notice_id uuid, p_status text, p_failed integer, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'nothing_to_send') THEN
    RAISE EXCEPTION 'unknown_notice_status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.event_change_notices n
  SET status = p_status,
      finished_at = now(),
      failed_count = GREATEST(COALESCE(p_failed, 0), 0),
      last_error = p_error,
      sent_count = (SELECT count(*) FROM public.event_change_deliveries d WHERE d.notice_id = n.id)
  WHERE n.id = p_notice_id AND n.status = 'sending';
END;
$fn$;
REVOKE ALL ON FUNCTION public.finish_event_change_notice(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_event_change_notice(uuid, text, integer, text) TO service_role;
