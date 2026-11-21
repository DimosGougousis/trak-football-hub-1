-- @trak-suite mode=--assessment-objectives in-all=true
-- TRAK-526 (Reports 3/10, Imad 21 Nov; storage and drafts decided by Tarek, 21 Nov): Assess player's objective
-- check-in. save_assessment_with_objectives() writes the assessment as the coach and the answers in one transaction:
-- every open objective once, Not yet to Met; added titles. A draft keeps them; publishing applies Met and creates the
-- added objectives; a published one's answers are final. A squad with no shared plan has no check-in. Only the coach
-- reads it; nobody writes it directly; squad evaluations' objective_progress is untouched. Synthetic fixtures; rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing assessment-objective fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.a526id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95260000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE a526_results(label text, ok boolean);
GRANT SELECT, INSERT ON a526_results TO authenticated, anon;
CREATE TEMP TABLE a526_ids(name text PRIMARY KEY, id uuid);
GRANT SELECT, INSERT, UPDATE ON a526_ids TO authenticated;
CREATE FUNCTION pg_temp.a526actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.a526id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.a526check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.a526_results VALUES(label, ok IS TRUE)
$$;
CREATE FUNCTION pg_temp.a526refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- Read as the owner, so the checks see what is stored whoever is asking.
CREATE FUNCTION pg_temp.a526count(statement text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE n bigint;
BEGIN EXECUTE statement INTO n; RETURN n; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.a526count(text) TO authenticated;
CREATE FUNCTION pg_temp.a526obj(player integer, title text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT po.id FROM public.player_objectives po WHERE po.squad_player_id = pg_temp.a526id($1) AND po.title = $2 ORDER BY po.created_at DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION pg_temp.a526obj(integer, text) TO authenticated;
CREATE FUNCTION pg_temp.a526status(player integer, title text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT po.status FROM public.player_objectives po WHERE po.id = pg_temp.a526obj($1, $2)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.a526status(integer, text) TO authenticated;
-- An Assess row as the page sends it: six ratings of 6, their card stats, and published_at when it sets one.
CREATE FUNCTION pg_temp.a526row(player integer, published text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('squad_player_id', pg_temp.a526id(player), 'coach_name_snapshot', 'Synthetic Coach One',
   'work_rate', 6, 'tactical', 6, 'attitude', 6, 'technical', 6, 'physical', 6, 'coachability', 6,
   'consistency', 6, 'impact', 6, 'workrate', 6, 'technique', 6, 'spirit', 6)
  || CASE published WHEN 'draft' THEN jsonb_build_object('published_at', NULL) WHEN 'publish' THEN jsonb_build_object('published_at', now()) ELSE '{}'::jsonb END
$$;
CREATE FUNCTION pg_temp.a526save(id uuid, player integer, published text, progress jsonb, added jsonb DEFAULT '[]') RETURNS text LANGUAGE sql STABLE AS $$
 SELECT format('SELECT public.save_assessment_with_objectives(%L, %L, %L, %L)', id, pg_temp.a526row(player, published), progress, added)
$$;
CREATE FUNCTION pg_temp.a526answers(a uuid, b uuid, sa text, sb text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_array(jsonb_build_object('player_objective_id', a, 'status', sa), jsonb_build_object('player_objective_id', b, 'status', sb))
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Academy (100) has the season plan. Coach One (10): U16 Ola (40, Attacker) with objectives A and B, Pia (41,
-- Midfielder) with C; U14 Uri (44, Defender), whose squad has no shared plan. Coach Two (11) in the same academy.
-- Adults, so no consent is waiting. Coach One's U16 plan (50) was shared a month ago.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.a526id(n),'synthetic-'||n||'@assess526.invalid',now() FROM unnest(ARRAY[1,10,11,20,21,24]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.a526id(1),'club','Synthetic Admin'),
 (pg_temp.a526id(10),'coach','Synthetic Coach One'),(pg_temp.a526id(11),'coach','Synthetic Coach Two'),
 (pg_temp.a526id(20),'player','Synthetic Player Ola'),(pg_temp.a526id(21),'player','Synthetic Player Pia'),
 (pg_temp.a526id(24),'player','Synthetic Player Uri');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.a526id(100),pg_temp.a526id(1),'Assess Objectives Academy','A526N1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.a526id(10),pg_temp.a526id(100)),(pg_temp.a526id(11),pg_temp.a526id(100));
INSERT INTO public.player_details(user_id,date_of_birth) SELECT pg_temp.a526id(n), current_date - interval '20 years' FROM unnest(ARRAY[20,21,24]) n;
INSERT INTO public.squad_players(id,coach_user_id,player_name,age_group,linked_player_id,position) VALUES
 (pg_temp.a526id(40),pg_temp.a526id(10),'Synthetic Player Ola','U16',pg_temp.a526id(20),'Attacker'),
 (pg_temp.a526id(41),pg_temp.a526id(10),'Synthetic Player Pia','U16',pg_temp.a526id(21),'Midfielder'),
 (pg_temp.a526id(44),pg_temp.a526id(10),'Synthetic Player Uri','U14',pg_temp.a526id(24),'Defender');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.a526id(100),'season_plan') ON CONFLICT DO NOTHING;
INSERT INTO public.season_plans(id,coach_user_id,squad,starts_on,ends_on) VALUES
 (pg_temp.a526id(50),pg_temp.a526id(10),'U16',current_date - 60,current_date + 200);
UPDATE public.season_plans SET shared_at = now() - interval '30 days', last_shared_at = now() - interval '30 days' WHERE id = pg_temp.a526id(50);
SET LOCAL ROLE authenticated;
SELECT pg_temp.a526actor(10);
SELECT public.save_player_objectives(pg_temp.a526id(40), '[{"title":"A","source":"own"},{"title":"B","source":"own"}]'::jsonb);
SELECT public.save_player_objectives(pg_temp.a526id(41), '[{"title":"C","source":"own"}]'::jsonb);
RESET ROLE;
CREATE TEMP TABLE a526_before AS SELECT (SELECT count(*) FROM public.objective_progress) AS progress;

-- 1. Publish: both answers kept, Met closes B, the added objective takes B's place.
SET LOCAL ROLE authenticated;
SELECT pg_temp.a526actor(10);
INSERT INTO pg_temp.a526_ids SELECT 'ola', (SELECT public.save_assessment_with_objectives(NULL, pg_temp.a526row(40, 'publish'),
  pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'B'), 'on_track', 'met'), '["Shoot first time"]'::jsonb));
SELECT pg_temp.a526check(pg_temp.a526count(format('SELECT count(*) FROM public.assessment_objectives WHERE assessment_id = %L AND status IS NOT NULL AND applied_at IS NOT NULL',
  (SELECT id FROM pg_temp.a526_ids WHERE name = 'ola'))) = 2
  AND pg_temp.a526status(40, 'A') = 'open' AND pg_temp.a526status(40, 'B') = 'met' AND pg_temp.a526status(40, 'Shoot first time') = 'open'
  AND pg_temp.a526count(format('SELECT count(*) FROM public.assessment_objectives WHERE assessment_id = %L AND added_title = ''Shoot first time'' AND player_objective_id = %L',
    (SELECT id FROM pg_temp.a526_ids WHERE name = 'ola'), pg_temp.a526obj(40, 'Shoot first time'))) = 1,
  '1 a published check-in keeps both answers, closes Met, and creates the added objective');
SELECT pg_temp.a526check((SELECT count(*) FROM public.assessment_objectives WHERE assessment_id = (SELECT id FROM pg_temp.a526_ids WHERE name = 'ola')) = 3,
  '1 the coach reads it');

-- 2. A draft keeps its answers and an added title; Met waits for publish, and publishing applies it once.
INSERT INTO pg_temp.a526_ids SELECT 'pia', (SELECT public.save_assessment_with_objectives(NULL, pg_temp.a526row(41, 'draft'),
  jsonb_build_array(jsonb_build_object('player_objective_id', pg_temp.a526obj(41, 'C'), 'status', 'met')), '["Scan before receiving"]'::jsonb));
SELECT pg_temp.a526check(pg_temp.a526status(41, 'C') = 'open' AND pg_temp.a526obj(41, 'Scan before receiving') IS NULL
  AND pg_temp.a526count(format('SELECT count(*) FROM public.assessment_objectives WHERE assessment_id = %L AND applied_at IS NULL',
    (SELECT id FROM pg_temp.a526_ids WHERE name = 'pia'))) = 2,
  '2 a draft keeps its answers and the added title; C stays open');
SELECT public.save_assessment_with_objectives((SELECT id FROM pg_temp.a526_ids WHERE name = 'pia'), pg_temp.a526row(41, 'publish'),
  jsonb_build_array(jsonb_build_object('player_objective_id', pg_temp.a526obj(41, 'C'), 'status', 'met')), '["Scan before receiving"]'::jsonb);
SELECT pg_temp.a526check(pg_temp.a526status(41, 'C') = 'met' AND pg_temp.a526status(41, 'Scan before receiving') = 'open',
  '2 publishing the draft closes C and creates the added objective');
SELECT pg_temp.a526check(pg_temp.a526refused(pg_temp.a526save((SELECT id FROM pg_temp.a526_ids WHERE name = 'pia'), 41, 'keep',
    jsonb_build_array(jsonb_build_object('player_objective_id', pg_temp.a526obj(41, 'Scan before receiving'), 'status', 'not_yet'))), 'P0001')
  AND pg_temp.a526count(format('SELECT count(*) FROM public.coach_assessments WHERE id = %L', (SELECT id FROM pg_temp.a526_ids WHERE name = 'pia'))) = 1,
  '2 a published check-in is final; an edit that only changes the bands still saves');
SELECT public.save_assessment_with_objectives((SELECT id FROM pg_temp.a526_ids WHERE name = 'pia'), pg_temp.a526row(41, 'keep'), NULL, NULL);

-- 3. The squad evaluation's rules: every open objective once, the four answers only, up to two open.
SELECT pg_temp.a526check(
  pg_temp.a526refused(pg_temp.a526save(NULL, 40, 'publish', jsonb_build_array(jsonb_build_object('player_objective_id', pg_temp.a526obj(40, 'A'), 'status', 'on_track'))), '22023')
  AND pg_temp.a526refused(pg_temp.a526save(NULL, 40, 'publish', pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'A'), 'on_track', 'on_track')), '22023')
  AND pg_temp.a526refused(pg_temp.a526save(NULL, 40, 'publish', pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'Shoot first time'), 'great', 'on_track')), '22023')
  AND pg_temp.a526refused(pg_temp.a526save(NULL, 40, 'publish', pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'Shoot first time'), 'on_track', 'on_track'), '["Head it in"]'::jsonb), '22023')
  AND pg_temp.a526refused(pg_temp.a526save(NULL, 40, 'publish', pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'Shoot first time'), 'met', 'on_track'), '["a"," spaced "]'::jsonb), '22023'),
  '3 one answer per open objective, the four answers, two open at most, one-line titles');
