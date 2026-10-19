-- @trak-suite mode=--event-emails in-all=true
-- TRAK-135 (Imad and Kostas, 16 Oct): publishing an event queues one email
-- notice, to the same people a change goes to. A draft for today or later,
-- not a past one; not a cancelled draft; not a re-save of a published event.
-- A series published at once queues one notice per date, all due together,
-- so the sender makes one email per person. An edit inside the 15 s window
-- keeps the notice "published" (families never saw the draft); a cancel
-- inside it leaves the notice for the sender to drop (nothing to send).
-- Synthetic fixtures; the whole suite rolls back.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
 IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Refusing event-publish-emails fixtures outside disposable harness';
 END IF;
END $$;
CREATE FUNCTION pg_temp.p135id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('91351000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE TEMP TABLE p135_results(label text, ok boolean, detail text);
GRANT SELECT, INSERT ON p135_results TO authenticated, anon, service_role;
CREATE FUNCTION pg_temp.p135actor(n integer) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.p135id(n))::text,true)::text
$$;
CREATE FUNCTION pg_temp.p135check(ok boolean,label text,detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO pg_temp.p135_results VALUES(label,ok IS TRUE,detail)
$$;
-- The statement must succeed and touch exactly expected_rows rows.
CREATE FUNCTION pg_temp.p135allowed(statement text, label text, expected_rows bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint; st text; msg text;
BEGIN
 BEGIN EXECUTE statement; GET DIAGNOSTICS n = ROW_COUNT;
 EXCEPTION WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM;
 END;
 INSERT INTO pg_temp.p135_results VALUES(label, st IS NULL AND n = expected_rows, coalesce(st||': '||msg,'affected rows='||n));
END $$;
SET LOCAL check_function_bodies = off;
-- The notices for one suite event, as kind/status pairs, oldest first.
CREATE FUNCTION pg_temp.p135notices(n integer) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(kind||'/'||status, ',' ORDER BY created_at, status),'none')
 FROM public.event_change_notices WHERE event_id = pg_temp.p135id(n)
$$;
CREATE FUNCTION pg_temp.p135to(n integer) RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(right(user_id::text,3), ',' ORDER BY user_id),'none')
 FROM trak_private.event_change_recipients(pg_temp.p135id(n))
$$;
-- A day relative to the academy's today (Dubai, the default), and a time on it.
CREATE FUNCTION pg_temp.p135day(k integer) RETURNS date LANGUAGE sql AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date + k
$$;
CREATE FUNCTION pg_temp.p135at(k integer, t time) RETURNS timestamptz LANGUAGE sql AS $$
 SELECT (pg_temp.p135day(k) + t) AT TIME ZONE 'Asia/Dubai'
$$;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Academy 100: coach 10 (U15). Child 20 (own email) and parent 30, consented.
INSERT INTO auth.users(id,email,email_confirmed_at)
 SELECT pg_temp.p135id(n), 'synthetic-'||n||'@publish135.invalid', now() FROM unnest(ARRAY[1,10,20,30]) n;
INSERT INTO public.profiles(user_id,role,full_name)
 SELECT pg_temp.p135id(n),
  CASE n WHEN 1 THEN 'club' WHEN 10 THEN 'coach' WHEN 20 THEN 'player' ELSE 'parent' END::public.user_role, 'Synthetic '||n
 FROM unnest(ARRAY[1,10,20,30]) n;
INSERT INTO public.organizations(id,admin_user_id,name,join_code) VALUES (pg_temp.p135id(100),pg_temp.p135id(1),'Publish Academy','P135A1');
INSERT INTO public.coach_details(user_id,organization_id,team) VALUES (pg_temp.p135id(10),pg_temp.p135id(100),'U15');
INSERT INTO public.player_details(user_id,date_of_birth) VALUES (pg_temp.p135id(20), current_date - interval '10 years');
INSERT INTO public.player_parent_links(player_user_id,parent_user_id) VALUES (pg_temp.p135id(20),pg_temp.p135id(30));
INSERT INTO public.squad_players(id,coach_user_id,player_name,linked_player_id) VALUES (pg_temp.p135id(40),pg_temp.p135id(10),'Synthetic 20',pg_temp.p135id(20));
INSERT INTO public.academy_features(organization_id,feature) VALUES(pg_temp.p135id(100),'events') ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.p135actor(30);
SELECT public.record_parental_consent(pg_temp.p135id(20),'parent','{"coaching_records":true}'::jsonb,'synthetic-v1','Synthetic disposable consent.');
RESET ROLE;

-- Coach 10's drafts (one start time each: live events can't overlap, TRAK-158).
-- 700 today 21:00; 701 tomorrow; 702 in 10 days; 703 yesterday; 704–707 a
-- weekly series from 14 days out; 708 a cancelled draft in 4 days; 709 already
-- published in 5 days; 710 tomorrow 19:00 (edited after publishing,
-- which on its own would queue a change: tomorrow counts); 711 in 7 days
-- (cancelled after publishing).
INSERT INTO public.coach_calendar_events(id,coach_user_id,title,event_type,starts_at,event_date,start_time,end_time,venue,published,status,series_id)
 SELECT pg_temp.p135id(700+i), pg_temp.p135id(10), 'Training '||i, 'training',
  pg_temp.p135at(d, t0), pg_temp.p135day(d), t0, t0 + interval '90 minutes', 'Pitch 2', p, s, sr
 FROM (VALUES (0,0,time '21:00',false,'scheduled',null::uuid),(1,1,time '17:00',false,'scheduled',null),
              (2,10,time '17:00',false,'scheduled',null),(3,-1,time '17:00',false,'scheduled',null),
              (4,14,time '17:00',false,'scheduled',pg_temp.p135id(800)),(5,21,time '17:00',false,'scheduled',pg_temp.p135id(800)),
              (6,28,time '17:00',false,'scheduled',pg_temp.p135id(800)),(7,35,time '17:00',false,'scheduled',pg_temp.p135id(800)),
              (8,4,time '17:00',false,'cancelled',null),(9,5,time '17:00',true,'scheduled',null),
              (10,1,time '19:00',false,'scheduled',null),(11,7,time '17:00',false,'scheduled',null)) v(i,d,t0,p,s,sr);

