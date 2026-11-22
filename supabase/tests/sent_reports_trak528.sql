-- @trak-suite mode=--sent-reports in-all=true
-- TRAK-528 (Reports 5/10, Imad 21 Nov): publishing a report day stores each player's report as it was, in two copies:
-- the player's (the whole report and the note) and the parents' (no job, no "Did the job?", no note). A later change
-- doesn't touch a sent report, and sending again stores nothing new. The coach reads his players' player copies; the
-- child reads his own copies; his guardians read the parents' copy; nobody else, and nobody while consent is missing.
-- Deleting the account removes them; the child's data download has them. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing sent-report fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.r528id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95280000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE r528_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON r528_results TO authenticated, anon;
CREATE TEMP TABLE r528_kept(name text PRIMARY KEY, body jsonb);
GRANT SELECT, INSERT ON r528_kept TO authenticated;
CREATE FUNCTION pg_temp.r528actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.r528id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.r528check(ok boolean, label text, detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.r528_results VALUES(label, ok IS TRUE, detail)
$$;
CREATE FUNCTION pg_temp.r528refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- What the caller reads: player copies / parents' copies, over every squad row.
CREATE FUNCTION pg_temp.r528seen() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT (SELECT count(*) FROM public.report_for_player) || '/' || (SELECT count(*) FROM public.report_for_family)
$$;
CREATE FUNCTION pg_temp.r528kept(name text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT body FROM pg_temp.r528_kept WHERE r528_kept.name = $1
$$;
CREATE FUNCTION pg_temp.r528players(n integer[], note text DEFAULT '') RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_agg(jsonb_build_object('squad_player_id', pg_temp.r528id(p), 'work_rate', 7, 'tactical', 7, 'attitude', 7,
   'technical', 7, 'physical', 7, 'coachability', 7, 'note', CASE WHEN p = 40 THEN note ELSE '' END))
 FROM unnest(n) p
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Academy (100), season plan on. Coach One (10), U16: Ola (40, adult, 20), Kai (42, 14, parent 30) and Zoe (43, 14,
-- parent 31), both with consent. Coach Two (11) in the same academy; parent 32 has no child here. The U16 season began
-- 60 days ago; its plan was shared 50 days ago. Ola played a match 35 days ago: a job, did it partly, above.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.r528id(n),'synthetic-'||n||'@report528.invalid',now() FROM unnest(ARRAY[1,10,11,20,22,23,30,31,32]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.r528id(1),'club','Synthetic Admin'),
 (pg_temp.r528id(10),'coach','Synthetic Coach One'),(pg_temp.r528id(11),'coach','Synthetic Coach Two'),
 (pg_temp.r528id(20),'player','Synthetic Player Ola'),(pg_temp.r528id(22),'player','Synthetic Player Kai'),
 (pg_temp.r528id(23),'player','Synthetic Player Zoe'),
 (pg_temp.r528id(30),'parent','Synthetic Parent Kai'),(pg_temp.r528id(31),'parent','Synthetic Parent Zoe'),
 (pg_temp.r528id(32),'parent','Synthetic Parent Other');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.r528id(100),pg_temp.r528id(1),'Sent Report Academy','R528N1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.r528id(10),pg_temp.r528id(100)),(pg_temp.r528id(11),pg_temp.r528id(100));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.r528id(20), current_date - interval '20 years'),
 (pg_temp.r528id(22), current_date - interval '14 years'),
 (pg_temp.r528id(23), current_date - interval '14 years');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.r528id(22),pg_temp.r528id(30)),(pg_temp.r528id(23),pg_temp.r528id(31));
INSERT INTO public.squad_players(id,coach_user_id,player_name,age_group,linked_player_id,position,created_at) VALUES
 (pg_temp.r528id(40),pg_temp.r528id(10),'Synthetic Player Ola','U16',pg_temp.r528id(20),'Attacker',now() - interval '90 days'),
 (pg_temp.r528id(42),pg_temp.r528id(10),'Synthetic Player Kai','U16',pg_temp.r528id(22),'Defender',now() - interval '90 days'),
 (pg_temp.r528id(43),pg_temp.r528id(10),'Synthetic Player Zoe','U16',pg_temp.r528id(23),'Midfielder',now() - interval '90 days');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.r528id(100),'season_plan') ON CONFLICT DO NOTHING;
