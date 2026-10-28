-- @trak-suite mode=--games-plans in-all=true
-- TRAK-284 (Games 2/8, spec TRAK-282): a match's game plan, step 1 (opponent and goals), saved as a draft only
-- the coach sees. Only the event's coach reads or writes it: no other coach, admin, player, guardian, child
-- without consent or anon. Writes need the academy's games switch on and a match that isn't cancelled; reads
-- don't, so switching Games off loses nothing. Nobody deletes a plan: it goes with its match. Bad values are
-- refused. Test people are named after footballers. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing games-plans fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.g284id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92840000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE g284_results(label text, ok boolean);
GRANT SELECT, INSERT ON g284_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.g284actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.g284id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.g284check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.g284_results VALUES(label, ok IS TRUE)
$$;
-- True when the statement fails with exactly this SQLSTATE.
CREATE FUNCTION pg_temp.g284refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- How many rows a statement changed (0 when a rule hid them).
CREATE FUNCTION pg_temp.g284changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- A plan for match 506 (which never gets one) that the table's checks must refuse.
CREATE FUNCTION pg_temp.g284bad(columns text, vals text) RETURNS boolean LANGUAGE sql AS $$
 SELECT pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id,%s) VALUES(%L,%s)',columns,pg_temp.g284id(506),vals),'23514')
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy On (100) has Games: Otto Rehhagel (10) plans his matches; Fernando Santos (11) coaches there too.
-- Academy Off (101) hasn't: Ange Postecoglou (12). On Otto's roster: Theodoros Zagorakis (20, player A) and
-- Angelos Charisteas (21, player B), both with their guardian's consent, and Giorgos Karagounis (22), whose
-- consent is pending. Traianos Dellas (30) is player A's guardian, Kostas Katsouranis (31) player B's.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.g284id(n),'synthetic-'||n||'@games284.invalid',now() FROM unnest(ARRAY[1,2,10,11,12,20,21,22,30,31]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.g284id(1),'club','Vassilis Tsiartas'),(pg_temp.g284id(2),'club','Nikos Dabizas'),
 (pg_temp.g284id(10),'coach','Otto Rehhagel'),(pg_temp.g284id(11),'coach','Fernando Santos'),
 (pg_temp.g284id(12),'coach','Ange Postecoglou'),
 (pg_temp.g284id(20),'player','Theodoros Zagorakis'),(pg_temp.g284id(21),'player','Angelos Charisteas'),
 (pg_temp.g284id(22),'player','Giorgos Karagounis'),
 (pg_temp.g284id(30),'parent','Traianos Dellas'),(pg_temp.g284id(31),'parent','Kostas Katsouranis');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.g284id(100),pg_temp.g284id(1),'Games On Academy','G284N1'),
 (pg_temp.g284id(101),pg_temp.g284id(2),'Games Off Academy','G284F1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.g284id(10),pg_temp.g284id(100)),(pg_temp.g284id(11),pg_temp.g284id(100)),(pg_temp.g284id(12),pg_temp.g284id(101));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.g284id(20),current_date - interval '10 years'),(pg_temp.g284id(21),current_date - interval '10 years'),
 (pg_temp.g284id(22),current_date - interval '10 years');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.g284id(20),pg_temp.g284id(30)),(pg_temp.g284id(21),pg_temp.g284id(31));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id) VALUES
 (pg_temp.g284id(40),pg_temp.g284id(10),'Theodoros Zagorakis',pg_temp.g284id(20)),
 (pg_temp.g284id(41),pg_temp.g284id(10),'Angelos Charisteas',pg_temp.g284id(21)),
 (pg_temp.g284id(42),pg_temp.g284id(10),'Giorgos Karagounis',pg_temp.g284id(22));
-- Otto: 500 a published match, 501 a match not yet published, 502 a training, 505 a match cancelled before any
-- plan, 506 a match nobody plans. 503 is Fernando's match, 504 Ange's.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,starts_at,start_time,published) VALUES
 (pg_temp.g284id(500),pg_temp.g284id(10),'vs Portugal','match','Portugal','2054-11-07 15:00+00','19:00',true),
 (pg_temp.g284id(501),pg_temp.g284id(10),'vs Czechia','match','Czechia','2054-11-14 15:00+00','19:00',false),
 (pg_temp.g284id(502),pg_temp.g284id(10),'Training','training',NULL,'2054-11-05 15:00+00','19:00',true),
 (pg_temp.g284id(503),pg_temp.g284id(11),'vs Russia','match','Russia','2054-11-07 15:00+00','19:00',true),
 (pg_temp.g284id(504),pg_temp.g284id(12),'vs Spain','match','Spain','2054-11-07 15:00+00','19:00',true),
 (pg_temp.g284id(505),pg_temp.g284id(10),'vs France','match','France','2054-11-21 15:00+00','19:00',true),
 (pg_temp.g284id(506),pg_temp.g284id(10),'vs Italy','match','Italy','2054-11-28 15:00+00','19:00',true);
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.g284id(100),'games');

