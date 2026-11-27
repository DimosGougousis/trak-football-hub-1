-- @trak-suite mode=--coach-todos in-all=true
-- TRAK-612 (New Home 6/8): the coach's own to-dos. Only their coach reads, adds, ticks or removes them: no other coach,
-- player, guardian or anon. Only a coach can add one. Bad values are refused. Test people are named after footballers.
-- Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing coach-todos fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.t612id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('96120000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE t612_results(label text, ok boolean);
GRANT SELECT, INSERT ON t612_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.t612actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.t612id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.t612check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.t612_results VALUES(label, ok IS TRUE)
$$;
CREATE FUNCTION pg_temp.t612refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
CREATE FUNCTION pg_temp.t612changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION pg_temp.t612add(title text, urgent boolean DEFAULT false) RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.coach_todos(title,due_on,urgent) VALUES(%L,%L,%L)', title, '2054-11-05', urgent)
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Jürgen Klopp (10) and Pep Guardiola (11) coach; Thierry Henry (20) is a player, Patrick Vieira (30) a guardian.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.t612id(n),'synthetic-'||n||'@todos612.invalid',now() FROM unnest(ARRAY[10,11,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.t612id(10),'coach','Jürgen Klopp'),(pg_temp.t612id(11),'coach','Pep Guardiola'),
 (pg_temp.t612id(20),'player','Thierry Henry'),(pg_temp.t612id(30),'parent','Patrick Vieira');
INSERT INTO public.player_details(user_id,date_of_birth) VALUES(pg_temp.t612id(20),'2000-01-01');

SET LOCAL ROLE authenticated;

-- ── 1. A coach adds, reads, ticks and removes their own ───────────────────
SELECT pg_temp.t612actor(10);
SELECT pg_temp.t612check(NOT pg_temp.t612refused(pg_temp.t612add('Call the pitch about Saturday'),'42501'),'1 a coach adds a to-do');
SELECT pg_temp.t612check(NOT pg_temp.t612refused(pg_temp.t612add('Order new bibs', true),'42501'),'1 and an urgent one');
SELECT pg_temp.t612check((SELECT count(*) FROM public.coach_todos)=2,'1 and reads both');
SELECT pg_temp.t612check((SELECT coach_user_id FROM public.coach_todos WHERE title='Order new bibs')=pg_temp.t612id(10),'1 the row is theirs');
SELECT pg_temp.t612check(pg_temp.t612changed('UPDATE public.coach_todos SET done_at=now() WHERE title=''Order new bibs''')=1,'1 ticks one');
SELECT pg_temp.t612check(pg_temp.t612changed('DELETE FROM public.coach_todos WHERE title=''Order new bibs''')=1,'1 removes one');

-- ── 2. Nobody else ─────────────────────────────────────────────────────────
SELECT pg_temp.t612actor(11);
SELECT pg_temp.t612check(NOT EXISTS(SELECT 1 FROM public.coach_todos),'2 another coach reads none');
SELECT pg_temp.t612check(pg_temp.t612changed('UPDATE public.coach_todos SET done_at=now()')=0,'2 nor ticks any');
SELECT pg_temp.t612check(pg_temp.t612changed('DELETE FROM public.coach_todos')=0,'2 nor removes any');
SELECT pg_temp.t612check(pg_temp.t612refused(format('INSERT INTO public.coach_todos(coach_user_id,title,due_on) VALUES(%L,%L,%L)',
  pg_temp.t612id(10),'Not mine','2054-11-05'),'42501'),'2 nor adds one for another coach');
SELECT pg_temp.t612actor(20);
SELECT pg_temp.t612check(NOT EXISTS(SELECT 1 FROM public.coach_todos),'2 a player reads none');
SELECT pg_temp.t612check(pg_temp.t612refused(pg_temp.t612add('Mine'),'42501'),'2 nor adds one');
SELECT pg_temp.t612actor(30);
SELECT pg_temp.t612check(NOT EXISTS(SELECT 1 FROM public.coach_todos),'2 a guardian reads none');
SELECT pg_temp.t612check(pg_temp.t612refused(pg_temp.t612add('Mine'),'42501'),'2 nor adds one');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.t612check(pg_temp.t612refused('SELECT 1 FROM public.coach_todos','42501'),'2 anon can''t read the table');
RESET ROLE;

-- ── 3. Bad values ──────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.t612actor(10);
SELECT pg_temp.t612check(pg_temp.t612refused(pg_temp.t612add('   '),'23514'),'3 an empty to-do is refused');
SELECT pg_temp.t612check(pg_temp.t612refused(pg_temp.t612add(repeat('x',121)),'23514'),'3 over 120 characters is refused');
SELECT pg_temp.t612check(pg_temp.t612refused('INSERT INTO public.coach_todos(title) VALUES(''No day'')','23502'),'3 a to-do needs its day');
RESET ROLE;

-- ── 4. A coach's to-dos go with their account ──────────────────────────────
DELETE FROM auth.users WHERE id=pg_temp.t612id(10);
SELECT pg_temp.t612check(NOT EXISTS(SELECT 1 FROM public.coach_todos),'4 deleting the coach deletes their to-dos');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.t612_results;
 IF total <> 19 THEN RAISE EXCEPTION 'Coach to-dos: % checks ran; expected 19', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.t612_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Coach to-dos checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Coach to-dos: % of % passed', total, total;
END $$;
ROLLBACK;
