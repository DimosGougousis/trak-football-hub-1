-- @trak-suite mode=--academy-time-zone in-all=true
-- TRAK-175 (J8): each academy runs on its own clock. Academy D is Dubai
-- (UTC+4 all year), academy A is Athens (UTC+3, then UTC+2 from 04:00 on
-- Sun 25 Oct 2026). The same 17:00 typed by each academy's coach is a
-- different instant, the app's old Dubai instant is corrected without a
-- "Changed" bump, and the register, "can't make it", overlaps, reminders and
-- the calendar feed all read the academy's own clock. Only the operator sets
-- the zone, and not under existing events.
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing academy-time-zone fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.tz175id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('91750000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE tz175_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON tz175_results TO authenticated, anon, service_role;
CREATE TEMP TABLE tz175_tokens(label text PRIMARY KEY, token text);
GRANT SELECT, INSERT ON tz175_tokens TO authenticated, service_role;
CREATE FUNCTION pg_temp.tz175actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.tz175id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.tz175check(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.tz175_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must fail with exactly this SQLSTATE (NULL: must succeed), and its message must contain the text.
CREATE FUNCTION pg_temp.tz175refused(statement text, label text, expected text, words text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.tz175_results VALUES(label, st IS NOT DISTINCT FROM expected AND coalesce(msg,'') ILIKE '%'||words||'%', coalesce(st||': '||msg,'no error'));
END $$;
-- Athens' wall clock k minutes from now.
CREATE FUNCTION pg_temp.tz175athens(k integer) RETURNS timestamp LANGUAGE sql AS $$
 SELECT (now() + make_interval(mins => k)) AT TIME ZONE 'Europe/Athens'
$$;
SET LOCAL check_function_bodies = off;
CREATE FUNCTION pg_temp.tz175ev(n integer) RETURNS public.coach_calendar_events LANGUAGE sql AS $$
 SELECT * FROM public.coach_calendar_events WHERE id = pg_temp.tz175id(n)
$$;
-- Who is due at an instant, as user:event by the last three digits.
CREATE FUNCTION pg_temp.tz175due(p_at timestamptz) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(user_id::text,3)||':'||right(event_id::text,3)||'@'||day, ',' ORDER BY user_id, event_id),'none')
 FROM trak_private.event_reminder_due_at(p_at)
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy D (100, admin 1): coach 10, child 21, parent 31.
-- Academy A (101, admin 2): coach 11, child 20, parent 30.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.tz175id(n), 'synthetic-'||n||'@timezone175.invalid', now()
 FROM unnest(ARRAY[1,2,10,11,20,21,30,31]) n;
INSERT INTO public.profiles(user_id,role,full_name)
 SELECT pg_temp.tz175id(n),
  CASE WHEN n IN (1,2) THEN 'club' WHEN n IN (10,11) THEN 'coach' WHEN n BETWEEN 20 AND 29 THEN 'player' ELSE 'parent' END::public.user_role,
  'Synthetic '||n
 FROM unnest(ARRAY[1,2,10,11,20,21,30,31]) n;
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.tz175id(100),pg_temp.tz175id(1),'Clock Academy D','TZ175D'),
 (pg_temp.tz175id(101),pg_temp.tz175id(2),'Clock Academy A','TZ175A');

-- ── 1. The setting: Dubai unless the operator says otherwise ─────────────
SELECT pg_temp.tz175check((SELECT time_zone = 'Asia/Dubai' FROM public.organizations WHERE id = pg_temp.tz175id(100)),
 '1 an academy is on Dubai time unless set');
SELECT pg_temp.tz175refused(format('UPDATE public.organizations SET time_zone = ''Europe/London'' WHERE id = %L', pg_temp.tz175id(101)),
 '1 only a zone the calendar feed can describe','23514','organizations_time_zone_supported');
-- The operator (this superuser session) sets Athens before any event exists.
UPDATE public.organizations SET time_zone = 'Europe/Athens' WHERE id = pg_temp.tz175id(101);
SELECT pg_temp.tz175check((SELECT time_zone = 'Europe/Athens' FROM public.organizations WHERE id = pg_temp.tz175id(101)),
 '1 the operator sets Athens for an academy with no events yet');
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(1);
SELECT pg_temp.tz175refused(format('UPDATE public.organizations SET time_zone = ''Europe/Athens'' WHERE id = %L', pg_temp.tz175id(100)),
 '1 an academy admin cannot change their academy''s clock','42501','Only Trak');
