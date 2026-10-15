-- @trak-suite mode=--match-session-review in-all=true
-- Synthetic records, real role checks, disposable database only.
BEGIN;
DO $$ BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing session-link fixtures outside a disposable database';
  END IF;
END $$;
CREATE FUNCTION pg_temp.ml(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('98174000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE ml_results(description text, passed boolean, detail text);
GRANT INSERT ON ml_results TO authenticated;
CREATE FUNCTION pg_temp.ml_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.ml_results VALUES(description,ok IS TRUE,NULL); END $$;
CREATE FUNCTION pg_temp.ml_refused(statement text, code text, description text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := 'accepted';
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN actual := SQLSTATE; END;
  INSERT INTO pg_temp.ml_results VALUES(description,actual=code,actual);
END $$;
INSERT INTO auth.users(id,email) VALUES
 (pg_temp.ml(1),'coach-a@synthetic.test'),(pg_temp.ml(2),'coach-b@synthetic.test'),
 (pg_temp.ml(3),'player-a@synthetic.test'),(pg_temp.ml(4),'player-b@synthetic.test'),
 (pg_temp.ml(5),'player-c@synthetic.test');
INSERT INTO public.profiles(user_id,full_name,role) VALUES
 (pg_temp.ml(1),'Coach A','coach'),(pg_temp.ml(2),'Coach B','coach'),
 (pg_temp.ml(3),'Player A','player'),(pg_temp.ml(4),'Player B','player'),(pg_temp.ml(5),'Player C','player');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.ml(1),NULL),(pg_temp.ml(2),NULL);
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.ml(3),(current_date-interval '19 years')::date),
 (pg_temp.ml(4),(current_date-interval '19 years')::date),
 (pg_temp.ml(5),(current_date-interval '19 years')::date);
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,status) VALUES
 (pg_temp.ml(20),pg_temp.ml(1),'Player A',pg_temp.ml(3),'active'),
 (pg_temp.ml(21),pg_temp.ml(1),'Player B',pg_temp.ml(4),'active'),
 (pg_temp.ml(22),pg_temp.ml(2),'Player C',pg_temp.ml(5),'active');
INSERT INTO public.coach_sessions(id,coach_user_id,title,session_type,session_date) VALUES
 (pg_temp.ml(30),pg_temp.ml(1),'Match A','match',current_date-1),
 (pg_temp.ml(31),pg_temp.ml(1),'Training','training',current_date-1),
 (pg_temp.ml(32),pg_temp.ml(2),'Match B','match',current_date-1),
 (pg_temp.ml(33),pg_temp.ml(1),'Other date','match',current_date-2);
INSERT INTO public.session_attendance(session_id,squad_player_id,status) VALUES
 (pg_temp.ml(30),pg_temp.ml(20),'present'),(pg_temp.ml(30),pg_temp.ml(21),'absent'),
 (pg_temp.ml(31),pg_temp.ml(20),'present'),(pg_temp.ml(32),pg_temp.ml(22),'present'),
 -- Player A also attended Coach B's match, so only the session-owner check can refuse it.
 (pg_temp.ml(32),pg_temp.ml(20),'present'),
 (pg_temp.ml(33),pg_temp.ml(20),'present');
CREATE FUNCTION pg_temp.ml_call(player integer, session integer) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.log_match_for_player(%L::uuid,%L,1,0,%L,%L,%L,%L,90,0,0,%L,NULL,NULL,6.5,current_date-1,%L::uuid)',
 pg_temp.ml(player),'Synthetic opponent','League','Home','ST','U19','None',pg_temp.ml(session));
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.ml(1))::text,true);
SELECT pg_temp.ml_refused(pg_temp.ml_call(4,30),'42501','absent sibling cannot be linked');
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,31),'42501','training cannot be linked to a match');
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,32),'42501','another coach session cannot be linked');
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,33),'42501','another date cannot be linked');
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,999),'42501','unknown session cannot be linked');
DO $$ BEGIN EXECUTE pg_temp.ml_call(3,30); END $$;
RESET ROLE;
SELECT pg_temp.ml_assert((SELECT session_id=pg_temp.ml(30) FROM public.matches WHERE user_id=pg_temp.ml(3)),
 'attended match retains its exact session');
-- The unique constraint backs the readable RPC check during concurrent saves.
SELECT pg_temp.ml_refused(format('INSERT INTO public.matches(user_id,position,age_group,competition,venue,minutes_played,goals,assists,team_score,opponent_score,session_id) VALUES(%L::uuid,%L,%L,%L,%L,90,0,0,1,0,%L::uuid)',
 pg_temp.ml(3),'ST','U19','League','Home',pg_temp.ml(30)), '23505', 'the database also prevents duplicate player/session rows');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,30),'P0001','retry cannot duplicate a session match');
-- Existing callers, including the hidden quick logger, omit the new argument.
SELECT public.log_match_for_player(pg_temp.ml(4),'Legacy opponent',1,0,'League','Home','ST','U19',90,0,0,'None',NULL,NULL,6.5,current_date-1);
RESET ROLE;
SELECT pg_temp.ml_assert((SELECT session_id IS NULL FROM public.matches WHERE user_id=pg_temp.ml(4)),
 'old callers keep a null link rather than guessing');
RESET ROLE;
UPDATE public.player_details SET date_of_birth=(current_date-interval '15 years')::date WHERE user_id=pg_temp.ml(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,30),'42501','consent is rechecked even with a saved session');
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.ml(3))::text,true);
SELECT pg_temp.ml_refused(pg_temp.ml_call(3,30),'P0001','player cannot create a coach session link');
RESET ROLE;
SELECT pg_temp.ml_assert(NOT has_table_privilege('authenticated','public.matches','INSERT')
 AND NOT has_table_privilege('authenticated','public.matches','UPDATE'),
 'direct writes cannot bypass RPC link checks');
SELECT pg_temp.ml_assert(obj_description('public.log_match_for_player(uuid,text,integer,integer,text,text,text,text,integer,integer,integer,text,text,text,numeric,date,uuid)'::regprocedure,'pg_proc') LIKE 'Coach-side match logging.%',
 'the function keeps its documentation comment');
DELETE FROM public.coach_sessions WHERE id=pg_temp.ml(30);
SELECT pg_temp.ml_assert((SELECT session_id IS NULL FROM public.matches WHERE user_id=pg_temp.ml(3)),
 'session deletion preserves the match facts');
DO $$ DECLARE failures text;
BEGIN SELECT string_agg(description||': '||coalesce(detail,'false'),E'\n') INTO failures FROM pg_temp.ml_results WHERE NOT passed;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Session link checks failed:%',E'\n'||failures; END IF;
END $$;
SELECT * FROM pg_temp.ml_results;
ROLLBACK;
