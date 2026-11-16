-- @trak-suite mode=--consent-batch-review in-all=true
-- TRAK-312: one consent check for a whole roster. For the coach's own players
-- the batch answer must equal the single check (coach_squad_player_consent_required)
-- for each child; any other id comes back as "can't record yet" (fail closed);
-- a player or a guardian is refused.
-- Synthetic fixtures only; one transaction that rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $test$
BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing consent-batch fixtures outside the disposable test harness';
  END IF;
END;
$test$;

CREATE FUNCTION pg_temp.cb(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $test$
  SELECT ('98120000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$test$;

CREATE TEMP TABLE cb_results (description text, passed boolean, detail text);
GRANT INSERT ON cb_results TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp.cb_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', p_uid::text)::text, true);
END;
$test$;

CREATE FUNCTION pg_temp.cb_allowed(statement text, description text) RETURNS void
LANGUAGE plpgsql AS $test$
DECLARE failure text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN failure := SQLSTATE || ': ' || SQLERRM;
  END;
  INSERT INTO pg_temp.cb_results VALUES (description, failure IS NULL, failure);
END;
$test$;

CREATE FUNCTION pg_temp.cb_refused(statement text, expected_state text, description text) RETURNS void
LANGUAGE plpgsql AS $test$
DECLARE failure text;
BEGIN
  BEGIN
    EXECUTE statement;
    failure := 'unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN failure := SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  INSERT INTO pg_temp.cb_results VALUES (description, failure IS NULL, failure);
END;
$test$;

-- The batch answer for these ids, as a sorted set, against what is expected.
CREATE FUNCTION pg_temp.cb_expect(p_ids uuid[], expected uuid[], description text) RETURNS void
LANGUAGE plpgsql AS $test$
DECLARE got uuid[]; failure text;
BEGIN
  BEGIN
    got := public.coach_squad_players_consent_pending(p_ids);
  EXCEPTION WHEN OTHERS THEN failure := SQLSTATE || ': ' || SQLERRM;
  END;
  IF failure IS NULL AND NOT (got @> expected AND expected @> got AND cardinality(got) = cardinality(expected)) THEN
    failure := 'got ' || coalesce(got::text, 'null');
  END IF;
  INSERT INTO pg_temp.cb_results VALUES (description, failure IS NULL, failure);
END;
$test$;

-- For each of the coach's own ids: in the batch answer exactly when the single check says "required".
CREATE FUNCTION pg_temp.cb_agrees(p_ids uuid[], description text) RETURNS void
LANGUAGE plpgsql AS $test$
DECLARE batch uuid[]; id uuid; failure text;
BEGIN
  BEGIN
    batch := public.coach_squad_players_consent_pending(p_ids);
    FOREACH id IN ARRAY p_ids LOOP
      IF (id = ANY (batch)) IS DISTINCT FROM public.coach_squad_player_consent_required(id) THEN
        failure := coalesce(failure || ', ', '') || id::text;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN failure := SQLSTATE || ': ' || SQLERRM;
  END;
  INSERT INTO pg_temp.cb_results VALUES (description, failure IS NULL, failure);
END;
$test$;

CREATE FUNCTION pg_temp.cb_check(ok boolean, description text) RETURNS void
LANGUAGE sql AS $test$
  INSERT INTO pg_temp.cb_results VALUES (description, coalesce(ok, false), NULL);
$test$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Coach 2's squad rows: 60 Ana (approved and signs up), 61 Ben (never approved),
-- 62 Cleo (departed). 63 is coach 3's player. 99 doesn't exist.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  (pg_temp.cb(1),  'admin@consent-batch.test',    now()),
  (pg_temp.cb(2),  'coach@consent-batch.test',    now()),
  (pg_temp.cb(3),  'coach-b@consent-batch.test',  now()),
  (pg_temp.cb(10), 'ana@consent-batch.test',      now()),
  (pg_temp.cb(20), 'guardian@consent-batch.test', now());
INSERT INTO public.profiles (user_id, role, full_name) VALUES
  (pg_temp.cb(1), 'club',  'CB Admin'),
  (pg_temp.cb(2), 'coach', 'CB Coach'),
  (pg_temp.cb(3), 'coach', 'CB Coach B');
INSERT INTO public.organizations (id, admin_user_id, name, join_code) VALUES
  (pg_temp.cb(50), pg_temp.cb(1), 'CB Academy', 'CB-ACADEMY');
INSERT INTO public.coach_details (user_id, organization_id) VALUES
  (pg_temp.cb(2), pg_temp.cb(50)), (pg_temp.cb(3), pg_temp.cb(50));
INSERT INTO public.squad_players (id, coach_user_id, player_name, age_group, status) VALUES
  (pg_temp.cb(60), pg_temp.cb(2), 'Ana Synthetic',  'U14', 'active'),
  (pg_temp.cb(61), pg_temp.cb(2), 'Ben Synthetic',  'U14', 'active'),
  (pg_temp.cb(62), pg_temp.cb(2), 'Cleo Synthetic', 'U14', 'coach_departed'),
  (pg_temp.cb(63), pg_temp.cb(3), 'Dan Synthetic',  'U14', 'active');
INSERT INTO public.roster_children (id, organization_id, squad_player_id, date_of_birth, child_email, loaded_by) VALUES
  (pg_temp.cb(70), pg_temp.cb(50), pg_temp.cb(60), '2013-03-04', 'ana@consent-batch.test', 'fixture');
INSERT INTO public.roster_guardians (roster_child_id, email, loaded_by) VALUES
  (pg_temp.cb(70), 'guardian@consent-batch.test', 'fixture');

SET LOCAL ROLE authenticated;

-- ── 1. Nobody has approved yet ─────────────────────────────────────────────
SELECT pg_temp.cb_as(pg_temp.cb(2));
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(60), pg_temp.cb(61)], ARRAY[pg_temp.cb(60), pg_temp.cb(61)],
  '1 TRAK-312 both of the coach''s players are waiting');