INSERT INTO public.organizations(id,admin_user_id,name,join_code,time_zone)
 VALUES (pg_temp.tz175id(102),pg_temp.tz175id(1),'Clock Academy D2','TZ175E','Europe/Athens');
RESET ROLE;
SELECT pg_temp.tz175check((SELECT time_zone = 'Asia/Dubai' FROM public.organizations WHERE id = pg_temp.tz175id(102)),
 '1 an academy an admin creates gets the default, whatever they send');

-- The fixtures below are the operator's: nobody signed in.
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.coach_details(user_id,organization_id,team) VALUES
 (pg_temp.tz175id(10),pg_temp.tz175id(100),'U15'),(pg_temp.tz175id(11),pg_temp.tz175id(101),'U14');
INSERT INTO public.player_details(user_id,date_of_birth)
 SELECT pg_temp.tz175id(n), current_date - interval '13 years' FROM unnest(ARRAY[20,21]) n;
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.tz175id(20),pg_temp.tz175id(30)),(pg_temp.tz175id(21),pg_temp.tz175id(31));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id) VALUES
 (pg_temp.tz175id(40),pg_temp.tz175id(11),'Synthetic 20',pg_temp.tz175id(20)),
 (pg_temp.tz175id(41),pg_temp.tz175id(10),'Synthetic 21',pg_temp.tz175id(21));
INSERT INTO public.academy_features(organization_id,feature) VALUES
 (pg_temp.tz175id(100),'events'),(pg_temp.tz175id(101),'events') ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(30);
