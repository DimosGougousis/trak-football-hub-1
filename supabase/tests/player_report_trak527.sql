-- @trak-suite mode=--player-report in-all=true
-- TRAK-527 (Reports 4/10, Imad 21 Nov): coach_player_report() gives one player's report for one report day, the period
-- after the last report day: his assessments this season, the period's matches with a published evaluation, his
-- objectives with their answers at the last report and now, and the period's trainings. Only the player's own coach
-- reads it: another coach, the player, an admin and anon are refused. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing player-report fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.r527id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95270000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE r527_results(label text, ok boolean);
GRANT SELECT, INSERT ON r527_results TO authenticated, anon;
CREATE TEMP TABLE r527_report(name text PRIMARY KEY, body jsonb);
GRANT SELECT, INSERT ON r527_report TO authenticated;
CREATE FUNCTION pg_temp.r527actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.r527id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.r527check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.r527_results VALUES(label, ok IS TRUE)
$$;
CREATE FUNCTION pg_temp.r527refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- The report as SQL text, for the refusals. Report day in 5 days; the last one 20 days ago.
CREATE FUNCTION pg_temp.r527call(player integer) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT format('SELECT public.coach_player_report(%L, %L, %L)', pg_temp.r527id(player), current_date + 5, current_date - 20)
$$;
CREATE FUNCTION pg_temp.r527(name text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT body FROM pg_temp.r527_report WHERE r527_report.name = $1
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Academy (100), season plan on, in the default time zone; every date below is days away from a period's edge. Coach One (10): U16 Ola (40) and Pia (41,
-- never assessed); U14 Uri (44). Coach Two (11) in the same academy. Adults, so no consent is waiting. Coach One's U16
-- season began 60 days ago; its plan was shared 30 days ago.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.r527id(n),'synthetic-'||n||'@report527.invalid',now() FROM unnest(ARRAY[1,10,11,20,21,24]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.r527id(1),'club','Synthetic Admin'),
 (pg_temp.r527id(10),'coach','Synthetic Coach One'),(pg_temp.r527id(11),'coach','Synthetic Coach Two'),
 (pg_temp.r527id(20),'player','Synthetic Player Ola'),(pg_temp.r527id(21),'player','Synthetic Player Pia'),
 (pg_temp.r527id(24),'player','Synthetic Player Uri');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.r527id(100),pg_temp.r527id(1),'Report Academy','R527N1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.r527id(10),pg_temp.r527id(100)),(pg_temp.r527id(11),pg_temp.r527id(100));
INSERT INTO public.player_details(user_id,date_of_birth) SELECT pg_temp.r527id(n), current_date - interval '20 years' FROM unnest(ARRAY[20,21,24]) n;
INSERT INTO public.squad_players(id,coach_user_id,player_name,age_group,linked_player_id,position,created_at) VALUES
 (pg_temp.r527id(40),pg_temp.r527id(10),'Synthetic Player Ola','U16',pg_temp.r527id(20),'Attacker',now() - interval '90 days'),
 (pg_temp.r527id(41),pg_temp.r527id(10),'Synthetic Player Pia','U16',pg_temp.r527id(21),'Midfielder',now() - interval '90 days'),
 (pg_temp.r527id(44),pg_temp.r527id(10),'Synthetic Player Uri','U14',pg_temp.r527id(24),'Defender',now() - interval '90 days');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.r527id(100),'season_plan') ON CONFLICT DO NOTHING;
INSERT INTO public.season_plans(id,coach_user_id,squad,starts_on,ends_on) VALUES
 (pg_temp.r527id(50),pg_temp.r527id(10),'U16',current_date - 60,current_date + 200);
UPDATE public.season_plans SET shared_at = now() - interval '30 days', last_shared_at = now() - interval '30 days' WHERE id = pg_temp.r527id(50);

-- Ola's objectives, A and B, set by the coach.
SET LOCAL ROLE authenticated;
SELECT pg_temp.r527actor(10);
SELECT public.save_player_objectives(pg_temp.r527id(40), '[{"title":"A","source":"own"},{"title":"B","source":"own"}]'::jsonb);
RESET ROLE;
UPDATE public.player_objectives SET created_at = now() - interval '50 days' WHERE squad_player_id = pg_temp.r527id(40);

-- Ola's assessments: 70 days ago (before the season), 40 days ago (before the period), 5 days ago (in it). The last two
-- answer his objectives: A Not yet then On track; B Some progress, then not asked. Uri: one, 40 days ago.
INSERT INTO public.coach_assessments(id,coach_user_id,squad_player_id,work_rate,tactical,attitude,technical,physical,coachability,created_at,published_at) VALUES
 (pg_temp.r527id(60),pg_temp.r527id(10),pg_temp.r527id(40),3,3,3,3,3,3,now() - interval '70 days',now() - interval '70 days'),
 (pg_temp.r527id(61),pg_temp.r527id(10),pg_temp.r527id(40),5,5,5,5,5,5,now() - interval '40 days',now() - interval '40 days'),
 (pg_temp.r527id(62),pg_temp.r527id(10),pg_temp.r527id(40),7,7,7,7,7,8,now() - interval '5 days',now() - interval '5 days'),
 (pg_temp.r527id(64),pg_temp.r527id(10),pg_temp.r527id(44),6,6,6,6,6,6,now() - interval '40 days',now() - interval '40 days');