SELECT pg_temp.cb_agrees(ARRAY[pg_temp.cb(60), pg_temp.cb(61)],
  '1 TRAK-312 the batch equals the single check for each child');

-- ── 2. Ana is approved and signs up ────────────────────────────────────────
SELECT pg_temp.cb_as(pg_temp.cb(20));
SELECT pg_temp.cb_allowed($$SELECT public.provision_my_profile('{"role":"parent","full_name":"CB Guardian"}'::jsonb)$$,
  '2 CONTROL the guardian signs up and claims their roster row');
SELECT pg_temp.cb_allowed($$SELECT public.record_roster_consent('98120000-0000-0000-0000-000000000070', 'legal_guardian',
    '{"coaching_records":true,"recognition":false,"parent_visibility":true}'::jsonb,
    '2026-09-12.1', 'Synthetic roster consent.')$$,
  '2 CONTROL the guardian approves Ana');
SELECT pg_temp.cb_as(pg_temp.cb(10));
SELECT pg_temp.cb_allowed($$SELECT public.provision_my_profile(jsonb_build_object('role', 'player', 'full_name', 'Ana Synthetic',
  'player_details', jsonb_build_object('date_of_birth', '2013-03-04', 'position', 'Defender')))$$,
  '2 CONTROL Ana signs up and claims her roster place');
SELECT pg_temp.cb_as(pg_temp.cb(2));
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(60), pg_temp.cb(61)], ARRAY[pg_temp.cb(61)],
  '2 TRAK-312 Ana is ready, Ben still waits');
SELECT pg_temp.cb_agrees(ARRAY[pg_temp.cb(60), pg_temp.cb(61)],
  '2 TRAK-312 the batch still equals the single check for each child');
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(60), pg_temp.cb(60), NULL], '{}'::uuid[],
  '2 repeats and nulls in the list are harmless');
SELECT pg_temp.cb_expect('{}'::uuid[], '{}'::uuid[], '2 an empty list answers an empty list');
SELECT pg_temp.cb_expect(NULL, '{}'::uuid[], '2 no list answers an empty list');

-- ── 3. Ids that aren't the coach's current players fail closed ─────────────
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(60), pg_temp.cb(62), pg_temp.cb(63), pg_temp.cb(99)],
  ARRAY[pg_temp.cb(62), pg_temp.cb(63), pg_temp.cb(99)],
  '3 a departed player, another coach''s player and a missing id all come back as not ready');
SELECT pg_temp.cb_as(pg_temp.cb(3));
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(60), pg_temp.cb(61)], ARRAY[pg_temp.cb(60), pg_temp.cb(61)],
  '3 another coach learns nothing: even Ana, who is ready, comes back as not ready');
SELECT pg_temp.cb_expect(ARRAY[pg_temp.cb(63)], ARRAY[pg_temp.cb(63)],
  '3 CONTROL coach B''s own unapproved player waits');
SELECT pg_temp.cb_agrees(ARRAY[pg_temp.cb(63)], '3 CONTROL coach B''s batch equals the single check');

-- ── 4. Only a coach may ask ────────────────────────────────────────────────
SELECT pg_temp.cb_as(pg_temp.cb(10));
SELECT pg_temp.cb_refused($$SELECT public.coach_squad_players_consent_pending(ARRAY['98120000-0000-0000-0000-000000000060']::uuid[])$$,
  '42501', '4 a player is refused');
SELECT pg_temp.cb_as(pg_temp.cb(20));
SELECT pg_temp.cb_refused($$SELECT public.coach_squad_players_consent_pending(ARRAY['98120000-0000-0000-0000-000000000060']::uuid[])$$,
  '42501', '4 a guardian is refused');
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.cb_refused($$SELECT public.coach_squad_players_consent_pending(ARRAY['98120000-0000-0000-0000-000000000060']::uuid[])$$,
  '42501', '4 no session is refused');
SELECT pg_temp.cb_as(pg_temp.cb(2));
SELECT pg_temp.cb_refused($$SELECT public.coach_squad_players_consent_pending(array_fill('98120000-0000-0000-0000-000000000060'::uuid, ARRAY[1001]))$$,
  '22023', '4 a list far past any roster is refused');
RESET ROLE;
SELECT pg_temp.cb_check(
  NOT has_function_privilege('anon', 'public.coach_squad_players_consent_pending(uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.coach_squad_players_consent_pending(uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.coach_squad_players_consent_pending(uuid[])', 'EXECUTE'),
  '4 only signed-in accounts can call it');

SELECT set_config('request.jwt.claims', '', true);

-- ── Report ─────────────────────────────────────────────────────────────────
DO $test$
DECLARE failed integer; total integer;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*) INTO failed, total FROM pg_temp.cb_results;
  IF total <> 19 THEN
    RAISE EXCEPTION 'Coach consent batch: % assertions ran; expected exactly 19', total;
  END IF;
  IF failed > 0 THEN
    RAISE EXCEPTION 'Coach consent batch: % of % failed: %', failed, total,
      (SELECT string_agg(description || ' [' || coalesce(detail, '') || ']', ' || ') FROM pg_temp.cb_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'Coach consent batch: % of % passed', total - failed, total;
END;
$test$;

ROLLBACK;
