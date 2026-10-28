-- @trak-suite mode=--training-plans in-all=true
-- TRAK-295 (Training 2/5, spec TRAK-293): a training's plan, saved whole by save_training_plan(). Only the
-- training's coach reads or writes it: no other coach, player, guardian or anon. Writes need the academy's training
-- switch on and the coach's own training, not cancelled; reads don't, so switching off loses nothing. A save is all
-- or nothing, holds 1 to 12 practices, and "Save to My drills" makes a drill in the same save. Bad values are
-- refused. Test people are named after footballers. Synthetic fixtures; the suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing training-plans fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.t295id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92950000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE t295_results(label text, ok boolean);
GRANT SELECT, INSERT ON t295_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.t295actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.t295id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.t295check(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.t295_results VALUES(label, ok IS TRUE)
$$;
-- True when the statement fails with exactly this SQLSTATE.
CREATE FUNCTION pg_temp.t295refused(statement text, code text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; END;
 RETURN st IS NOT DISTINCT FROM code;
END $$;
-- How many rows a statement changed (0 when a rule hid them).
CREATE FUNCTION pg_temp.t295changed(statement text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
-- Saves a plan for an event; the statement, so t295refused can run it.
CREATE FUNCTION pg_temp.t295save(event integer, practices jsonb) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.save_training_plan(%L,%L::jsonb)', pg_temp.t295id(event), practices)
$$;
-- One practice written here.
CREATE FUNCTION pg_temp.t295p(name text, minutes integer, extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('name',name,'minutes',minutes,'tell','','source','own') || extra
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy On (100) has Training: Jürgen Klopp (10) plans his trainings; Pep Guardiola (11) coaches there too.
-- Academy Off (101) hasn't: Carlo Ancelotti (12). Thierry Henry (20) is a player, Patrick Vieira (30) a guardian.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.t295id(n),'synthetic-'||n||'@training295.invalid',now() FROM unnest(ARRAY[1,2,10,11,12,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.t295id(1),'club','Arsène Wenger'),(pg_temp.t295id(2),'club','Alex Ferguson'),
 (pg_temp.t295id(10),'coach','Jürgen Klopp'),(pg_temp.t295id(11),'coach','Pep Guardiola'),
 (pg_temp.t295id(12),'coach','Carlo Ancelotti'),
 (pg_temp.t295id(20),'player','Thierry Henry'),(pg_temp.t295id(30),'parent','Patrick Vieira');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.t295id(100),pg_temp.t295id(1),'Training On Academy','T295N1'),
 (pg_temp.t295id(101),pg_temp.t295id(2),'Training Off Academy','T295F1');
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.t295id(10),pg_temp.t295id(100)),(pg_temp.t295id(11),pg_temp.t295id(100)),(pg_temp.t295id(12),pg_temp.t295id(101));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES(pg_temp.t295id(20),'2000-01-01');
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.t295id(100),'training');
-- Jürgen: 500 a training, 501 a training cancelled later, 502 a match, 503 a training planned on in section 7.
-- 504 is Pep's training, 505 Carlo's.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,opponent,starts_at,start_time,published) VALUES
 (pg_temp.t295id(500),pg_temp.t295id(10),'Pressing','training',NULL,'2054-11-05 15:00+00','19:00',true),
 (pg_temp.t295id(501),pg_temp.t295id(10),'Finishing','training',NULL,'2054-11-06 15:00+00','19:00',true),
 (pg_temp.t295id(502),pg_temp.t295id(10),'vs Everton','match','Everton','2054-11-07 15:00+00','19:00',true),
 (pg_temp.t295id(503),pg_temp.t295id(10),'Rondos','training',NULL,'2054-11-08 15:00+00','19:00',false),
 (pg_temp.t295id(504),pg_temp.t295id(11),'Positional play','training',NULL,'2054-11-05 15:00+00','19:00',true),
 (pg_temp.t295id(505),pg_temp.t295id(12),'Shape','training',NULL,'2054-11-05 15:00+00','19:00',true);

SET LOCAL ROLE authenticated;

-- ── 1. The coach saves a plan, whole ───────────────────────────────────────
SELECT pg_temp.t295actor(10);
SELECT public.save_training_plan(pg_temp.t295id(500), jsonb_build_array(
  pg_temp.t295p('Warm-up: rondos 4v1',15,'{"area":"10 × 10 m"}'),
  pg_temp.t295p('Pressing on the trigger',25,'{"tell":"Press as soon as their 6 turns back.","save_to_drills":true}')));
SELECT pg_temp.t295check((SELECT coach_user_id FROM public.training_plans WHERE event_id=pg_temp.t295id(500))=pg_temp.t295id(10),
  '1 a coach saves a plan for their training, and it is theirs');
