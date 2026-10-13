-- TRAK-165 (J1): a roster child must be at least the academy's minimum age.
--
-- Founders' decision, 12 Oct 2026: Trak serves no child under 13 in the UAE.
-- The UAE Child Digital Safety Law (Federal Decree-Law 26/2025, Art. 7)
-- restricts using an under-13's data, including for commercial purposes, and
-- the legal pack v1.1 promises that no child under 13 is imported, invited or
-- recorded. Greece's law differs, and the founders don't want the UAE rule to
-- limit an Athens academy (Imad, 12 Oct). So the minimum is per academy:
-- 13 by default, changed only by the operator for an academy whose law allows
-- younger children (on counsel's advice).
--
-- Eligibility is by date of birth on the Dubai date, not by squad label: an U13
-- squad is all under 13, and a birth-year U14 still has 12-year-olds until
-- their birthdays. Existing rows are not re-checked (prod had 0 under 13 on
-- 12 Oct, read-only).

ALTER TABLE public.organizations
  ADD COLUMN min_player_age integer NOT NULL DEFAULT 13
    CHECK (min_player_age BETWEEN 0 AND 17);
COMMENT ON COLUMN public.organizations.min_player_age IS
  'TRAK-165. Youngest age (years, by date of birth) this academy may load onto a roster. 13 for UAE academies (Child Digital Safety Law); set by the operator only, per country, on counsel''s advice.';

-- Academy admins may create and edit their own academy row, so they can't be
-- the ones who lower its minimum: their insert always gets the default, and
-- their update can't change it. The operator (service role, or the dashboard)
-- can.
CREATE FUNCTION trak_private.min_player_age_set_by_operator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.min_player_age := 13;
    ELSIF NEW.min_player_age IS DISTINCT FROM OLD.min_player_age THEN
      RAISE EXCEPTION 'Only Trak can change an academy''s minimum age' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.min_player_age_set_by_operator() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_min_player_age_set_by_operator
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION trak_private.min_player_age_set_by_operator();

-- Every path that creates or re-dates a roster child writes roster_children,
-- so the check lives there and none can skip it.
CREATE FUNCTION trak_private.roster_child_meets_min_age()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_min integer;
BEGIN
  SELECT o.min_player_age INTO v_min FROM public.organizations o WHERE o.id = NEW.organization_id;
  IF COALESCE(v_min, 13) > 0
     AND NEW.date_of_birth > ((now() AT TIME ZONE 'Asia/Dubai')::date - make_interval(years => COALESCE(v_min, 13)))::date THEN
    RAISE EXCEPTION 'This academy serves children aged % and over: this date of birth (%) is younger', COALESCE(v_min, 13), NEW.date_of_birth
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.roster_child_meets_min_age() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_roster_child_meets_min_age
  BEFORE INSERT OR UPDATE OF date_of_birth, organization_id ON public.roster_children
  FOR EACH ROW EXECUTE FUNCTION trak_private.roster_child_meets_min_age();
