-- @trak-suite mode=--edit-match-review in-all=true
-- TRAK-185 part 1: a coach corrects a logged match (score, each player's goals,
-- assists and card) with the logging rules. Synthetic records, real role
-- checks, disposable database only.
BEGIN;
DO $$ BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing match-edit fixtures outside a disposable database';
  END IF;
END $$;
CREATE FUNCTION pg_temp.em(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('98185000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE em_results(description text, passed boolean, detail text);
GRANT INSERT ON em_results TO authenticated;
CREATE FUNCTION pg_temp.em_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.em_results VALUES(description,ok IS TRUE,NULL); END $$;
CREATE FUNCTION pg_temp.em_refused(statement text, code text, description text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := 'accepted';
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN actual := SQLSTATE; END;
  INSERT INTO pg_temp.em_results VALUES(description,actual=code,actual);
END $$;
CREATE FUNCTION pg_temp.em_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.em(n))::text,true);
$$;
-- The edit call: score, then per player (user, goals, assists, card).
CREATE FUNCTION pg_temp.em_edit(session integer, us integer, them integer, rows text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.edit_logged_match(%L::uuid,%s,%s,%L::jsonb)', pg_temp.em(session), us, them, rows);
$$;
CREATE FUNCTION pg_temp.em_row(player integer, goals integer, assists integer, card text DEFAULT 'None') RETURNS text LANGUAGE sql AS $$
  SELECT json_build_object('user_id',pg_temp.em(player),'goals',goals,'assists',assists,'card',card,'computed_rating',7.0)::text;
$$;

INSERT INTO auth.users(id,email) VALUES
 (pg_temp.em(1),'coach-a@synthetic.test'),(pg_temp.em(2),'coach-b@synthetic.test'),
 (pg_temp.em(3),'player-a@synthetic.test'),(pg_temp.em(4),'player-b@synthetic.test'),
 (pg_temp.em(5),'player-c@synthetic.test');
INSERT INTO public.profiles(user_id,full_name,role) VALUES
 (pg_temp.em(1),'Coach A','coach'),(pg_temp.em(2),'Coach B','coach'),
 (pg_temp.em(3),'Player A','player'),(pg_temp.em(4),'Player B','player'),(pg_temp.em(5),'Player C','player');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.em(1),NULL),(pg_temp.em(2),NULL);
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.em(3),(current_date-interval '19 years')::date),
 (pg_temp.em(4),(current_date-interval '19 years')::date),
 (pg_temp.em(5),(current_date-interval '19 years')::date);
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,status) VALUES
 (pg_temp.em(20),pg_temp.em(1),'Player A',pg_temp.em(3),'active'),
 (pg_temp.em(21),pg_temp.em(1),'Player B',pg_temp.em(4),'active'),
 (pg_temp.em(22),pg_temp.em(2),'Player C',pg_temp.em(5),'active');
INSERT INTO public.coach_sessions(id,coach_user_id,title,session_type,session_date) VALUES
 (pg_temp.em(30),pg_temp.em(1),'vs Synthetic Rovers','match',current_date-1),
 (pg_temp.em(32),pg_temp.em(2),'vs Synthetic United','match',current_date-1),
 (pg_temp.em(31),pg_temp.em(1),'Training','training',current_date-1);
INSERT INTO public.session_attendance(session_id,squad_player_id,status) VALUES
 (pg_temp.em(30),pg_temp.em(20),'present'),(pg_temp.em(30),pg_temp.em(21),'present'),
 (pg_temp.em(32),pg_temp.em(22),'present');

-- Logged 2-1: A scored (assisted by B), B scored.
SET LOCAL ROLE authenticated;
SELECT pg_temp.em_as(1);
SELECT public.log_match_for_player(pg_temp.em(3),'Synthetic Rovers',2,1,'League','Home','ST','U19',NULL,1,0,'None',NULL,NULL,7.0,current_date-1,pg_temp.em(30));
SELECT public.log_match_for_player(pg_temp.em(4),'Synthetic Rovers',2,1,'League','Home','MF','U19',NULL,1,1,'None',NULL,NULL,7.0,current_date-1,pg_temp.em(30));
SELECT pg_temp.em_as(2);
SELECT public.log_match_for_player(pg_temp.em(5),'Synthetic United',1,0,'League','Away','ST','U19',NULL,1,0,'None',NULL,NULL,7.0,current_date-1,pg_temp.em(32));

-- ── Reading a logged match back ──────────────────────────────────────────
SELECT pg_temp.em_as(1);
SELECT pg_temp.em_assert((SELECT count(*) = 2 AND bool_and(team_score = 2 AND opponent_score = 1) FROM public.logged_match(pg_temp.em(30))),
 'the coach reads back both players of their logged match');
SELECT pg_temp.em_assert((SELECT goals = 1 AND assists = 1 AND player_name = 'Player B' FROM public.logged_match(pg_temp.em(30)) WHERE user_id = pg_temp.em(4)),
 'each row carries the player and their numbers');
