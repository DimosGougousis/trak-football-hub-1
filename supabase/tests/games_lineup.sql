-- @trak-suite mode=--games-lineup in-all=true
-- TRAK-441 slice 3 (Imad, 12 and 15 Nov): the line-up a player reads. Share writes a row for each starter and each
-- player on the bench: their name and place, and nothing else (G4: never a job, a note, a context or an expectation).
-- The squad's players read it once their own copy of the plan is out, a left-out player too. A guardian never reads it,
-- nor a coach, a child of another academy, a child whose consent is pending or a child who can't make it. A child
-- who is left out, can't come or has no consent is never listed, and a listed child whose consent is withdrawn stops
-- showing at once (G1, G6). A line-up edit waits for the coach's next share. Test people are named after
-- footballers. Synthetic fixtures; rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing games-lineup fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.g441id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('94410000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE g441_results(label text, ok boolean);
GRANT SELECT, INSERT ON g441_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.g441actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.g441id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.g441check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.g441_results VALUES(label, ok IS TRUE)
$$;
-- The line-up as whoever is acting reads it: "45:starter:1 40:starter:4 48:bench:-", by place then name.
CREATE FUNCTION pg_temp.g441lineup() RETURNS text LANGUAGE sql AS $$
 SELECT COALESCE(string_agg(right(squad_player_id::text,2) || ':' || role || ':' || COALESCE(slot::text,'-'), ' '
   ORDER BY slot NULLS LAST, name), '')
 FROM public.game_lineup_for_players
$$;
CREATE FUNCTION pg_temp.g441changes() RETURNS integer[] LANGUAGE sql AS $$
 SELECT COALESCE(array_agg(right(c.squad_player_id::text,2)::integer ORDER BY c.squad_player_id), '{}')
 FROM public.game_plan_changes(ARRAY[pg_temp.g441id(500)]) c
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy On (100) has Games: Otto Rehhagel (10) coaches its U16. Academy Other (101): Ange Postecoglou (12).
-- Otto's roster: Antonios Nikopolidis (45, keeper, starts), Theodoros Zagorakis (40, starts), Takis Fyssas (48, not
-- placed, so on the bench), Angelos Charisteas (41, left out), Ioannis Goumas (49, can't make it), all consented;
-- Giorgos Karagounis (42), consent pending. Each consented child has a guardian: Traianos Dellas (30) is
-- Zagorakis's, Demis Nikolaidis (35) the keeper's. Ange's roster: Angelos Basinas (47).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.g441id(n),'synthetic-'||n||'@games441.invalid',now()
 FROM unnest(ARRAY[1,2,10,12,20,21,22,25,27,28,29,30,31,35,38,39]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.g441id(1),'club','Vassilis Tsiartas'),(pg_temp.g441id(2),'club','Nikos Dabizas'),
 (pg_temp.g441id(10),'coach','Otto Rehhagel'),(pg_temp.g441id(12),'coach','Ange Postecoglou'),
 (pg_temp.g441id(20),'player','Theodoros Zagorakis'),(pg_temp.g441id(21),'player','Angelos Charisteas'),
 (pg_temp.g441id(22),'player','Giorgos Karagounis'),(pg_temp.g441id(25),'player','Antonios Nikopolidis'),
 (pg_temp.g441id(27),'player','Angelos Basinas'),(pg_temp.g441id(28),'player','Takis Fyssas'),(pg_temp.g441id(29),'player','Ioannis Goumas'),
 (pg_temp.g441id(30),'parent','Traianos Dellas'),(pg_temp.g441id(31),'parent','Michalis Kapsis'),
 (pg_temp.g441id(35),'parent','Demis Nikolaidis'),(pg_temp.g441id(38),'parent','Stylianos Venetidis'),
 (pg_temp.g441id(39),'parent','Georgios Georgiadis');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.g441id(100),pg_temp.g441id(1),'Line-up On Academy','G441N1'),
 (pg_temp.g441id(101),pg_temp.g441id(2),'Line-up Other Academy','G441F1');
