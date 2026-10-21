-- @trak-suite mode=--started-event-locked in-all=true
-- TRAK-230 (J8, 20 Oct live run, S4/S7; Kostas 21 Oct, option A): once an
-- event has started, what families were told is fixed. The coach can't change
-- its details or cancel it; publishing a draft is still allowed (the rehearsal
-- runs registers on events started earlier today). An event with no start time
-- locks when its day is over. The register and the match log are other tables
-- and stay open (TRAK-185). The operator can still correct a row (TRAK-184).
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing started-event fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.l230id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92300000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE l230_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON l230_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.l230actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.l230id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.l230ok(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text; n integer;
BEGIN
 BEGIN EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.l230_results VALUES(label, coalesce(st IS NULL AND n = 1, false), coalesce(st||': '||msg, n||' rows'));
END $$;
CREATE FUNCTION pg_temp.l230locked(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.l230_results VALUES(label,
   coalesce(st = 'P0001' AND msg = 'This event has started, so it can''t be changed. Use its register or match log instead.', false),
   coalesce(st||': '||msg,'no error'));
END $$;
CREATE FUNCTION pg_temp.l230day(k integer) RETURNS date LANGUAGE sql AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date + k
$$;
CREATE FUNCTION pg_temp.l230upd(n integer, sets text) RETURNS text LANGUAGE sql AS $$
 SELECT format('UPDATE public.coach_calendar_events SET %s WHERE id = %L', sets, pg_temp.l230id(n))
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy (100, Dubai clock), coach A (10). Events: 800 yesterday 17:00
-- published (started); 801 in 5 days published; 802 yesterday 10:00 draft;
-- 804 today, no time (old row); 805 yesterday, no time (old row).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.l230id(n), 'synthetic-'||n||'@locked230.invalid', now() FROM unnest(ARRAY[1,10]) n;
INSERT INTO public.profiles(user_id,role,full_name)
 SELECT pg_temp.l230id(n), CASE WHEN n = 1 THEN 'club' ELSE 'coach' END::public.user_role, 'Synthetic '||n
 FROM unnest(ARRAY[1,10]) n;
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.l230id(100),pg_temp.l230id(1),'Locked Academy','L230X1');
INSERT INTO public.coach_details(user_id,organization_id,team) VALUES (pg_temp.l230id(10),pg_temp.l230id(100),'U15');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.l230id(100),'events') ON CONFLICT DO NOTHING;
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,end_time,venue,published)
SELECT pg_temp.l230id(n), pg_temp.l230id(10), t, 'training', (pg_temp.l230day(k) + s) AT TIME ZONE 'Asia/Dubai',
       pg_temp.l230day(k), s, s + interval '90 minutes', 'Main Pitch', p
FROM (VALUES (800,'Finishing',-1,time '17:00',true),(801,'Pressing',5,time '17:00',true),(802,'Shape',-1,time '10:00',false)) v(n,t,k,s,p);
-- Old untimed rows, as they were made before TRAK-157 refused them.
SET LOCAL session_replication_role = replica;
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,venue,published,organization_id)
SELECT pg_temp.l230id(n), pg_temp.l230id(10), t, 'training', (pg_temp.l230day(k) + time '00:00') AT TIME ZONE 'Asia/Dubai',
       pg_temp.l230day(k), NULL, 'Main Pitch', true, pg_temp.l230id(100)
FROM (VALUES (804,'Recovery',0),(805,'Gym',-1)) v(n,t,k);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT pg_temp.l230actor(10);

-- ── 1. Before it starts, everything still changes ──────────────────────────
SELECT pg_temp.l230ok(pg_temp.l230upd(801, $s$venue = 'Second Pitch'$s$), '1 CONTROL an upcoming event''s venue changes');
SELECT pg_temp.l230ok(pg_temp.l230upd(801, $s$start_time = '16:00', end_time = '17:30'$s$), '1 CONTROL and its time');

-- ── 2. Once it has started, nothing families were told changes ─────────────
SELECT pg_temp.l230locked(pg_temp.l230upd(800, $s$venue = 'Second Pitch'$s$), '2 a started event''s venue is fixed');
SELECT pg_temp.l230locked(pg_temp.l230upd(800, $s$start_time = '18:00', end_time = '19:30'$s$), '2 so is its time');
SELECT pg_temp.l230locked(pg_temp.l230upd(800, $s$event_date = event_date + 7$s$), '2 and its day');
SELECT pg_temp.l230locked(pg_temp.l230upd(800, $s$title = 'Renamed', kit = 'Red', family_note = 'Bring water'$s$), '2 and its title, kit and note');
SELECT pg_temp.l230locked(pg_temp.l230upd(800, $s$status = 'cancelled', cancel_reason = 'Rain'$s$), '2 and it can''t be cancelled after the fact');
SELECT pg_temp.l230ok(pg_temp.l230upd(800, $s$venue = venue$s$), '2 CONTROL saving it unchanged is no change');

-- ── 3. Publishing a started draft still works ──────────────────────────────
SELECT pg_temp.l230ok(pg_temp.l230upd(802, $s$published = true$s$), '3 a draft whose time has passed can still be published (S7 runs its register)');
SELECT pg_temp.l230locked(pg_temp.l230upd(802, $s$venue = 'Second Pitch'$s$), '3 but once started, published or not, its details are fixed');

-- ── 4. No start time: locked when its day is over ──────────────────────────
SELECT pg_temp.l230ok(pg_temp.l230upd(804, $s$venue = 'Second Pitch'$s$), '4 an untimed event today still changes');
SELECT pg_temp.l230locked(pg_temp.l230upd(805, $s$venue = 'Second Pitch'$s$), '4 an untimed event from yesterday is fixed');

-- ── 5. The operator can still correct a row ────────────────────────────────
RESET ROLE;
SELECT pg_temp.l230ok(pg_temp.l230upd(800, $s$venue = 'Municipal Ground'$s$), '5 the operator corrects a started event (as TRAK-184 did)');

DO $$ DECLARE failures text; total integer;
BEGIN
  SELECT count(*) INTO total FROM pg_temp.l230_results;
  IF total <> 13 THEN RAISE EXCEPTION 'Started-event lock: % checks ran; expected 13', total; END IF;
  SELECT string_agg(label || ' [' || coalesce(detail, '') || ']', E'\n') INTO failures FROM pg_temp.l230_results WHERE NOT ok;
  IF failures IS NOT NULL THEN RAISE EXCEPTION 'Started-event lock checks failed:%', E'\n' || failures; END IF;
  RAISE NOTICE 'Started-event lock: % of % passed', total, total;
END $$;
ROLLBACK;