-- ── 1. What publishing queues ─────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.p135actor(10);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(700)),'1 coach publishes today''s draft',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(701)),'1 coach publishes tomorrow''s draft',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(702)),'1 coach publishes a draft 10 days out',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(703)),'1 coach publishes yesterday''s draft',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE series_id=%L',pg_temp.p135id(800)),'1 coach publishes a weekly series at once',4);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(708)),'1 coach publishes a cancelled draft',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(709)),'1 coach saves a published event as published again',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(710)),'1 coach publishes, then (next line) edits inside the window',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET start_time=''20:00'', end_time=''21:30'', starts_at=%L WHERE id=%L',pg_temp.p135at(1,'20:00'),pg_temp.p135id(710)),'1 coach edits the event just published',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET published=true WHERE id=%L',pg_temp.p135id(711)),'1 coach publishes, then (next line) cancels inside the window',1);
SELECT pg_temp.p135allowed(format('UPDATE public.coach_calendar_events SET status=''cancelled'' WHERE id=%L',pg_temp.p135id(711)),'1 coach cancels the event just published',1);
RESET ROLE;
SELECT pg_temp.p135check(pg_temp.p135notices(700)='published/pending','1 publishing today''s draft queues a published notice',pg_temp.p135notices(700));
SELECT pg_temp.p135check(pg_temp.p135notices(701)='published/pending','1 publishing tomorrow''s draft queues one',pg_temp.p135notices(701));
SELECT pg_temp.p135check(pg_temp.p135notices(702)='published/pending','1 publishing a draft 10 days out queues one (any future date)',pg_temp.p135notices(702));
SELECT pg_temp.p135check(pg_temp.p135notices(703)='none','1 publishing a past draft queues nothing',pg_temp.p135notices(703));
SELECT pg_temp.p135check((SELECT count(*) = 4 AND count(DISTINCT due_at) = 1 AND bool_and(kind = 'published' AND status = 'pending')
  FROM public.event_change_notices WHERE event_id IN (SELECT id FROM public.coach_calendar_events WHERE series_id = pg_temp.p135id(800))),
 '1 a series published at once queues one notice per date, all due together');
SELECT pg_temp.p135check(pg_temp.p135notices(708)='none','1 publishing a cancelled draft queues nothing',pg_temp.p135notices(708));
SELECT pg_temp.p135check(pg_temp.p135notices(709)='none','1 re-saving a published event queues nothing',pg_temp.p135notices(709));
SELECT pg_temp.p135check(pg_temp.p135notices(710)='published/pending','1 an edit inside the window keeps one published notice',pg_temp.p135notices(710));
SELECT pg_temp.p135check(pg_temp.p135notices(711)='published/pending','1 a cancel inside the window leaves the published notice for the sender to drop',pg_temp.p135notices(711));

-- ── 2. Who is emailed, and what the sender gets ───────────────────────────
SELECT pg_temp.p135check(pg_temp.p135to(700)='020,030','2 the child with their own email and their guardian',pg_temp.p135to(700));
CREATE TEMP TABLE p135_claim(claimed jsonb);
GRANT SELECT, INSERT ON p135_claim TO service_role;
UPDATE public.event_change_notices SET due_at = now() - interval '1 second';
SET LOCAL ROLE service_role;
INSERT INTO p135_claim SELECT public.claim_event_change_notices();
RESET ROLE;
SELECT pg_temp.p135check((SELECT count(*) = 9 AND bool_and(x->>'kind' = 'published') FROM p135_claim, jsonb_array_elements(claimed) x),
 '2 every published notice is claimed, as published',(SELECT jsonb_array_length(claimed)::text FROM p135_claim));
SELECT pg_temp.p135check((SELECT x->'event'->>'start_time' = '20:00:00' AND jsonb_array_length(x->'recipients') = 2
  FROM p135_claim, jsonb_array_elements(claimed) x WHERE x->'event'->>'title' = 'Training 10'),
 '2 the claimed notice carries the event as it is now, and both recipients');
SELECT pg_temp.p135check((SELECT x->'event'->>'status' = 'cancelled'
  FROM p135_claim, jsonb_array_elements(claimed) x WHERE x->'event'->>'title' = 'Training 11'),
 '2 the one cancelled inside the window reaches the sender as cancelled (it sends nothing)');

DO $$ DECLARE failures text; n integer; BEGIN
 SELECT string_agg(label||coalesce(': '||detail,''),E'\n') INTO failures FROM pg_temp.p135_results WHERE ok IS DISTINCT FROM true;
 SELECT count(*) INTO n FROM pg_temp.p135_results;
 IF n <> 24 THEN
  RAISE EXCEPTION 'Event publish emails: % checks ran; expected exactly 24', n;
 END IF;
 IF failures IS NOT NULL THEN
  RAISE EXCEPTION USING MESSAGE='Event publish emails failed',DETAIL=failures;
 END IF;
 RAISE NOTICE 'Event publish emails: % checks passed',n;
END $$;
SELECT count(*) AS event_publish_emails_checks_passed FROM pg_temp.p135_results;
ROLLBACK;