-- Academies start with Matches and Training on (20261115140000). This suite switches them by hand, as an operator
-- still can: its academies start with neither.
DELETE FROM public.academy_features WHERE feature IN ('games','training');
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.g441id(10),pg_temp.g441id(100)),(pg_temp.g441id(12),pg_temp.g441id(101));
INSERT INTO public.player_details(user_id,date_of_birth)
 SELECT pg_temp.g441id(n), current_date - interval '14 years' FROM unnest(ARRAY[20,21,22,25,27,28,29]) n;
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.g441id(20),pg_temp.g441id(30)),(pg_temp.g441id(21),pg_temp.g441id(31)),(pg_temp.g441id(25),pg_temp.g441id(35)),
 (pg_temp.g441id(28),pg_temp.g441id(38)),(pg_temp.g441id(29),pg_temp.g441id(39));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.g441id(40),pg_temp.g441id(10),'Theodoros Zagorakis',pg_temp.g441id(20),'U16'),
 (pg_temp.g441id(41),pg_temp.g441id(10),'Angelos Charisteas',pg_temp.g441id(21),'U16'),
 (pg_temp.g441id(42),pg_temp.g441id(10),'Giorgos Karagounis',pg_temp.g441id(22),'U16'),
 (pg_temp.g441id(45),pg_temp.g441id(10),'Antonios Nikopolidis',pg_temp.g441id(25),'U16'),
 (pg_temp.g441id(48),pg_temp.g441id(10),'Takis Fyssas',pg_temp.g441id(28),'U16'),
 (pg_temp.g441id(49),pg_temp.g441id(10),'Ioannis Goumas',pg_temp.g441id(29),'U16'),
 (pg_temp.g441id(47),pg_temp.g441id(12),'Angelos Basinas',pg_temp.g441id(27),'U16');
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,starts_at,start_time,published,squad) VALUES
 (pg_temp.g441id(500),pg_temp.g441id(10),'vs Portugal','match','Portugal','2054-11-07 15:00+00','19:00',true,'U16');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.g441id(100),'games');

SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(g), public.record_parental_consent(pg_temp.g441id(c),'parent','{"coaching_records":true}'::jsonb,
  'synthetic-v1','Synthetic disposable consent.')
 FROM (VALUES (30,20),(31,21),(35,25),(38,28),(39,29)) AS consent(g,c);
-- Otto's plan: 4-4-2, the keeper and Zagorakis on the pitch with a job each, Zagorakis with a note, a context and a
-- Stretch; Charisteas left out with a note.
SELECT pg_temp.g441actor(10);
INSERT INTO public.game_plans(event_id,goals,formation) VALUES(pg_temp.g441id(500),
 '[{"title":"Win the second ball","looks_like":"First to every loose ball in midfield."}]','4-4-2');
INSERT INTO public.game_plan_players(event_id,squad_player_id,role,slot,job,note,context,expectation) VALUES
 (pg_temp.g441id(500),pg_temp.g441id(45),'starter',1,'Command the box on crosses.','','{}','usual'),
 (pg_temp.g441id(500),pg_temp.g441id(40),'starter',4,'Stay tight to their winger.','Second game at right-back.','{out_of_position}','stretch');
INSERT INTO public.game_plan_players(event_id,squad_player_id,role,note) VALUES
 (pg_temp.g441id(500),pg_temp.g441id(41),'not_selected','Not this week. Your chance comes on Tuesday.');
RESET ROLE;
INSERT INTO public.event_absences(event_id,squad_player_id,reported_by) VALUES(pg_temp.g441id(500),pg_temp.g441id(49),pg_temp.g441id(39));

-- ── 1. Nothing before the share ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','1 before sharing, a player reads no line-up');

-- ── 2. The share writes names and places only ──────────────────────────────
SELECT pg_temp.g441actor(10);
SELECT pg_temp.g441check((SELECT public.share_game_plan(pg_temp.g441id(500),true))=4,'2 the coach shares with 4 children');
SELECT pg_temp.g441check(pg_temp.g441lineup()='','2 the coach reads no copy: the plan is his');
RESET ROLE;
SELECT pg_temp.g441check((SELECT string_agg(right(squad_player_id::text,2) || ':' || role || ':' || COALESCE(slot::text,'-'), ' ' ORDER BY slot NULLS LAST)
   FROM public.game_lineup_for_players)='45:starter:1 40:starter:4 48:bench:-',
  '2 a row for each starter and for the bench: none for left out, can''t make it or consent pending');
