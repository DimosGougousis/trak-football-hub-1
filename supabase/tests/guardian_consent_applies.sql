-- @trak-suite mode=--guardian-consent-applies in-all=true
-- TRAK-177 item 1 (live run 3, 16 Oct): the guardian's Profile said "You have
-- no active consent recorded" for a 16-year-old at a consent-age-15 academy,
-- who consents for himself. guardian_consent_applies(child) tells a guardian
-- whether their approval applies to their own linked child: under the
-- academy's consent age, or with no date of birth (TRAK-83). It reveals
-- nothing about anyone else's child. Synthetic records, disposable database.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing guardian-consent fixtures outside a disposable database';
  END IF;
END $$;
CREATE FUNCTION pg_temp.ga(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('98177100-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE ga_results(description text, passed boolean, detail text);
GRANT INSERT ON ga_results TO authenticated, anon;
CREATE FUNCTION pg_temp.ga_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.ga_results VALUES(description, ok IS TRUE, NULL); END $$;
CREATE FUNCTION pg_temp.ga_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',pg_temp.ga(n))::text, true);
$$;
CREATE FUNCTION pg_temp.ga_applies(n integer) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.guardian_consent_applies(pg_temp.ga(n));
$$;

-- 1 Greek admin, 2 UAE admin, 3 Greek coach, 4 UAE coach. Players: 10 Greek
-- 16, 11 Greek 14, 12 UAE 16, 13 Greek with no date of birth, 14 Greek 16
-- with another guardian. Guardians: 20 (children 10–13) and 21 (child 14).
INSERT INTO auth.users(id, email)
SELECT pg_temp.ga(n), 'guardian-applies-' || n || '@synthetic.test' FROM unnest(ARRAY[1,2,3,4,10,11,12,13,14,20,21]) n;
INSERT INTO public.profiles(user_id, full_name, role) VALUES
 (pg_temp.ga(1),'Greek Admin','club'),(pg_temp.ga(2),'UAE Admin','club'),
 (pg_temp.ga(3),'Greek Coach','coach'),(pg_temp.ga(4),'UAE Coach','coach'),
 (pg_temp.ga(10),'Greek Sixteen','player'),(pg_temp.ga(11),'Greek Fourteen','player'),
 (pg_temp.ga(12),'UAE Sixteen','player'),(pg_temp.ga(13),'Greek No Birthday','player'),
 (pg_temp.ga(14),'Other Sixteen','player'),
 (pg_temp.ga(20),'Guardian','parent'),(pg_temp.ga(21),'Other Guardian','parent');
INSERT INTO public.organizations(id, admin_user_id, name, join_code) VALUES
 (pg_temp.ga(100), pg_temp.ga(1), 'Synthetic Greek Academy', 'GA-GR'),
 (pg_temp.ga(101), pg_temp.ga(2), 'Synthetic UAE Academy', 'GA-UAE');
UPDATE public.organizations SET consent_age = 15 WHERE id = pg_temp.ga(100);
INSERT INTO public.coach_details(user_id, organization_id) VALUES (pg_temp.ga(3), pg_temp.ga(100)), (pg_temp.ga(4), pg_temp.ga(101));
INSERT INTO public.player_details(user_id, date_of_birth) VALUES
 (pg_temp.ga(10), (current_date - interval '16 years 1 month')::date),
 (pg_temp.ga(11), (current_date - interval '14 years 1 month')::date),
 (pg_temp.ga(12), (current_date - interval '16 years 1 month')::date),
 (pg_temp.ga(14), (current_date - interval '16 years 1 month')::date);
INSERT INTO public.squad_players(id, coach_user_id, player_name, linked_player_id, status) VALUES
 (pg_temp.ga(30), pg_temp.ga(3), 'Greek Sixteen',     pg_temp.ga(10), 'active'),
 (pg_temp.ga(31), pg_temp.ga(3), 'Greek Fourteen',    pg_temp.ga(11), 'active'),
 (pg_temp.ga(32), pg_temp.ga(4), 'UAE Sixteen',       pg_temp.ga(12), 'active'),
 (pg_temp.ga(33), pg_temp.ga(3), 'Greek No Birthday', pg_temp.ga(13), 'active'),
 (pg_temp.ga(34), pg_temp.ga(3), 'Other Sixteen',     pg_temp.ga(14), 'active');
INSERT INTO public.player_parent_links(player_user_id, parent_user_id) VALUES
 (pg_temp.ga(10), pg_temp.ga(20)), (pg_temp.ga(11), pg_temp.ga(20)),
 (pg_temp.ga(12), pg_temp.ga(20)), (pg_temp.ga(13), pg_temp.ga(20)),
 (pg_temp.ga(14), pg_temp.ga(21));

SELECT pg_temp.ga_assert(has_function_privilege('authenticated', 'public.guardian_consent_applies(uuid)', 'EXECUTE'),
  'a signed-in guardian can ask');
SELECT pg_temp.ga_assert(NOT has_function_privilege('anon', 'public.guardian_consent_applies(uuid)', 'EXECUTE'),
  'an anonymous caller cannot ask');

SET LOCAL ROLE authenticated;
SELECT pg_temp.ga_as(20);
SELECT pg_temp.ga_assert(pg_temp.ga_applies(10) IS FALSE, 'a Greek 16-year-old consents himself: no guardian line');
SELECT pg_temp.ga_assert(pg_temp.ga_applies(11) IS TRUE, 'a Greek 14-year-old still needs the guardian');
SELECT pg_temp.ga_assert(pg_temp.ga_applies(12) IS TRUE, 'a UAE 16-year-old still needs the guardian (consent age 18)');
SELECT pg_temp.ga_assert(pg_temp.ga_applies(13) IS TRUE, 'no date of birth counts as needing the guardian');
SELECT pg_temp.ga_assert(pg_temp.ga_applies(14) IS FALSE, 'another guardian''s child: nothing to say');
SELECT pg_temp.ga_as(21);
SELECT pg_temp.ga_assert(pg_temp.ga_applies(11) IS FALSE, 'a child who isn''t yours: nothing to say');
SELECT pg_temp.ga_assert(pg_temp.ga_applies(14) IS FALSE, 'the other guardian''s Greek 16-year-old consents himself too');
RESET ROLE;

DO $$ DECLARE failures text;
BEGIN SELECT string_agg(description || ': ' || coalesce(detail, 'false'), E'\n') INTO failures FROM pg_temp.ga_results WHERE NOT passed;
  IF failures IS NOT NULL THEN RAISE EXCEPTION 'Guardian-consent checks failed:%', E'\n' || failures; END IF;
END $$;
SELECT * FROM pg_temp.ga_results;
ROLLBACK;