SELECT pg_temp.a526check(pg_temp.a526count('SELECT count(*) FROM public.coach_assessments WHERE squad_player_id = ''95260000-0000-0000-0000-000000000040''') = 1,
  '3 a refused check-in saves no assessment either');

-- 4. No shared plan: the assessment saves with no check-in, and answers are refused.
SELECT pg_temp.a526check(pg_temp.a526refused(pg_temp.a526save(NULL, 44, 'publish', '[]'::jsonb, '["Win headers"]'::jsonb), '22023')
  AND (SELECT public.save_assessment_with_objectives(NULL, pg_temp.a526row(44, 'publish'), '[]'::jsonb, '[]'::jsonb)) IS NOT NULL
  AND pg_temp.a526count('SELECT count(*) FROM public.assessment_objectives ao JOIN public.coach_assessments ca ON ca.id = ao.assessment_id WHERE ca.squad_player_id = ''95260000-0000-0000-0000-000000000044''') = 0,
  '4 a squad with no shared plan saves the assessment and no check-in');

-- 5. Nobody writes it directly, and only its coach reads it.
SELECT pg_temp.a526check(pg_temp.a526refused(format('INSERT INTO public.assessment_objectives(assessment_id, added_title) VALUES(%L, ''X'')', (SELECT id FROM pg_temp.a526_ids WHERE name = 'ola')), '42501')
  AND pg_temp.a526refused('UPDATE public.assessment_objectives SET status = ''met''', '42501')
  AND pg_temp.a526refused('DELETE FROM public.assessment_objectives', '42501'),
  '5 the coach never writes the check-in directly');
