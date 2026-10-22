-- @trak-suite mode=--squad-views-review in-all=true
-- TRAK-250 (J8, Squad tab). Availability: families confirm in the squad's
-- WhatsApp group and the coach ticks each child Confirmed. Only the event's
-- coach writes or reads a confirmation, for a consented child of their own
-- squad, on a published, scheduled event of an academy with events on, until
-- the end of the event's day in the academy's zone. Season: the coach's own
-- logged matches for their own squad rows, through coach_squad_season.
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing squad-view fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.svid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92500000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE sv_results(label text, ok boolean, detail text);
GRANT INSERT ON sv_results TO authenticated, anon;
CREATE FUNCTION pg_temp.svactor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.svid(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.svcheck(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.sv_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must succeed.
CREATE FUNCTION pg_temp.svok(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN msg := SQLSTATE||': '||SQLERRM; END;
 INSERT INTO pg_temp.sv_results VALUES(label, msg IS NULL, msg);
END $$;
-- The statement must be refused with this SQLSTATE and the given words.
CREATE FUNCTION pg_temp.svrefused(statement text, label text, state text, words text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM; END;
 INSERT INTO pg_temp.sv_results VALUES(label, st = state AND msg ILIKE '%'||words||'%', coalesce(st||': '||msg,'unexpectedly succeeded'));
END $$;
CREATE FUNCTION pg_temp.svconfirm(event integer, row_ integer) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.confirm_event_attendance(%L, %L)', pg_temp.svid(event), pg_temp.svid(row_))
$$;
CREATE FUNCTION pg_temp.svunconfirm(event integer, row_ integer) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT public.unconfirm_event_attendance(%L, %L)', pg_temp.svid(event), pg_temp.svid(row_))
$$;
CREATE FUNCTION pg_temp.svseason(squad text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
 SELECT format('SELECT * FROM public.coach_squad_season(current_date - 30, current_date, %L)', squad)
$$;
-- Confirmations the caller can read, as event-suffix:squad-row-suffix pairs.
SET LOCAL check_function_bodies = off;
CREATE FUNCTION pg_temp.svseen() RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(event_id::text,3)||':'||right(squad_player_id::text,2), ',' ORDER BY event_id, squad_player_id),'none')
 FROM public.event_confirmations
$$;
GRANT EXECUTE ON FUNCTION pg_temp.svseen() TO authenticated;
-- The caller's season rows, as opponent/squad-row-suffix in the function's order.
CREATE FUNCTION pg_temp.svseasonrows(squad text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(s.opponent||'/'||right(s.squad_player_id::text,2), ',' ORDER BY s.ord),'none')
 FROM public.coach_squad_season(current_date - 30, current_date, squad) WITH ORDINALITY AS s(match_date, opponent, session_id,
   team_score, opponent_score, squad_player_id, minutes_played, goals, assists, ord)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.svseasonrows(text) TO authenticated;

-- Academy A (100, events on): coach A1 (10) holds U10 (c1 20 admitted, c2 21
-- consent pending) and U12 (c3 22 admitted, on two of A1's rows, as after a
-- re-add); coach A2 (11) is a colleague. Academy B (101): coach B1 (12).
-- Guardians: 30 (c1), 31 (c2), 32 (c3).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.svid(n),'synthetic-'||n||'@squadviews.invalid',now()
 FROM unnest(ARRAY[1,2,10,11,12,20,21,22,30,31,32]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.svid(1),'club','Admin A'),(pg_temp.svid(2),'club','Admin B'),
 (pg_temp.svid(10),'coach','Coach A1'),(pg_temp.svid(11),'coach','Coach A2'),(pg_temp.svid(12),'coach','Coach B1'),
 (pg_temp.svid(20),'player','Child One'),(pg_temp.svid(21),'player','Child Two'),(pg_temp.svid(22),'player','Child Three'),
 (pg_temp.svid(30),'parent','Guardian One'),(pg_temp.svid(31),'parent','Guardian Two'),(pg_temp.svid(32),'parent','Guardian Three');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.svid(100),pg_temp.svid(1),'Squad Views A','SV250A'),(pg_temp.svid(101),pg_temp.svid(2),'Squad Views B','SV250B');
INSERT INTO public.academy_features(organization_id,feature) VALUES
 (pg_temp.svid(100),'events'),(pg_temp.svid(101),'events') ON CONFLICT DO NOTHING;
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.svid(10),pg_temp.svid(100)),(pg_temp.svid(11),pg_temp.svid(100)),(pg_temp.svid(12),pg_temp.svid(101));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.svid(20),current_date - interval '9 years 6 months'),(pg_temp.svid(21),current_date - interval '9 years 6 months'),
 (pg_temp.svid(22),current_date - interval '11 years 6 months');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES
 (pg_temp.svid(20),pg_temp.svid(30)),(pg_temp.svid(21),pg_temp.svid(31)),(pg_temp.svid(22),pg_temp.svid(32));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.svid(40),pg_temp.svid(10),'Child One',pg_temp.svid(20),'U10'),
 (pg_temp.svid(41),pg_temp.svid(10),'Child Two',pg_temp.svid(21),'U10'),
 (pg_temp.svid(42),pg_temp.svid(10),'Child Three',pg_temp.svid(22),'U12'),
 (pg_temp.svid(43),pg_temp.svid(10),'Child Three',pg_temp.svid(22),'U12');

