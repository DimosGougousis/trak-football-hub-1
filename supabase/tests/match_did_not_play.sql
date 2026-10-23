-- @trak-suite mode=--did-not-play-review in-all=true
-- TRAK-185 part 2: a player removed from a logged match is kept, as "Didn't
-- play", and no longer counts (Imad, 18 Oct). Synthetic records, real role
-- checks, disposable database only.
BEGIN;
DO $$ BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing did-not-play fixtures outside a disposable database';
  END IF;
END $$;
CREATE FUNCTION pg_temp.dp(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('98185200-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE dp_results(description text, passed boolean, detail text);
GRANT INSERT ON dp_results TO authenticated;
CREATE FUNCTION pg_temp.dp_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.dp_results VALUES(description,ok IS TRUE,NULL); END $$;
CREATE FUNCTION pg_temp.dp_refused(statement text, code text, description text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := 'accepted';
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN actual := SQLSTATE; END;
  INSERT INTO pg_temp.dp_results VALUES(description,actual=code,actual);
END $$;
CREATE FUNCTION pg_temp.dp_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',pg_temp.dp(n))::text,true);
$$;
CREATE FUNCTION pg_temp.dp_mark(session integer, player integer, played boolean) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.mark_match_appearance(%L::uuid,%L::uuid,%L)', pg_temp.dp(session), pg_temp.dp(player), played);
$$;

INSERT INTO auth.users(id,email) VALUES
 (pg_temp.dp(1),'coach-a@synthetic.test'),(pg_temp.dp(2),'coach-b@synthetic.test'),
 (pg_temp.dp(3),'player-a@synthetic.test'),(pg_temp.dp(4),'player-b@synthetic.test'),
 (pg_temp.dp(5),'player-c@synthetic.test'),(pg_temp.dp(6),'player-d@synthetic.test');
INSERT INTO public.profiles(user_id,full_name,role) VALUES
 (pg_temp.dp(1),'Coach A','coach'),(pg_temp.dp(2),'Coach B','coach'),
 (pg_temp.dp(3),'Player A','player'),(pg_temp.dp(4),'Player B','player'),
 (pg_temp.dp(5),'Player C','player'),(pg_temp.dp(6),'Player D','player');
INSERT INTO public.coach_details(user_id,organization_id) VALUES (pg_temp.dp(1),NULL),(pg_temp.dp(2),NULL);
INSERT INTO public.player_details(user_id,date_of_birth)
 SELECT pg_temp.dp(n),(current_date-interval '19 years')::date FROM unnest(ARRAY[3,4,5,6]) n;
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,status) VALUES
 (pg_temp.dp(20),pg_temp.dp(1),'Player A',pg_temp.dp(3),'active'),
 (pg_temp.dp(21),pg_temp.dp(1),'Player B',pg_temp.dp(4),'active'),
 (pg_temp.dp(23),pg_temp.dp(1),'Player D',pg_temp.dp(6),'active'),
 (pg_temp.dp(22),pg_temp.dp(2),'Player C',pg_temp.dp(5),'active');
INSERT INTO public.coach_sessions(id,coach_user_id,title,session_type,session_date) VALUES
 (pg_temp.dp(30),pg_temp.dp(1),'vs Synthetic Rovers','match',current_date-1),
 (pg_temp.dp(32),pg_temp.dp(2),'vs Synthetic United','match',current_date-1);
INSERT INTO public.session_attendance(session_id,squad_player_id,status) VALUES
 (pg_temp.dp(30),pg_temp.dp(20),'present'),(pg_temp.dp(30),pg_temp.dp(21),'present'),
 (pg_temp.dp(30),pg_temp.dp(23),'present'),(pg_temp.dp(32),pg_temp.dp(22),'present');

-- Logged 2-1: A scored, B scored and assisted, D played.
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT public.log_match_for_player(pg_temp.dp(3),'Synthetic Rovers',2,1,'League','Home','ST','U19',NULL,1,0,'None',NULL,NULL,7.0,current_date-1,pg_temp.dp(30));
SELECT public.log_match_for_player(pg_temp.dp(4),'Synthetic Rovers',2,1,'League','Home','MF','U19',NULL,1,1,'Yellow',NULL,NULL,7.5,current_date-1,pg_temp.dp(30));
SELECT public.log_match_for_player(pg_temp.dp(6),'Synthetic Rovers',2,1,'League','Home','DF','U19',NULL,0,0,'None',NULL,NULL,6.5,current_date-1,pg_temp.dp(30));
SELECT pg_temp.dp_as(2);
SELECT public.log_match_for_player(pg_temp.dp(5),'Synthetic United',1,0,'League','Away','ST','U19',NULL,1,0,'None',NULL,NULL,7.0,current_date-1,pg_temp.dp(32));
RESET ROLE;
-- D has an assessment on this match: it says D played.
INSERT INTO public.coach_assessments(id,squad_player_id,coach_user_id,session_id,work_rate,tactical,attitude,technical,physical,coachability,appearance)
 VALUES (pg_temp.dp(40),pg_temp.dp(23),pg_temp.dp(1),pg_temp.dp(30),7,7,7,7,7,7,'started');

-- ── Marking B "Didn't play" ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT public.mark_match_appearance(pg_temp.dp(30),pg_temp.dp(4),false);
SELECT pg_temp.dp_assert((SELECT count(*) = 3 FROM public.logged_match(pg_temp.dp(30))),
 'the match still lists B, beside A and D');
SELECT pg_temp.dp_assert((SELECT NOT played AND goals IS NULL AND assists IS NULL AND card_received IS NULL
  FROM public.logged_match(pg_temp.dp(30)) WHERE user_id = pg_temp.dp(4)),
 'B is listed as Didn''t play, with no goals, assists or card');
RESET ROLE;
SELECT pg_temp.dp_assert(NOT EXISTS (SELECT 1 FROM public.matches WHERE user_id = pg_temp.dp(4)),
 'B no longer has a match row, so no stat counts it');
SELECT pg_temp.dp_assert((SELECT (recorded->>'goals')::int = 1 AND recorded->>'card_received' = 'Yellow' AND marked_by = pg_temp.dp(1)
  FROM public.match_non_appearances WHERE user_id = pg_temp.dp(4)),
 'B''s original record is kept, never deleted');
SELECT pg_temp.dp_assert((SELECT status = 'absent' FROM public.session_attendance WHERE session_id = pg_temp.dp(30) AND squad_player_id = pg_temp.dp(21)),
 'B is no longer present at the match');

-- ── Refused, and nothing changes ─────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,6,false),'P0001','a player assessed on the match can''t be marked as not playing');
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,4,false),'P0001','a player already marked can''t be marked twice');
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,5,false),'42501','a player not in the coach''s squad is refused');
SELECT pg_temp.dp_as(2);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,3,false),'42501','another coach cannot change the match');
SELECT pg_temp.dp_as(3);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,3,false),'42501','a player cannot change the match');
SELECT pg_temp.dp_refused('SELECT count(*) FROM public.match_non_appearances','42501','a player cannot read the kept records directly');
RESET ROLE;
-- With D unmarkable and B out, A is the last player who played and can be marked only if D goes first: remove D's assessment's protection by a second match.
DELETE FROM public.coach_assessments WHERE id = pg_temp.dp(40);
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT public.mark_match_appearance(pg_temp.dp(30),pg_temp.dp(6),false);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,3,false),'P0001','the last player who played can''t be removed');

