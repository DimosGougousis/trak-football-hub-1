-- @trak-suite mode=--games-started-instead in-all=true
-- TRAK-519 (Imad, 20 and 21 Nov): a starter who didn't show is unticked, and the player who started in their place is
-- ticked instead. The draft keeps who started in whose place; only a player who played and wasn't a starter can, for a
-- starter of the plan who didn't play, one each. Publishing logs that player at the no-show's line, and the no-show
-- gets nothing. Test people are named after footballers. Synthetic fixtures; rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing games-started-instead fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.s519id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95190000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE s519_results(label text, ok boolean);
GRANT SELECT, INSERT ON s519_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.s519actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.s519id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.s519check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.s519_results VALUES(label, ok IS TRUE)
$$;
-- True when the statement fails with exactly this SQLSTATE.
CREATE FUNCTION pg_temp.s519refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- True when the statement runs; the harness prints why when it doesn't.
CREATE FUNCTION pg_temp.s519runs(statement text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE statement; RETURN true;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 's519runs: % (%)', SQLERRM, SQLSTATE; RETURN false;
END $$;
-- One player as the app sends them: played, and who they started in place of.
CREATE FUNCTION pg_temp.s519p(n integer, played boolean, started_for integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('id', pg_temp.s519id(n), 'played', played,
   'started_for', CASE WHEN started_for IS NOT NULL THEN pg_temp.s519id(started_for) END)
   || CASE WHEN played THEN '{"against_expectation":"met"}'::jsonb ELSE '{}'::jsonb END
$$;
-- A 0–0 draft of match 500 with these players, as a statement to run.
CREATE FUNCTION pg_temp.s519save(players jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.save_game_evaluation(%L::uuid, 0, 0, %L::jsonb, %L, %L::text[], %L::jsonb)',
   pg_temp.s519id(500), '[]', '', '{}', players)
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Otto Rehhagel (10) coaches the U16. In match 500 (two days ago, 4-4-2) Antonios Nikopolidis (40) starts in goal
-- (slot 1) and Angelos Basinas (41) in midfield (slot 6); Giorgos Karagounis (42, an attacker by profile) and Kostas
-- Katsouranis (43) are on the bench. Each has a guardian who consented. Nikopolidis didn't show; Karagounis started.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.s519id(n),'synthetic-'||n||'@started519.invalid',now() FROM unnest(ARRAY[1,10,20,21,22,23,30,31,32,33]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.s519id(1),'club','Vassilis Tsiartas'),(pg_temp.s519id(10),'coach','Otto Rehhagel'),
 (pg_temp.s519id(20),'player','Antonios Nikopolidis'),(pg_temp.s519id(21),'player','Angelos Basinas'),
 (pg_temp.s519id(22),'player','Giorgos Karagounis'),(pg_temp.s519id(23),'player','Kostas Katsouranis'),
 (pg_temp.s519id(30),'parent','Traianos Dellas'),(pg_temp.s519id(31),'parent','Michalis Kapsis'),
 (pg_temp.s519id(32),'parent','Giourkas Seitaridis'),(pg_temp.s519id(33),'parent','Stelios Giannakopoulos');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES(pg_temp.s519id(100),pg_temp.s519id(1),'Started Instead Academy','S519N1');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.s519id(100),'games') ON CONFLICT DO NOTHING;
INSERT INTO public.coach_details(user_id,organization_id) VALUES(pg_temp.s519id(10),pg_temp.s519id(100));
INSERT INTO public.player_details(user_id,date_of_birth) SELECT pg_temp.s519id(n), current_date - interval '14 years' FROM unnest(ARRAY[20,21,22,23]) n;
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) SELECT pg_temp.s519id(c), pg_temp.s519id(c + 10) FROM unnest(ARRAY[20,21,22,23]) c;
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group,position) VALUES
 (pg_temp.s519id(40),pg_temp.s519id(10),'Antonios Nikopolidis',pg_temp.s519id(20),'U16','Goalkeeper'),
 (pg_temp.s519id(41),pg_temp.s519id(10),'Angelos Basinas',pg_temp.s519id(21),'U16','Midfielder'),
 (pg_temp.s519id(42),pg_temp.s519id(10),'Giorgos Karagounis',pg_temp.s519id(22),'U16','Attacker'),
 (pg_temp.s519id(43),pg_temp.s519id(10),'Kostas Katsouranis',pg_temp.s519id(23),'U16','Midfielder');
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,home_away,starts_at,start_time,published,squad,competition) VALUES
 (pg_temp.s519id(500),pg_temp.s519id(10),'vs Czechia','match','Czechia','away',now() - interval '2 days','19:00',true,'U16','league');
