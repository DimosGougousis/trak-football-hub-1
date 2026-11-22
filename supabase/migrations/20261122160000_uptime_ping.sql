-- TRAK-544: the Better Stack database monitor (TRAK-113) gets a function of its own. It used
-- my_consent_status(), which TRAK-237 (#694) rightly closed to signed-out visitors on 19 Nov, and the
-- alert stayed silent for 3 days. This one reads no table, runs with the caller's rights (so the
-- advisor's signed-out SECURITY DEFINER check never flags it) and has a pinned search_path.
CREATE FUNCTION public.uptime_ping() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT 'trak-db-up'::text $$;

COMMENT ON FUNCTION public.uptime_ping() IS
  'Better Stack uptime monitor (TRAK-113, TRAK-544) calls this as anon with the publishable key. Keep anon EXECUTE, or the database alert goes quiet.';

-- Supabase's default privileges hand new public functions to anon, authenticated and service_role.
REVOKE ALL ON FUNCTION public.uptime_ping() FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.uptime_ping() TO anon;
