-- TRAK-175 (J8): each academy runs on its own clock.
--
-- The first pilot academy is in Athens (decided 14 Oct),
-- and every J8 rule so far read event_date + start_time as Dubai (UTC+4 all
-- year). Athens is UTC+3 until 04:00 on Sun 25 Oct and UTC+2 after, so a
-- fixed offset can't be swapped in: each academy names its IANA zone, and
-- every rule converts through it. Existing academies keep Asia/Dubai, so
-- nothing moves for them.
--
-- The zones are a closed list: the calendar feed has to describe each one's
-- daylight-saving rules (VTIMEZONE), and an unknown zone would leave phones
-- guessing. Adding an academy in a new country adds its zone here and there.

ALTER TABLE public.organizations
  ADD COLUMN time_zone text NOT NULL DEFAULT 'Asia/Dubai'
    CONSTRAINT organizations_time_zone_supported CHECK (time_zone IN ('Asia/Dubai', 'Europe/Athens'));
COMMENT ON COLUMN public.organizations.time_zone IS
  'TRAK-175. The academy''s clock: event_date + start_time are read in this zone. Set by the operator only, before the academy has events.';

-- Whether an academy has any event, whoever asks (RLS would hide some).
CREATE FUNCTION trak_private.academy_has_events(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.coach_calendar_events e WHERE e.organization_id = p_organization_id);
$fn$;
REVOKE ALL ON FUNCTION trak_private.academy_has_events(uuid) FROM PUBLIC, anon, authenticated;

-- Like min_player_age (TRAK-165): academy admins may create and edit their own
-- row, so they get the default and can't change it. And nobody changes it
-- once events exist: every event's instant was worked out on the old clock.
-- Not SECURITY DEFINER: current_user must be the caller's role.
CREATE FUNCTION trak_private.time_zone_set_by_operator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.time_zone := 'Asia/Dubai';
    ELSIF NEW.time_zone IS DISTINCT FROM OLD.time_zone THEN
      RAISE EXCEPTION 'Only Trak can change an academy''s time zone' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.time_zone IS DISTINCT FROM OLD.time_zone
     AND trak_private.academy_has_events(OLD.id) THEN
    RAISE EXCEPTION 'This academy already has events on the % clock, so its time zone can''t change', OLD.time_zone
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.time_zone_set_by_operator() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_time_zone_set_by_operator
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION trak_private.time_zone_set_by_operator();