INSERT INTO public.assessment_objectives(assessment_id,player_objective_id,status,applied_at)
 SELECT pg_temp.r527id(61), po.id, CASE po.title WHEN 'A' THEN 'not_yet' ELSE 'some_progress' END, now() - interval '40 days'
 FROM public.player_objectives po WHERE po.squad_player_id = pg_temp.r527id(40);
INSERT INTO public.assessment_objectives(assessment_id,player_objective_id,status,applied_at)
 SELECT pg_temp.r527id(62), po.id, 'on_track', now() - interval '5 days'
 FROM public.player_objectives po WHERE po.squad_player_id = pg_temp.r527id(40) AND po.title = 'A';

-- Matches: 10 days ago, published, Ola played (job, did it partly, above); 3 days ago, published, Ola didn't play;
-- 30 days ago, published (before the period); 2 days ago, not published.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,home_away,starts_at,event_date,start_time,published,squad) VALUES
 (pg_temp.r527id(500),pg_temp.r527id(10),'Match','match','North FC','home',now() - interval '10 days',current_date - 10,'10:00',true,'U16'),
 (pg_temp.r527id(501),pg_temp.r527id(10),'Match','match','South FC','away',now() - interval '3 days',current_date - 3,'10:00',true,'U16'),
 (pg_temp.r527id(502),pg_temp.r527id(10),'Match','match','East FC','home',now() - interval '30 days',current_date - 30,'10:00',true,'U16'),
 (pg_temp.r527id(503),pg_temp.r527id(10),'Match','match','West FC','home',now() - interval '2 days',current_date - 2,'10:00',true,'U16');
INSERT INTO public.game_plan_players(event_id,squad_player_id,role,slot,job) VALUES
 (pg_temp.r527id(500),pg_temp.r527id(40),'starter',9,'Press their left back'),
 (pg_temp.r527id(501),pg_temp.r527id(40),'bench',NULL,'Come on and hold the ball');
INSERT INTO public.game_evaluations(event_id,our_score,their_score,published_at) VALUES
 (pg_temp.r527id(500),2,1,now() - interval '9 days'),(pg_temp.r527id(501),0,0,now() - interval '2 days'),
 (pg_temp.r527id(502),1,1,now() - interval '29 days'),(pg_temp.r527id(503),3,0,NULL);
INSERT INTO public.game_evaluation_players(event_id,squad_player_id,played,did_job,against_expectation) VALUES
 (pg_temp.r527id(500),pg_temp.r527id(40),true,'partly','above'),
 (pg_temp.r527id(501),pg_temp.r527id(40),false,'yes','met'),
 (pg_temp.r527id(502),pg_temp.r527id(40),true,'yes','met'),
 (pg_temp.r527id(503),pg_temp.r527id(40),true,'yes','met');

-- Trainings: 12 and 6 days ago with a register (Ola at the first), 4 days ago with none taken, 25 days ago (before the
-- period), and one for U14 only.
INSERT INTO public.coach_sessions(id,coach_user_id,session_type,title,session_date,squad) VALUES
 (pg_temp.r527id(700),pg_temp.r527id(10),'training','Training',current_date - 12,'U16'),
 (pg_temp.r527id(701),pg_temp.r527id(10),'training','Training',current_date - 6,NULL),
 (pg_temp.r527id(702),pg_temp.r527id(10),'training','Training',current_date - 4,'U16'),
 (pg_temp.r527id(703),pg_temp.r527id(10),'training','Training',current_date - 25,'U16'),
 (pg_temp.r527id(704),pg_temp.r527id(10),'training','Training',current_date - 8,'U14');
INSERT INTO public.session_attendance(session_id,squad_player_id,status) VALUES
 (pg_temp.r527id(700),pg_temp.r527id(40),'present'),
 (pg_temp.r527id(701),pg_temp.r527id(41),'present'),
 (pg_temp.r527id(703),pg_temp.r527id(40),'present'),
 (pg_temp.r527id(704),pg_temp.r527id(44),'present');

-- ── 1. The coach reads Ola's report ─────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.r527actor(10);
INSERT INTO pg_temp.r527_report SELECT 'ola', public.coach_player_report(pg_temp.r527id(40), current_date + 5, current_date - 20);
INSERT INTO pg_temp.r527_report SELECT 'pia', public.coach_player_report(pg_temp.r527id(41), current_date + 5, current_date - 20);
INSERT INTO pg_temp.r527_report SELECT 'uri', public.coach_player_report(pg_temp.r527id(44), current_date + 5, current_date - 20);
INSERT INTO pg_temp.r527_report SELECT 'first', public.coach_player_report(pg_temp.r527id(40), current_date + 5, NULL);
SELECT pg_temp.r527check((pg_temp.r527('ola')->>'period_from')::date = current_date - 19
  AND (pg_temp.r527('ola')->>'season_starts_on')::date = current_date - 60
  AND (pg_temp.r527('ola')->>'report_day')::date = current_date + 5,
  '1 the period runs from the day after the last report to the report day; the season from the plan''s start');