-- ── "Played after all" ───────────────────────────────────────────────────
-- The match is corrected to 1-1 while B is out: B's goal back would not fit.
SELECT public.edit_logged_match(pg_temp.dp(30),1,1,('['||json_build_object('user_id',pg_temp.dp(3),'goals',1,'assists',0,'card','None','computed_rating',7.0)::text||']')::jsonb);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,4,true),'P0001','restoring a scorer past the score is refused');
SELECT public.edit_logged_match(pg_temp.dp(30),2,1,('['||json_build_object('user_id',pg_temp.dp(3),'goals',1,'assists',0,'card','None','computed_rating',7.0)::text||']')::jsonb);
SELECT public.mark_match_appearance(pg_temp.dp(30),pg_temp.dp(4),true);
RESET ROLE;
SELECT pg_temp.dp_assert((SELECT goals = 1 AND assists = 1 AND card_received = 'Yellow' AND team_score = 2 AND opponent_score = 1
  FROM public.matches WHERE user_id = pg_temp.dp(4)),
 'B''s original numbers come back, on the match''s current score');
SELECT pg_temp.dp_assert(NOT EXISTS (SELECT 1 FROM public.match_non_appearances WHERE user_id = pg_temp.dp(4)),
 'the kept record is cleared once B is back');
SELECT pg_temp.dp_assert((SELECT status = 'present' FROM public.session_attendance WHERE session_id = pg_temp.dp(30) AND squad_player_id = pg_temp.dp(21)),
 'B is present at the match again');

-- ── Consent (G1) ─────────────────────────────────────────────────────────
UPDATE public.player_details SET date_of_birth = (current_date-interval '15 years')::date WHERE user_id = pg_temp.dp(4);
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT pg_temp.dp_refused(pg_temp.dp_mark(30,4,false),'42501','a child waiting for consent can''t be changed');
RESET ROLE;
UPDATE public.player_details SET date_of_birth = (current_date-interval '19 years')::date WHERE user_id = pg_temp.dp(4);

-- ── The player's own data: export and deletion ───────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.dp_as(1);
SELECT public.mark_match_appearance(pg_temp.dp(30),pg_temp.dp(4),false);
SELECT pg_temp.dp_as(4);
SELECT pg_temp.dp_assert((SELECT jsonb_array_length(public.export_my_account()->'match_non_appearances') = 1),
 'the player''s export includes their kept "Didn''t play" record');
SELECT pg_temp.dp_as(3);
SELECT pg_temp.dp_assert((SELECT coalesce(jsonb_array_length(public.export_my_account()->'match_non_appearances'), 0) = 0),
 'another player''s export does not');
RESET ROLE;
DELETE FROM auth.users WHERE id = pg_temp.dp(4);
SELECT pg_temp.dp_assert(NOT EXISTS (SELECT 1 FROM public.match_non_appearances WHERE user_id = pg_temp.dp(4)),
 'a deleted account takes its kept records with it');

-- ── Who may call it ──────────────────────────────────────────────────────
SELECT pg_temp.dp_assert(NOT has_function_privilege('anon','public.mark_match_appearance(uuid,uuid,boolean)','EXECUTE'),
 'nobody signed out can call it');
SELECT pg_temp.dp_assert(NOT has_table_privilege('authenticated','public.match_non_appearances','SELECT')
 AND NOT has_table_privilege('anon','public.match_non_appearances','SELECT'),
 'the kept records are read only through the coach''s function');

DO $$ DECLARE failures text;
BEGIN SELECT string_agg(description||': '||coalesce(detail,'false'),E'\n') INTO failures FROM pg_temp.dp_results WHERE NOT passed;
 IF failures IS NOT NULL THEN RAISE EXCEPTION 'Did-not-play checks failed:%',E'\n'||failures; END IF;
END $$;
SELECT * FROM pg_temp.dp_results;
ROLLBACK;