-- Consent through each guardian's own RPC, the way the app records it. Giorgos has none.
SET LOCAL ROLE authenticated;
SELECT pg_temp.g284actor(30);
SELECT public.record_parental_consent(pg_temp.g284id(20),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
SELECT pg_temp.g284actor(31);
SELECT public.record_parental_consent(pg_temp.g284id(21),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');

-- ── 1. The coach plans their own match ─────────────────────────────────────
SELECT pg_temp.g284actor(10);
INSERT INTO public.game_plans(event_id,strength,their_formation,key_players,scouting,goals) VALUES
 (pg_temp.g284id(500),'stronger','4-3-3',
  '[{"number":9,"position":"Striker","note":"Quick. Runs in behind."},{"number":null,"position":"Left wing","note":""}]',
  'Their keeper plays short to the left centre-back.',
  '[{"title":"Win it back in their half","looks_like":"Press when their keeper plays short."},{"title":"","looks_like":"Switch play early."}]');
SELECT pg_temp.g284check((SELECT strength='stronger' AND their_formation='4-3-3' AND jsonb_array_length(key_players)=2
  AND jsonb_array_length(goals)=2 FROM public.game_plans WHERE event_id=pg_temp.g284id(500)),
  '1 the coach saves a plan for their match and reads it back, a goal with no title yet included');
SELECT pg_temp.g284check(pg_temp.g284changed(format('UPDATE public.game_plans SET scouting=%L WHERE event_id=%L',
  'Their #7 drifts inside.',pg_temp.g284id(500)))=1,'1 and changes it');
SELECT pg_temp.g284check(pg_temp.g284changed(format(
  'INSERT INTO public.game_plans(event_id,strength) VALUES(%L,%L) ON CONFLICT (event_id) DO UPDATE SET strength=excluded.strength',
  pg_temp.g284id(500),'similar'))=1,'1 saving again goes through the app''s upsert');
SELECT pg_temp.g284check((SELECT count(*)=1 AND bool_and(strength='similar') FROM public.game_plans WHERE event_id=pg_temp.g284id(500)),
  '1 and updates the one plan');
SELECT pg_temp.g284check(pg_temp.g284changed(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(501)))=1,
  '1 a match not yet published can be planned too');
SELECT pg_temp.g284check(pg_temp.g284refused(format('DELETE FROM public.game_plans WHERE event_id=%L',pg_temp.g284id(501)),'42501'),
  '1 nobody deletes a plan, the coach included');

-- ── 2. Nobody else reads a plan ────────────────────────────────────────────
SELECT pg_temp.g284actor(11);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 another coach of the same academy reads none');
SELECT pg_temp.g284actor(12);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 a coach of another academy reads none');
SELECT pg_temp.g284actor(1);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 the academy''s admin reads none');
SELECT pg_temp.g284actor(20);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 player A, on the coach''s roster, reads none');
SELECT pg_temp.g284actor(21);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 player B reads none');
SELECT pg_temp.g284actor(30);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 player A''s guardian reads none');
SELECT pg_temp.g284actor(22);
SELECT pg_temp.g284check(NOT EXISTS(SELECT 1 FROM public.game_plans),'2 a child whose consent is pending reads none');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.g284check(pg_temp.g284refused('SELECT 1 FROM public.game_plans','42501'),'2 anon can''t read the table at all');
RESET ROLE;

-- ── 3. Nobody else writes one ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g284actor(11);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(506)),'42501'),
  '3 another coach can''t plan Otto''s match');
SELECT pg_temp.g284check(pg_temp.g284changed(format('UPDATE public.game_plans SET scouting=%L WHERE event_id=%L','Mine now',pg_temp.g284id(500)))=0,
  '3 or change his plan');
SELECT pg_temp.g284actor(20);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(506)),'42501'),
  '3 a player can''t write one');
SELECT pg_temp.g284actor(30);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(506)),'42501'),
  '3 a guardian can''t');
SELECT pg_temp.g284actor(22);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(506)),'42501'),
  '3 a child whose consent is pending can''t');

-- ── 4. Only a match, and not a cancelled one ───────────────────────────────
SELECT pg_temp.g284actor(10);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(502)),'42501'),
  '4 a training can''t have a game plan');
RESET ROLE;
UPDATE public.coach_calendar_events SET status='cancelled' WHERE id IN (pg_temp.g284id(500),pg_temp.g284id(505));
SET LOCAL ROLE authenticated;
SELECT pg_temp.g284actor(10);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(505)),'42501'),
  '4 the coach can''t plan a cancelled match');
