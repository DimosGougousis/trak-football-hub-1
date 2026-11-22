-- @trak-suite mode=--advisor-cleanup-review in-all=true
-- TRAK-237: signed-out visitors can't run any SECURITY DEFINER function in
-- public; signed-in accounts and the service role still can, exactly as
-- before; the search_path is pinned; one copy of each duplicated index stays.
-- No fixtures; one transaction that rolls back.
BEGIN;
DO $test$
BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing advisor-cleanup checks outside the disposable test harness';
  END IF;
END;
$test$;

CREATE TEMP TABLE ac_results (description text, passed boolean, detail text);
GRANT INSERT ON ac_results TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp.ac_check(ok boolean, description text, detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $test$
  INSERT INTO pg_temp.ac_results VALUES (description, coalesce(ok, false), detail);
$test$;

CREATE FUNCTION pg_temp.ac_run(statement text, expected_state text, description text) RETURNS void
LANGUAGE plpgsql AS $test$
DECLARE failure text;
BEGIN
  BEGIN
    EXECUTE statement;
    IF expected_state IS NOT NULL THEN failure := 'unexpectedly allowed'; END IF;
  EXCEPTION WHEN OTHERS THEN
    IF expected_state IS NULL OR SQLSTATE <> expected_state THEN failure := SQLSTATE || ': ' || SQLERRM; END IF;
  END;
  INSERT INTO pg_temp.ac_results VALUES (description, failure IS NULL, failure);
END;
$test$;

-- ── 1. Grants ──────────────────────────────────────────────────────────
SELECT pg_temp.ac_check(NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  '1 no SECURITY DEFINER function in public is executable by anon',
  (SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')));

SELECT pg_temp.ac_check(
  has_function_privilege('authenticated', 'public.is_coach()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.my_consent_status()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.withdraw_parental_consent(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.squad_player_is_mine(uuid)', 'EXECUTE'),
  '1 signed-in accounts keep the functions they used');
SELECT pg_temp.ac_check(
  has_function_privilege('service_role', 'public.is_coach()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.my_organization_id()', 'EXECUTE'),
  '1 the service role keeps them too');
-- TRAK-544: the uptime monitor's own function; taking anon's access away silences the database alert.
SELECT pg_temp.ac_check(
  has_function_privilege('anon', 'public.uptime_ping()', 'EXECUTE')
  AND NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.uptime_ping()'::regprocedure),
  '1 the uptime monitor''s uptime_ping() stays callable by anon, and is not SECURITY DEFINER');

-- ── 2. Behaviour by role ───────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT pg_temp.ac_run('SELECT public.is_coach()', '42501', '2 a visitor is refused is_coach()');
SELECT pg_temp.ac_run('SELECT public.my_consent_status()', '42501', '2 a visitor is refused my_consent_status()');
SELECT pg_temp.ac_check((SELECT public.uptime_ping()) = 'trak-db-up', '2 a visitor runs uptime_ping() and gets trak-db-up');
RESET ROLE;
SELECT set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', '98237000-0000-0000-0000-000000000001')::text, true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ac_run('SELECT public.is_coach()', NULL, '2 a signed-in account still runs is_coach()');
SELECT pg_temp.ac_run('SELECT public.my_consent_status()', NULL, '2 a signed-in account still runs my_consent_status()');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ── 3. search_path and indexes ─────────────────────────────────────────
SELECT pg_temp.ac_check(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.export_scope_includes_observations()'::regprocedure)
    @> ARRAY['search_path=""'],
  '3 export_scope_includes_observations has a fixed search_path',
  (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.export_scope_includes_observations()'::regprocedure));
SELECT pg_temp.ac_check(
  to_regclass('public.idx_coach_calendar_events_coach_starts') IS NULL
  AND to_regclass('public.idx_squad_players_coach') IS NULL,
  '3 the duplicate indexes are gone');
SELECT pg_temp.ac_check(
  to_regclass('public.idx_coach_calendar_coach_starts') IS NOT NULL
  AND to_regclass('public.idx_squad_players_coach_user_id') IS NOT NULL,
  '3 one copy of each stays');

-- ── Report ─────────────────────────────────────────────────────────────
DO $test$
DECLARE failed integer; total integer;
BEGIN
  SELECT count(*) FILTER (WHERE NOT passed), count(*) INTO failed, total FROM pg_temp.ac_results;
  IF total <> 12 THEN
    RAISE EXCEPTION 'Advisor cleanup: % assertions ran; expected exactly 12', total;
  END IF;
  IF failed > 0 THEN
    RAISE EXCEPTION 'Advisor cleanup: % of % failed: %', failed, total,
      (SELECT string_agg(description || ' [' || coalesce(detail, '') || ']', ' || ') FROM pg_temp.ac_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'Advisor cleanup: % of % passed', total - failed, total;
END;
$test$;
ROLLBACK;
