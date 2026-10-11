-- @trak-suite mode=--event-overlap in-all=true
-- TRAK-158 (J8.4), from the 11 Oct live run: a match 17:00-18:30 and a
-- training 18:00-19:30 on the same Friday were both published, and nothing
-- warned the coach. Rule (Kostas, 11 Oct): a published, not cancelled event
-- can't overlap another of the same coach's on the same Dubai day. Drafts may
-- (still planning); back-to-back is fine; a start with no end counts as 90
-- minutes; an event with no start time can't be checked until it has one.
-- Checked on publish and on any change to a live event's day or times, in the
-- database, so a second phone or a series save can't skip it.
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing event-overlap fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.o158id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('91580000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE o158_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON o158_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.o158actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.o158id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.o158check(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.o158_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must succeed.
CREATE FUNCTION pg_temp.o158ok(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.o158_results VALUES(label, st IS NULL, coalesce(st||': '||msg,'ok'));
END $$;
-- The statement must fail with P0001 and this message (a LIKE pattern).
CREATE FUNCTION pg_temp.o158clash(statement text, label text, message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.o158_results VALUES(label, st = 'P0001' AND msg LIKE message, coalesce(st||': '||msg,'no error'));
END $$;
CREATE FUNCTION pg_temp.o158day(k integer) RETURNS date LANGUAGE sql AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date + k
$$;
-- An insert of one of coach A's events on day +5 (or another day), as the app writes it.
CREATE FUNCTION pg_temp.o158event(n integer, title text, kind text, starts time, ends time, published boolean, k integer DEFAULT 5)
RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,end_time,published) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L)',
   pg_temp.o158id(n), pg_temp.o158id(10), title, kind,
   (pg_temp.o158day(k) + coalesce(starts, time '00:00')) AT TIME ZONE 'Asia/Dubai', pg_temp.o158day(k), starts, ends, published)
$$;
SET LOCAL check_function_bodies = off;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy X (100): coach A (10), coach B (11).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.o158id(n), 'synthetic-'||n||'@overlap158.invalid', now() FROM unnest(ARRAY[1,10,11]) n;
INSERT INTO public.profiles(user_id,role,full_name)
 SELECT pg_temp.o158id(n), CASE WHEN n = 1 THEN 'club' ELSE 'coach' END::public.user_role, 'Synthetic '||n
 FROM unnest(ARRAY[1,10,11]) n;
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.o158id(100),pg_temp.o158id(1),'Overlap Academy X','O158X1');
INSERT INTO public.coach_details(user_id,organization_id,team) VALUES
 (pg_temp.o158id(10),pg_temp.o158id(100),'U15'),(pg_temp.o158id(11),pg_temp.o158id(100),'U17');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.o158id(100),'events');

SET LOCAL ROLE authenticated;
SELECT pg_temp.o158actor(10);