SELECT pg_temp.a526actor(11);
SELECT pg_temp.a526check((SELECT count(*) FROM public.assessment_objectives) = 0
  AND pg_temp.a526refused(pg_temp.a526save((SELECT id FROM pg_temp.a526_ids WHERE name = 'ola'), 40, 'keep', NULL), '42501'),
  '5 another coach reads none and saves nothing over it');
SELECT pg_temp.a526actor(20);
SELECT pg_temp.a526check((SELECT count(*) FROM public.assessment_objectives) = 0, '5 the player reads none');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.a526check(pg_temp.a526refused('SELECT count(*) FROM public.assessment_objectives', '42501'), '5 anon reads nothing');
RESET ROLE;

-- 7. Publishing a draft from its card applies its check-in once; Unpublish and publish again change nothing.
SET LOCAL ROLE authenticated;
SELECT pg_temp.a526actor(10);
INSERT INTO pg_temp.a526_ids SELECT 'card', (SELECT public.save_assessment_with_objectives(NULL, pg_temp.a526row(40, 'draft'),
  pg_temp.a526answers(pg_temp.a526obj(40, 'A'), pg_temp.a526obj(40, 'Shoot first time'), 'met', 'some_progress'), '[]'::jsonb));
SELECT public.set_assessment_published((SELECT id FROM pg_temp.a526_ids WHERE name = 'card'), true);
SELECT public.set_assessment_published((SELECT id FROM pg_temp.a526_ids WHERE name = 'card'), false);
SELECT public.set_assessment_published((SELECT id FROM pg_temp.a526_ids WHERE name = 'card'), true);
SELECT pg_temp.a526check(pg_temp.a526status(40, 'A') = 'met' AND pg_temp.a526status(40, 'Shoot first time') = 'open'
  AND pg_temp.a526count(format('SELECT count(*) FROM public.assessment_objectives WHERE assessment_id = %L AND applied_at IS NOT NULL',
    (SELECT id FROM pg_temp.a526_ids WHERE name = 'card'))) = 2,
  '7 publishing from the card closes Met once; the other stays open');
RESET ROLE;

-- 6. The squad evaluations' answers are untouched.
SELECT pg_temp.a526check((SELECT count(*) FROM public.objective_progress) = (SELECT progress FROM pg_temp.a526_before),
  '6 objective_progress is not written by Assess');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.a526_results;
 IF total <> 14 THEN RAISE EXCEPTION 'Assessment objectives: % checks ran; expected 14', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.a526_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Assessment objective checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Assessment objectives: % of % passed', total, total;
END $$;
ROLLBACK;
