-- @trak-suite mode=--games-lock in-all=true
-- TRAK-287 (Games 5/8, spec TRAK-282): locked at kick-off. Once a match's start has passed, the app can't change its
-- plan or line-up: a write one second before kick-off goes through, one second after is refused. The lock follows the
-- start, so moving the match later reopens editing. The operator can still correct a row. What wasn't shared stays
-- countable for the lock's note. Test people are named after footballers. Synthetic fixtures; rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing games-lock fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.g287id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92870000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE g287_results(label text, ok boolean);
GRANT SELECT, INSERT ON g287_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.g287actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.g287id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.g287check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.g287_results VALUES(label, ok IS TRUE)
$$;
-- True when the statement fails with exactly this SQLSTATE.
CREATE FUNCTION pg_temp.g287refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- How many rows a statement changed.
CREATE FUNCTION pg_temp.g287changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- Kick-off is `seconds` from now: negative has passed. Moved as the operator, as Schedule would move the match.
CREATE FUNCTION pg_temp.g287kickoff(seconds integer) RETURNS void LANGUAGE sql AS $$
 UPDATE public.coach_calendar_events SET starts_at = now() + make_interval(secs => seconds) WHERE id = pg_temp.g287id(500)
$$;
CREATE FUNCTION pg_temp.g287plan(goal text) RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.game_plans(event_id,goals) VALUES(%L,%L) ON CONFLICT (event_id) DO UPDATE SET goals=excluded.goals',
   pg_temp.g287id(500), jsonb_build_array(jsonb_build_object('title',goal,'looks_like','')))
$$;
CREATE FUNCTION pg_temp.g287job(job text) RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.game_plan_players(event_id,squad_player_id,role,slot,job) VALUES(%L,%L,%L,4,%L) ON CONFLICT (event_id,squad_player_id) DO UPDATE SET job=excluded.job',
   pg_temp.g287id(500), pg_temp.g287id(40), 'starter', job)
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Otto Rehhagel (10) coaches the U16 of an academy with Games; Theodoros Zagorakis (40) is on his roster, consented,
-- with Traianos Dellas (30) as his guardian. Match 500 is against Portugal.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.g287id(n),'synthetic-'||n||'@games287.invalid',now() FROM unnest(ARRAY[1,10,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.g287id(1),'club','Vassilis Tsiartas'),(pg_temp.g287id(10),'coach','Otto Rehhagel'),
 (pg_temp.g287id(20),'player','Theodoros Zagorakis'),(pg_temp.g287id(30),'parent','Traianos Dellas');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES(pg_temp.g287id(100),pg_temp.g287id(1),'Lock Academy','G287N1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES(pg_temp.g287id(10),pg_temp.g287id(100));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES(pg_temp.g287id(20), current_date - interval '14 years');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES(pg_temp.g287id(20),pg_temp.g287id(30));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.g287id(40),pg_temp.g287id(10),'Theodoros Zagorakis',pg_temp.g287id(20),'U16');
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,starts_at,start_time,published,squad) VALUES
 (pg_temp.g287id(500),pg_temp.g287id(10),'vs Portugal','match','Portugal','2054-11-07 15:00+00','19:00',true,'U16');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.g287id(100),'games');
SET LOCAL ROLE authenticated;
SELECT pg_temp.g287actor(30), public.record_parental_consent(pg_temp.g287id(20),'parent','{"coaching_records":true}'::jsonb,
  'synthetic-v1','Synthetic disposable consent.');
RESET ROLE;

-- ── 1. One second before kick-off, the plan is the coach's to change ───────
SELECT pg_temp.g287kickoff(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.g287actor(10);
SELECT pg_temp.g287check(pg_temp.g287changed(pg_temp.g287plan('Win the second ball'))=1
  AND pg_temp.g287changed(pg_temp.g287job('Stay tight to their winger.'))=1,
  '1 one second before kick-off, the coach saves the plan and a job');
SELECT pg_temp.g287check((SELECT public.share_game_plan(pg_temp.g287id(500),true))=1,'1 and shares it');
SELECT pg_temp.g287check(pg_temp.g287changed(pg_temp.g287job('Stay tight to their winger. Win your headers.'))=1,
  '1 then changes the job without sharing it');
RESET ROLE;

-- ── 2. One second after, nothing in the plan changes ──────────────────────
SELECT pg_temp.g287kickoff(-1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.g287actor(10);
SELECT pg_temp.g287check(pg_temp.g287refused(pg_temp.g287plan('Defend as a block'),'P0001'),
  '2 one second after kick-off, the goals are locked');
SELECT pg_temp.g287check(pg_temp.g287refused(pg_temp.g287job('Anything else'),'P0001'),
  '2 and so is a job');
SELECT pg_temp.g287check(pg_temp.g287refused(format('UPDATE public.game_plan_players SET expectation=%L, note=%L WHERE event_id=%L',
  'lead','Proud of you.',pg_temp.g287id(500)),'P0001'),
  '2 and an expectation or a note');
SELECT pg_temp.g287check(pg_temp.g287refused(format('UPDATE public.game_plans SET scouting=%L, strength=%L WHERE event_id=%L',
  'Their 9 is quick.','stronger',pg_temp.g287id(500)),'P0001'),
  '2 and scouting or how strong they are');
SELECT pg_temp.g287check((SELECT goals->0->>'title' FROM public.game_plans WHERE event_id=pg_temp.g287id(500))='Win the second ball'
  AND (SELECT job FROM public.game_plan_players WHERE event_id=pg_temp.g287id(500))='Stay tight to their winger. Win your headers.',
  '2 the plan reads as it was at kick-off');
SELECT pg_temp.g287check(pg_temp.g287refused(format('SELECT public.share_game_plan(%L,false)',pg_temp.g287id(500)),'P0001'),
  '2 nothing can be shared after kick-off');
SELECT pg_temp.g287check((SELECT array_agg(squad_player_id) FROM public.game_plan_changes(ARRAY[pg_temp.g287id(500)]))=ARRAY[pg_temp.g287id(40)],
  '2 the change that wasn''t shared still counts, for the lock''s note');
RESET ROLE;

-- ── 3. The operator can still correct a row ────────────────────────────────
SELECT pg_temp.g287check(pg_temp.g287changed(format('UPDATE public.game_plan_players SET job=%L WHERE event_id=%L',
  'Stay tight to their winger.',pg_temp.g287id(500)))=1,
  '3 after kick-off, the operator (no app session) can still correct a job');

-- ── 4. Moving the match later reopens the plan ────────────────────────────
SELECT pg_temp.g287kickoff(86400);
SET LOCAL ROLE authenticated;
SELECT pg_temp.g287actor(10);
SELECT pg_temp.g287check(pg_temp.g287changed(pg_temp.g287plan('Defend as a block'))=1
  AND pg_temp.g287changed(pg_temp.g287job('Stay tight to their winger. Shout early.'))=1,
  '4 moved to tomorrow, the coach can change the plan again');
RESET ROLE;

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.g287_results;
 IF total <> 12 THEN RAISE EXCEPTION 'Games lock: % checks ran; expected 12', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.g287_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Games lock checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Games lock: % of % passed', total, total;
END $$;
ROLLBACK;
