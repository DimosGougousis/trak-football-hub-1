-- @trak-suite mode=--report-day-send in-all=true
-- TRAK-531 (Reports 8/10, Imad 21 Nov): report day. The note to the player and parents goes in both copies of the
-- report, and a parent reads it; a message written the old way still reaches the player only. The coach can send one
-- player's report on its own: he and his parent read it, the day stays open, the squad's Send sends the rest and
-- closes it, and nobody is sent twice. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing report day fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.r531id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95310000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE r531_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON r531_results TO authenticated, anon;
CREATE TEMP TABLE r531_kept(name text PRIMARY KEY, body jsonb);
GRANT SELECT, INSERT ON r531_kept TO authenticated;
CREATE FUNCTION pg_temp.r531actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.r531id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.r531check(ok boolean, label text, detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.r531_results VALUES(label, ok IS TRUE, detail)
$$;
CREATE FUNCTION pg_temp.r531refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- How many rows the caller reads; none when he may not read the table at all.
CREATE FUNCTION pg_temp.r531rows(statement text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
 EXECUTE 'SELECT count(*) FROM (' || statement || ') q' INTO n;
 RETURN n;
EXCEPTION WHEN insufficient_privilege THEN RETURN 0;
END $$;
CREATE FUNCTION pg_temp.r531kept(name text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT body FROM pg_temp.r531_kept WHERE r531_kept.name = $1
$$;
-- One player's entry: seven each, and a note under `key` ('report_note' now, 'note' from a page opened before).
CREATE FUNCTION pg_temp.r531player(n integer, key text DEFAULT 'report_note', note text DEFAULT '') RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('squad_player_id', pg_temp.r531id(n), 'work_rate', 7, 'tactical', 7, 'attitude', 7,
   'technical', 7, 'physical', 7, 'coachability', 7, key, note)
$$;
-- What the caller reads: the notes in the player copies / the parents' copies, by player, over every squad row.
CREATE FUNCTION pg_temp.r531notes() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT string_agg(right(r.squad_player_id::text, 2) || '=' || r.note, ',' ORDER BY r.squad_player_id) FROM public.report_for_player r), '')
   || '/' || coalesce((SELECT string_agg(right(r.squad_player_id::text, 2) || '=' || r.note, ',' ORDER BY r.squad_player_id) FROM public.report_for_family r), '')
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Academy (100), season plan on. Coach (10), U16: Kai (42, 14, parent 30), Zoe (43, 14, parent 31), Ivo (44, 14,
-- parent 32), all with consent. The season began 60 days ago; its plan was shared 50 days ago.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.r531id(n),'synthetic-'||n||'@report531.invalid',now() FROM unnest(ARRAY[1,10,22,23,24,30,31,32]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.r531id(1),'club','Synthetic Admin'), (pg_temp.r531id(10),'coach','Synthetic Coach'),
 (pg_temp.r531id(22),'player','Synthetic Player Kai'), (pg_temp.r531id(23),'player','Synthetic Player Zoe'),
 (pg_temp.r531id(24),'player','Synthetic Player Ivo'),
 (pg_temp.r531id(30),'parent','Synthetic Parent Kai'), (pg_temp.r531id(31),'parent','Synthetic Parent Zoe'),
 (pg_temp.r531id(32),'parent','Synthetic Parent Ivo');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.r531id(100),pg_temp.r531id(1),'Report Day Academy','R531N1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.r531id(10),pg_temp.r531id(100));
INSERT INTO public.player_details(user_id,date_of_birth)
 SELECT pg_temp.r531id(n), current_date - interval '14 years' FROM unnest(ARRAY[22,23,24]) n;
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.r531id(22),pg_temp.r531id(30)),(pg_temp.r531id(23),pg_temp.r531id(31)),(pg_temp.r531id(24),pg_temp.r531id(32));
INSERT INTO public.squad_players(id,coach_user_id,player_name,age_group,linked_player_id,position,created_at) VALUES
 (pg_temp.r531id(42),pg_temp.r531id(10),'Synthetic Player Kai','U16',pg_temp.r531id(22),'Defender',now() - interval '90 days'),
 (pg_temp.r531id(43),pg_temp.r531id(10),'Synthetic Player Zoe','U16',pg_temp.r531id(23),'Midfielder',now() - interval '90 days'),
 (pg_temp.r531id(44),pg_temp.r531id(10),'Synthetic Player Ivo','U16',pg_temp.r531id(24),'Attacker',now() - interval '90 days');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.r531id(100),'season_plan') ON CONFLICT DO NOTHING;