SELECT pg_temp.g441check((SELECT array_agg(column_name::text ORDER BY column_name::text) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='game_lineup_for_players')=ARRAY['event_id','formation','name','role','slot','squad_player_id'],
  '2 the copy has a name, a place and the formation: no column for a job, a note, a context or an expectation');
SELECT pg_temp.g441check((SELECT bool_and(formation='4-4-2') AND bool_or(name='Antonios Nikopolidis') AND bool_or(name='Takis Fyssas')
   FROM public.game_lineup_for_players),'2 each row holds the roster name and the plan''s formation');
SELECT pg_temp.g441check((SELECT count(*)=0 FROM public.game_lineup_for_players l
   WHERE l.name ~* 'crosses|winger|right-back|Tuesday|stretch|out_of_position'),'2 no job, note, context or expectation words in any row');

-- ── 3. Who reads it ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='45:starter:1 40:starter:4 48:bench:-','3 a starter reads the whole line-up, his own place in it');
SELECT pg_temp.g441actor(28);
SELECT pg_temp.g441check(pg_temp.g441lineup()='45:starter:1 40:starter:4 48:bench:-','3 a player on the bench reads it');
SELECT pg_temp.g441actor(21);
SELECT pg_temp.g441check(pg_temp.g441lineup()='45:starter:1 40:starter:4 48:bench:-','3 a left-out player reads it, and isn''t listed in it');
SELECT pg_temp.g441actor(30);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','3 a guardian never reads the line-up');
SELECT pg_temp.g441actor(12);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','3 nor does another coach');
SELECT pg_temp.g441actor(27);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','3 nor a child of another academy');
SELECT pg_temp.g441actor(22);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','3 nor a child whose consent is pending');
SELECT pg_temp.g441actor(29);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','3 nor a child who can''t make it (no copy of the plan)');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.g441check((SELECT has_table_privilege('anon','public.game_lineup_for_players','SELECT')) IS FALSE,'3 nor anyone signed out');
RESET ROLE;

-- ── 4. A line-up edit waits for the next share ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(10);
SELECT pg_temp.g441check(pg_temp.g441changes()='{}','4 nothing to share right after sharing');
UPDATE public.game_plan_players SET slot=5 WHERE event_id=pg_temp.g441id(500) AND squad_player_id=pg_temp.g441id(40);
SELECT pg_temp.g441check(pg_temp.g441changes()=ARRAY[40,41,45,48],'4 a moved starter is a change for every child with a copy');
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='45:starter:1 40:starter:4 48:bench:-','4 players still read the line-up as shared');
SELECT pg_temp.g441actor(10);
SELECT pg_temp.g441check((SELECT public.share_game_plan(pg_temp.g441id(500),false))=4,'4 the coach shares the change');
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='45:starter:1 40:starter:5 48:bench:-','4 then players read the new place');

-- ── 5. Consent, the roster and cancelling ──────────────────────────────────
SELECT pg_temp.g441actor(35);
SELECT public.withdraw_parental_consent(pg_temp.g441id(25));
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='40:starter:5 48:bench:-','5 a child whose consent is withdrawn stops showing to team-mates at once');
SELECT pg_temp.g441actor(25);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','5 and reads no line-up himself');
RESET ROLE;
UPDATE public.squad_players SET status='coach_departed' WHERE id=pg_temp.g441id(48);
SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='40:starter:5','5 nor does a child who left the roster');
RESET ROLE;
UPDATE public.coach_calendar_events SET status='cancelled' WHERE id=pg_temp.g441id(500);
SET LOCAL ROLE authenticated;
SELECT pg_temp.g441actor(20);
SELECT pg_temp.g441check(pg_temp.g441lineup()='','5 a cancelled match has no line-up to read');
RESET ROLE;

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.g441_results;
 IF total <> 25 THEN RAISE EXCEPTION 'Game line-up: % checks ran; expected 25', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.g441_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Game line-up checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Game line-up: % of % passed', total, total;
END $$;
ROLLBACK;