SELECT pg_temp.em_assert((SELECT count(*) = 0 FROM public.logged_match(pg_temp.em(32))),
 'another coach''s match reads as nothing');

-- ── Refused, and nothing changes ─────────────────────────────────────────
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,2,0)||','||pg_temp.em_row(4,2,1)||']'),'P0001',
 'goals that add up past the score are refused');
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,1,2)||','||pg_temp.em_row(4,1,2)||']'),'P0001',
 'more assists than the team''s goals are refused');
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,2,0)||']'),'P0001',
 'an edit must include every player in the match');
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,1,0)||','||pg_temp.em_row(4,1,0)||','||pg_temp.em_row(5,1,0)||']'),'P0001',
 'a player who is not in this match cannot be edited in');
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,1,0,'Purple')||','||pg_temp.em_row(4,1,0)||']'),'P0001',
 'a card is None, Yellow or Red');
SELECT pg_temp.em_refused(pg_temp.em_edit(30,-1,1,'['||pg_temp.em_row(3,0,0)||','||pg_temp.em_row(4,0,0)||']'),'P0001',
 'a negative score is refused');
SELECT pg_temp.em_refused(pg_temp.em_edit(31,1,0,'['||pg_temp.em_row(3,1,0)||']'),'42501',
 'a training is not a match to edit');
SELECT pg_temp.em_as(2);
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,2,0)||','||pg_temp.em_row(4,1,1)||']'),'42501',
 'another coach cannot edit the match');
SELECT pg_temp.em_as(3);
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,2,0)||','||pg_temp.em_row(4,1,1)||']'),'42501',
 'a player cannot edit the match');
RESET ROLE;
SELECT pg_temp.em_assert((SELECT bool_and(team_score = 2 AND opponent_score = 1) AND sum(goals) = 2 FROM public.matches WHERE session_id = pg_temp.em(30)),
 'every refused edit left the match as logged');

-- ── A correct edit ───────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.em_as(1);
SELECT pg_temp.em_assert(public.edit_logged_match(pg_temp.em(30),3,1,('['||pg_temp.em_row(3,2,0,'Yellow')||','||pg_temp.em_row(4,1,2)||']')::jsonb) = 2,
 'the corrected 3-1 saves both rows');
RESET ROLE;
SELECT pg_temp.em_assert((SELECT bool_and(team_score = 3 AND opponent_score = 1) FROM public.matches WHERE session_id = pg_temp.em(30)),
 'every row carries the new score');
SELECT pg_temp.em_assert((SELECT goals = 2 AND assists = 0 AND card_received = 'Yellow' AND computed_rating = 7.0 FROM public.matches WHERE user_id = pg_temp.em(3)),
 'player A has the corrected goals, card and rating');
SELECT pg_temp.em_assert((SELECT logged_by = pg_temp.em(1) AND logged_by_role = 'coach' AND position = 'ST' AND minutes_played IS NULL FROM public.matches WHERE user_id = pg_temp.em(3)),
 'who logged it, the position and the not-recorded minutes are kept');
SELECT pg_temp.em_assert((SELECT goals = 1 AND team_score = 1 FROM public.matches WHERE user_id = pg_temp.em(5)),
 'another coach''s match is untouched');

-- ── Consent (G1): a withdrawn or missing consent stops an edit ─────────────
UPDATE public.player_details SET date_of_birth = (current_date-interval '15 years')::date WHERE user_id = pg_temp.em(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.em_as(1);
SELECT pg_temp.em_refused(pg_temp.em_edit(30,3,1,'['||pg_temp.em_row(3,1,0)||','||pg_temp.em_row(4,1,0)||']'),'42501',
 'a child waiting for consent cannot be edited');
RESET ROLE;
SELECT pg_temp.em_assert((SELECT goals = 2 FROM public.matches WHERE user_id = pg_temp.em(3)),
 'the refused consent edit changed nothing');

-- ── Who may call it ──────────────────────────────────────────────────────
SELECT pg_temp.em_assert(NOT has_function_privilege('anon','public.edit_logged_match(uuid,integer,integer,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.logged_match(uuid)','EXECUTE'),
 'nobody signed out can call either function');
SELECT pg_temp.em_assert(has_function_privilege('authenticated','public.edit_logged_match(uuid,integer,integer,jsonb)','EXECUTE'),
 'signed-in coaches can call the edit');
SELECT pg_temp.em_assert(NOT has_table_privilege('authenticated','public.matches','UPDATE'),
 'direct updates still cannot bypass the rules');

DO $$ DECLARE failures text;
BEGIN SELECT string_agg(description||': '||coalesce(detail,'false'),E'\n') INTO failures FROM pg_temp.em_results WHERE NOT passed;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Match edit checks failed:%',E'\n'||failures; END IF;
END $$;
SELECT * FROM pg_temp.em_results;
ROLLBACK;