INSERT INTO public.season_plans(id,coach_user_id,squad,starts_on,ends_on) VALUES
 (pg_temp.r531id(50),pg_temp.r531id(10),'U16',current_date - 60,current_date + 200);
UPDATE public.season_plans SET shared_at = now() - interval '50 days', last_shared_at = now() - interval '50 days' WHERE id = pg_temp.r531id(50);
SET LOCAL ROLE authenticated;
SELECT pg_temp.r531actor(30);
SELECT public.record_parental_consent(pg_temp.r531id(22), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');
SELECT pg_temp.r531actor(31);
SELECT public.record_parental_consent(pg_temp.r531id(23), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');
SELECT pg_temp.r531actor(32);
SELECT public.record_parental_consent(pg_temp.r531id(24), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');

-- ── 1. A report day sent before: the message reaches the player only ───────
-- The day 30 days ago is sent the old way, from a page opened before this change: the note as `note`.
SELECT pg_temp.r531actor(10);
INSERT INTO pg_temp.r531_kept SELECT 'old', public.publish_evaluation_with_objectives(pg_temp.r531id(50), current_date - 30,
  jsonb_build_array(pg_temp.r531player(42, 'note', 'Only for Kai.'), pg_temp.r531player(43), pg_temp.r531player(44)), '[]'::jsonb);
SELECT pg_temp.r531check(pg_temp.r531notes() = '42=Only for Kai.,43=,44=/', '1 CONTROL the coach reads the old message in Kai''s copy', pg_temp.r531notes());
SELECT pg_temp.r531actor(30);
SELECT pg_temp.r531check(pg_temp.r531notes() = '/42=', '1 Kai''s parent reads his report without the message written before', pg_temp.r531notes());
SELECT pg_temp.r531check(pg_temp.r531rows('SELECT 1 FROM public.coach_shared_feedback') = 0, '1 nor the message itself');
SELECT pg_temp.r531actor(22);
SELECT pg_temp.r531check(pg_temp.r531notes() = '42=Only for Kai./42=', '1 CONTROL Kai reads it', pg_temp.r531notes());

-- ── 2. Send one player: Kai, with a note for him and his parents ───────────
SELECT pg_temp.r531actor(10);
INSERT INTO pg_temp.r531_kept SELECT 'kai', public.publish_evaluation_with_objectives(pg_temp.r531id(50), current_date - 1,
  jsonb_build_array(pg_temp.r531player(42, 'report_note', '  Great month, Kai.  ')), '[]'::jsonb, false);
RESET ROLE;
CREATE FUNCTION pg_temp.r531eval(name text) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT (pg_temp.r531kept(name)->>'evaluation_id')::uuid
$$;
CREATE FUNCTION pg_temp.r531sent(name text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(string_agg(right(r.squad_player_id::text, 2), ',' ORDER BY r.squad_player_id), '')
   || '/' || (SELECT count(*) FROM public.report_for_family f WHERE f.evaluation_id = pg_temp.r531eval(name))
 FROM public.report_for_player r WHERE r.evaluation_id = pg_temp.r531eval(name)
$$;
SELECT pg_temp.r531check(pg_temp.r531sent('kai') = '42/1', '2 sending Kai alone sends his report, both copies, and nobody else''s', pg_temp.r531sent('kai'));
SELECT pg_temp.r531check((SELECT closed_at IS NULL FROM public.season_evaluations WHERE id = pg_temp.r531eval('kai'))
  AND (SELECT closed_at IS NOT NULL FROM public.season_evaluations WHERE id = pg_temp.r531eval('old')),
  '2 the report day stays open for the rest; the one before is closed');
SET LOCAL ROLE authenticated;
SELECT pg_temp.r531actor(30);
SELECT pg_temp.r531check((SELECT note FROM public.report_for_family WHERE evaluation_id = pg_temp.r531eval('kai')) = 'Great month, Kai.',
  '2 Kai''s parent reads the new note', pg_temp.r531notes());
SELECT pg_temp.r531actor(22);
SELECT pg_temp.r531check((SELECT note FROM public.report_for_player WHERE evaluation_id = pg_temp.r531eval('kai')) = 'Great month, Kai.',
  '2 Kai reads it in his copy', pg_temp.r531notes());
SELECT pg_temp.r531actor(31);
SELECT pg_temp.r531check(NOT EXISTS (SELECT 1 FROM public.report_for_family WHERE evaluation_id = pg_temp.r531eval('kai')),
  '2 Zoe''s parent reads nothing of this day yet', pg_temp.r531notes());

-- ── 3. Kai can't be sent twice ──────────────────────────────────────────────
SELECT pg_temp.r531actor(10);
SELECT pg_temp.r531check(pg_temp.r531refused(format('SELECT public.publish_evaluation_with_objectives(%L, %L, %L, ''[]'', false)',
    pg_temp.r531id(50), current_date - 1, jsonb_build_array(pg_temp.r531player(42, 'report_note', 'Again.'))), 'P0001'),
  '3 sending Kai again is refused');
SELECT pg_temp.r531check(pg_temp.r531refused(format('SELECT public.publish_evaluation_with_objectives(%L, %L, %L, ''[]'')',
    pg_temp.r531id(50), current_date - 2, jsonb_build_array(pg_temp.r531player(43))), 'P0001'),
  '3 another date is refused while this one is open');
SELECT pg_temp.r531check(pg_temp.r531refused(format('SELECT public.publish_evaluation_with_objectives(%L, %L, %L, ''[]'')',
    pg_temp.r531id(50), current_date - 1, jsonb_build_array(pg_temp.r531player(43, 'report_note', repeat('x', 601)))), '22023'),
  '3 a note over 600 characters is refused');

-- ── 4. The squad's Send sends the rest and closes the day ──────────────────
INSERT INTO pg_temp.r531_kept SELECT 'rest', public.publish_evaluation_with_objectives(pg_temp.r531id(50), current_date - 1,
  jsonb_build_array(pg_temp.r531player(43, 'report_note', repeat('z', 600)), pg_temp.r531player(44)), '[]'::jsonb);
RESET ROLE;
SELECT pg_temp.r531check(pg_temp.r531eval('rest') = pg_temp.r531eval('kai') AND pg_temp.r531sent('kai') = '42,43,44/3'
  AND (SELECT count(*) FROM public.coach_assessments WHERE evaluation_id = pg_temp.r531eval('kai') AND squad_player_id = pg_temp.r531id(42)) = 1,
  '4 the squad''s Send sends Zoe and Ivo in the same day, and Kai once', pg_temp.r531sent('kai'));
SELECT pg_temp.r531check((SELECT closed_at IS NOT NULL FROM public.season_evaluations WHERE id = pg_temp.r531eval('kai'))
  AND (SELECT note FROM public.report_for_player WHERE evaluation_id = pg_temp.r531eval('kai') AND squad_player_id = pg_temp.r531id(42)) = 'Great month, Kai.',
  '4 the day is closed, and Kai''s report is as he was sent it');
SET LOCAL ROLE authenticated;
SELECT pg_temp.r531actor(31);
SELECT pg_temp.r531check((SELECT note FROM public.report_for_family WHERE evaluation_id = pg_temp.r531eval('kai')) = repeat('z', 600),
  '4 Zoe''s parent reads her note, 600 characters');
SELECT pg_temp.r531actor(10);
SELECT pg_temp.r531check(pg_temp.r531refused(format('SELECT public.publish_evaluation_with_objectives(%L, %L, %L, ''[]'')',
    pg_temp.r531id(50), current_date - 1, jsonb_build_array(pg_temp.r531player(43))), 'P0001'),
  '4 once closed, the day is sent');

-- ── 5. Everyone sent one by one: the squad's Send only closes the day ──────
INSERT INTO pg_temp.r531_kept SELECT 'today', public.publish_evaluation_with_objectives(pg_temp.r531id(50), current_date,
  jsonb_build_array(pg_temp.r531player(42), pg_temp.r531player(43), pg_temp.r531player(44)), '[]'::jsonb, false);
INSERT INTO pg_temp.r531_kept SELECT 'close', public.publish_evaluation_with_objectives(pg_temp.r531id(50), current_date, '[]'::jsonb, '[]'::jsonb);
RESET ROLE;
SELECT pg_temp.r531check(pg_temp.r531eval('close') = pg_temp.r531eval('today') AND pg_temp.r531sent('today') = '42,43,44/3'
  AND (SELECT closed_at IS NOT NULL FROM public.season_evaluations WHERE id = pg_temp.r531eval('today')),
  '5 a Send with nobody left closes the day and sends nothing new', pg_temp.r531sent('today'));

DO $$
DECLARE failed text;
BEGIN
 SELECT string_agg(label || coalesce(' [' || detail || ']', ''), '; ') INTO failed FROM pg_temp.r531_results WHERE NOT ok;
 IF failed IS NOT NULL THEN RAISE EXCEPTION 'Report day checks failed: %', failed; END IF;
 IF (SELECT count(*) FROM pg_temp.r531_results) < 17 THEN RAISE EXCEPTION 'Report day: only % checks ran', (SELECT count(*) FROM pg_temp.r531_results); END IF;
END $$;
ROLLBACK;
