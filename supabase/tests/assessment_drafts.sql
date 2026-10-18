-- @trak-suite mode=--assessment-drafts in-all=true
-- TRAK-200 (Imad, 18 Oct): a draft assessment's bands must not reach the
-- player or their parents. Only the coach reads a draft; Publish shows it to
-- the family, Unpublish hides it again. A row saved without saying (an old
-- open tab, every fixture before this suite) counts as published, as today.
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $test$
BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing assessment draft fixtures outside the disposable test harness';
  END IF;
END;
$test$;

CREATE FUNCTION pg_temp.ad(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $test$
  SELECT ('97720000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$test$;

CREATE TEMP TABLE ad_results (description text, passed boolean, detail text);
GRANT INSERT ON ad_results TO authenticated, anon;

CREATE FUNCTION pg_temp.ad_as(p_uid uuid) RETURNS void LANGUAGE sql AS $test$
  SELECT set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', p_uid::text)::text, true)::text;
$test$;

CREATE FUNCTION pg_temp.ad_check(ok boolean, description text, detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $test$
  INSERT INTO pg_temp.ad_results VALUES (description, coalesce(ok, false), detail);
$test$;

-- Which of the child's assessments the caller can read, by id suffix.
SET LOCAL check_function_bodies = off;
CREATE FUNCTION pg_temp.ad_seen(p_child uuid) RETURNS text LANGUAGE sql AS $test$
  SELECT coalesce(string_agg(right(ca.id::text, 2), ',' ORDER BY ca.id), '-')
  FROM public.coach_assessments ca JOIN public.squad_players sp ON sp.id = ca.squad_player_id
  WHERE sp.linked_player_id = p_child;
$test$;
GRANT EXECUTE ON FUNCTION pg_temp.ad_seen(uuid) TO authenticated;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- 1 admin, 2 coach, 3 child (10), 4 parent of the child, 5 another coach.
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT pg_temp.ad(n), 'ad-' || n || '@assessment-drafts.test', now()
FROM unnest(ARRAY[1,2,3,4,5]) n;
INSERT INTO public.profiles (user_id, role, full_name) VALUES
  (pg_temp.ad(1), 'club', 'Admin'), (pg_temp.ad(2), 'coach', 'Coach'),
  (pg_temp.ad(3), 'player', 'Child'), (pg_temp.ad(4), 'parent', 'Parent'),
  (pg_temp.ad(5), 'coach', 'Other Coach');
INSERT INTO public.organizations (id, admin_user_id, name, join_code) VALUES
  (pg_temp.ad(50), pg_temp.ad(1), 'Assessment Drafts Academy', 'ADACAD');
INSERT INTO public.coach_details (user_id, organization_id) VALUES
  (pg_temp.ad(2), pg_temp.ad(50)), (pg_temp.ad(5), pg_temp.ad(50));
INSERT INTO public.player_details (user_id, date_of_birth) VALUES
  (pg_temp.ad(3), current_date - interval '10 years');
INSERT INTO public.player_parent_links (player_user_id, parent_user_id) VALUES
  (pg_temp.ad(3), pg_temp.ad(4));
INSERT INTO public.squad_players (id, coach_user_id, player_name, linked_player_id) VALUES
  (pg_temp.ad(20), pg_temp.ad(2), 'Child', pg_temp.ad(3));
-- 31: saved without saying (today's rows, an old tab). 32: saved as a draft.
INSERT INTO public.coach_assessments
  (id, coach_user_id, squad_player_id, work_rate, tactical, attitude, technical, physical, coachability)
VALUES (pg_temp.ad(31), pg_temp.ad(2), pg_temp.ad(20), 7,7,7,7,7,7);
INSERT INTO public.coach_assessments
  (id, coach_user_id, squad_player_id, work_rate, tactical, attitude, technical, physical, coachability, published_at)
VALUES (pg_temp.ad(32), pg_temp.ad(2), pg_temp.ad(20), 3,3,3,3,3,3, NULL);

SET LOCAL ROLE authenticated;
SELECT pg_temp.ad_as(pg_temp.ad(4));
SELECT public.record_parental_consent(pg_temp.ad(3), 'parent', '{"coaching_records":true}'::jsonb, 'synthetic-v1', 'Synthetic disposable consent.');

-- ── 1. A draft is the coach's alone ────────────────────────────────────────
SELECT pg_temp.ad_as(pg_temp.ad(3));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31',
  '1 the child reads the published assessment, not the draft', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(4));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31',
  '1 the parent reads the published assessment, not the draft', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(2));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31,32',
  '1 CONTROL the coach reads both, draft included', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(5));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '-',
  '1 CONTROL another coach reads neither', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(1));
SELECT pg_temp.ad_check(position('32' IN pg_temp.ad_seen(pg_temp.ad(3))) = 0,
  '1 the academy admin never reads a draft', pg_temp.ad_seen(pg_temp.ad(3)));

-- ── 2. Publish shows it; Unpublish hides it again ──────────────────────────
SELECT pg_temp.ad_as(pg_temp.ad(2));
UPDATE public.coach_assessments SET published_at = now() WHERE id = pg_temp.ad(32);
SELECT pg_temp.ad_as(pg_temp.ad(3));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31,32',
  '2 after Publish the child reads it', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(4));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31,32',
  '2 after Publish the parent reads it', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(2));
UPDATE public.coach_assessments SET published_at = NULL WHERE id = pg_temp.ad(32);
SELECT pg_temp.ad_as(pg_temp.ad(3));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31',
  '2 after Unpublish the child loses it again', pg_temp.ad_seen(pg_temp.ad(3)));
SELECT pg_temp.ad_as(pg_temp.ad(4));
SELECT pg_temp.ad_check(pg_temp.ad_seen(pg_temp.ad(3)) = '31',
  '2 after Unpublish the parent loses it again', pg_temp.ad_seen(pg_temp.ad(3)));

-- ── 3. Nobody but the coach can publish ────────────────────────────────────
SELECT pg_temp.ad_as(pg_temp.ad(4));
UPDATE public.coach_assessments SET published_at = now() WHERE id = pg_temp.ad(32);
SELECT pg_temp.ad_as(pg_temp.ad(3));
UPDATE public.coach_assessments SET published_at = now() WHERE id = pg_temp.ad(32);
RESET ROLE;
SELECT pg_temp.ad_check((SELECT published_at IS NULL FROM public.coach_assessments WHERE id = pg_temp.ad(32)),
  '3 neither the parent nor the child can publish a draft', NULL);

-- ── Report ─────────────────────────────────────────────────────────────────
DO $test$
DECLARE failed integer; total integer;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*) INTO failed, total FROM pg_temp.ad_results;
  IF total <> 10 THEN
    RAISE EXCEPTION 'Assessment drafts: % assertions ran; expected exactly 10', total;
  END IF;
  IF failed > 0 THEN
    RAISE EXCEPTION 'Assessment drafts: % of % failed: %', failed, total,
      (SELECT string_agg(description || ' [' || coalesce(detail, '') || ']', ' || ') FROM pg_temp.ad_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'Assessment drafts: % of % passed', total - failed, total;
END;
$test$;

ROLLBACK;