-- The plan as it locked at kick-off (written as the operator: the app can't touch it after kick-off).
INSERT INTO public.game_plans(event_id,strength,scouting,goals,formation) VALUES(pg_temp.s519id(500),'similar','','[]','4-4-2');
INSERT INTO public.game_plan_players(event_id,squad_player_id,role,slot,job,note,context,expectation) VALUES
 (pg_temp.s519id(500),pg_temp.s519id(40),'starter',1,'','','{}','usual'),
 (pg_temp.s519id(500),pg_temp.s519id(41),'starter',6,'','','{}','usual'),
 (pg_temp.s519id(500),pg_temp.s519id(42),'bench',NULL,'','','{}','usual'),
 (pg_temp.s519id(500),pg_temp.s519id(43),'bench',NULL,'','','{}','usual');
SET LOCAL ROLE authenticated;
SELECT pg_temp.s519actor(g), public.record_parental_consent(pg_temp.s519id(c),'parent','{"coaching_records":true}'::jsonb,
  'synthetic-v1','Synthetic disposable consent.') FROM (VALUES (30,20),(31,21),(32,22),(33,23)) AS consent(g,c);

-- ── 1. Who can start in whose place ────────────────────────────────────────
SELECT pg_temp.s519actor(10);
SELECT pg_temp.s519check(pg_temp.s519refused(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,false),pg_temp.s519p(41,true,40))),'P0001'),
  '1 a starter can''t also start in another starter''s place');
SELECT pg_temp.s519check(pg_temp.s519refused(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,true),pg_temp.s519p(42,true,40))),'P0001'),
  '1 nobody starts in place of a starter who played');
SELECT pg_temp.s519check(pg_temp.s519refused(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,false),pg_temp.s519p(42,true,40),
    pg_temp.s519p(43,true,40))),'P0001'),
  '1 one player for each starter');
SELECT pg_temp.s519check(pg_temp.s519refused(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,false),pg_temp.s519p(42,false,40))),'P0001'),
  '1 only a player who played');
SELECT pg_temp.s519check(pg_temp.s519refused(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,false),pg_temp.s519p(42,true,43))),'P0001'),
  '1 only in place of a starter of the plan');

-- ── 2. The draft keeps it ──────────────────────────────────────────────────
SELECT pg_temp.s519check(pg_temp.s519runs(pg_temp.s519save(jsonb_build_array(pg_temp.s519p(40,false),pg_temp.s519p(41,true),
    pg_temp.s519p(42,true,40),pg_temp.s519p(43,false)))),
  '2 the coach saves Karagounis starting in Nikopolidis''s place');
SELECT pg_temp.s519check((SELECT started_for FROM public.game_evaluation_players WHERE event_id=pg_temp.s519id(500)
    AND squad_player_id=pg_temp.s519id(42))=pg_temp.s519id(40)
  AND (SELECT count(*) FROM public.game_evaluation_players WHERE event_id=pg_temp.s519id(500) AND started_for IS NOT NULL)=1,
  '2 the draft keeps who started in whose place');

-- ── 3. Publishing ─────────────────────────────────────────────────────────
SELECT pg_temp.s519check(pg_temp.s519runs(format('SELECT public.publish_game_evaluation(%L::uuid)', pg_temp.s519id(500))),
  '3 the coach publishes it');
RESET ROLE;
SELECT pg_temp.s519check((SELECT position FROM public.matches WHERE user_id=pg_temp.s519id(22) AND opponent='Czechia')='Goalkeeper'
  AND (SELECT position FROM public.matches WHERE user_id=pg_temp.s519id(21) AND opponent='Czechia')='Midfielder'
  AND NOT EXISTS (SELECT 1 FROM public.matches WHERE user_id=pg_temp.s519id(20) AND opponent='Czechia'),
  '3 Karagounis is logged at the keeper''s line he started on, not his profile''s; Nikopolidis has no match row');
SELECT pg_temp.s519check(EXISTS (SELECT 1 FROM public.game_review_for_family WHERE event_id=pg_temp.s519id(500) AND squad_player_id=pg_temp.s519id(42))
  AND NOT EXISTS (SELECT 1 FROM public.game_review_for_family WHERE event_id=pg_temp.s519id(500) AND squad_player_id=pg_temp.s519id(40)),
  '3 Karagounis gets his review; Nikopolidis gets nothing');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.s519_results;
 IF total <> 10 THEN RAISE EXCEPTION 'Games started instead: % checks ran; expected 10', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.s519_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Games started instead checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Games started instead: % of % passed', total, total;
END $$;
ROLLBACK;
