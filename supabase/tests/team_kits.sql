-- @trak-suite mode=--team-kits-review in-all=true
-- TRAK-203: synthetic fixtures, real authenticated roles, rolled back.
BEGIN;
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing kit fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.kid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('98203000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE kit_results(label text, ok boolean, detail text);
GRANT INSERT ON kit_results TO authenticated, anon;
CREATE FUNCTION pg_temp.kas(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.kid(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.kcheck(ok boolean, label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.kit_results VALUES(label, ok IS TRUE, NULL)
$$;
CREATE FUNCTION pg_temp.krefused(statement text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
 INSERT INTO pg_temp.kit_results VALUES(label, msg IS NOT NULL, coalesce(msg,'accepted'));
END $$;
CREATE FUNCTION pg_temp.design() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT '{"pattern":"stripes","shirt":"#781D32","secondary":"#F5F3EC","trim":"#CBA654","shorts":"#F5F3EC","socks":"#781D32"}'::jsonb
$$;
CREATE FUNCTION pg_temp.kits() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('version',1,'home',pg_temp.design(),'away',pg_temp.design(),'alternate',pg_temp.design())
$$;
CREATE FUNCTION pg_temp.snap() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('version',1,'slot','home','design',pg_temp.design())
$$;
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.kid(n),'synthetic-'||n||'@kits.invalid',now() FROM unnest(ARRAY[1,2,10,11,12,20,21,30,31]) n;
INSERT INTO public.profiles(user_id,role,full_name) VALUES
 (pg_temp.kid(1),'club','Kit Admin'),(pg_temp.kid(2),'club','Other Admin'),
 (pg_temp.kid(10),'coach','Kit Coach'),(pg_temp.kid(11),'coach','Other Coach'),(pg_temp.kid(12),'coach','Other Academy Coach'),
 (pg_temp.kid(20),'player','Player Fourteen'),(pg_temp.kid(21),'player','Player Sixteen'),
 (pg_temp.kid(30),'parent','Guardian Fourteen'),(pg_temp.kid(31),'parent','Guardian Sixteen');
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES
 (pg_temp.kid(100),pg_temp.kid(1),'Kit Academy','KIT203A'),(pg_temp.kid(101),pg_temp.kid(2),'Other Academy','KIT203B');
INSERT INTO public.academy_features(organization_id,feature) VALUES (pg_temp.kid(100),'events'),(pg_temp.kid(101),'events') ON CONFLICT DO NOTHING;
INSERT INTO public.coach_details(user_id,organization_id) VALUES
 (pg_temp.kid(10),pg_temp.kid(100)),(pg_temp.kid(11),pg_temp.kid(100)),(pg_temp.kid(12),pg_temp.kid(101));
INSERT INTO public.player_details(user_id,date_of_birth) VALUES
 (pg_temp.kid(20),current_date - interval '13 years'),(pg_temp.kid(21),current_date - interval '15 years');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES (pg_temp.kid(20),pg_temp.kid(30)),(pg_temp.kid(21),pg_temp.kid(31));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id,age_group) VALUES
 (pg_temp.kid(40),pg_temp.kid(10),'Player Fourteen',pg_temp.kid(20),'U14'),(pg_temp.kid(41),pg_temp.kid(10),'Player Sixteen',pg_temp.kid(21),'U16');

SET LOCAL ROLE authenticated;
SELECT pg_temp.kas(10);
INSERT INTO public.coach_team_kits(coach_user_id,squad,kits) VALUES (pg_temp.kid(10),'U14',pg_temp.kits()),(pg_temp.kid(10),'U16',pg_temp.kits());
SELECT pg_temp.kcheck((SELECT count(*)=2 FROM public.coach_team_kits),'coach can save separate squad sets');
SELECT pg_temp.kcheck((SELECT bool_and(organization_id=pg_temp.kid(100)) FROM public.coach_team_kits),'academy stamped from coach');
SELECT pg_temp.krefused(format('INSERT INTO public.coach_team_kits(coach_user_id,squad,kits) VALUES(%L,%L,%L)',pg_temp.kid(10),'U18',pg_temp.kits()),'unknown squad refused');
SELECT pg_temp.krefused(format('UPDATE public.coach_team_kits SET organization_id=%L',pg_temp.kid(101)),'cannot move kit to another academy');
SELECT pg_temp.krefused(format('UPDATE public.coach_team_kits SET coach_user_id=%L',pg_temp.kid(11)),'cannot reassign ownership');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = ''{}''','incomplete set refused');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = jsonb_set(kits,''{home,shirt}'',''"url(https://example.com)"'')','non-color refused');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = jsonb_set(kits,''{away,pattern}'',''"unknown"'')','unknown pattern refused');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = jsonb_set(kits,''{version}'',''2'')','unknown version refused');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = kits || ''{"private_note":"hidden"}''','unknown keys refused');
SELECT pg_temp.krefused('UPDATE public.coach_team_kits SET kits = jsonb_set(kits,''{home,shirt}'',''null'')','null color refused');

INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,published,squad,kit,kit_snapshot) VALUES
 (pg_temp.kid(800),pg_temp.kid(10),'Kit match','training',now()+interval '2 days',current_date+2,'17:00',true,'U14','Home kit',pg_temp.snap()),
 (pg_temp.kid(801),pg_temp.kid(10),'Draft','training',now()+interval '3 days',current_date+3,'17:00',false,'U14','Home kit',pg_temp.snap()),
 (pg_temp.kid(802),pg_temp.kid(10),'Legacy','training',now()+interval '4 days',current_date+4,'17:00',true,'U14','Green bibs',NULL);
SELECT pg_temp.krefused('UPDATE public.coach_calendar_events SET kit_snapshot = ''{}'' WHERE id=pg_temp.kid(800)','invalid event snapshot refused');
UPDATE public.coach_team_kits SET kits=jsonb_set(kits,'{home,shirt}','"#123456"') WHERE squad='U14';
SELECT pg_temp.kcheck((SELECT kit_snapshot=pg_temp.snap() FROM public.coach_calendar_events WHERE id=pg_temp.kid(800)),'editing templates does not change event snapshot');
UPDATE public.coach_calendar_events SET kit_snapshot=jsonb_set(kit_snapshot,'{design,shorts}','"#123456"') WHERE id=pg_temp.kid(800);
SELECT pg_temp.kcheck((SELECT sequence=1 FROM public.coach_calendar_events WHERE id=pg_temp.kid(800)),'kit edit increments event change sequence');

SELECT pg_temp.kas(11);
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.coach_team_kits),'another coach sees no kits');
SELECT pg_temp.krefused(format('INSERT INTO public.coach_team_kits(coach_user_id,kits) VALUES(%L,%L)',pg_temp.kid(10),pg_temp.kits()),'another coach cannot write owner kits');
SELECT pg_temp.kas(12);
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.coach_team_kits),'another academy sees no kits');
SELECT pg_temp.kas(30);
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.coach_team_kits),'guardian cannot browse squad templates');
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.child_events(pg_temp.kid(20))),'consent needed for event art');
SELECT public.record_parental_consent(pg_temp.kid(20),'parent','{"coaching_records":true}','synthetic-v1','Synthetic disposable consent.');
SELECT pg_temp.kcheck((SELECT count(*)=2 FROM public.child_events(pg_temp.kid(20))),'guardian sees published events only');
SELECT pg_temp.kcheck((SELECT kit_snapshot->'design'->>'shorts'='#123456' FROM public.child_events(pg_temp.kid(20)) WHERE id=pg_temp.kid(800)),'guardian receives current event art');
SELECT pg_temp.kcheck((SELECT kit='Green bibs' AND kit_snapshot IS NULL FROM public.child_events(pg_temp.kid(20)) WHERE id=pg_temp.kid(802)),'legacy text remains');
SELECT pg_temp.kas(20);
SELECT pg_temp.kcheck((SELECT kit_snapshot->>'slot'='home' FROM public.child_events(pg_temp.kid(20)) WHERE id=pg_temp.kid(800)),'player receives same snapshot');
SELECT pg_temp.kas(31);
SELECT public.record_parental_consent(pg_temp.kid(21),'parent','{"coaching_records":true}','synthetic-v1','Synthetic disposable consent.');
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.child_events(pg_temp.kid(21))),'other squad sees no kit event');
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.child_events(pg_temp.kid(20))),'unrelated guardian sees no event');
SELECT pg_temp.kas(30);
SELECT public.withdraw_parental_consent(pg_temp.kid(20));
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.child_events(pg_temp.kid(20))),'withdrawal removes event and kit from guardian');
SELECT pg_temp.kas(20);
SELECT pg_temp.kcheck((SELECT count(*)=0 FROM public.child_events(pg_temp.kid(20))),'withdrawal removes event and kit from player');
SELECT pg_temp.kas(10);
UPDATE public.coach_calendar_events SET kit='Green bibs' WHERE id=pg_temp.kid(800);
SELECT pg_temp.kcheck((SELECT kit_snapshot IS NULL AND kit='Green bibs' FROM public.coach_calendar_events WHERE id=pg_temp.kid(800)),
 'an older text-only client cannot leave a contradictory illustration');

RESET ROLE;
DELETE FROM public.academy_features WHERE organization_id=pg_temp.kid(100) AND feature='events';
SET LOCAL ROLE authenticated;
SELECT pg_temp.kas(10);
SELECT pg_temp.krefused(format('INSERT INTO public.coach_team_kits(coach_user_id,kits) VALUES(%L,%L)',pg_temp.kid(10),pg_temp.kits()),'off switch blocks kit creation');
WITH changed AS (UPDATE public.coach_team_kits SET kits=pg_temp.kits() RETURNING *) SELECT pg_temp.kcheck(NOT EXISTS(SELECT FROM changed),'off switch blocks template update');
SET LOCAL ROLE anon;
SELECT pg_temp.krefused('SELECT * FROM public.coach_team_kits','anonymous cannot read kits');
RESET ROLE;
DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.kit_results WHERE NOT ok;
 SELECT count(*) INTO n FROM pg_temp.kit_results;
 IF failures IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='Team kits failed', DETAIL=failures; END IF;
 RAISE NOTICE 'Team kits: % checks passed', n;
END $$;
ROLLBACK;