-- A1's events: 700 ev (U10, published, in 2 days); 701 cancelled; 702 draft;
-- 703 yesterday; 704 U12; 705 U10 that started at today's midnight in Dubai
-- (started, not ended: still confirmable on the day); 706 (below) U10 but
-- pinned to academy B.
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published,squad) VALUES
 (pg_temp.svid(700),pg_temp.svid(10),'U10 training','training',now(),(now() AT TIME ZONE 'Asia/Dubai' + interval '2 days')::date,time '17:00',true,'U10'),
 (pg_temp.svid(701),pg_temp.svid(10),'U10 cancelled','training',now(),(now() AT TIME ZONE 'Asia/Dubai' + interval '3 days')::date,time '17:00',true,'U10'),
 (pg_temp.svid(702),pg_temp.svid(10),'U10 draft','training',now(),(now() AT TIME ZONE 'Asia/Dubai' + interval '4 days')::date,time '17:00',false,'U10'),
 (pg_temp.svid(703),pg_temp.svid(10),'U10 yesterday','training',now(),(now() AT TIME ZONE 'Asia/Dubai' - interval '1 day')::date,time '10:00',true,'U10'),
 (pg_temp.svid(704),pg_temp.svid(10),'U12 training','training',now(),(now() AT TIME ZONE 'Asia/Dubai' + interval '5 days')::date,time '17:00',true,'U12'),
 (pg_temp.svid(705),pg_temp.svid(10),'U10 today','training',now(),(now() AT TIME ZONE 'Asia/Dubai')::date,time '00:00',true,'U10');
