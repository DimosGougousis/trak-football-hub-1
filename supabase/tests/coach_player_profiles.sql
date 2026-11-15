-- @trak-suite mode=--player-profiles-review in-all=true
-- TRAK-260 (TRAK-258 E). A player's profile for the coach: foot, nationality and
-- traits from fixed lists, read and written only by the squad row's coach; the
-- roster's date of birth for the coach's own players only; the coach's two
-- in-app notification switches. Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing player-profile fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.ppid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('92600000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE pp_results(label text, ok boolean, detail text);
GRANT INSERT ON pp_results TO authenticated, anon;
CREATE FUNCTION pg_temp.ppactor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.ppid(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.ppcheck(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.pp_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must succeed.
CREATE FUNCTION pg_temp.ppok(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN msg := SQLSTATE||': '||SQLERRM; END;
 INSERT INTO pg_temp.pp_results VALUES(label, msg IS NULL, msg);
END $$;
-- The statement must be refused with this SQLSTATE and the given words.
CREATE FUNCTION pg_temp.pprefused(statement text, label text, state text, words text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text; msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM; END;
 INSERT INTO pg_temp.pp_results VALUES(label, st = state AND msg ILIKE '%'||words||'%', coalesce(st||': '||msg,'unexpectedly succeeded'));
END $$;
CREATE FUNCTION pg_temp.ppsave(row_ integer, foot text, nation text, traits text[]) RETURNS text LANGUAGE sql AS $$
 SELECT format('INSERT INTO public.squad_player_profiles(squad_player_id, preferred_foot, nationality, traits) VALUES (%L, %L, %L, %L)
   ON CONFLICT (squad_player_id) DO UPDATE SET preferred_foot = excluded.preferred_foot, nationality = excluded.nationality, traits = excluded.traits',
   pg_temp.ppid(row_), foot, nation, traits)
$$;
-- Profiles the caller can read, as squad-row-suffix:foot pairs.
SET LOCAL check_function_bodies = off;
CREATE FUNCTION pg_temp.ppseen() RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(squad_player_id::text,2)||':'||coalesce(preferred_foot,'-'), ',' ORDER BY squad_player_id),'none')
 FROM public.squad_player_profiles
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ppseen() TO authenticated;
-- Birth dates the caller gets, as squad-row-suffix:date pairs.
CREATE FUNCTION pg_temp.ppborn(squad text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(b.squad_player_id::text,2)||':'||b.date_of_birth, ',' ORDER BY b.squad_player_id),'none')
 FROM public.coach_player_birth_dates(squad) b
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ppborn(text) TO authenticated;

-- Academy A (100): coach A1 (10) holds 40 (U14, the player 20 linked) and 41
-- (U16); colleague A2 (11) holds 42. Academy B (101): coach B1 (12). Guardian 30
-- of player 20. 43 is A1's row made before the roster (no roster entry).
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.ppid(n),'synthetic-'||n||'@playerprofiles.invalid',now()
 FROM unnest(ARRAY[1,2,10,11,12,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.ppid(1),'club','Admin A'),(pg_temp.ppid(2),'club','Admin B'),
 (pg_temp.ppid(10),'coach','Coach A1'),(pg_temp.ppid(11),'coach','Coach A2'),(pg_temp.ppid(12),'coach','Coach B1'),
 (pg_temp.ppid(20),'player','Player One'),(pg_temp.ppid(30),'parent','Guardian One');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.ppid(100),pg_temp.ppid(1),'Profiles A','PP260A'),(pg_temp.ppid(101),pg_temp.ppid(2),'Profiles B','PP260B');
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.ppid(10),pg_temp.ppid(100)),(pg_temp.ppid(11),pg_temp.ppid(100)),(pg_temp.ppid(12),pg_temp.ppid(101));
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES (pg_temp.ppid(20),pg_temp.ppid(30));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.ppid(40),pg_temp.ppid(10),'Player One',pg_temp.ppid(20),'U14'),
 (pg_temp.ppid(41),pg_temp.ppid(10),'Player Two',NULL,'U16'),
 (pg_temp.ppid(42),pg_temp.ppid(11),'Player Three',NULL,'U14'),
 (pg_temp.ppid(43),pg_temp.ppid(10),'Player Four',NULL,'U14');
INSERT INTO public.roster_children(id,organization_id,squad_player_id,date_of_birth,child_email,loaded_by) VALUES
 (pg_temp.ppid(70),pg_temp.ppid(100),pg_temp.ppid(40),'2012-02-26','one@playerprofiles.invalid','fixture'),
 (pg_temp.ppid(71),pg_temp.ppid(100),pg_temp.ppid(41),'2010-05-01','two@playerprofiles.invalid','fixture'),
 (pg_temp.ppid(72),pg_temp.ppid(100),pg_temp.ppid(42),'2012-07-07','three@playerprofiles.invalid','fixture');

SET LOCAL ROLE authenticated;
-- PP01–PP03: the squad row's coach writes, changes and reads.
SELECT pg_temp.ppactor(10);
SELECT pg_temp.ppok(pg_temp.ppsave(40,'right','Greece',ARRAY['Places shots','Plays one-twos']),'PP01 A1 saves their player''s foot, nationality and traits');
SELECT pg_temp.ppok(pg_temp.ppsave(40,'left','Greece',ARRAY['Places shots']),'PP02 A1 changes them');
SELECT pg_temp.ppok(pg_temp.ppsave(41,NULL,NULL,ARRAY[]::text[]),'PP02 A1 saves an empty profile');
SELECT pg_temp.ppcheck(pg_temp.ppseen()='40:left,41:-','PP03 A1 reads their own players'' profiles',pg_temp.ppseen());
SELECT pg_temp.ppcheck((SELECT traits FROM public.squad_player_profiles WHERE squad_player_id=pg_temp.ppid(40))=ARRAY['Places shots'],
  'PP03 the change replaced the traits');