SELECT pg_temp.g284check(pg_temp.g284changed(format('UPDATE public.game_plans SET scouting=%L WHERE event_id=%L','After',pg_temp.g284id(500)))=0,
  '4 or change the plan of a match that was cancelled');
SELECT pg_temp.g284check(pg_temp.g284refused(format(
  'INSERT INTO public.game_plans(event_id,strength) VALUES(%L,%L) ON CONFLICT (event_id) DO UPDATE SET strength=excluded.strength',
  pg_temp.g284id(500),'weaker'),'42501'),'4 and the app''s save is refused, not silently skipped');
SELECT pg_temp.g284check((SELECT strength FROM public.game_plans WHERE event_id=pg_temp.g284id(500))='similar',
  '4 the coach still reads the cancelled match''s plan, unchanged');

-- ── 5. The switch: writes need it, reads don't ─────────────────────────────
SELECT pg_temp.g284actor(12);
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(504)),'42501'),
  '5 a coach of an academy without Games can''t plan their own match');
RESET ROLE;
DELETE FROM public.academy_features WHERE organization_id=pg_temp.g284id(100) AND feature='games';
SET LOCAL ROLE authenticated;
SELECT pg_temp.g284actor(10);
SELECT pg_temp.g284check(EXISTS(SELECT 1 FROM public.game_plans WHERE event_id=pg_temp.g284id(501)),
  '5 switched off, the coach still reads their plans');
SELECT pg_temp.g284check(pg_temp.g284changed(format('UPDATE public.game_plans SET scouting=%L WHERE event_id=%L','Off',pg_temp.g284id(501)))=0,
  '5 but can''t change one');
SELECT pg_temp.g284check(pg_temp.g284refused(format('INSERT INTO public.game_plans(event_id) VALUES(%L)',pg_temp.g284id(506)),'42501'),
  '5 or start one');
RESET ROLE;
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.g284id(100),'games');

-- ── 6. Bad values are refused ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.g284actor(10);
SELECT pg_temp.g284check(pg_temp.g284bad('strength','''easy'''),'6 a strength that isn''t weaker, similar or stronger');
SELECT pg_temp.g284check(pg_temp.g284bad('their_formation','''the diamond'''),'6 a formation that isn''t a shape like 4-4-2');
SELECT pg_temp.g284check(pg_temp.g284bad('scouting',quote_literal(repeat('x',2001))),'6 scouting over 2000');
SELECT pg_temp.g284check(pg_temp.g284bad('key_players','''{}'''),'6 key players that aren''t a list');
SELECT pg_temp.g284check(pg_temp.g284bad('key_players',quote_literal((SELECT jsonb_agg(jsonb_build_object('number',n,'position','','note',''))
  FROM generate_series(1,12) n)::text)),'6 more than 11 key players');
SELECT pg_temp.g284check(pg_temp.g284bad('key_players','''[{"number":9,"position":"Striker","note":"","name":"Their striker"}]'''),
  '6 a key player with a name: they are another club''s children');
SELECT pg_temp.g284check(pg_temp.g284bad('key_players','''[{"number":0,"position":"","note":""}]''')
  AND pg_temp.g284bad('key_players','''[{"number":100,"position":"","note":""}]''')
  AND pg_temp.g284bad('key_players','''[{"number":7.5,"position":"","note":""}]''')
  AND pg_temp.g284bad('key_players','''[{"number":"9","position":"","note":""}]'''),'6 a shirt number that isn''t 1 to 99');
SELECT pg_temp.g284check(pg_temp.g284bad('key_players',quote_literal(jsonb_build_array(jsonb_build_object('number',9,'position',repeat('x',41),'note',''))::text))
  AND pg_temp.g284bad('key_players',quote_literal(jsonb_build_array(jsonb_build_object('number',9,'position','','note',repeat('x',301)))::text)),
  '6 a position over 40 or a note over 300');
SELECT pg_temp.g284check(pg_temp.g284bad('goals',quote_literal((SELECT jsonb_agg(jsonb_build_object('title','Goal '||n,'looks_like',''))
  FROM generate_series(1,4) n)::text)),'6 a fourth goal');
SELECT pg_temp.g284check(pg_temp.g284bad('goals',quote_literal(jsonb_build_array(jsonb_build_object('title',repeat('x',81),'looks_like',''))::text))
  AND pg_temp.g284bad('goals',quote_literal(jsonb_build_array(jsonb_build_object('title','Press','looks_like',repeat('x',301)))::text))
  AND pg_temp.g284bad('goals','''[{"title":5,"looks_like":""}]'''),'6 a goal title over 80, a description over 300 or a title that isn''t text');
RESET ROLE;

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.g284_results;
 IF total <> 38 THEN RAISE EXCEPTION 'Game plans: % checks ran; expected 38', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.g284_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Game plans checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Game plans: % of % passed', total, total;
END $$;
ROLLBACK;