UPDATE public.coach_calendar_events SET status='cancelled' WHERE id=pg_temp.svid(701);
-- 706: A1's U10 event pinned to academy B, as one made before a move between
-- academies is (stamp_calendar_event pins the academy). Written with triggers
-- off, since no app path makes it today.
SET LOCAL session_replication_role = replica;
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published,squad,organization_id) VALUES
 (pg_temp.svid(706),pg_temp.svid(10),'U10 other academy','training',
  ((now() AT TIME ZONE 'Asia/Dubai' + interval '2 days')::date + time '17:00') AT TIME ZONE 'Asia/Dubai',
  (now() AT TIME ZONE 'Asia/Dubai' + interval '2 days')::date,time '17:00',true,'U10',pg_temp.svid(101));
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT pg_temp.svactor(30);
SELECT public.record_parental_consent(pg_temp.svid(20),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
SELECT pg_temp.svactor(32);
SELECT public.record_parental_consent(pg_temp.svid(22),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
RESET ROLE;

-- Matches for c1: two logged by A1 (the second carries 'U12' on the match
-- itself; the squad filter reads the squad row, not the match), one by
-- colleague A2, one self-logged, one by A1 outside the window. One by A1 for
-- c3, who sits on two of A1's U12 rows.
INSERT INTO public.matches(user_id,position,age_group,competition,venue,match_date,opponent,team_score,opponent_score,minutes_played,goals,assists,logged_by,logged_by_role) VALUES
 (pg_temp.svid(20),'ST','U10','League','Home',current_date - 10,'Opp One',3,1,40,1,0,pg_temp.svid(10),'coach'),
 (pg_temp.svid(20),'ST','U12','League','Away',current_date - 3,'Opp Two',0,2,NULL,0,1,pg_temp.svid(10),'coach'),
 (pg_temp.svid(20),'ST','U10','League','Home',current_date - 5,'Colleague Opp',1,1,30,0,0,pg_temp.svid(11),'coach'),
 (pg_temp.svid(20),'ST','U10','League','Home',current_date - 7,'Self Opp',5,0,50,4,0,pg_temp.svid(20),'player'),
 (pg_temp.svid(20),'ST','U10','League','Home',current_date - 400,'Old Opp',2,2,40,0,0,pg_temp.svid(10),'coach'),
 (pg_temp.svid(22),'CM','U12','League','Home',current_date - 6,'Twelve Opp',2,0,60,0,2,pg_temp.svid(10),'coach');

SET LOCAL ROLE authenticated;
-- ── SV01-SV02. The coach confirms and unconfirms ──────────────────────────
SELECT pg_temp.svactor(10);
SELECT pg_temp.svok(pg_temp.svconfirm(700,40),'SV01 A1 confirms c1 on ev');
SELECT pg_temp.svcheck(pg_temp.svseen()='700:40','SV01 the confirmation row exists',pg_temp.svseen());
SELECT pg_temp.svok(pg_temp.svconfirm(700,40),'SV01 confirming again is ok');
SELECT pg_temp.svcheck((SELECT count(*) FROM public.event_confirmations WHERE event_id=pg_temp.svid(700))=1,'SV01 and still leaves one row');
SELECT pg_temp.svok(pg_temp.svconfirm(705,40),'SV01 an event that started today can still be confirmed until its day ends');
SELECT pg_temp.svok(pg_temp.svunconfirm(705,40),'SV02 and unconfirmed on the day');
SELECT pg_temp.svok(pg_temp.svunconfirm(700,40),'SV02 A1 unconfirms');
SELECT pg_temp.svcheck(pg_temp.svseen()='none','SV02 no rows left',pg_temp.svseen());

-- ── SV03-SV07. Refused, with a reason a screen can show ───────────────────
SELECT pg_temp.svactor(11);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,40),'SV03 colleague A2 cannot confirm on A1''s event','42501','Only the event''s coach');
SELECT pg_temp.svactor(12);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,40),'SV04 another academy''s coach B1 cannot confirm','42501','Only the event''s coach');
SELECT pg_temp.svactor(10);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,41),'SV05 a consent-pending child cannot be confirmed','42501','Waiting for consent');
SELECT pg_temp.svrefused(pg_temp.svconfirm(701,40),'SV06 a cancelled event is refused','42501','This event is cancelled');
SELECT pg_temp.svrefused(pg_temp.svconfirm(702,40),'SV06 an unpublished event is refused','42501','not published');
SELECT pg_temp.svrefused(pg_temp.svconfirm(703,40),'SV06 yesterday''s event is refused','42501','has ended');
SELECT pg_temp.svrefused(pg_temp.svunconfirm(703,40),'SV06 an unconfirm after the event''s day is refused too','42501','has ended');
SELECT pg_temp.svrefused(pg_temp.svconfirm(704,40),'SV06 a U10 child on a U12 event is refused','42501','not in this event''s squad');
SELECT pg_temp.svrefused(pg_temp.svconfirm(706,40),'SV11 a child of another academy than the event''s is refused','42501','not in this event''s squad');
RESET ROLE;
-- Switched off, then back on as the fixture had it. (A savepoint would roll
-- the recorded result back with the switch.)
DELETE FROM public.academy_features WHERE organization_id=pg_temp.svid(100) AND feature='events';
SET LOCAL ROLE authenticated;
SELECT pg_temp.svactor(10);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,40),'SV07 events switched off for the academy are refused','42501','switched off');
RESET ROLE;
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.svid(100),'events');
SET LOCAL ROLE authenticated;

-- ── SV08. Families never write, and nobody writes the table directly ──────
SELECT pg_temp.svactor(30);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,40),'SV08 a guardian cannot confirm','42501','Only the event''s coach');
SELECT pg_temp.svactor(20);
SELECT pg_temp.svrefused(pg_temp.svconfirm(700,40),'SV08 a player cannot confirm','42501','Only the event''s coach');
SELECT pg_temp.svactor(10);
SELECT pg_temp.svrefused(format('INSERT INTO public.event_confirmations(event_id,squad_player_id,confirmed_by) VALUES(%L,%L,%L)',
  pg_temp.svid(700),pg_temp.svid(40),pg_temp.svid(10)),'SV08 even the coach cannot insert into the table directly','42501','permission denied');