SELECT pg_temp.r527check((SELECT array_agg((a->>'work_rate')::int) FROM jsonb_array_elements(pg_temp.r527('ola')->'assessments') a) = ARRAY[5,7]
  AND (pg_temp.r527('ola')->'assessments'->1->>'coachability')::int = 8,
  '1 the season''s assessments, oldest first, with their six ratings');
SELECT pg_temp.r527check((pg_temp.r527('ola')->'before_season'->>'work_rate')::int = 3 AND pg_temp.r527('pia')->'before_season' = 'null'::jsonb,
  '1 the latest from before the season, apart');
SELECT pg_temp.r527check(jsonb_array_length(pg_temp.r527('ola')->'matches') = 2
  AND pg_temp.r527('ola')->'matches'->0 @> '{"opponent":"North FC","home_away":"home","our_score":2,"their_score":1,"job":"Press their left back","played":true,"did_job":"partly","against_expectation":"above"}'::jsonb
  AND pg_temp.r527('ola')->'matches'->1 @> '{"opponent":"South FC","played":false,"did_job":null,"against_expectation":null}'::jsonb,
  '2 the period''s published matches only, in order: his job and how it went, and Didn''t play with no result');
SELECT pg_temp.r527check((SELECT array_agg(o->>'title' || ':' || coalesce(o->>'at_last_report', '-') || '>' || coalesce(o->>'now', '-'))
    FROM jsonb_array_elements(pg_temp.r527('ola')->'objectives') o) = ARRAY['A:not_yet>on_track', 'B:some_progress>some_progress'],
  '3 each objective''s latest answer at the last report and now');
SELECT pg_temp.r527check((SELECT array_agg(o->>'title' || ':' || coalesce(o->>'at_last_report', '-'))
    FROM jsonb_array_elements(pg_temp.r527('first')->'objectives') o) = ARRAY['A:-', 'B:-']
  AND (pg_temp.r527('first')->>'period_from')::date = current_date - 60,
  '3 a first report starts on the season''s first day and has no last report');
SELECT pg_temp.r527check(pg_temp.r527('ola')->'trainings' = '{"attended":1,"total":2}'::jsonb
  AND pg_temp.r527('pia')->'trainings' = '{"attended":1,"total":2}'::jsonb,
  '4 the period''s trainings with a register taken, his squad''s or the whole roster''s');
SELECT pg_temp.r527check(pg_temp.r527('pia')->'assessments' = '[]'::jsonb AND pg_temp.r527('pia')->'matches' = '[]'::jsonb
  AND pg_temp.r527('pia')->'objectives' = '[]'::jsonb,
  '5 a player never assessed has no assessments');
SELECT pg_temp.r527check(jsonb_array_length(pg_temp.r527('uri')->'assessments') = 1
  AND (pg_temp.r527('uri')->>'squad') = 'U14' AND (pg_temp.r527('uri')->>'period_from')::date = current_date - 19,
  '5 a player with no assessment in the period still has his latest from before');
SELECT pg_temp.r527check(pg_temp.r527refused(format('SELECT public.coach_player_report(%L, %L, %L)', pg_temp.r527id(40), current_date, current_date), '22023'),
  '6 a last report day on or after the report day is refused');

-- ── 7. Nobody else reads it ─────────────────────────────────────────────────
SELECT pg_temp.r527actor(11);
SELECT pg_temp.r527check(pg_temp.r527refused(pg_temp.r527call(40), '42501'), '7 another coach in the same academy is refused');
SELECT pg_temp.r527actor(20);
SELECT pg_temp.r527check(pg_temp.r527refused(pg_temp.r527call(40), '42501'), '7 the player himself is refused');
SELECT pg_temp.r527actor(1);
SELECT pg_temp.r527check(pg_temp.r527refused(pg_temp.r527call(40), '42501'), '7 the academy''s admin is refused');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT pg_temp.r527check(pg_temp.r527refused(pg_temp.r527call(40), '42501'), '7 anon is refused');
RESET ROLE;

DO $$
DECLARE failed text;
BEGIN
 SELECT string_agg(label, '; ') INTO failed FROM pg_temp.r527_results WHERE NOT ok;
 IF failed IS NOT NULL THEN RAISE EXCEPTION 'Player report checks failed: %', failed; END IF;
 IF (SELECT count(*) FROM pg_temp.r527_results) < 14 THEN RAISE EXCEPTION 'Player report: only % checks ran', (SELECT count(*) FROM pg_temp.r527_results); END IF;
END $$;
ROLLBACK;
