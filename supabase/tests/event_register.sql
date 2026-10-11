-- @trak-suite mode=--event-register in-all=true
-- TRAK-138 (J8.15): after the event, the coach's register becomes the
-- completed session. take_event_register() runs as the coach (SECURITY
-- INVOKER), so the J4 write path's own rules apply: the coach's sessions only,
-- attendance only for their current squad, and never for a child whose
-- consent isn't active (G1). One session per event, whatever the number of
-- saves; a re-save makes attendance exactly the list sent. Only a published
-- event that went ahead and has happened (TRAK-67); a match goes through the
-- match log. Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing event-register fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.g138id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('91380000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
-- A player's squad row, as the screen sends it.
CREATE FUNCTION pg_temp.g138sp(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.g138id(n + 20) $$;
CREATE TEMP TABLE g138_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON g138_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.g138actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.g138id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.g138check(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.g138_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must fail with exactly this SQLSTATE, and its message must contain the text.
CREATE FUNCTION pg_temp.g138refused(statement text, label text, expected text, words text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.g138_results VALUES(label, st IS NOT DISTINCT FROM expected AND coalesce(msg,'') ILIKE '%'||words||'%', coalesce(st||': '||msg,'no error'));
END $$;
CREATE FUNCTION pg_temp.g138day(k integer) RETURNS date LANGUAGE sql AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date + k
$$;
SET LOCAL check_function_bodies = off;
-- A session's attendance, by player number.
CREATE FUNCTION pg_temp.g138present(n integer) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg((right(a.squad_player_id::text, 2)::integer - 20)::text, ',' ORDER BY a.squad_player_id), 'none')
 FROM public.session_attendance a JOIN public.coach_sessions s ON s.id = a.session_id
 WHERE s.event_id = pg_temp.g138id(n)
$$;
CREATE FUNCTION pg_temp.g138register(n integer, players integer[]) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.take_event_register(%L, ARRAY[%s]::uuid[])', pg_temp.g138id(n),
   coalesce((SELECT string_agg(quote_literal(pg_temp.g138sp(p)), ',') FROM unnest(players) p), ''))
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy X (100): coach A (10), coach B (11). On A's squad: 20 and 21
-- (consented), 22 (consent withdrawn). On B's squad: 23. Parent 30 of 20.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.g138id(n), 'synthetic-'||n||'@register138.invalid', now()
 FROM unnest(ARRAY[1,10,11,20,21,22,23,30]) n;
INSERT INTO public.profiles(user_id,role,full_name)
 SELECT pg_temp.g138id(n),
  CASE WHEN n = 1 THEN 'club' WHEN n IN (10,11) THEN 'coach' WHEN n BETWEEN 20 AND 29 THEN 'player' ELSE 'parent' END::public.user_role,
  'Synthetic '||n
 FROM unnest(ARRAY[1,10,11,20,21,22,23,30]) n;
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.g138id(100),pg_temp.g138id(1),'Register Academy X','G138X1');
INSERT INTO public.coach_details(user_id,organization_id,team) VALUES
 (pg_temp.g138id(10),pg_temp.g138id(100),'U15'),(pg_temp.g138id(11),pg_temp.g138id(100),'U17');
INSERT INTO public.player_details(user_id,date_of_birth)
 SELECT pg_temp.g138id(n), current_date - interval '10 years' FROM unnest(ARRAY[20,21,22,23]) n;
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.g138id(20),pg_temp.g138id(30)),(pg_temp.g138id(21),pg_temp.g138id(30)),
 (pg_temp.g138id(22),pg_temp.g138id(30)),(pg_temp.g138id(23),pg_temp.g138id(30));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id)
 SELECT pg_temp.g138sp(n), pg_temp.g138id(CASE WHEN n = 23 THEN 11 ELSE 10 END), 'Synthetic '||n, pg_temp.g138id(n)
 FROM unnest(ARRAY[20,21,22,23]) n;
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.g138id(100),'events');
-- A's events: 800 training 2 days ago; 801 "other" yesterday; 802 training
-- tomorrow; 803 cancelled 2 days ago; 804 a draft 2 days ago; 805 a match 2
-- days ago (at 15:00: a coach's live events can't overlap, TRAK-158); 806 a
-- training an hour from now. B's 810, 2 days ago.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,venue,published,status)
 SELECT pg_temp.g138id(id), pg_temp.g138id(coach), 'Register '||id, kind,
  (pg_temp.g138day(d) + CASE WHEN id = 805 THEN time '15:00' ELSE time '17:00' END) AT TIME ZONE 'Asia/Dubai', pg_temp.g138day(d),
  CASE WHEN id = 805 THEN time '15:00' ELSE time '17:00' END, 'Pitch 2', pub, st
 FROM (VALUES (800,10,'training',-2,true,'scheduled'),(801,10,'other',-1,true,'scheduled'),
              (802,10,'training',1,true,'scheduled'),(803,10,'training',-2,true,'cancelled'),
              (804,10,'training',-2,false,'scheduled'),(805,10,'match',-2,true,'scheduled'),
              (810,11,'training',-2,true,'scheduled')) v(id,coach,kind,d,pub,st);
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published)
 SELECT pg_temp.g138id(806), pg_temp.g138id(10), 'Register 806', 'training', now() + interval '1 hour',
  ((now() + interval '1 hour') AT TIME ZONE 'Asia/Dubai')::date, ((now() + interval '1 hour') AT TIME ZONE 'Asia/Dubai')::time, true;
