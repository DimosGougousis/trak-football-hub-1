-- @trak-suite mode=--event-squads in-all=true
-- TRAK-176 (J8): one coach, two squads (U14 + U16), as at the pilot academy.
-- An event may belong to one squad (the roster's age_group); NULL is the
-- coach's whole roster, as every event was before. A U14 event reaches U14
-- families in every path (the app's list, "Can't make it", the phone calendar,
-- change emails and reminders) and no U16 family; the register takes U14
-- players only. Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing event-squad fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.sq(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('98176000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE sq_results(label text, ok boolean, detail text);
GRANT INSERT ON sq_results TO authenticated, anon;
CREATE TEMP TABLE sq_tokens(who integer, token text);
GRANT INSERT, SELECT ON sq_tokens TO authenticated;
CREATE FUNCTION pg_temp.sq_as(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.sq(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.sq_check(ok boolean, label text, detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.sq_results VALUES(label, ok IS TRUE, detail)
$$;
-- The statement must be refused (any error), with the given words in the message.
CREATE FUNCTION pg_temp.sq_refused(statement text, label text, words text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
 INSERT INTO pg_temp.sq_results VALUES(label, msg IS NOT NULL AND msg ILIKE '%'||words||'%', coalesce(msg,'accepted'));
END $$;
CREATE FUNCTION pg_temp.sq_ok(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN msg := SQLSTATE||': '||SQLERRM; END;
 INSERT INTO pg_temp.sq_results VALUES(label, msg IS NULL, msg);
END $$;
-- The events a family member sees for a child, as ids (the 8xx part).
CREATE FUNCTION pg_temp.sq_seen(child integer) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(id::text,3), ',' ORDER BY id), '') FROM public.child_events(pg_temp.sq(child))
$$;

-- Academy 100: coach 10 holds U14 (child 20, guardian 30) and U16 (child 21,
-- guardian 31). Coach 11 has a U14 of their own (child 22, guardian 32).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.sq(n),'synthetic-'||n||'@squads.invalid',now() FROM unnest(ARRAY[1,10,11,20,21,22,30,31,32]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.sq(1),'club','Admin'),(pg_temp.sq(10),'coach','Coach Two Squads'),(pg_temp.sq(11),'coach','Coach Other'),
 (pg_temp.sq(20),'player','Under Fourteen'),(pg_temp.sq(21),'player','Under Sixteen'),(pg_temp.sq(22),'player','Other Fourteen'),
 (pg_temp.sq(30),'parent','Guardian Fourteen'),(pg_temp.sq(31),'parent','Guardian Sixteen'),(pg_temp.sq(32),'parent','Guardian Other');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.sq(100),pg_temp.sq(1),'Squads Academy','SQ176A');
INSERT INTO public.academy_features(organization_id,feature) VALUES (pg_temp.sq(100),'events') ON CONFLICT DO NOTHING;
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.sq(10),pg_temp.sq(100)),(pg_temp.sq(11),pg_temp.sq(100));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.sq(20),current_date - interval '13 years 2 months'),(pg_temp.sq(21),current_date - interval '15 years 2 months'),
 (pg_temp.sq(22),current_date - interval '13 years 2 months');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.sq(20),pg_temp.sq(30)),(pg_temp.sq(21),pg_temp.sq(31)),(pg_temp.sq(22),pg_temp.sq(32));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.sq(40),pg_temp.sq(10),'Under Fourteen',pg_temp.sq(20),'U14'),
 (pg_temp.sq(41),pg_temp.sq(10),'Under Sixteen',pg_temp.sq(21),'U16'),
 (pg_temp.sq(42),pg_temp.sq(11),'Other Fourteen',pg_temp.sq(22),'U14');

-- 800 U14 training in 2 days; 801 whole roster in 3 days; 802 U14 training
-- that started an hour ago (for the register).
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published,squad) VALUES
 (pg_temp.sq(800),pg_temp.sq(10),'U14 training','training',now() + interval '2 days',(now() AT TIME ZONE 'Asia/Dubai' + interval '2 days')::date,(now() AT TIME ZONE 'Asia/Dubai')::time,true,'U14'),
 (pg_temp.sq(801),pg_temp.sq(10),'Both squads','training',now() + interval '3 days',(now() AT TIME ZONE 'Asia/Dubai' + interval '3 days')::date,(now() AT TIME ZONE 'Asia/Dubai')::time,true,NULL),
 (pg_temp.sq(802),pg_temp.sq(10),'U14 earlier','training',now() - interval '1 hour',(now() AT TIME ZONE 'Asia/Dubai' - interval '1 hour')::date,(now() AT TIME ZONE 'Asia/Dubai' - interval '1 hour')::time,true,'U14');

