-- TRAK-176 (J8): one coach, two squads (U14 + U16), as at the pilot academy.
-- A squad is the coach's roster rows with the same squad_players.age_group.
-- An event, and a logged session, may name one; NULL is the coach's whole
-- roster, which is what every event was before, so nothing changes for anyone
-- until a coach picks a squad. Every path that decides which families an event
-- reaches gains "squad IS NULL OR age_group = squad": the family list
-- (child_events), "Can't make it" (absence_target), the phone calendar
-- (family_reads_event_for, calendar_feed_for_token), change emails and
-- reminders (event_change_recipients), and the coach's register. Bodies are
-- the latest on main with that one condition added (and the squad label).

ALTER TABLE public.coach_calendar_events ADD COLUMN squad text;
ALTER TABLE public.coach_sessions ADD COLUMN squad text;

-- ── A squad is one of the coach's own ─────────────────────────────────────
CREATE FUNCTION trak_private.refuse_unknown_squad()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.squad IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.coach_user_id = NEW.coach_user_id AND sp.age_group = NEW.squad
      AND sp.status <> 'coach_departed') THEN
    RAISE EXCEPTION 'That squad isn''t one of yours: no % players on your roster', NEW.squad USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.refuse_unknown_squad() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_refuse_unknown_squad BEFORE INSERT OR UPDATE OF squad, coach_user_id ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_unknown_squad();
CREATE TRIGGER trg_refuse_unknown_squad BEFORE INSERT OR UPDATE OF squad, coach_user_id ON public.coach_sessions
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_unknown_squad();

-- ── The shared family rule, with the squad ─────────────────────────────────
CREATE FUNCTION trak_private.family_reads_event_for(p_user uuid, p_coach_user_id uuid, p_organization_id uuid, p_squad text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_players sp
    WHERE sp.coach_user_id = p_coach_user_id
      AND sp.organization_id = p_organization_id
      AND sp.status <> 'coach_departed'
      AND (p_squad IS NULL OR sp.age_group = p_squad)
      AND (sp.linked_player_id = p_user
           OR EXISTS (SELECT 1 FROM public.player_parent_links ppl
                      WHERE ppl.player_user_id = sp.linked_player_id
                        AND ppl.parent_user_id = p_user))
      AND NOT public.player_consent_required(sp.linked_player_id)
  );
$fn$;
REVOKE ALL ON FUNCTION trak_private.family_reads_event_for(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- The three-argument form stays for its callers that mean "any of this
-- coach's squads" (the feed's list of names to keep out of calendar entries).
CREATE OR REPLACE FUNCTION trak_private.family_reads_event_for(p_user uuid, p_coach_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT trak_private.family_reads_event_for(p_user, p_coach_user_id, p_organization_id, NULL);
$fn$;

-- ── The family's event list ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.child_events(p_child uuid)
RETURNS TABLE (
  id uuid,
  event_type text,
  title text,
  event_date date,
  start_time time,
  starts_at timestamptz,
  meet_time time,
  venue text,
  kit text,
  opponent text,
  home_away text,
  status text,
  cancel_reason text,
  sequence integer,
  updated_at timestamptz,
  family_note text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT e.id, e.event_type, e.title, e.event_date, e.start_time, e.starts_at,
         e.meet_time, e.venue, e.kit, e.opponent, e.home_away, e.status,
         trak_private.family_safe_reason(e.cancel_reason, e.coach_user_id, e.organization_id),
         e.sequence, e.updated_at,
         trak_private.family_safe_reason(e.family_note, e.coach_user_id, e.organization_id)
  FROM public.coach_calendar_events e
  WHERE e.published
    AND (p_child = auth.uid()
         OR EXISTS (SELECT 1 FROM public.player_parent_links l
                    WHERE l.player_user_id = p_child AND l.parent_user_id = auth.uid()))
    AND NOT public.player_consent_required(p_child)
    AND EXISTS (SELECT 1 FROM public.squad_players sp
                WHERE sp.linked_player_id = p_child
                  AND sp.coach_user_id = e.coach_user_id
                  AND sp.organization_id = e.organization_id
                  AND sp.status <> 'coach_departed'
                  AND (e.squad IS NULL OR sp.age_group = e.squad));
$fn$;

-- ── "Can't make it" ───────────────────────────────────────────────────────
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
  IF auth.uid() IS NULL OR NOT (
    EXISTS (
      SELECT 1 FROM public.player_parent_links l
      WHERE l.player_user_id = p_child AND l.parent_user_id = auth.uid()
    )
    OR (p_child = auth.uid()
        AND COALESCE(public.player_age_years(p_child) >= public.player_consent_age(p_child), false))
  ) THEN
    RAISE EXCEPTION 'Only a linked guardian, or a player old enough to consent for themselves, can say a child can''t make it' USING ERRCODE = '42501';
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
    AND (v_event.squad IS NULL OR sp.age_group = v_event.squad)
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

-- ── The register: that squad's players only; the session keeps the squad ─
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
  -- TRAK-176: a squad's event registers that squad's players only.
  IF e.squad IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_present, '{}'::uuid[])) p
    WHERE NOT EXISTS (SELECT 1 FROM public.squad_players sp WHERE sp.id = p AND sp.age_group = e.squad)) THEN
    RAISE EXCEPTION 'This is a % event: a player from another squad can''t be on its register', e.squad USING ERRCODE = 'P0001';
  END IF;

  -- Consent first, to say why in words; the attendance policy refuses anyway.
  -- Another coach's player is refused here with 42501.
  FOREACH v_player IN ARRAY COALESCE(p_present, '{}'::uuid[]) LOOP
    IF public.coach_squad_player_consent_required(v_player) THEN
      RAISE EXCEPTION 'Waiting for parent: nothing is recorded about player % until a parent approves', v_player
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.coach_sessions (coach_user_id, title, session_type, session_date, venue, event_id, squad)
  VALUES (auth.uid(), e.title, e.event_type,
          COALESCE(e.event_date, (e.starts_at AT TIME ZONE v_tz)::date), e.venue, e.id, e.squad)
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

-- ── The phone calendar ────────────────────────────────────────────────────
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
          'squadLabel', coalesce(e.squad, (
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
          AND trak_private.family_reads_event_for(v_link.user_id, ev.coach_user_id, ev.organization_id, ev.squad)
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

-- ── Change emails (and reminders, which use the same recipients) ──────────
CREATE OR REPLACE FUNCTION trak_private.event_change_recipients(p_event_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH ev AS (
    SELECT e.coach_user_id, e.organization_id, e.squad
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
  WHERE trak_private.family_reads_event_for(c.person_id, ev.coach_user_id, ev.organization_id, ev.squad)
    AND NULLIF(btrim(u.email), '') IS NOT NULL
    AND lower(btrim(u.email)) NOT LIKE '%@child.trakfootball.com'
    AND lower(btrim(u.email)) NOT LIKE '%.test'
  ORDER BY lower(btrim(u.email)), u.id;
$fn$;

-- ── The squad label in change emails: the event's squad first ─────────────
CREATE OR REPLACE FUNCTION public.claim_event_change_notices()
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
      'squad', COALESCE(e.squad, NULLIF(btrim(cd.team), '')),
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

-- ── The squad label in reminders: the event's squad first ─────────────────
CREATE OR REPLACE FUNCTION public.claim_event_reminders(p_day date DEFAULT NULL, p_at timestamptz DEFAULT NULL)
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
        'squad', COALESCE(e.squad, NULLIF(btrim(cd.team), '')),
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
