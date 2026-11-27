-- @trak-suite mode=--coach-home-order in-all=true
-- TRAK-613 (New Home 7/8): the coach's own order for Home's To-do. Only its coach reads or saves it: no other coach,
-- player, guardian or anon. Only a coach can save one. One row per coach, day and squad view. Bad values are refused.
-- Test people are named after footballers. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing coach-home-order fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.t613id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('96130000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE t613_results(label text, ok boolean);
GRANT SELECT, INSERT ON t613_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.t613actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.t613id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.t613check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.t613_results VALUES(label, ok IS TRUE)
$$;
CREATE FUNCTION pg_temp.t613refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
CREATE FUNCTION pg_temp.t613changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION pg_temp.t613save(view text, keys text[]) RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.coach_home_order(day,squad_view,item_keys) VALUES(%L,%L,%L)', '2054-11-05', view, keys)
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.t613id(n),'synthetic-'||n||'@order613.invalid',now() FROM unnest(ARRAY[10,11,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.t613id(10),'coach','Jürgen Klopp'),(pg_temp.t613id(11),'coach','Pep Guardiola'),
 (pg_temp.t613id(20),'player','Thierry Henry'),(pg_temp.t613id(30),'parent','Patrick Vieira');
INSERT INTO public.player_details(user_id,date_of_birth) VALUES(pg_temp.t613id(20),'2000-01-01');

SET LOCAL ROLE authenticated;

-- ── 1. A coach saves and changes their own order ──────────────────────────
SELECT pg_temp.t613actor(10);
SELECT pg_temp.t613check(NOT pg_temp.t613refused(pg_temp.t613save('all', ARRAY['own:a','register:b']),'42501'),'1 a coach saves an order');
SELECT pg_temp.t613check(NOT pg_temp.t613refused(pg_temp.t613save('U16', ARRAY['register:b']),'42501'),'1 and one for a squad');
SELECT pg_temp.t613check((SELECT item_keys FROM public.coach_home_order WHERE squad_view='all')=ARRAY['own:a','register:b'],'1 and reads it back');
SELECT pg_temp.t613check(pg_temp.t613refused(pg_temp.t613save('all', ARRAY['x']),'23505'),'1 one row per day and squad view');
SELECT pg_temp.t613check(pg_temp.t613changed('UPDATE public.coach_home_order SET item_keys=ARRAY[''register:b'',''own:a''] WHERE squad_view=''all''')=1,'1 changes it');

-- ── 2. Nobody else ─────────────────────────────────────────────────────────
SELECT pg_temp.t613actor(11);
SELECT pg_temp.t613check(NOT EXISTS(SELECT 1 FROM public.coach_home_order),'2 another coach reads none');
SELECT pg_temp.t613check(pg_temp.t613changed('UPDATE public.coach_home_order SET item_keys=ARRAY[]::text[]')=0,'2 nor changes any');
SELECT pg_temp.t613check(pg_temp.t613changed('DELETE FROM public.coach_home_order')=0,'2 nor clears any');
SELECT pg_temp.t613check(pg_temp.t613refused(format('INSERT INTO public.coach_home_order(coach_user_id,day,squad_view,item_keys) VALUES(%L,%L,%L,%L)',
  pg_temp.t613id(10),'2054-11-06','all',ARRAY['x']),'42501'),'2 nor saves one for another coach');
SELECT pg_temp.t613actor(20);
SELECT pg_temp.t613check(NOT EXISTS(SELECT 1 FROM public.coach_home_order),'2 a player reads none');
SELECT pg_temp.t613check(pg_temp.t613refused(pg_temp.t613save('all', ARRAY['x']),'42501'),'2 nor saves one');
SELECT pg_temp.t613actor(30);
SELECT pg_temp.t613check(NOT EXISTS(SELECT 1 FROM public.coach_home_order),'2 a guardian reads none');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.t613check(pg_temp.t613refused('SELECT 1 FROM public.coach_home_order','42501'),'2 anon can''t read the table');
RESET ROLE;

-- ── 3. Bad values ──────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.t613actor(10);
SELECT pg_temp.t613check(pg_temp.t613refused(pg_temp.t613save('', ARRAY['x']),'23514'),'3 a squad view can''t be empty');
SELECT pg_temp.t613check(pg_temp.t613refused(format('INSERT INTO public.coach_home_order(day,squad_view,item_keys) VALUES(%L,%L,%L)',
  '2054-11-07','all',(SELECT array_agg('k'||n) FROM generate_series(1,101) n)),'23514'),'3 more than 100 keys is refused');
RESET ROLE;

-- ── 4. It goes with the account ────────────────────────────────────────────
DELETE FROM auth.users WHERE id=pg_temp.t613id(10);
SELECT pg_temp.t613check(NOT EXISTS(SELECT 1 FROM public.coach_home_order),'4 deleting the coach deletes their order');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.t613_results;
 IF total <> 16 THEN RAISE EXCEPTION 'Coach Home order: % checks ran; expected 16', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.t613_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Coach Home order checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Coach Home order: % of % passed', total, total;
END $$;
ROLLBACK;