SET LOCAL ROLE authenticated;
SELECT pg_temp.sq_as(30);
SELECT public.record_parental_consent(pg_temp.sq(20),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
INSERT INTO pg_temp.sq_tokens SELECT 30, public.create_my_calendar_link();
SELECT pg_temp.sq_as(31);
SELECT public.record_parental_consent(pg_temp.sq(21),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
INSERT INTO pg_temp.sq_tokens SELECT 31, public.create_my_calendar_link();
SELECT pg_temp.sq_as(32);
SELECT public.record_parental_consent(pg_temp.sq(22),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');

-- ── 1. A squad is one of the coach's own ─────────────────────────────────
SELECT pg_temp.sq_as(10);
SELECT pg_temp.sq_refused(format('INSERT INTO public.coach_calendar_events(coach_user_id,title,event_type,starts_at,event_date,start_time,published,squad) VALUES(%L,%L,%L,now() + interval ''5 days'',(now() AT TIME ZONE ''Asia/Dubai'' + interval ''5 days'')::date,%L,false,%L)',
  pg_temp.sq(10),'Wrong squad','training','17:00','U18'),'1 an event for a squad the coach has no players in is refused','squad');
SELECT pg_temp.sq_ok(format('UPDATE public.coach_calendar_events SET squad=%L WHERE id=%L', 'U16', pg_temp.sq(801)),'1 the coach can set one of their own squads');
SELECT pg_temp.sq_ok(format('UPDATE public.coach_calendar_events SET squad=NULL WHERE id=%L', pg_temp.sq(801)),'1 and back to the whole roster');
SELECT pg_temp.sq_refused(format('INSERT INTO public.coach_sessions(coach_user_id,title,session_type,session_date,squad) VALUES(%L,%L,%L,current_date,%L)',
  pg_temp.sq(10),'Wrong squad','training','U18'),'1 a logged session for a squad the coach has no players in is refused','squad');

-- ── 2. The family's event list (child_events) ────────────────────────────
SELECT pg_temp.sq_as(30);
SELECT pg_temp.sq_check(pg_temp.sq_seen(20)='800,801,802','2 the U14 guardian sees the U14 events and the whole-roster one',pg_temp.sq_seen(20));
SELECT pg_temp.sq_as(20);
SELECT pg_temp.sq_check(pg_temp.sq_seen(20)='800,801,802','2 the U14 player sees the same',pg_temp.sq_seen(20));
SELECT pg_temp.sq_as(31);
SELECT pg_temp.sq_check(pg_temp.sq_seen(21)='801','2 the U16 guardian sees only the whole-roster event, no U14 one',pg_temp.sq_seen(21));
SELECT pg_temp.sq_as(32);
SELECT pg_temp.sq_check(pg_temp.sq_seen(22)='','2 another coach''s U14 family sees none of them',pg_temp.sq_seen(22));

-- ── 3. "Can't make it" ───────────────────────────────────────────────────
SELECT pg_temp.sq_as(31);
SELECT pg_temp.sq_refused(format('SELECT public.report_cant_make_it(%L,%L,NULL)',pg_temp.sq(800),pg_temp.sq(21)),'3 a U16 child on a U14 event is refused','not available');
SELECT pg_temp.sq_ok(format('SELECT public.report_cant_make_it(%L,%L,NULL)',pg_temp.sq(801),pg_temp.sq(21)),'3 a U16 child on a whole-roster event is fine');
SELECT pg_temp.sq_as(30);
SELECT pg_temp.sq_ok(format('SELECT public.report_cant_make_it(%L,%L,NULL)',pg_temp.sq(800),pg_temp.sq(20)),'3 a U14 child on the U14 event is fine');

-- ── 4. The register ──────────────────────────────────────────────────────
SELECT pg_temp.sq_as(10);
SELECT pg_temp.sq_refused(format('SELECT public.take_event_register(%L, ARRAY[%L]::uuid[])',pg_temp.sq(802),pg_temp.sq(41)),'4 a U16 player cannot be marked present at a U14 event','squad');
SELECT pg_temp.sq_ok(format('SELECT public.take_event_register(%L, ARRAY[%L]::uuid[])',pg_temp.sq(802),pg_temp.sq(40)),'4 a U14 player can');
RESET ROLE;
SELECT pg_temp.sq_check((SELECT squad FROM public.coach_sessions WHERE event_id=pg_temp.sq(802))='U14','4 the completed session keeps the event''s squad');

-- ── 5. The phone calendar ────────────────────────────────────────────────
SELECT pg_temp.sq_check((SELECT string_agg(right(e->>'id',3), ',' ORDER BY e->>'id') FROM jsonb_array_elements(public.calendar_feed_for_token((SELECT token FROM pg_temp.sq_tokens WHERE who=30))->'events') e)='800,801,802',
  '5 the U14 guardian''s calendar has the U14 events and the whole-roster one');
SELECT pg_temp.sq_check((SELECT string_agg(right(e->>'id',3), ',' ORDER BY e->>'id') FROM jsonb_array_elements(public.calendar_feed_for_token((SELECT token FROM pg_temp.sq_tokens WHERE who=31))->'events') e)='801',
  '5 the U16 guardian''s calendar has no U14 event');
SELECT pg_temp.sq_check((SELECT e->>'squadLabel' FROM jsonb_array_elements(public.calendar_feed_for_token((SELECT token FROM pg_temp.sq_tokens WHERE who=30))->'events') e WHERE right(e->>'id',3)='800')='U14',
  '5 a U14 event is labelled U14');

-- ── 6. Change emails and reminders ───────────────────────────────────────
SELECT pg_temp.sq_check((SELECT string_agg(right(user_id::text,2), ',' ORDER BY user_id) FROM trak_private.event_change_recipients(pg_temp.sq(800)))='20,30',
  '6 a U14 event emails the U14 family only', (SELECT string_agg(right(user_id::text,2), ',' ORDER BY user_id) FROM trak_private.event_change_recipients(pg_temp.sq(800))));
SELECT pg_temp.sq_check((SELECT string_agg(right(user_id::text,2), ',' ORDER BY user_id) FROM trak_private.event_change_recipients(pg_temp.sq(801)))='20,21,30,31',
  '6 a whole-roster event emails both squads, as today', (SELECT string_agg(right(user_id::text,2), ',' ORDER BY user_id) FROM trak_private.event_change_recipients(pg_temp.sq(801))));
SELECT pg_temp.sq_check(NOT EXISTS (SELECT 1 FROM trak_private.event_reminder_due((now() AT TIME ZONE 'Asia/Dubai' + interval '2 days')::date) d
  WHERE d.event_id = pg_temp.sq(800) AND d.user_id IN (pg_temp.sq(21), pg_temp.sq(31))), '6 no U16 reminder for the U14 event');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.sq_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.sq_results;
 IF failures IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='Event squads failed', DETAIL=failures; END IF;
 RAISE NOTICE 'Event squads: % checks passed', n;
END $$;
SELECT count(*) AS event_squads_checks_passed FROM pg_temp.sq_results;
ROLLBACK;