SELECT pg_temp.t295check((SELECT array_agg(name ORDER BY position) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(500))
  =ARRAY['Warm-up: rondos 4v1','Pressing on the trigger'],'1 its practices keep their order');
SELECT pg_temp.t295check((SELECT area FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(500) AND position=1)='10 × 10 m',
  '1 with their details');
SELECT pg_temp.t295check((SELECT source='own' AND drill_id IS NULL FROM public.training_plan_practices
  WHERE event_id=pg_temp.t295id(500) AND position=1),'1 a practice written here says so');
SELECT pg_temp.t295check((SELECT p.source='drill' AND d.coach_user_id=pg_temp.t295id(10) AND d.tell='Press as soon as their 6 turns back.'
  FROM public.training_plan_practices p JOIN public.coach_drills d ON d.id=p.drill_id
  WHERE p.event_id=pg_temp.t295id(500) AND p.position=2),'1 "Save to My drills" makes it one of the coach''s drills, in the same save');

-- Saving again replaces the practices: two become one.
SELECT public.save_training_plan(pg_temp.t295id(500), jsonb_build_array(pg_temp.t295p('Game 8v8',30)));
SELECT pg_temp.t295check((SELECT array_agg(name) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(500))=ARRAY['Game 8v8'],
  '1 saving again replaces the practices');
SELECT pg_temp.t295check((SELECT count(*) FROM public.coach_drills WHERE name='Pressing on the trigger')=1,
  '1 and keeps the drill it made');

-- ── 2. All or nothing ──────────────────────────────────────────────────────
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(
  pg_temp.t295p('Fine',15,'{"save_to_drills":true}'), pg_temp.t295p('   ',15))),'23514'),'2 a blank name stops the save');
SELECT pg_temp.t295check((SELECT array_agg(name) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(500))=ARRAY['Game 8v8'],
  '2 and the saved plan is as it was');
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.coach_drills WHERE name='Fine'),'2 with no drill made either');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500,'[]'),'P0001'),'2 a plan needs a practice');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500,
  (SELECT jsonb_agg(pg_temp.t295p('Drill '||n,10)) FROM generate_series(1,13) n)),'P0001'),'2 a plan holds at most 12 practices');
SELECT public.save_training_plan(pg_temp.t295id(503),(SELECT jsonb_agg(pg_temp.t295p('Drill '||n,10)) FROM generate_series(1,12) n));
SELECT pg_temp.t295check((SELECT count(*) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(503))=12,
  '2 twelve is fine, on a training not yet published');

-- ── 3. Only the coach's own, open trainings ────────────────────────────────
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(504, jsonb_build_array(pg_temp.t295p('Mine',15))),'P0001'),
  '3 not another coach''s training');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(502, jsonb_build_array(pg_temp.t295p('Shape',15))),'P0001'),
  '3 not a match');
SELECT pg_temp.t295check(pg_temp.t295refused(format('INSERT INTO public.training_plans(event_id) VALUES(%L)',pg_temp.t295id(502)),'42501'),
  '3 not a match, even written directly');
SELECT pg_temp.t295check(pg_temp.t295refused(format('INSERT INTO public.training_plans(event_id) VALUES(%L)',pg_temp.t295id(504)),'42501'),
  '3 not another coach''s training, written directly');
SELECT pg_temp.t295check(pg_temp.t295refused(format('INSERT INTO public.training_plans(event_id,coach_user_id) VALUES(%L,%L)',
  pg_temp.t295id(501),pg_temp.t295id(11)),'42501'),'3 not in another coach''s name');
-- A practice can't name another coach's drill.
RESET ROLE;
INSERT INTO public.coach_drills(id,coach_user_id,name,minutes) VALUES(pg_temp.t295id(600),pg_temp.t295id(11),'Pep''s rondo',15);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t295actor(10);
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Rondo',15,
  jsonb_build_object('source','drill','drill_id',pg_temp.t295id(600))))),'42501'),'3 a practice can''t name another coach''s drill');

-- ── 4. Nobody else reads or changes a plan ─────────────────────────────────
SELECT pg_temp.t295actor(11);
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.training_plans),'4 another coach of the same academy reads no plan');
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.training_plan_practices),'4 or practice');
SELECT pg_temp.t295check(pg_temp.t295changed(format('DELETE FROM public.training_plan_practices WHERE event_id=%L',pg_temp.t295id(500)))=0,
  '4 or removes one');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Mine',15))),'P0001'),
  '4 or saves over it');
SELECT pg_temp.t295actor(20);
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.training_plans) AND NOT EXISTS(SELECT 1 FROM public.training_plan_practices),
  '4 a player reads none');
