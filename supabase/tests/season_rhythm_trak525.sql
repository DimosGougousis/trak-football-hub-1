-- @trak-suite mode=--season-rhythm in-all=true
-- TRAK-525 (Reports 2/10, Imad 21 Nov): the season plan's rhythm is every month, every 3 months, every 6 months, or
-- Custom: a number of weeks from 2 to 26, stored as '2w' to '26w'. Plans saved as every 2 or 6 weeks stay valid. The
-- coach sets a draft's rhythm; once shared, a new rhythm waits under Not shared yet as 'evaluation', as before. The
-- shared copy (written by share_season_plan(), the table owner) takes the same values. Anything else is refused.
-- Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing season-rhythm fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.r525id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('95250000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE r525_results(label text, ok boolean);
GRANT SELECT, INSERT ON r525_results TO authenticated;
CREATE FUNCTION pg_temp.r525check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.r525_results VALUES(label, ok IS TRUE)
$$;
-- True when the statement fails with exactly this SQLSTATE.
CREATE FUNCTION pg_temp.r525refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
CREATE FUNCTION pg_temp.r525changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
CREATE FUNCTION pg_temp.r525set(plan integer, every text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT format('UPDATE public.season_plans SET eval_every = %L WHERE id = %L', every, pg_temp.r525id(plan))
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Coach (10) at an academy with the season plan (100): U16's plan (50) is a draft, U14's (51) was shared a month ago.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.r525id(n),'synthetic-'||n||'@rhythm525.invalid',now() FROM unnest(ARRAY[1,10]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.r525id(1),'club','Synthetic Admin'),(pg_temp.r525id(10),'coach','Synthetic Coach');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.r525id(100),pg_temp.r525id(1),'Rhythm Academy','R525A1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.r525id(10),pg_temp.r525id(100));
INSERT INTO public.squad_players(id,coach_user_id,player_name,age_group,position) VALUES
 (pg_temp.r525id(40),pg_temp.r525id(10),'Synthetic Player Pat','U16','Defender'),
 (pg_temp.r525id(41),pg_temp.r525id(10),'Synthetic Player Uri','U14','Midfielder');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.r525id(100),'season_plan') ON CONFLICT DO NOTHING;
INSERT INTO public.season_plans(id,coach_user_id,squad,starts_on,ends_on) VALUES
 (pg_temp.r525id(50),pg_temp.r525id(10),'U16',current_date - 60,current_date + 200),
 (pg_temp.r525id(51),pg_temp.r525id(10),'U14',current_date - 60,current_date + 200);
UPDATE public.season_plans SET shared_at = now() - interval '30 days', last_shared_at = now() - interval '30 days',
  shared_eval_every = eval_every, shared_eval_day = eval_day
 WHERE id = pg_temp.r525id(51);

-- 1. The coach sets a draft's rhythm to any of the choices, and nothing else.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.r525id(10))::text,true);
SELECT pg_temp.r525check((SELECT bool_and(pg_temp.r525changed(pg_temp.r525set(50, every)) = 1)
  FROM unnest(ARRAY['3m','6m','2w','12w','26w','6w','month']) every), '1 every month, 3 months, 6 months, and 2 to 26 weeks');
SELECT pg_temp.r525check((SELECT bool_and(pg_temp.r525refused(pg_temp.r525set(50, every), '23514'))
  FROM unnest(ARRAY['1w','27w','0w','02w','12m','2m','weekly','3m ','']) every), '1 nothing else: 1 or 27 weeks, other months, other words');

-- 2. Once shared, a new rhythm waits under Not shared yet, as before.
SELECT pg_temp.r525check(pg_temp.r525changed(pg_temp.r525set(51, '3m')) = 1, '2 the coach sets a shared plan to every 3 months');
RESET ROLE;
SELECT pg_temp.r525check((SELECT unshared_parts = '{evaluation}' AND eval_every = '3m' AND shared_eval_every = 'month'
  FROM public.season_plans WHERE id = pg_temp.r525id(51)), '2 it waits under Not shared yet; families still read every month');

-- 3. The shared copy, as share_season_plan() writes it, takes the same values and refuses the rest.
SELECT pg_temp.r525check((SELECT bool_and(pg_temp.r525changed(format(
  'UPDATE public.season_plans SET shared_eval_every = %L WHERE id = %L', every, pg_temp.r525id(51))) = 1)
  FROM unnest(ARRAY['3m','6m','9w','26w','2w']) every), '3 the shared copy carries the new choices and the weeks');
SELECT pg_temp.r525check(pg_temp.r525refused(format(
  'UPDATE public.season_plans SET shared_eval_every = ''27w'' WHERE id = %L', pg_temp.r525id(51)), '23514'), '3 and refuses anything else');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.r525_results;
 IF total <> 6 THEN RAISE EXCEPTION 'Season rhythm: % checks ran; expected 6', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.r525_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Season rhythm checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Season rhythm: % of % passed', total, total;
END $$;
ROLLBACK;