-- 807 started two hours ago on the coach's Dubai clock.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published)
 SELECT pg_temp.g138id(807), pg_temp.g138id(10), 'Register 807', 'training', now() - interval '2 hours',
  ((now() - interval '2 hours') AT TIME ZONE 'Asia/Dubai')::date, ((now() - interval '2 hours') AT TIME ZONE 'Asia/Dubai')::time, true;

SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(30);
SELECT public.record_parental_consent(pg_temp.g138id(c),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.')
 FROM unnest(ARRAY[20,21,22,23]) c;
SELECT public.withdraw_parental_consent(pg_temp.g138id(22));

-- ── 1. The register becomes the completed session, once ──────────────────
SELECT pg_temp.g138actor(10);
SELECT pg_temp.g138check((SELECT public.take_event_register(pg_temp.g138id(800), ARRAY[pg_temp.g138sp(20), pg_temp.g138sp(21)])) IS NOT NULL,
 '1 coach A takes the register of a past training');
RESET ROLE;
SELECT pg_temp.g138check((SELECT count(*) = 1 AND bool_and(s.session_type = 'training' AND s.session_date = pg_temp.g138day(-2)
   AND s.title = 'Register 800' AND s.venue = 'Pitch 2' AND s.coach_user_id = pg_temp.g138id(10))
  FROM public.coach_sessions s WHERE s.event_id = pg_temp.g138id(800)),
 '1 readback: one session, the event''s type, date, title and venue, the coach''s');
SELECT pg_temp.g138check(pg_temp.g138present(800) = '20,21','1 readback: those two are present',pg_temp.g138present(800));
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(10);
CREATE TEMP TABLE g138_first AS SELECT id FROM public.coach_sessions WHERE event_id = pg_temp.g138id(800);
SELECT pg_temp.g138check((SELECT public.take_event_register(pg_temp.g138id(800), ARRAY[pg_temp.g138sp(20)])) = (SELECT id FROM g138_first),
 '1 saving again returns the same session');
RESET ROLE;
SELECT pg_temp.g138check((SELECT count(*) FROM public.coach_sessions WHERE event_id = pg_temp.g138id(800)) = 1
  AND pg_temp.g138present(800) = '20','1 readback: still one session; attendance is exactly the new list',pg_temp.g138present(800));
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(10);
SELECT public.take_event_register(pg_temp.g138id(800), ARRAY[pg_temp.g138sp(20), pg_temp.g138sp(21)]);
SELECT pg_temp.g138check(pg_temp.g138present(800) = '20,21','1 a player marked present again is back, once',pg_temp.g138present(800));
SELECT public.take_event_register(pg_temp.g138id(801), ARRAY[pg_temp.g138sp(21)]);
RESET ROLE;
SELECT pg_temp.g138check((SELECT session_type = 'other' FROM public.coach_sessions WHERE event_id = pg_temp.g138id(801)),
 '1 an "other" event becomes an "other" session');
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(10);
SELECT public.take_event_register(pg_temp.g138id(801), ARRAY[pg_temp.g138sp(20), pg_temp.g138sp(20)]);
SELECT pg_temp.g138check((SELECT public.take_event_register(pg_temp.g138id(807), ARRAY[pg_temp.g138sp(20)])) IS NOT NULL,
 '2 the register opens once the event has started on the Dubai clock, not hours later');
RESET ROLE;
SELECT pg_temp.g138check((SELECT count(*) FROM public.session_attendance a JOIN public.coach_sessions s ON s.id = a.session_id
  WHERE s.event_id = pg_temp.g138id(801) AND a.squad_player_id = pg_temp.g138sp(20)) = 1,
 '1 a player sent twice is recorded once');

-- ── 2. Only an event that went ahead, has happened, and isn't a match ────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(10);
SELECT pg_temp.g138refused(pg_temp.g138register(802, ARRAY[20]),'2 a future event has no register (TRAK-67)','P0001','once the event has started');
SELECT pg_temp.g138refused(pg_temp.g138register(806, ARRAY[20]),'2 nor one that starts later today','P0001','once the event has started');
SELECT pg_temp.g138refused(pg_temp.g138register(803, ARRAY[20]),'2 a cancelled event has no register','P0001','cancelled');
SELECT pg_temp.g138refused(pg_temp.g138register(804, ARRAY[20]),'2 a draft has no register','P0001','published');
SELECT pg_temp.g138refused(pg_temp.g138register(805, ARRAY[20]),'2 a match is recorded in the match log','P0001','match log');
SELECT pg_temp.g138refused(pg_temp.g138register(810, ARRAY[23]),'2 another coach''s event is not on this schedule','P0001','not on your schedule');

-- ── 3. The J4 write path's rules hold (G1) ───────────────────────────────
SELECT pg_temp.g138refused(pg_temp.g138register(800, ARRAY[20, 22]),'3 a child whose consent was withdrawn cannot be marked present','P0001','Waiting for parent');
SELECT pg_temp.g138refused(pg_temp.g138register(800, ARRAY[20, 23]),'3 another coach''s player cannot be marked present','42501','');
RESET ROLE;
SELECT pg_temp.g138check(pg_temp.g138present(800) = '20,21','3 readback: a refused save changed nothing',pg_temp.g138present(800));
SELECT pg_temp.g138refused(format('INSERT INTO public.coach_sessions(coach_user_id,title,session_type,session_date,event_id) VALUES (%L,''Twin'',''training'',%L,%L)',
  pg_temp.g138id(10), pg_temp.g138day(-2), pg_temp.g138id(800)),'3 the table itself holds one session per event','23505','');
-- Tarek's #272 note: FK checks skip RLS, so without a rule of its own a coach
-- who knew another coach's event id could hang a session on it, and that
-- coach's register would find a session that isn't theirs.
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(10);
SELECT pg_temp.g138refused(format('INSERT INTO public.coach_sessions(coach_user_id,title,session_type,session_date,event_id) VALUES (%L,''Borrowed'',''training'',%L,%L)',
  pg_temp.g138id(10), pg_temp.g138day(-2), pg_temp.g138id(810)),'3 a coach cannot attach a session to another coach''s event','42501','row-level security');
SELECT pg_temp.g138refused(format('UPDATE public.coach_sessions SET event_id = %L WHERE event_id = %L', pg_temp.g138id(810), pg_temp.g138id(801)),
 '3 nor move one of their sessions onto it','42501','row-level security');
SELECT pg_temp.g138refused(format('INSERT INTO public.coach_sessions(coach_user_id,title,session_type,session_date) VALUES (%L,''Logged by hand'',''training'',%L)',
  pg_temp.g138id(10), pg_temp.g138day(-3)),'3 a session with no event still saves as before (J4)',NULL,'');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.g138actor(30);
SELECT pg_temp.g138refused(pg_temp.g138register(800, ARRAY[20]),'3 a parent who can read the event still cannot take its register','P0001','not on your schedule');
RESET ROLE;
SELECT pg_temp.g138check(
  NOT has_function_privilege('anon', 'public.take_event_register(uuid, uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.take_event_register(uuid, uuid[])', 'EXECUTE')
  AND (SELECT NOT prosecdef FROM pg_proc WHERE oid = 'public.take_event_register(uuid, uuid[])'::regprocedure),
 '3 signed-in only, and it runs as the caller so the J4 policies apply');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.g138_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.g138_results;
 IF n <> 24 THEN
  RAISE EXCEPTION 'Event register: % checks ran; expected exactly 24', n;
 END IF;
 IF failures IS NOT NULL THEN
  RAISE EXCEPTION USING MESSAGE='Event register failed',DETAIL=failures;
 END IF;
 RAISE NOTICE 'Event register: % checks passed',n;
END $$;
SELECT count(*) AS event_register_checks_passed FROM pg_temp.g138_results;
ROLLBACK;