INSERT INTO public.season_plans(id,coach_user_id,squad,starts_on,ends_on) VALUES
 (pg_temp.r528id(50),pg_temp.r528id(10),'U16',current_date - 60,current_date + 200);
UPDATE public.season_plans SET shared_at = now() - interval '50 days', last_shared_at = now() - interval '50 days' WHERE id = pg_temp.r528id(50);
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,home_away,starts_at,event_date,start_time,published,squad) VALUES
 (pg_temp.r528id(500),pg_temp.r528id(10),'Match','match','North FC','home',now() - interval '35 days',current_date - 35,'10:00',true,'U16');
INSERT INTO public.game_plan_players(event_id,squad_player_id,role,slot,job) VALUES
 (pg_temp.r528id(500),pg_temp.r528id(40),'starter',9,'Press their left back');
INSERT INTO public.game_evaluations(event_id,our_score,their_score,published_at) VALUES (pg_temp.r528id(500),2,1,now() - interval '34 days');
INSERT INTO public.game_evaluation_players(event_id,squad_player_id,played,did_job,against_expectation) VALUES
 (pg_temp.r528id(500),pg_temp.r528id(40),true,'partly','above');
SET LOCAL ROLE authenticated;
SELECT pg_temp.r528actor(30);
SELECT public.record_parental_consent(pg_temp.r528id(22), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');
SELECT pg_temp.r528actor(31);
SELECT public.record_parental_consent(pg_temp.r528id(23), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');

-- ── 1. Publishing sends each player's report ────────────────────────────────
-- The report day 30 days ago is published today, 30 days late; then the one of yesterday.
SELECT pg_temp.r528actor(10);
INSERT INTO pg_temp.r528_kept SELECT 'first', public.publish_evaluation_with_objectives(pg_temp.r528id(50), current_date - 30,
  pg_temp.r528players(ARRAY[40,42,43], 'Keep pressing.'), '[]'::jsonb);
INSERT INTO pg_temp.r528_kept SELECT 'ola-shown', public.coach_player_report(pg_temp.r528id(40), current_date - 30, NULL);
INSERT INTO pg_temp.r528_kept SELECT 'second', public.publish_evaluation_with_objectives(pg_temp.r528id(50), current_date - 1,
  pg_temp.r528players(ARRAY[40,42,43]), '[]'::jsonb);
RESET ROLE;
CREATE FUNCTION pg_temp.r528eval(name text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (pg_temp.r528kept(name)->>'evaluation_id')::uuid
$$;
CREATE FUNCTION pg_temp.r528copy(which text, eval text, player integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE which WHEN 'player' THEN (SELECT to_jsonb(r) FROM public.report_for_player r
     WHERE r.evaluation_id = pg_temp.r528eval(eval) AND r.squad_player_id = pg_temp.r528id(player))
   ELSE (SELECT to_jsonb(r) FROM public.report_for_family r
     WHERE r.evaluation_id = pg_temp.r528eval(eval) AND r.squad_player_id = pg_temp.r528id(player)) END
$$;
SELECT pg_temp.r528check((SELECT count(*) FROM public.report_for_player WHERE evaluation_id = pg_temp.r528eval('first')) = 3
  AND (SELECT count(*) FROM public.report_for_family WHERE evaluation_id = pg_temp.r528eval('first')) = 3
  AND (SELECT count(*) FROM public.report_for_player WHERE evaluation_id = pg_temp.r528eval('second')) = 3,
  '1 each report day sends one player copy and one parents'' copy per player');
SELECT pg_temp.r528check(pg_temp.r528copy('player', 'first', 40)->'report' = pg_temp.r528kept('ola-shown'),
  '1 the player copy is the report the coach was shown');
SELECT pg_temp.r528check(pg_temp.r528copy('player', 'first', 40)->>'note' = 'Keep pressing.'
  AND pg_temp.r528copy('player', 'first', 42)->>'note' = '',
  '1 the player copy keeps the note to the player');
SELECT pg_temp.r528check(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.r528copy('player', 'first', 40)->'report'->'assessments') a
    WHERE (a->>'day')::date = current_date - 30 AND (a->>'work_rate')::int = 7),
  '1 a report day published late still holds its own ratings, on its day',
  pg_temp.r528copy('player', 'first', 40)->'report'->>'assessments');
SELECT pg_temp.r528check((pg_temp.r528copy('player', 'second', 40)->'report'->>'last_report_day')::date = current_date - 30
  AND (pg_temp.r528copy('player', 'second', 40)->'report'->>'period_from')::date = current_date - 29,
  '1 the next report covers the days after the last one');

-- ── 2. The parents' copy ────────────────────────────────────────────────────
SELECT pg_temp.r528check(pg_temp.r528copy('player', 'first', 40)->'report'->'matches'->0 @> '{"job":"Press their left back","did_job":"partly"}'::jsonb,
  '2 CONTROL the player copy has the job and Did the job?');
SELECT pg_temp.r528check(NOT (pg_temp.r528copy('family', 'first', 40)->'report'->'matches'->0 ? 'job')
  AND NOT (pg_temp.r528copy('family', 'first', 40)->'report'->'matches'->0 ? 'did_job')
  AND pg_temp.r528copy('family', 'first', 40)->'report'->'matches'->0 @> '{"opponent":"North FC","against_expectation":"above"}'::jsonb,
  '2 the parents'' copy has no job and no Did the job?, but Below, Met or Above');
SELECT pg_temp.r528check(NOT (pg_temp.r528copy('family', 'first', 40) ? 'note')
  AND (pg_temp.r528copy('family', 'first', 40)->'report') - 'matches' = (pg_temp.r528copy('player', 'first', 40)->'report') - 'matches',
  '2 the parents'' copy has no note, and otherwise the same report');

-- ── 3. A sent report never changes ──────────────────────────────────────────
INSERT INTO pg_temp.r528_kept SELECT 'ola-sent', pg_temp.r528copy('player', 'first', 40);
UPDATE public.coach_assessments SET work_rate = 1 WHERE evaluation_id = pg_temp.r528eval('first');
UPDATE public.game_evaluation_players SET did_job = 'yes' WHERE event_id = pg_temp.r528id(500);
SELECT pg_temp.r528check(pg_temp.r528copy('player', 'first', 40) = pg_temp.r528kept('ola-sent'),
  '3 editing an assessment or a match afterwards leaves the sent report as it was');
SELECT pg_temp.r528check(trak_private.send_reports(pg_temp.r528eval('first')) = 0
  AND trak_private.send_reports(pg_temp.r528eval('first'), pg_temp.r528id(42)) = 0
  AND (SELECT count(*) FROM public.report_for_player) = 6 AND (SELECT count(*) FROM public.report_for_family) = 6
  AND pg_temp.r528copy('player', 'first', 40) = pg_temp.r528kept('ola-sent'),
  '3 sending again, for the squad or one player, stores nothing new');
-- A report day published before this change (no copies yet) is sent the way the migration sends the old ones.
DELETE FROM public.report_for_player WHERE evaluation_id = pg_temp.r528eval('second');
DELETE FROM public.report_for_family WHERE evaluation_id = pg_temp.r528eval('second');
-- One statement each: SQL doesn't promise the order of the two calls inside one AND.
INSERT INTO pg_temp.r528_kept SELECT 'kai-alone', to_jsonb(trak_private.send_reports(pg_temp.r528eval('second'), pg_temp.r528id(42)));
INSERT INTO pg_temp.r528_kept SELECT 'the-rest', to_jsonb(trak_private.send_reports(pg_temp.r528eval('second')));
SELECT pg_temp.r528check(pg_temp.r528kept('kai-alone') = '1' AND pg_temp.r528kept('the-rest') = '2'
  AND (SELECT count(*) FROM public.report_for_family WHERE evaluation_id = pg_temp.r528eval('second')) = 3,
  '3 an older report day is sent once, one player or the rest',
  pg_temp.r528kept('kai-alone')::text || ' then ' || pg_temp.r528kept('the-rest')::text);

-- ── 4. Who reads them ───────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.r528actor(10);
SELECT pg_temp.r528check(pg_temp.r528seen() = '6/0', '4 the coach reads his players'' player copies', pg_temp.r528seen());
SELECT pg_temp.r528actor(11);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/0', '4 another coach in the academy reads none', pg_temp.r528seen());
SELECT pg_temp.r528actor(1);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/0', '4 the academy''s admin reads none', pg_temp.r528seen());
SELECT pg_temp.r528actor(20);
SELECT pg_temp.r528check(pg_temp.r528seen() = '2/2'
  AND NOT EXISTS (SELECT 1 FROM public.report_for_player WHERE squad_player_id <> pg_temp.r528id(40)),
  '4 a player reads his own copies only', pg_temp.r528seen());
SELECT pg_temp.r528actor(30);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/2'
  AND NOT EXISTS (SELECT 1 FROM public.report_for_family WHERE squad_player_id <> pg_temp.r528id(42)),
  '4 a parent reads his child''s parents'' copy only, never the player copy', pg_temp.r528seen());
SELECT pg_temp.r528actor(32);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/0', '4 a parent of another child reads none', pg_temp.r528seen());
SELECT pg_temp.r528actor(31);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/2', '4 CONTROL Zoe''s parent reads hers', pg_temp.r528seen());
SELECT pg_temp.r528check(public.withdraw_parental_consent(pg_temp.r528id(23)) >= 1, '4 Zoe''s parent withdraws consent');
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/0', '4 without consent the parent reads nothing', pg_temp.r528seen());
SELECT pg_temp.r528actor(23);
SELECT pg_temp.r528check(pg_temp.r528seen() = '0/0', '4 nor does the child', pg_temp.r528seen());
SELECT pg_temp.r528actor(10);
SELECT pg_temp.r528check(pg_temp.r528refused(format('INSERT INTO public.report_for_player(evaluation_id,squad_player_id,report) VALUES (%L,%L,''{}'')',
    pg_temp.r528eval('first'), pg_temp.r528id(42)), '42501')
  AND pg_temp.r528refused('UPDATE public.report_for_player SET note = ''x''', '42501')
  AND pg_temp.r528refused('DELETE FROM public.report_for_family', '42501'),
  '4 nobody signed in writes, changes or removes a sent report');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.r528check(pg_temp.r528refused('SELECT count(*) FROM public.report_for_player', '42501')
  AND pg_temp.r528refused('SELECT count(*) FROM public.report_for_family', '42501'),
  '4 a visitor who isn''t signed in reads nothing');
RESET ROLE;

-- ── 5. Download my data, and deleting the account ───────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.r528actor(20);
INSERT INTO pg_temp.r528_kept SELECT 'ola-export', public.export_my_account();
SELECT pg_temp.r528check(jsonb_array_length(pg_temp.r528kept('ola-export')->'reports') = 2
  AND pg_temp.r528kept('ola-export')->'reports'->0->>'note' = 'Keep pressing.',
  '5 the child''s data download has his sent reports, the note included');
SELECT public.delete_my_account();
RESET ROLE;
SELECT pg_temp.r528check((SELECT count(*) FROM public.report_for_player WHERE squad_player_id = pg_temp.r528id(40)) = 0
  AND (SELECT count(*) FROM public.report_for_family WHERE squad_player_id = pg_temp.r528id(40)) = 0
  AND (SELECT count(*) FROM public.report_for_player) = 4,
  '5 deleting his account removes his reports, and only his');

DO $$
DECLARE failed text;
BEGIN
 SELECT string_agg(label || coalesce(' [' || detail || ']', ''), '; ') INTO failed FROM pg_temp.r528_results WHERE NOT ok;
 IF failed IS NOT NULL THEN RAISE EXCEPTION 'Sent report checks failed: %', failed; END IF;
 IF (SELECT count(*) FROM pg_temp.r528_results) < 22 THEN RAISE EXCEPTION 'Sent reports: only % checks ran', (SELECT count(*) FROM pg_temp.r528_results); END IF;
END $$;
ROLLBACK;