SELECT pg_temp.t295actor(30);
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.training_plans) AND NOT EXISTS(SELECT 1 FROM public.training_plan_practices),
  '4 a guardian reads none');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.t295check(pg_temp.t295refused('SELECT 1 FROM public.training_plans','42501'),'4 anon can''t read plans at all');
SELECT pg_temp.t295check(pg_temp.t295refused('SELECT 1 FROM public.training_plan_practices','42501'),'4 or practices');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Anon',15))),'42501'),
  '4 or save one');
RESET ROLE;

-- ── 5. Bad values are refused ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.t295actor(10);
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p(repeat('x',81),15))),'23514'),
  '5 a name over 80');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Long',90))),'23514'),
  '5 minutes over 60');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Tell',15,
  jsonb_build_object('tell',repeat('x',501))))),'23514'),'5 what you''ll tell them over 500');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Cond',15,
  jsonb_build_object('conditions',repeat('x',121))))),'23514'),'5 a detail over 120');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Odd',15,'{"source":"internet"}'))),'23514'),
  '5 an unknown source');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(500, jsonb_build_array(pg_temp.t295p('Lib',15,'{"source":"library"}'))),'23514'),
  '5 a Library practice with no session');

-- ── 6. Cancelled: writes stop, reads stay ──────────────────────────────────
SELECT public.save_training_plan(pg_temp.t295id(501), jsonb_build_array(pg_temp.t295p('Finishing 3v2',20)));
RESET ROLE;
UPDATE public.coach_calendar_events SET status='cancelled' WHERE id=pg_temp.t295id(501);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t295actor(10);
SELECT pg_temp.t295check(EXISTS(SELECT 1 FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(501)),
  '6 a cancelled training''s plan is still read');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(501, jsonb_build_array(pg_temp.t295p('After',15))),'P0001'),
  '6 but not saved again');
SELECT pg_temp.t295check(pg_temp.t295changed(format('DELETE FROM public.training_plan_practices WHERE event_id=%L',pg_temp.t295id(501)))=0,
  '6 or emptied directly');

-- ── 7. Switched off: writes stop, reads stay ───────────────────────────────
SELECT pg_temp.t295actor(12);
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(505, jsonb_build_array(pg_temp.t295p('Off',15))),'42501'),
  '7 a coach of an academy without Training can''t save a plan');
RESET ROLE;
DELETE FROM public.academy_features WHERE organization_id=pg_temp.t295id(100) AND feature='training';
SET LOCAL ROLE authenticated;
SELECT pg_temp.t295actor(10);
SELECT pg_temp.t295check((SELECT count(*) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(503))=12,
  '7 switched off, the coach still reads their plans');
SELECT pg_temp.t295check(pg_temp.t295refused(pg_temp.t295save(503, jsonb_build_array(pg_temp.t295p('After',15))),'42501'),
  '7 but can''t save one');
SELECT pg_temp.t295check((SELECT count(*) FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(503))=12,
  '7 and the plan is as it was');
RESET ROLE;

-- ── 8. A plan goes with its training ───────────────────────────────────────
DELETE FROM public.coach_calendar_events WHERE id=pg_temp.t295id(503);
SELECT pg_temp.t295check(NOT EXISTS(SELECT 1 FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(503)),
  '8 deleting a training deletes its plan');
-- A practice is a copy: deleting the drill it came from leaves it in the plan.
INSERT INTO public.coach_drills(id,coach_user_id,name,minutes) VALUES(pg_temp.t295id(601),pg_temp.t295id(10),'Overloads',20);
INSERT INTO public.training_plan_practices(event_id,position,name,minutes,source,drill_id)
 VALUES(pg_temp.t295id(500),2,'Overloads',20,'drill',pg_temp.t295id(601));
DELETE FROM public.coach_drills WHERE id=pg_temp.t295id(601);
SELECT pg_temp.t295check(EXISTS(SELECT 1 FROM public.training_plan_practices WHERE event_id=pg_temp.t295id(500) AND name='Overloads'),
  '8 deleting a drill leaves its practice in the plan');
SELECT pg_temp.t295check((SELECT drill_id IS NULL AND source='drill' FROM public.training_plan_practices
  WHERE event_id=pg_temp.t295id(500) AND position=2),'8 still marked as the coach''s drill');

DO $$ DECLARE failures text; total integer;
BEGIN
 SELECT count(*) INTO total FROM pg_temp.t295_results;
 IF total <> 44 THEN RAISE EXCEPTION 'Training plans: % checks ran; expected 44', total; END IF;
 SELECT string_agg(label, E'\n') INTO failures FROM pg_temp.t295_results WHERE NOT ok;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Training plans checks failed:%', E'\n' || failures; END IF;
 RAISE NOTICE 'Training plans: % of % passed', total, total;
END $$;
ROLLBACK;
