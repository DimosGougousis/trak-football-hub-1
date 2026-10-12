-- TRAK-165 (J1): no child under 13 can be loaded.
--
-- Founders' decision, 12 Oct 2026: Trak serves only children aged 13 and over.
-- The UAE Child Digital Safety Law (Federal Decree-Law 26/2025, Art. 7)
-- restricts using an under-13's data, including for commercial purposes, and
-- the legal pack v1.1 promises that no child under 13 is imported, invited or
-- recorded. Eligibility is by date of birth on the Dubai date, not by squad
-- label: an U13 squad is all under 13, and a birth-year U14 still has
-- 12-year-olds until their birthdays.
--
-- A trigger on roster_children rather than a check inside
-- admit_roster_child(): every path that creates or re-dates a roster child
-- passes through this table, so none can skip it. Existing rows are not
-- re-checked (prod had 0 under 13 on 12 Oct, read-only).

CREATE FUNCTION trak_private.roster_child_is_13_or_older()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.date_of_birth > ((now() AT TIME ZONE 'Asia/Dubai')::date - interval '13 years')::date THEN
    RAISE EXCEPTION 'Trak only serves children aged 13 and over: this date of birth (%) is under 13', NEW.date_of_birth
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.roster_child_is_13_or_older() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_roster_child_is_13_or_older
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.roster_children
  FOR EACH ROW EXECUTE FUNCTION trak_private.roster_child_is_13_or_older();