-- ── SV09. Only the event's coach reads ────────────────────────────────────
SELECT pg_temp.svok(pg_temp.svconfirm(700,40),'SV09 setup: A1 confirms c1 on ev');
SELECT pg_temp.svok(pg_temp.svconfirm(704,42),'SV09 setup: A1 confirms c3 on the U12 event');
SELECT pg_temp.svcheck(pg_temp.svseen()='700:40,704:42','SV09 A1 reads its own events'' confirmations',pg_temp.svseen());
SELECT pg_temp.svactor(11);
SELECT pg_temp.svcheck(pg_temp.svseen()='none','SV09 colleague A2 reads none',pg_temp.svseen());
SELECT pg_temp.svactor(12);
SELECT pg_temp.svcheck(pg_temp.svseen()='none','SV09 B1 reads none',pg_temp.svseen());
SELECT pg_temp.svactor(30);
SELECT pg_temp.svcheck(pg_temp.svseen()='none','SV09 c1''s guardian reads none',pg_temp.svseen());
SELECT pg_temp.svactor(20);
SELECT pg_temp.svcheck(pg_temp.svseen()='none','SV09 c1 reads none',pg_temp.svseen());

-- ── SV10. The coach's season read ─────────────────────────────────────────
SELECT pg_temp.svactor(10);
SELECT pg_temp.svcheck(pg_temp.svseasonrows()='Opp One/40,Twelve Opp/42,Opp Two/40',
  'SV10 A1 reads only its own coach-logged matches in the window, once per match, by date',pg_temp.svseasonrows());
SELECT pg_temp.svcheck((SELECT s.match_date=current_date - 10 AND s.session_id IS NULL AND s.team_score=3 AND s.opponent_score=1
    AND s.minutes_played=40 AND s.goals=1 AND s.assists=0
  FROM public.coach_squad_season(current_date - 30, current_date) s WHERE s.opponent='Opp One'),
  'SV10 a row carries the match''s date, session, score and the child''s figures');
SELECT pg_temp.svcheck((SELECT s.minutes_played IS NULL FROM public.coach_squad_season(current_date - 30, current_date) s WHERE s.opponent='Opp Two'),
  'SV10 minutes not recorded stay NULL, not 0');
SELECT pg_temp.svcheck(pg_temp.svseasonrows('U10')='Opp One/40,Opp Two/40','SV10 p_squad U10 keeps the U10 rows',pg_temp.svseasonrows('U10'));
SELECT pg_temp.svcheck(pg_temp.svseasonrows('U12')='Twelve Opp/42','SV10 p_squad U12 returns none of c1''s U10 rows',pg_temp.svseasonrows('U12'));
SELECT pg_temp.svactor(11);
SELECT pg_temp.svcheck(pg_temp.svseasonrows()='none','SV10 colleague A2 has no squad rows, so no season',pg_temp.svseasonrows());
SELECT pg_temp.svactor(12);
SELECT pg_temp.svcheck(pg_temp.svseasonrows()='none','SV10 B1 reads 0 rows',pg_temp.svseasonrows());
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.svrefused(pg_temp.svseason(),'SV10 anon cannot call the season read','42501','permission denied');
RESET ROLE;
SELECT pg_temp.svcheck(NOT has_function_privilege('anon','public.confirm_event_attendance(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.unconfirm_event_attendance(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','trak_private.confirmation_target(uuid,uuid)','EXECUTE')
  AND NOT has_table_privilege('anon','public.event_confirmations','SELECT')
  AND NOT has_table_privilege('authenticated','public.event_confirmations','INSERT')
  AND NOT has_table_privilege('authenticated','public.event_confirmations','UPDATE')
  AND NOT has_table_privilege('authenticated','public.event_confirmations','DELETE'),
  'SV08 grants: no anonymous calls, no direct writes, the check itself is private');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.sv_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.sv_results;
 IF n <> 37 THEN RAISE EXCEPTION 'Squad views: % checks ran; expected exactly 37', n; END IF;
 IF failures IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='Squad views failed',DETAIL=failures; END IF;
 RAISE NOTICE 'Squad views: % checks passed',n;
END $$;
ROLLBACK;
