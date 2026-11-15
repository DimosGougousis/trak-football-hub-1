-- TRAK-234 (J2, 20 Oct live run follow-up): a guardian is asked to approve only
-- a child their approval applies to.
--
-- get_children_awaiting_consent() feeds the consent bar on parent Home. It
-- listed every linked child for whom player_consent_required() is true. Since
-- TRAK-177, a 15-17-year-old at a consent-age-15 academy gives their own
-- consent, and a guardian's approval given at that age doesn't count. So
-- until the player consented themselves (or after they withdrew), their
-- guardian was asked, approved, saw "Approval saved", and was asked again.
--
-- The list now also needs guardian_consent_applies() (TRAK-177): the caller's
-- own child, under the academy's consent age, or with no date of birth. The
-- roster list (get_roster_children_awaiting_consent) already stops at the
-- consent age. Nothing else changes: the same columns, caller, grants and
-- consent test, and no consent record is read or written differently.

CREATE OR REPLACE FUNCTION public.get_children_awaiting_consent()
RETURNS TABLE(player_user_id uuid, full_name text, age_years int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT ppl.player_user_id,
         p.full_name,
         public.player_age_years(ppl.player_user_id)
  FROM public.player_parent_links ppl
  JOIN public.profiles p ON p.user_id = ppl.player_user_id
  WHERE ppl.parent_user_id = auth.uid()
    AND public.player_consent_required(ppl.player_user_id)
    AND public.guardian_consent_applies(ppl.player_user_id);
$fn$;
REVOKE ALL ON FUNCTION public.get_children_awaiting_consent() FROM public;
GRANT EXECUTE ON FUNCTION public.get_children_awaiting_consent() TO authenticated;
