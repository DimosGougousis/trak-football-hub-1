-- @trak-suite mode=--own-consent-review in-all=true
-- TRAK-177 (G1/J2): at an academy whose consent age is 15, a player aged
-- 15–17 consents for themselves; under 15 a guardian does; 18+ needs nobody.
-- Every other academy keeps 18, so nothing changes there. Synthetic records,
-- real roles, disposable database only.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $$ BEGIN
  IF current_setting('trak.test_database', true) IS DISTINCT FROM 'disposable' THEN
    RAISE EXCEPTION 'Refusing own-consent fixtures outside a disposable database';
  END IF;
END $$;
CREATE FUNCTION pg_temp.oc(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('98177000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE TEMP TABLE oc_results(description text, passed boolean, detail text);
GRANT INSERT ON oc_results TO authenticated;
CREATE FUNCTION pg_temp.oc_assert(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO pg_temp.oc_results VALUES(description, ok IS TRUE, NULL); END $$;
CREATE FUNCTION pg_temp.oc_refused(statement text, description text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text := 'accepted';
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN actual := SQLSTATE; END;
  INSERT INTO pg_temp.oc_results VALUES(description, actual = '42501', actual);
END $$;
CREATE FUNCTION pg_temp.oc_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',pg_temp.oc(n))::text, true);
$$;
CREATE FUNCTION pg_temp.oc_required(n integer) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.player_consent_required(pg_temp.oc(n));
$$;

-- People: 1 UAE admin, 2 Greek admin, 3 UAE coach, 4 Greek coach;
-- players 10 (Greek, 15), 11 (Greek, 14), 12 (Greek, 16, a guardian approved
-- at 14), 13 (UAE, 16), 14 (Greek, 18); 20 a guardian.
INSERT INTO auth.users(id, email)
SELECT pg_temp.oc(n), 'own-consent-' || n || '@synthetic.test' FROM unnest(ARRAY[1,2,3,4,10,11,12,13,14,20]) n;
INSERT INTO public.profiles(user_id, full_name, role) VALUES
 (pg_temp.oc(1),'UAE Admin','club'),(pg_temp.oc(2),'Greek Admin','club'),
 (pg_temp.oc(3),'UAE Coach','coach'),(pg_temp.oc(4),'Greek Coach','coach'),
 (pg_temp.oc(10),'Greek Fifteen','player'),(pg_temp.oc(11),'Greek Fourteen','player'),
 (pg_temp.oc(12),'Greek Sixteen','player'),(pg_temp.oc(13),'UAE Sixteen','player'),
 (pg_temp.oc(14),'Greek Eighteen','player'),(pg_temp.oc(20),'Guardian','parent');
INSERT INTO public.organizations(id, admin_user_id, name, join_code) VALUES
 (pg_temp.oc(100), pg_temp.oc(1), 'Synthetic UAE Academy', 'OWN-UAE'),
 (pg_temp.oc(101), pg_temp.oc(2), 'Synthetic Greek Academy', 'OWN-GR');
-- Trak (an operator, not an app role) sets the Greek academy to 15.
UPDATE public.organizations SET consent_age = 15 WHERE id = pg_temp.oc(101);
INSERT INTO public.coach_details(user_id, organization_id) VALUES (pg_temp.oc(3), pg_temp.oc(100)), (pg_temp.oc(4), pg_temp.oc(101));
INSERT INTO public.player_details(user_id, date_of_birth) VALUES
 (pg_temp.oc(10), (current_date - interval '15 years 1 month')::date),
 (pg_temp.oc(11), (current_date - interval '14 years 1 month')::date),
 (pg_temp.oc(12), (current_date - interval '16 years 1 month')::date),
 (pg_temp.oc(13), (current_date - interval '16 years 1 month')::date),
 (pg_temp.oc(14), (current_date - interval '18 years 1 month')::date);
INSERT INTO public.squad_players(id, coach_user_id, player_name, linked_player_id, status) VALUES
 (pg_temp.oc(30), pg_temp.oc(4), 'Greek Fifteen',  pg_temp.oc(10), 'active'),
 (pg_temp.oc(31), pg_temp.oc(4), 'Greek Fourteen', pg_temp.oc(11), 'active'),
 (pg_temp.oc(32), pg_temp.oc(4), 'Greek Sixteen',  pg_temp.oc(12), 'active'),
 (pg_temp.oc(33), pg_temp.oc(3), 'UAE Sixteen',    pg_temp.oc(13), 'active'),
 (pg_temp.oc(34), pg_temp.oc(4), 'Greek Eighteen', pg_temp.oc(14), 'active');
-- A guardian approved player 12 at 14, before the consent age applied to them.
INSERT INTO public.parental_consents(player_user_id, parent_user_id, relationship_declared, verification_method,
  purposes, notice_version, consent_text, threshold_age, player_age_at_consent, granted_at)
VALUES (pg_temp.oc(12), pg_temp.oc(20), 'parent', 'email_confirmed', '{"coaching_records": true}',
  'synthetic', 'Synthetic consent', 18, 14, now() - interval '2 years');

SELECT pg_temp.oc_assert((SELECT consent_age FROM public.organizations WHERE id = pg_temp.oc(100)) = 18,
  'every academy keeps 18 unless Trak changes it');
SELECT pg_temp.oc_assert(public.player_consent_age(pg_temp.oc(10)) = 15 AND public.player_consent_age(pg_temp.oc(13)) = 18,
  'a child''s consent age is their academy''s');
SELECT pg_temp.oc_assert(pg_temp.oc_required(10), 'a Greek 15-year-old is not admitted before consenting');
SELECT pg_temp.oc_assert(NOT pg_temp.oc_required(14), 'an 18-year-old needs nobody''s consent');
SELECT pg_temp.oc_assert(NOT pg_temp.oc_required(12), 'a guardian''s earlier approval still counts until the young person chooses');

SET LOCAL ROLE authenticated;
-- Only Trak changes the consent age; the academy's own admin cannot.
SELECT pg_temp.oc_as(2);
DO $$ BEGIN BEGIN UPDATE public.organizations SET consent_age = 13 WHERE id = pg_temp.oc(101); EXCEPTION WHEN OTHERS THEN NULL; END; END $$;
-- The player consents for themselves.
SELECT pg_temp.oc_as(10);
SELECT public.give_my_consent('2026-10-15.1', 'I agree to my coaching records being kept.');
SELECT pg_temp.oc_assert((public.my_consent_status()->>'consent_age')::int = 15
  AND (public.my_consent_status()->>'own_choice')::boolean, 'the app sees the consent age and the player''s own choice');
SELECT pg_temp.oc_refused($q$INSERT INTO public.player_own_consents(player_user_id, notice_version, consent_text, consent_age, player_age_at_consent, granted_at)
  VALUES (pg_temp.oc(11), 'x', 'x', 15, 14, now())$q$, 'nobody writes consent records directly');
SELECT pg_temp.oc_assert((SELECT count(*) FROM public.player_own_consents) = 1, 'a player reads only their own choices');
SELECT pg_temp.oc_as(11);
SELECT pg_temp.oc_refused($q$SELECT public.give_my_consent('2026-10-15.1', 'x')$q$, 'a 14-year-old''s own tick is refused: a guardian consents');
SELECT pg_temp.oc_as(13);
SELECT pg_temp.oc_refused($q$SELECT public.give_my_consent('2026-10-15.1', 'x')$q$, 'a UAE 16-year-old''s own tick is refused: the academy is at 18');
SELECT pg_temp.oc_as(14);
SELECT pg_temp.oc_refused($q$SELECT public.give_my_consent('2026-10-15.1', 'x')$q$, 'an adult has nothing to consent to');
SELECT pg_temp.oc_as(12);
SELECT public.withdraw_my_consent();
RESET ROLE;

SELECT pg_temp.oc_assert((SELECT consent_age FROM public.organizations WHERE id = pg_temp.oc(101)) = 15,
  'an academy admin cannot change the consent age');
SELECT pg_temp.oc_assert(NOT pg_temp.oc_required(10), 'after their own consent the 15-year-old is admitted');
SELECT pg_temp.oc_assert(pg_temp.oc_required(11), 'the 14-year-old still waits for a guardian');
SELECT pg_temp.oc_assert(pg_temp.oc_required(13), 'the UAE 16-year-old still waits for a guardian');
SELECT pg_temp.oc_assert(pg_temp.oc_required(12), 'the young person''s withdrawal wins over the older guardian approval');

SET LOCAL ROLE authenticated;
SELECT pg_temp.oc_as(10);
SELECT public.withdraw_my_consent();
RESET ROLE;
SELECT pg_temp.oc_assert(pg_temp.oc_required(10), 'withdrawing stops processing at once');
SET LOCAL ROLE authenticated;
SELECT pg_temp.oc_as(10);
SELECT public.give_my_consent('2026-10-15.1', 'I agree again.');
RESET ROLE;
SELECT pg_temp.oc_assert(NOT pg_temp.oc_required(10), 'consenting again admits them again');
SELECT pg_temp.oc_assert((SELECT count(*) FROM public.player_own_consents WHERE player_user_id = pg_temp.oc(10)) = 3,
  'every choice is kept as evidence');
SELECT pg_temp.oc_assert(public.squad_player_consent_required(pg_temp.oc(30)) = false
  AND public.squad_player_consent_required(pg_temp.oc(31)) = true, 'the coach''s roster check follows the same rule');

DO $$ DECLARE failures text;
BEGIN SELECT string_agg(description || ': ' || coalesce(detail, 'false'), E'\n') INTO failures FROM pg_temp.oc_results WHERE NOT passed;
  IF failures IS NOT NULL THEN RAISE EXCEPTION 'Own-consent checks failed:%', E'\n' || failures; END IF;
END $$;
SELECT * FROM pg_temp.oc_results;
ROLLBACK;
