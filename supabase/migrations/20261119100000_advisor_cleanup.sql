-- ============================================================
-- TRAK-237: the Supabase advisor findings that are worth a change
--
-- The full triage (every finding, intentional or actionable, with the
-- evidence) is on TRAK-237. None was an exploitable hole. This migration
-- makes the three changes that triage found worth making.
--
-- 1. Signed-out visitors (anon) lose EXECUTE on every SECURITY DEFINER
--    function in public. 23 of them still carried Supabase's default
--    grant (EXECUTE to PUBLIC and anon), from before later migrations
--    started revoking it. Checked on production, 19 Nov: each one either
--    refuses a NULL auth.uid(), only answers about auth.uid() (nothing for
--    a visitor), or is a trigger/event-trigger function, which PostgreSQL
--    never runs by a direct call. So nothing was exploitable; a visitor
--    simply never needs them. anon has no table grants (20260919120001),
--    so no row-level policy that calls these is ever evaluated for anon,
--    and no storage policy calls them.
--
--    Derived at apply time rather than listed, like 20260919120001, so a
--    function this migration doesn't know about is covered too. PUBLIC is
--    revoked as well, because anon inherits PUBLIC's EXECUTE. Signed-in
--    accounts and the service role keep exactly what they had: each is
--    granted EXECUTE directly where it held it (directly or via PUBLIC)
--    before the revoke, and nowhere else. Trigger functions need no
--    caller grant at all; keeping it changes nothing.
--
-- 2. export_scope_includes_observations() gets an empty search_path.
--    It is SECURITY INVOKER and returns true without reading anything, so
--    the mutable path was harmless; pinning it clears the advisor and
--    matches every other function.
--
-- 3. Two pairs of identical indexes, from two migrations that each added
--    the same one. The advisor reports the dropped copy of each pair as
--    never used; the kept copy is identical, so no query plan changes.
--      coach_calendar_events (coach_user_id, starts_at):
--        keep idx_coach_calendar_coach_starts, drop idx_coach_calendar_events_coach_starts
--      squad_players (coach_user_id):
--        keep idx_squad_players_coach_user_id, drop idx_squad_players_coach
--
-- Rollback: GRANT EXECUTE ON FUNCTION <name> TO anon; ALTER FUNCTION
-- public.export_scope_includes_observations() RESET search_path; recreate
-- the two indexes with the definitions above.
-- ============================================================

-- ── 1. No SECURITY DEFINER function in public for signed-out visitors ──
DO $migration$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS signed_in,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- Read before the revoke: grant back only what each role already had.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
    IF r.signed_in THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.f); END IF;
    IF r.service THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f); END IF;
  END LOOP;
END;
$migration$;

-- ── 2. A fixed search_path ─────────────────────────────────────────────
ALTER FUNCTION public.export_scope_includes_observations() SET search_path = '';

-- ── 3. One copy of each duplicated index ───────────────────────────────
DROP INDEX IF EXISTS public.idx_coach_calendar_events_coach_starts;
DROP INDEX IF EXISTS public.idx_squad_players_coach;