-- An academy's zone; Dubai for none (an event whose academy was deleted).
-- Only a zone name comes back, so the coach's register (SECURITY INVOKER)
-- may ask too.
CREATE FUNCTION trak_private.academy_time_zone(p_organization_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT COALESCE((SELECT o.time_zone FROM public.organizations o WHERE o.id = p_organization_id), 'Asia/Dubai');
$fn$;
REVOKE ALL ON FUNCTION trak_private.academy_time_zone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trak_private.academy_time_zone(uuid) TO authenticated;

-- The academy's date at an instant: "today" for same-day emails and the
-- minimum age. Athens and Dubai disagree for an hour or two before midnight.
CREATE FUNCTION trak_private.academy_today(p_organization_id uuid, p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT (p_at AT TIME ZONE trak_private.academy_time_zone(p_organization_id))::date;
$fn$;
REVOKE ALL ON FUNCTION trak_private.academy_today(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── The instant follows the academy's wall clock ──────────────────────────
-- The app has worked out starts_at as Dubai since #263. The database now sets
-- it from event_date + start_time on the academy's clock, whatever the device
-- or app version sent, and keeps the length the app gave (ends_at). Done
-- before the "did anything change?" comparison (TRAK-152), so a no-op save
-- from an app that still sends the Dubai instant changes nothing.
CREATE OR REPLACE FUNCTION public.stamp_calendar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_start timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.organization_id := (SELECT cd.organization_id FROM public.coach_details cd
                            WHERE cd.user_id = NEW.coach_user_id);
    NEW.sequence := 0;
  ELSE
    IF OLD.published AND NOT NEW.published THEN
      RAISE EXCEPTION 'published_event_cannot_return_to_draft' USING ERRCODE = '42501';
    END IF;
    -- The one way out of the pin is the FK's own ON DELETE SET NULL, once the
    -- academy is gone (20260918224500's carve-out 2). Pinning that too would
    -- block deleting the academy and its admin's account.
    IF NEW.organization_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = OLD.organization_id) THEN
      NEW.organization_id := OLD.organization_id;
    END IF;
  END IF;

  -- TRAK-175: an event with no time yet starts at the academy's midnight.
  IF NEW.event_date IS NOT NULL THEN
    v_start := (NEW.event_date + COALESCE(NEW.start_time, time '00:00'))
               AT TIME ZONE trak_private.academy_time_zone(NEW.organization_id);
    IF NEW.ends_at IS NOT NULL AND NEW.starts_at IS NOT NULL THEN
      NEW.ends_at := v_start + (NEW.ends_at - NEW.starts_at);
    END IF;
    NEW.starts_at := v_start;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Compared after the pin, so an academy or counter the app sent counts as
    -- nothing changed.
    IF (to_jsonb(NEW) - 'updated_at' - 'sequence') = (to_jsonb(OLD) - 'updated_at' - 'sequence') THEN
      NEW.sequence := OLD.sequence;
      NEW.updated_at := OLD.updated_at;
    ELSE
      NEW.sequence := OLD.sequence + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── The day of an event (oldest rows have only an instant) ────────────────
CREATE OR REPLACE FUNCTION trak_private.event_day(e public.coach_calendar_events)
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(e.event_date, (e.starts_at AT TIME ZONE trak_private.academy_time_zone(e.organization_id))::date);
$function$;

-- ── J8.4 overlap: a wall-clock end, on the event's own academy clock ──────
DROP FUNCTION trak_private.event_wall_end(date, time, time, timestamptz);
CREATE FUNCTION trak_private.event_wall_end(p_date date, p_start time, p_end time, p_ends_at timestamptz, p_time_zone text)
RETURNS timestamp
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN p_end IS NOT NULL AND p_end > p_start THEN p_date + p_end
    WHEN p_ends_at IS NOT NULL THEN p_ends_at AT TIME ZONE p_time_zone
    ELSE p_date + p_start + interval '90 minutes'
  END
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_wall_end(date, time, time, timestamptz, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trak_private.refuse_event_overlap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_start timestamp;
  v_end timestamp;
  v_clash record;
BEGIN
  IF NOT NEW.published OR NEW.status = 'cancelled' OR NEW.event_date IS NULL OR NEW.start_time IS NULL THEN
    RETURN NULL;
  END IF;
  -- Already live and nothing about when it is changed: an old clash stays editable.
  IF TG_OP = 'UPDATE' AND OLD.published AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.event_date IS NOT DISTINCT FROM NEW.event_date
     AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
     AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time
     AND OLD.ends_at IS NOT DISTINCT FROM NEW.ends_at THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.coach_user_id::text || '|' || NEW.event_date::text, 158));
  v_start := NEW.event_date + NEW.start_time;
  v_end := trak_private.event_wall_end(NEW.event_date, NEW.start_time, NEW.end_time, NEW.ends_at,
                                       trak_private.academy_time_zone(NEW.organization_id));

  SELECT e.title, e.event_date + e.start_time AS starts,
         trak_private.event_wall_end(e.event_date, e.start_time, e.end_time, e.ends_at,
                                     trak_private.academy_time_zone(e.organization_id)) AS ends
    INTO v_clash
  FROM public.coach_calendar_events e
  WHERE e.coach_user_id = NEW.coach_user_id
    AND e.id <> NEW.id
    AND e.published
    AND e.status IS DISTINCT FROM 'cancelled'
    AND e.event_date = NEW.event_date
    AND e.start_time IS NOT NULL
    AND e.event_date + e.start_time < v_end
    AND trak_private.event_wall_end(e.event_date, e.start_time, e.end_time, e.ends_at,
                                    trak_private.academy_time_zone(e.organization_id)) > v_start
  ORDER BY e.start_time, e.title
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This overlaps %, %–%. Change the time or cancel one.',
      v_clash.title, to_char(v_clash.starts, 'HH24:MI'), to_char(v_clash.ends, 'HH24:MI')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$fn$;

-- ── J8.15 register: opens once the event has started on its academy's clock
CREATE OR REPLACE FUNCTION public.take_event_register(p_event_id uuid, p_present uuid[])
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  e public.coach_calendar_events;
  v_tz text;
  v_session uuid;
  v_player uuid;
BEGIN
  SELECT * INTO e FROM public.coach_calendar_events ev
  WHERE ev.id = p_event_id AND ev.coach_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event is not on your schedule' USING ERRCODE = 'P0001';
  END IF;
  IF NOT e.published THEN
    RAISE EXCEPTION 'Only a published event has a register' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event was cancelled, so it has no register' USING ERRCODE = 'P0001';
  END IF;
  IF e.event_type NOT IN ('training', 'other') THEN
    RAISE EXCEPTION 'A match is recorded in the match log, with its score and minutes' USING ERRCODE = 'P0001';
  END IF;
  -- The coach's wall clock is the academy's (event_date + start_time); an
  -- event with no time yet opens at the start of its day.
  v_tz := trak_private.academy_time_zone(e.organization_id);
  IF COALESCE((e.event_date + COALESCE(e.start_time, time '00:00')) AT TIME ZONE v_tz, e.starts_at) > now() THEN
    RAISE EXCEPTION 'The register opens once the event has started' USING ERRCODE = 'P0001';
  END IF;

  -- Consent first, to say why in words; the attendance policy refuses anyway.
  -- Another coach's player is refused here with 42501.
  FOREACH v_player IN ARRAY COALESCE(p_present, '{}'::uuid[]) LOOP
    IF public.coach_squad_player_consent_required(v_player) THEN
      RAISE EXCEPTION 'Waiting for parent: nothing is recorded about player % until a parent approves', v_player
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.coach_sessions (coach_user_id, title, session_type, session_date, venue, event_id)
  VALUES (auth.uid(), e.title, e.event_type,
          COALESCE(e.event_date, (e.starts_at AT TIME ZONE v_tz)::date), e.venue, e.id)
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_session;
  IF v_session IS NULL THEN
    SELECT s.id INTO v_session FROM public.coach_sessions s WHERE s.event_id = e.id;
  END IF;

  DELETE FROM public.session_attendance a
  WHERE a.session_id = v_session AND a.squad_player_id <> ALL (COALESCE(p_present, '{}'::uuid[]));
  -- An older row with another status becomes present rather than gaining a twin.
  UPDATE public.session_attendance a SET status = 'present'
  WHERE a.session_id = v_session AND a.status <> 'present';
  INSERT INTO public.session_attendance (session_id, squad_player_id, status)
  SELECT v_session, p, 'present' FROM (SELECT DISTINCT unnest(COALESCE(p_present, '{}'::uuid[])) AS p) d
  WHERE NOT EXISTS (SELECT 1 FROM public.session_attendance a WHERE a.session_id = v_session AND a.squad_player_id = p);

  RETURN v_session;
END;
$function$;

-- ── J8.14 "Can't make it": closes when the event starts, on its clock ────
CREATE OR REPLACE FUNCTION trak_private.absence_target(p_event_id uuid, p_child uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event public.coach_calendar_events;
  v_squad_player uuid;
  v_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.player_parent_links l
    WHERE l.player_user_id = p_child AND l.parent_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only a linked guardian can say a child can''t make it' USING ERRCODE = '42501';
  END IF;
  IF public.player_consent_required(p_child) THEN
    RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this child until a guardian approves' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event FROM public.coach_calendar_events WHERE id = p_event_id;
  SELECT sp.id INTO v_squad_player FROM public.squad_players sp
  WHERE sp.linked_player_id = p_child
    AND sp.coach_user_id = v_event.coach_user_id
    AND sp.organization_id = v_event.organization_id
    AND sp.status <> 'coach_departed'
  LIMIT 1;
  IF NOT FOUND OR v_event.id IS NULL OR NOT v_event.published THEN
    RAISE EXCEPTION 'This event is not available for this child' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_features f
                 WHERE f.organization_id = v_event.organization_id AND f.feature = 'events') THEN
    RAISE EXCEPTION 'Events are switched off for this academy' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'This event is cancelled' USING ERRCODE = '42501';
  END IF;

  v_deadline := CASE
    WHEN v_event.event_date IS NULL THEN v_event.starts_at
    WHEN v_event.start_time IS NULL
      THEN (v_event.event_date + 1)::timestamp AT TIME ZONE trak_private.academy_time_zone(v_event.organization_id)
    ELSE (v_event.event_date + v_event.start_time) AT TIME ZONE trak_private.academy_time_zone(v_event.organization_id)
  END;
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'This event has started; tell the coach directly' USING ERRCODE = '42501';
  END IF;
  RETURN v_squad_player;
END;
$function$;

-- ── J8.12 same-day change emails: "today" is the academy's today ─────────
CREATE OR REPLACE FUNCTION trak_private.queue_event_change_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_today date := trak_private.academy_today(NEW.organization_id);
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
$function$;

-- ── J8.13 reminders: 2 days ahead and 09:00–20:00, each on its own clock ─
-- The academies whose clock is inside the sending hours at p_at, and the day
-- their reminders are for.
CREATE FUNCTION trak_private.event_reminder_days(p_at timestamptz)
RETURNS TABLE (organization_id uuid, day date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT o.id, (p_at AT TIME ZONE o.time_zone)::date + 2
  FROM public.organizations o
  WHERE (p_at AT TIME ZONE o.time_zone)::time >= time '09:00'
    AND (p_at AT TIME ZONE o.time_zone)::time < time '20:00';
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_reminder_days(timestamptz) FROM PUBLIC, anon, authenticated;

-- Who is due at p_at: event_reminder_due() for each such academy's day, only
-- that academy's events.
CREATE FUNCTION trak_private.event_reminder_due_at(p_at timestamptz)
RETURNS TABLE (user_id uuid, email text, event_id uuid, day date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT d.user_id, d.email, d.event_id, x.day
  FROM trak_private.event_reminder_days(p_at) x
  CROSS JOIN LATERAL trak_private.event_reminder_due(x.day) d
  JOIN public.coach_calendar_events e ON e.id = d.event_id AND e.organization_id = x.organization_id;
$fn$;
REVOKE ALL ON FUNCTION trak_private.event_reminder_due_at(timestamptz) FROM PUBLIC, anon, authenticated;

-- A given day claims that day for every academy, as before (tests, a manual
-- re-run). No day, as send-event-reminders calls it, claims for each academy
-- inside its sending hours at p_at (now unless given), its own today + 2.
DROP FUNCTION public.claim_event_reminders(date);
CREATE FUNCTION public.claim_event_reminders(p_day date DEFAULT NULL, p_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_at timestamptz := COALESCE(p_at, now());
  v_result jsonb;
BEGIN
  WITH due AS MATERIALIZED (
    SELECT d.user_id, d.email, d.event_id, p_day AS day
    FROM trak_private.event_reminder_due(p_day) d WHERE p_day IS NOT NULL
    UNION ALL
    SELECT n.user_id, n.email, n.event_id, n.day
    FROM trak_private.event_reminder_due_at(v_at) n WHERE p_day IS NULL
  ), fresh AS (
    INSERT INTO public.event_reminder_sends (user_id, reminder_day)
    SELECT DISTINCT due.user_id, due.day FROM due
    ON CONFLICT (user_id, reminder_day) DO NOTHING
    RETURNING user_id, reminder_day
  ), retried AS (
    -- Only someone due now: another academy's retry, claimed outside its own
    -- hours, would be marked sending and never handed out.
    UPDATE public.event_reminder_sends s
    SET status = 'sending', attempts = s.attempts + 1, claimed_at = now(), finished_at = NULL
    WHERE EXISTS (SELECT 1 FROM due WHERE due.user_id = s.user_id AND due.day = s.reminder_day)
      AND ((s.status = 'failed' AND s.attempts < 3 AND s.finished_at <= now() - interval '1 minute')
        OR (s.status = 'sending' AND s.claimed_at <= now() - interval '10 minutes'))
    RETURNING s.user_id, s.reminder_day
  ), claimed AS (
    SELECT fresh.user_id, fresh.reminder_day FROM fresh
    UNION
    SELECT retried.user_id, retried.reminder_day FROM retried
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'email', p.email,
      'day', p.day,
      'events', p.events
    ) ORDER BY p.day, p.user_id), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT d.user_id, d.day, min(d.email) AS email,
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
    FROM due d
    JOIN claimed c ON c.user_id = d.user_id AND c.reminder_day = d.day
    JOIN public.coach_calendar_events e ON e.id = d.event_id
    LEFT JOIN public.coach_details cd ON cd.user_id = e.coach_user_id
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    GROUP BY d.user_id, d.day
  ) p;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_event_reminders(date, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_reminders(date, timestamptz) TO service_role;

-- The scheduler's gate: is anyone due, or due a retry, in an academy whose
-- clock is inside the sending hours at p_at?
CREATE OR REPLACE FUNCTION trak_private.event_reminder_work_due(p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM trak_private.event_reminder_due_at(p_at) n
                 LEFT JOIN public.event_reminder_sends s ON s.user_id = n.user_id AND s.reminder_day = n.day
                 WHERE s.user_id IS NULL
                    OR (s.status = 'failed' AND s.attempts < 3 AND s.finished_at <= now() - interval '1 minute')
                    OR (s.status = 'sending' AND s.claimed_at <= now() - interval '10 minutes'));
$function$;

-- ── J8.9 calendar feed: each event's day and zone are its academy's ──────
CREATE OR REPLACE FUNCTION public.calendar_feed_for_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_link public.calendar_links;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_link FROM public.calendar_links
  WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Recorded for dead links too: something is still subscribed to them.
  UPDATE public.calendar_links SET last_fetched_at = now() WHERE id = v_link.id;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('events', '[]'::jsonb, 'child_names', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', e.id::text,
          'kind', CASE WHEN e.event_type IN ('training', 'match', 'tournament', 'other') THEN e.event_type ELSE 'other' END,
          'squadLabel', coalesce((
            SELECT min(sp.age_group) FROM public.squad_players sp
            WHERE sp.coach_user_id = e.coach_user_id
              AND sp.organization_id = e.organization_id
              AND (sp.linked_player_id = v_link.user_id
                   OR EXISTS (SELECT 1 FROM public.player_parent_links ppl
                              WHERE ppl.player_user_id = sp.linked_player_id
                                AND ppl.parent_user_id = v_link.user_id))), 'Squad'),
          'date', to_char(e.day, 'YYYY-MM-DD'),
          'startTime', left(e.start_time::text, 5),
          'endTime', left(e.end_time::text, 5),
          'meetTime', left(e.meet_time::text, 5),
          'opponent', e.opponent,
          'homeAway', e.home_away,
          'venue', e.venue,
          'kit', e.kit,
          'status', e.status,
          'sequence', e.sequence,
          'updatedAt', to_char(e.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timeZone', e.tz
        ) ORDER BY e.day, e.start_time NULLS FIRST, e.id)
      FROM (
        SELECT ev.*, z.tz, coalesce(ev.event_date, (ev.starts_at AT TIME ZONE z.tz)::date) AS day
        FROM public.coach_calendar_events ev
        CROSS JOIN LATERAL (SELECT trak_private.academy_time_zone(ev.organization_id) AS tz) z
        WHERE ev.published
          AND trak_private.family_reads_event_for(v_link.user_id, ev.coach_user_id, ev.organization_id)
      ) e
      WHERE e.day >= current_date - 60
    ), '[]'::jsonb),
    -- Every child in the squads this feed shows, not only the owner's own:
    -- a coach's note can name a squad-mate ("Lucas brings the bibs"), and
    -- that must not reach every other family's calendar (Imad, #258).
    'child_names', coalesce((
      SELECT jsonb_agg(DISTINCT sp.player_name)
      FROM public.squad_players sp
      WHERE sp.player_name IS NOT NULL
        AND (sp.linked_player_id = v_link.user_id
             OR EXISTS (SELECT 1 FROM public.player_parent_links ppl
                        WHERE ppl.player_user_id = sp.linked_player_id
                          AND ppl.parent_user_id = v_link.user_id)
             OR trak_private.family_reads_event_for(v_link.user_id, sp.coach_user_id, sp.organization_id))
    ), '[]'::jsonb)
  );
END;
$function$;

-- ── J1 minimum age: by date of birth on the academy's own date ───────────
CREATE OR REPLACE FUNCTION trak_private.roster_child_meets_min_age()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_min integer;
BEGIN
  SELECT o.min_player_age INTO v_min FROM public.organizations o WHERE o.id = NEW.organization_id;
  IF COALESCE(v_min, 13) > 0
     AND NEW.date_of_birth > (trak_private.academy_today(NEW.organization_id)
                              - make_interval(years => COALESCE(v_min, 13)))::date THEN
    RAISE EXCEPTION 'This academy serves children aged % and over: this date of birth (%) is younger', COALESCE(v_min, 13), NEW.date_of_birth
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
