-- TRAK-177 item 1 (live run 3, 16 Oct): the guardian's Profile said "You have
-- no active consent recorded" for a 16-year-old at a consent-age-15 academy,
-- who consents for himself. The app can't tell, because the child's consent
-- age is service-role only (player_consent_age). This answers one question for
-- the caller's own linked child: does a guardian's approval apply? True under
-- the academy's consent age, and when there's no date of birth (TRAK-83).
-- False for anyone else's child, so it reveals nothing about them. Read-only.

CREATE FUNCTION public.guardian_consent_applies(p_child uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' SET TimeZone = 'UTC'
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.player_parent_links l
           WHERE l.parent_user_id = auth.uid() AND l.player_user_id = p_child)
     AND COALESCE(public.player_age_years(p_child) < public.player_consent_age(p_child), true);
$$;
REVOKE ALL ON FUNCTION public.guardian_consent_applies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_consent_applies(uuid) TO authenticated;

-- TRAK-177 item 2 (Imad, 17 Oct: keep). The stored threshold is the age from
-- which nobody needs consent, not the academy's own consent age.
COMMENT ON COLUMN public.parental_consents.threshold_age IS
  'The age from which nobody needs consent (consent_threshold_age(), 18). An academy''s own consent age, from which the young person decides, is organizations.consent_age.';