-- PP04: only the fixed lists, and never both of an opposite pair.
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'right','Greece',ARRAY['Always late']),'PP04 a trait outside the list is refused','23514','traits_listed');
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'right','Greece',ARRAY['Dives into tackles','Does not dive into tackles']),
  'PP04 both of an opposite pair are refused','23514','traits_not_opposite');
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'right','Atlantis',ARRAY[]::text[]),'PP04 a nationality outside the list is refused','23514','nationality_listed');
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'weak','Greece',ARRAY[]::text[]),'PP04 a foot outside left, right, both is refused','23514','preferred_foot');
-- PP05: nobody deletes a profile; it goes with its squad row.
SELECT pg_temp.pprefused(format('DELETE FROM public.squad_player_profiles WHERE squad_player_id=%L',pg_temp.ppid(40)),
  'PP05 the coach cannot delete a profile','42501','permission denied');

-- PP06: a colleague in the same academy, another academy's coach, the player and their guardian read nothing and write nothing.
SELECT pg_temp.ppactor(11);
SELECT pg_temp.ppcheck(pg_temp.ppseen()='none','PP06 colleague A2 reads none',pg_temp.ppseen());
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'right',NULL,ARRAY[]::text[]),'PP06 colleague A2 cannot write A1''s player','42501','row-level security');
SELECT pg_temp.ppactor(12);
SELECT pg_temp.ppcheck(pg_temp.ppseen()='none','PP06 B1 reads none',pg_temp.ppseen());
SELECT pg_temp.ppactor(20);
SELECT pg_temp.ppcheck(pg_temp.ppseen()='none','PP06 the player reads none, their own included',pg_temp.ppseen());
SELECT pg_temp.pprefused(pg_temp.ppsave(40,'right',NULL,ARRAY[]::text[]),'PP06 the player cannot write their profile','42501','row-level security');
SELECT pg_temp.ppactor(30);
SELECT pg_temp.ppcheck(pg_temp.ppseen()='none','PP06 the guardian reads none',pg_temp.ppseen());

-- PP07: dates of birth, from the roster, for the caller's own players only.
SELECT pg_temp.ppactor(10);
SELECT pg_temp.ppcheck(pg_temp.ppborn()='40:2012-02-26,41:2010-05-01','PP07 A1 gets their rostered players'' dates (43 has no roster entry)',pg_temp.ppborn());
SELECT pg_temp.ppcheck(pg_temp.ppborn('U16')='41:2010-05-01','PP07 one squad only',pg_temp.ppborn('U16'));
SELECT pg_temp.ppactor(11);
SELECT pg_temp.ppcheck(pg_temp.ppborn()='42:2012-07-07','PP07 colleague A2 gets only their own player',pg_temp.ppborn());
SELECT pg_temp.ppactor(12);
SELECT pg_temp.ppcheck(pg_temp.ppborn()='none','PP07 B1 gets none',pg_temp.ppborn());
SELECT pg_temp.ppactor(20);
SELECT pg_temp.ppcheck(pg_temp.ppborn()='none','PP07 the player gets none',pg_temp.ppborn());
SELECT pg_temp.ppactor(30);
SELECT pg_temp.ppcheck(pg_temp.ppborn()='none','PP07 the guardian gets none',pg_temp.ppborn());

-- PP08: the coach's in-app switches are on unless turned off, and their own to change.
SELECT pg_temp.ppactor(10);
SELECT pg_temp.ppok(format('INSERT INTO public.notification_settings(user_id) VALUES (%L)',pg_temp.ppid(10)),'PP08 A1 makes their settings row');
SELECT pg_temp.ppcheck((SELECT cant_make_it_alerts AND needs_you FROM public.notification_settings WHERE user_id=pg_temp.ppid(10)),
  'PP08 both switches start on');
SELECT pg_temp.ppok(format('UPDATE public.notification_settings SET needs_you=false WHERE user_id=%L',pg_temp.ppid(10)),'PP08 A1 turns Needs you off');
SELECT pg_temp.ppcheck((SELECT NOT needs_you AND cant_make_it_alerts FROM public.notification_settings WHERE user_id=pg_temp.ppid(10)),
  'PP08 only that switch changed');
SELECT pg_temp.ppactor(11);
SELECT pg_temp.ppcheck(NOT EXISTS (SELECT 1 FROM public.notification_settings WHERE user_id=pg_temp.ppid(10)),'PP08 A2 cannot see A1''s switches');
RESET ROLE;

-- PP09: a visitor reads nothing and calls nothing.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.pprefused('SELECT * FROM public.squad_player_profiles','PP09 anon cannot read profiles','42501','permission denied');
SELECT pg_temp.pprefused('SELECT * FROM public.coach_player_birth_dates()','PP09 anon cannot read dates of birth','42501','permission denied');
RESET ROLE;
SELECT pg_temp.ppcheck(NOT has_table_privilege('authenticated','public.squad_player_profiles','DELETE')
  AND NOT has_table_privilege('anon','public.squad_player_profiles','SELECT')
  AND NOT has_function_privilege('anon','public.coach_player_birth_dates(text)','EXECUTE')
  AND NOT has_table_privilege('authenticated','public.roster_children','SELECT'),
  'PP09 grants: no deletes, no anonymous reads, the roster stays closed');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.pp_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.pp_results;
 IF n <> 30 THEN RAISE EXCEPTION 'Player profiles: % checks ran; expected exactly 30', n; END IF;
 IF failures IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='Player profiles failed',DETAIL=failures; END IF;
 RAISE NOTICE 'Player profiles: % checks passed',n;
END $$;
ROLLBACK;