SELECT public.record_parental_consent(pg_temp.tz175id(20),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
SELECT pg_temp.tz175actor(31);
SELECT public.record_parental_consent(pg_temp.tz175id(21),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
RESET ROLE;

-- ── 2. 17:00 is 17:00 on each academy's clock, across the clock change ───
-- What today's app sends: the Dubai instant (17:00 = 13:00Z), 90 minutes long.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,ends_at,event_date,start_time,end_time,venue,published)
 VALUES
 (pg_temp.tz175id(900),pg_temp.tz175id(11),'Athens Tue','training','2026-10-27 13:00Z','2026-10-27 14:30Z','2026-10-27','17:00','18:30','Pitch 1',true),
 (pg_temp.tz175id(901),pg_temp.tz175id(11),'Athens Thu','training','2026-10-22 13:00Z','2026-10-22 14:30Z','2026-10-22','17:00','18:30','Pitch 1',true),
 (pg_temp.tz175id(910),pg_temp.tz175id(10),'Dubai Tue','training','2026-10-27 13:00Z','2026-10-27 14:30Z','2026-10-27','17:00','18:30','Pitch 1',true);
SELECT pg_temp.tz175check((SELECT starts_at = '2026-10-27 15:00Z' AND ends_at = '2026-10-27 16:30Z' FROM pg_temp.tz175ev(900)),
 '2 Athens 17:00 on Tue 27 Oct (winter, UTC+2) is 15:00Z, still 90 minutes', (SELECT starts_at||' to '||ends_at FROM pg_temp.tz175ev(900)));
SELECT pg_temp.tz175check((SELECT starts_at = '2026-10-22 14:00Z' FROM pg_temp.tz175ev(901)),
 '2 Athens 17:00 on Thu 22 Oct (summer, UTC+3) is 14:00Z', (SELECT starts_at::text FROM pg_temp.tz175ev(901)));
SELECT pg_temp.tz175check((SELECT starts_at = '2026-10-27 13:00Z' AND ends_at = '2026-10-27 14:30Z' FROM pg_temp.tz175ev(910)),
 '2 Dubai 17:00 is still 13:00Z: nothing moves for a Dubai academy', (SELECT starts_at||' to '||ends_at FROM pg_temp.tz175ev(910)));
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(11);
-- A no-op save from today's app re-sends the Dubai instant.
UPDATE public.coach_calendar_events SET starts_at = '2026-10-27 13:00Z', ends_at = '2026-10-27 14:30Z', venue = 'Pitch 1'
 WHERE id = pg_temp.tz175id(900);
RESET ROLE;
SELECT pg_temp.tz175check((SELECT sequence = 0 AND starts_at = '2026-10-27 15:00Z' FROM pg_temp.tz175ev(900)),
 '2 a no-op save from an app that sends the Dubai instant is still no change (no "Changed", TRAK-152)',
 (SELECT sequence||' '||starts_at FROM pg_temp.tz175ev(900)));
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(11);
UPDATE public.coach_calendar_events SET start_time = '17:30', starts_at = '2026-10-27 13:30Z', ends_at = '2026-10-27 15:00Z'
 WHERE id = pg_temp.tz175id(900);
RESET ROLE;
SELECT pg_temp.tz175check((SELECT sequence = 1 AND starts_at = '2026-10-27 15:30Z' AND ends_at = '2026-10-27 17:00Z' FROM pg_temp.tz175ev(900)),
 '2 a real move is one change, on the Athens clock', (SELECT sequence||' '||starts_at||' to '||ends_at FROM pg_temp.tz175ev(900)));
UPDATE public.coach_calendar_events SET start_time = '17:00', starts_at = '2026-10-27 13:00Z', ends_at = '2026-10-27 14:30Z'
 WHERE id = pg_temp.tz175id(900);
SELECT pg_temp.tz175refused(format('UPDATE public.organizations SET time_zone = ''Asia/Dubai'' WHERE id = %L', pg_temp.tz175id(101)),
 '2 not even the operator moves an academy''s clock under its events','23514','can''t change');

-- The oldest rows have only an instant: their day is on their academy's clock.
-- 21:30Z on 27 Oct is 23:30 in Athens but already 01:30 on the 28th in Dubai.
-- (Such rows predate TRAK-157, which refuses a new event without a time.)
ALTER TABLE public.coach_calendar_events DISABLE TRIGGER trg_refuse_event_without_start_time;
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,published) VALUES
 (pg_temp.tz175id(905),pg_temp.tz175id(11),'Athens old','training','2026-10-27 21:30Z',false),
 (pg_temp.tz175id(915),pg_temp.tz175id(10),'Dubai old','training','2026-10-27 21:30Z',false);
ALTER TABLE public.coach_calendar_events ENABLE TRIGGER trg_refuse_event_without_start_time;
SELECT pg_temp.tz175check(trak_private.event_day(pg_temp.tz175ev(905)) = '2026-10-27' AND trak_private.event_day(pg_temp.tz175ev(915)) = '2026-10-28',
 '2 an undated row''s day is its academy''s date', trak_private.event_day(pg_temp.tz175ev(905))||' / '||trak_private.event_day(pg_temp.tz175ev(915)));
-- "Today" for same-day change emails and the minimum age, at that instant.
SELECT pg_temp.tz175check(trak_private.academy_today(pg_temp.tz175id(101), '2026-10-27 21:30Z') = '2026-10-27'
   AND trak_private.academy_today(pg_temp.tz175id(100), '2026-10-27 21:30Z') = '2026-10-28',
 '2 at 21:30Z it is still the 27th in Athens and already the 28th in Dubai',
 trak_private.academy_today(pg_temp.tz175id(101), '2026-10-27 21:30Z')||' / '||trak_private.academy_today(pg_temp.tz175id(100), '2026-10-27 21:30Z'));

-- ── 3. The register and "can't make it" go by the Athens clock ───────────
-- 920 starts in 30 minutes in Athens. Read as Dubai, the same 17:xx would
-- already be an hour or two ago. 921 was 3 hours ago.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published)
 SELECT pg_temp.tz175id(n), pg_temp.tz175id(11), 'Athens soon '||n, 'training', now(),
  pg_temp.tz175athens(k)::date, date_trunc('minute', pg_temp.tz175athens(k))::time, true
 FROM (VALUES (920, 30), (921, -180)) v(n, k);
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(11);
SELECT pg_temp.tz175refused(format('SELECT public.take_event_register(%L, ARRAY[%L]::uuid[])', pg_temp.tz175id(920), pg_temp.tz175id(40)),
 '3 the register is still shut 30 minutes before an Athens start','P0001','once the event has started');