-- ── 1. The live run's Friday ───────────────────────────────────────────────
SELECT pg_temp.o158ok(pg_temp.o158event(700,'vs Palm United','match','17:00','18:30',true),'1 the match is published');
SELECT pg_temp.o158ok(pg_temp.o158event(701,'Technical','training','18:00','19:30',false),'1 an overlapping draft saves: the coach is still planning');
SELECT pg_temp.o158clash(format('UPDATE public.coach_calendar_events SET published = true WHERE id = %L', pg_temp.o158id(701)),
 '1 publishing it is refused, naming the clash',
 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.');
SELECT pg_temp.o158clash(pg_temp.o158event(702,'Fitness','training','18:00','19:30',true),
 '1 so is saving it published straight away',
 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.');

-- ── 2. What isn't a clash ──────────────────────────────────────────────────
SELECT pg_temp.o158ok(pg_temp.o158event(709,'vs Late Rovers','match','17:00','18:30',true,7),'2 another day: a match to 18:30');
SELECT pg_temp.o158ok(pg_temp.o158event(710,'Recovery','training','18:30','19:30',true,7),'2 back-to-back is fine (18:30 after a match ending 18:30)');
SELECT pg_temp.o158ok(pg_temp.o158event(714,'Warm-up','training','16:00','17:00',true,7),'2 and the other way (a session ending 17:00 as the match starts)');
SELECT pg_temp.o158ok(pg_temp.o158event(711,'Team photo','other',NULL,NULL,true),'2 an event with no start time is not checked (Time not set yet)');
SELECT pg_temp.o158ok(pg_temp.o158event(712,'Technical','training','18:00','19:30',true,6),'2 the same time on another day is fine');
SELECT pg_temp.o158actor(11);
SELECT pg_temp.o158ok(replace(pg_temp.o158event(713,'B training','training','17:00','18:30',true), pg_temp.o158id(10)::text, pg_temp.o158id(11)::text),
 '2 another coach at the same time is fine');
SELECT pg_temp.o158actor(10);

-- ── 3. No end time counts as 90 minutes ────────────────────────────────────
SELECT pg_temp.o158clash(pg_temp.o158event(720,'Warm-up','other','16:00',NULL,true),
 '3 a 16:00 start with no end runs to 17:30, into the match',
 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.');
SELECT pg_temp.o158ok(pg_temp.o158event(721,'Early session','training','15:00',NULL,true),'3 a 15:00 start with no end ends 16:30: fine');

-- ── 4. Edits of a live event ───────────────────────────────────────────────
SELECT pg_temp.o158clash(format('UPDATE public.coach_calendar_events SET start_time = %L, end_time = %L WHERE id = %L', '18:00', '19:00', pg_temp.o158id(721)),
 '4 moving a published event into the match is refused',
 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.');
SELECT pg_temp.o158clash(format('UPDATE public.coach_calendar_events SET event_date = %L WHERE id = %L', pg_temp.o158day(5), pg_temp.o158id(712)),
 '4 so is moving it to the clashing day (a series week keeps its time)',
 'This overlaps vs Palm United, 17:00–18:30. Change the time or cancel one.');
SELECT pg_temp.o158ok(format('UPDATE public.coach_calendar_events SET status = %L WHERE id = %L', 'cancelled', pg_temp.o158id(700)),
 '4 the match is cancelled');
SELECT pg_temp.o158ok(format('UPDATE public.coach_calendar_events SET published = true WHERE id = %L', pg_temp.o158id(701)),
 '4 now the training publishes: a cancelled event doesn''t block');
SELECT pg_temp.o158clash(format('UPDATE public.coach_calendar_events SET status = %L WHERE id = %L', 'scheduled', pg_temp.o158id(700)),
 '4 and the match can''t come back over it',
 'This overlaps Technical, 18:00–19:30. Change the time or cancel one.');

-- ── 5. A clash from before this rule doesn't block other edits ─────────────
RESET ROLE;
SET LOCAL session_replication_role = replica;  -- fixtures only: insert an old clash past the triggers
INSERT INTO public.coach_calendar_events(id,coach_user_id,organization_id,title,event_type,starts_at,event_date,start_time,end_time,published)
 VALUES (pg_temp.o158id(730),pg_temp.o158id(10),pg_temp.o158id(100),'Old A','training',(pg_temp.o158day(8) + time '17:00') AT TIME ZONE 'Asia/Dubai',pg_temp.o158day(8),'17:00','18:30',true),
        (pg_temp.o158id(731),pg_temp.o158id(10),pg_temp.o158id(100),'Old B','training',(pg_temp.o158day(8) + time '18:00') AT TIME ZONE 'Asia/Dubai',pg_temp.o158day(8),'18:00','19:30',true);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.o158actor(10);
SELECT pg_temp.o158ok(format('UPDATE public.coach_calendar_events SET venue = %L WHERE id = %L', 'Pitch 4', pg_temp.o158id(731)),
 '5 an old clash: a venue change still saves (nothing about when changed)');
SELECT pg_temp.o158ok(format('UPDATE public.coach_calendar_events SET status = %L WHERE id = %L', 'cancelled', pg_temp.o158id(731)),
 '5 and either one can be cancelled');

-- ── 6. Two drafts published together can't clash with each other ──────────
SELECT pg_temp.o158ok(pg_temp.o158event(740,'Drill A','training','17:00','18:00',false,9),'6 draft A');
SELECT pg_temp.o158ok(pg_temp.o158event(741,'Drill B','training','17:30','18:30',false,9),'6 draft B, overlapping A');
SELECT pg_temp.o158check((SELECT count(*) = 1 FROM pg_proc WHERE proname = 'refuse_event_overlap'), '6 the rule exists');
SELECT pg_temp.o158clash(format('UPDATE public.coach_calendar_events SET published = true WHERE id IN (%L, %L)', pg_temp.o158id(740), pg_temp.o158id(741)),
 '6 publishing both in one save is refused',
 'This overlaps Drill _, %. Change the time or cancel one.');
RESET ROLE;
SELECT pg_temp.o158check((SELECT bool_and(NOT published) FROM public.coach_calendar_events WHERE id IN (pg_temp.o158id(740), pg_temp.o158id(741))),
 '6 readback: neither was published');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.o158_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.o158_results;
 IF n <> 24 THEN
  RAISE EXCEPTION 'Event overlap: % checks ran; expected exactly 24', n;
 END IF;
 IF failures IS NOT NULL THEN
  RAISE EXCEPTION USING MESSAGE='Event overlap failed',DETAIL=failures;
 END IF;
END $$;
ROLLBACK;