SELECT pg_temp.tz175refused(format('SELECT public.take_event_register(%L, ARRAY[%L]::uuid[])', pg_temp.tz175id(921), pg_temp.tz175id(40)),
 '3 and opens once it has started, for a coach who can only read their own academy',NULL);
SELECT pg_temp.tz175actor(30);
SELECT pg_temp.tz175refused(format('SELECT public.report_cant_make_it(%L, %L)', pg_temp.tz175id(920), pg_temp.tz175id(20)),
 '3 a parent can still say "can''t make it" 30 minutes before an Athens start',NULL);
RESET ROLE;

-- ── 4. Overlaps: an end known only as an instant is read in Athens ───────
-- 930: 17:00 with no end time, one hour long as an instant (the app's
-- after-midnight case). Its wall end is 18:00 in Athens (20:00 in Dubai).
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,ends_at,event_date,start_time,published)
 VALUES (pg_temp.tz175id(930),pg_temp.tz175id(11),'Athens Wed','training','2026-10-28 13:00Z','2026-10-28 14:00Z','2026-10-28','17:00',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(11);
SELECT pg_temp.tz175refused(format('INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,end_time,published) VALUES (%L,%L,''Clash'',''training'',now(),''2026-10-28'',''17:30'',''18:15'',true)',
  pg_temp.tz175id(932), pg_temp.tz175id(11)),
 '4 17:30 overlaps 17:00–18:00 on the Athens clock','P0001','17:00–18:00');
SELECT pg_temp.tz175refused(format('INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,end_time,published) VALUES (%L,%L,''After'',''training'',now(),''2026-10-28'',''18:30'',''19:30'',true)',
  pg_temp.tz175id(931), pg_temp.tz175id(11)),
 '4 18:30 is after it ends, so it publishes',NULL);
RESET ROLE;

-- ── 5. Reminders: 2 days ahead and 09:00–20:00, on each academy's clock ──
-- 16:30Z on Sun 25 Oct: 18:30 in Athens (open), 20:30 in Dubai (closed).
SELECT pg_temp.tz175check((SELECT string_agg(right(organization_id::text,3)||'@'||day, ',') FROM trak_private.event_reminder_days('2026-10-25 16:30Z')) = '101@2026-10-27',
 '5 at 16:30Z only Athens is inside its sending hours, for its own today + 2',
 (SELECT string_agg(right(organization_id::text,3)||'@'||day, ',') FROM trak_private.event_reminder_days('2026-10-25 16:30Z')));
SELECT pg_temp.tz175check(pg_temp.tz175due('2026-10-25 16:30Z') = '020:900@2026-10-27,030:900@2026-10-27',
 '5 so only the Athens event''s family is due, not the Dubai event on the same day', pg_temp.tz175due('2026-10-25 16:30Z'));
-- 05:30Z: 09:30 in Dubai (open), 07:30 in Athens (closed).
SELECT pg_temp.tz175check(pg_temp.tz175due('2026-10-25 05:30Z') = '021:910@2026-10-27,031:910@2026-10-27',
 '5 and at 05:30Z only the Dubai event''s family', pg_temp.tz175due('2026-10-25 05:30Z'));
SELECT pg_temp.tz175check(trak_private.event_reminder_work_due('2026-10-25 16:30Z') AND NOT trak_private.event_reminder_work_due('2026-10-25 03:00Z'),
 '5 the scheduler wakes when any academy has work in its hours, not at 07:00 Athens / 07:00 Dubai');
-- The Dubai parent's reminder for the same day failed earlier and is waiting
-- for a retry. At 16:30Z Dubai is closed, so it must be left alone: claimed
-- now, nobody would send it, and Dubai's hours never return to that day.
INSERT INTO public.event_reminder_sends(user_id,reminder_day,status,attempts,claimed_at,finished_at)
 VALUES (pg_temp.tz175id(31),'2026-10-27','failed',1,now() - interval '1 hour',now() - interval '1 hour');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE tz175_claim AS SELECT public.claim_event_reminders(NULL, '2026-10-25 16:30Z') AS claimed;
RESET ROLE;
SELECT pg_temp.tz175check((SELECT status = 'failed' AND attempts = 1 FROM public.event_reminder_sends
   WHERE user_id = pg_temp.tz175id(31) AND reminder_day = '2026-10-27'),
 '5 a closed academy''s failed reminder is not claimed in another academy''s hours',
 (SELECT status||' '||attempts FROM public.event_reminder_sends WHERE user_id = pg_temp.tz175id(31) AND reminder_day = '2026-10-27'));
SELECT pg_temp.tz175check((SELECT string_agg(right(x->>'user_id',3)||'@'||(x->>'day')||':'||(x->'events'->0->>'title'), ',' ORDER BY x->>'user_id')
   FROM tz175_claim, jsonb_array_elements(claimed) x) = '020@2026-10-27:Athens Tue,030@2026-10-27:Athens Tue',
 '5 the claim hands out the Athens family''s reminder, for their day',
 (SELECT claimed::text FROM tz175_claim));
SELECT pg_temp.tz175check(NOT trak_private.event_reminder_work_due('2026-10-25 16:30Z'),
 '5 once claimed, nothing more is due');
-- 05:30Z, Dubai's hours: its failed reminder is retried there, with the fresh one.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE tz175_claim_dubai AS SELECT public.claim_event_reminders(NULL, '2026-10-25 05:30Z') AS claimed;
RESET ROLE;
SELECT pg_temp.tz175check((SELECT string_agg(right(x->>'user_id',3)||'@'||(x->>'day'), ',' ORDER BY x->>'user_id')
   FROM tz175_claim_dubai, jsonb_array_elements(claimed) x) = '021@2026-10-27,031@2026-10-27',
 '5 and is retried in its own academy''s hours',
 (SELECT claimed::text FROM tz175_claim_dubai));

-- ── 6. The calendar feed says which clock each event is on ───────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.tz175actor(30); INSERT INTO tz175_tokens SELECT 'athens', public.create_my_calendar_link();
SELECT pg_temp.tz175actor(31); INSERT INTO tz175_tokens SELECT 'dubai', public.create_my_calendar_link();
RESET ROLE;
SELECT pg_temp.tz175check(
  (SELECT bool_and(e->>'timeZone' = 'Europe/Athens') AND bool_or(e->>'id' = pg_temp.tz175id(900)::text AND e->>'startTime' = '17:00')
   FROM jsonb_array_elements(public.calendar_feed_for_token((SELECT token FROM tz175_tokens WHERE label = 'athens'))->'events') e)
  AND (SELECT bool_and(e->>'timeZone' = 'Asia/Dubai') AND count(*) > 0
   FROM jsonb_array_elements(public.calendar_feed_for_token((SELECT token FROM tz175_tokens WHERE label = 'dubai'))->'events') e),
 '6 the Athens family''s feed is on Europe/Athens at 17:00; the Dubai family''s on Asia/Dubai');

-- ── 7. Who may call what ─────────────────────────────────────────────────
SELECT pg_temp.tz175check(
  has_function_privilege('authenticated', 'trak_private.academy_time_zone(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'trak_private.academy_time_zone(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'trak_private.event_reminder_days(timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'trak_private.event_reminder_due_at(timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.claim_event_reminders(date, timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.claim_event_reminders(date, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'trak_private.event_wall_end(date, time, time, timestamptz, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'trak_private.academy_today(uuid, timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'trak_private.academy_has_events(uuid)', 'EXECUTE'),
 '7 signed-in users may ask only an academy''s zone name; reminders stay the scheduler''s');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.tz175_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.tz175_results;
 IF n <> 28 THEN
  RAISE EXCEPTION 'Academy time zone: % checks ran; expected exactly 28', n;
 END IF;
 IF failures IS NOT NULL THEN
  RAISE EXCEPTION USING MESSAGE='Academy time zone failed',DETAIL=failures;
 END IF;
 RAISE NOTICE 'Academy time zone: % checks passed',n;
END $$;
SELECT count(*) AS academy_time_zone_checks_passed FROM pg_temp.tz175_results;
ROLLBACK;
