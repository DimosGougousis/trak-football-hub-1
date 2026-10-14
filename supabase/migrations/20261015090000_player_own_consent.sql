-- ============================================================
-- TRAK-177 (G1/J2): a young person aged 15–17 gives their own consent at an
-- academy whose country sets the digital-consent age at 15 (Greece, GDPR
-- Art. 8). Below that age a guardian consents, as before.
--
-- consent_threshold_age() stays 18: the age from which nobody needs consent
-- (20260921120000). What is new is a per-academy consent age at or below 18:
-- from it until 18 the young person's own choice is what counts (Imad, 15 Oct:
-- no guardian approval is also required). Every existing academy keeps 18, so
-- nothing changes for anyone outside such an academy.
--
-- "Once they choose, their choice is what counts": a guardian's approval given
-- before the child reached the consent age keeps working until the young
-- person records a choice of their own; after that only their latest choice
-- decides, so their withdrawal is not overridden by an older approval.
-- ============================================================

-- ── 1. Per-academy consent age, set only by Trak ─────────────
ALTER TABLE public.organizations
  ADD COLUMN consent_age integer NOT NULL DEFAULT 18
    CHECK (consent_age BETWEEN 13 AND 18);
COMMENT ON COLUMN public.organizations.consent_age IS
  'Age from which a player gives their own consent (TRAK-177). 18 = a guardian consents for every under-18. Set only by Trak.';

CREATE FUNCTION trak_private.consent_age_set_by_operator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- The same guard as min_player_age (#284): app roles are refused.
  IF NEW.consent_age IS DISTINCT FROM OLD.consent_age
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Only Trak can change an academy''s consent age' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.consent_age_set_by_operator() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_consent_age_set_by_operator
  BEFORE UPDATE OF consent_age ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION trak_private.consent_age_set_by_operator();

-- The child's academy consent age. A child on rosters in two academies gets
-- the stricter (higher) one; no current roster row means 18.
CREATE FUNCTION public.player_consent_age(p_user_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(max(o.consent_age), public.consent_threshold_age())
  FROM public.squad_players sp
  JOIN public.organizations o ON o.id = sp.organization_id
  WHERE sp.linked_player_id = p_user_id AND sp.status <> 'coach_departed';
$fn$;
REVOKE ALL ON FUNCTION public.player_consent_age(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_consent_age(uuid) TO service_role;

-- ── 2. The young person's own consent (evidence, never deleted) ──
CREATE TABLE public.player_own_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Orders choices exactly; now() is equal for every row in one transaction.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  player_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notice_version text NOT NULL,
  consent_text text NOT NULL,
  purposes jsonb NOT NULL DEFAULT '{"coaching_records": true}'::jsonb,
  consent_age integer NOT NULL,
  player_age_at_consent integer NOT NULL,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- A row is a choice: granted (withdrawn_at NULL) or a refusal/withdrawal.
  CHECK (granted_at IS NOT NULL OR withdrawn_at IS NOT NULL)
);
CREATE INDEX player_own_consents_player ON public.player_own_consents (player_user_id, seq DESC);
ALTER TABLE public.player_own_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.player_own_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.player_own_consents TO authenticated;
CREATE POLICY "Players read their own consent choices" ON public.player_own_consents
  FOR SELECT TO authenticated USING (player_user_id = auth.uid());

-- The latest choice decides: true = consents now, false = refused/withdrew,
-- NULL = has not chosen.
CREATE FUNCTION public.player_own_consent_choice(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.withdrawn_at IS NULL AND (c.purposes->'coaching_records') = 'true'::jsonb
  FROM public.player_own_consents c
  WHERE c.player_user_id = p_user_id
  ORDER BY c.seq DESC
  LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION public.player_own_consent_choice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_own_consent_choice(uuid) TO service_role;

-- ── 3. The rule every write gate already calls ────────────────
CREATE OR REPLACE FUNCTION public.player_consent_required(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT NOT COALESCE(
    CASE
      WHEN public.player_age_years(p_user_id) >= public.consent_threshold_age() THEN true
      WHEN public.player_age_years(p_user_id) >= public.player_consent_age(p_user_id)
        THEN COALESCE(public.player_own_consent_choice(p_user_id), public.player_has_parental_consent(p_user_id))
      ELSE public.player_has_parental_consent(p_user_id)
    END,
    false
  );
$fn$;

-- ── 4. The player's own calls ─────────────────────────────────
CREATE FUNCTION trak_private.own_consent_check(p_user uuid)
RETURNS TABLE(age int, consent_age int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_age int := public.player_age_years(p_user);
  v_consent_age int := public.player_consent_age(p_user);
BEGIN
  IF p_user IS NULL OR v_age IS NULL THEN
    RAISE EXCEPTION 'Only a player can record their own consent' USING ERRCODE = '42501';
  END IF;
  IF v_age >= public.consent_threshold_age() THEN
    RAISE EXCEPTION 'No consent is needed at this age' USING ERRCODE = '42501';
  END IF;
  IF v_age < v_consent_age THEN
    RAISE EXCEPTION 'A guardian gives consent at this age' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT v_age, v_consent_age;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.own_consent_check(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.give_my_consent(p_notice_version text, p_consent_text text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM trak_private.own_consent_check(auth.uid());
  IF coalesce(btrim(p_notice_version), '') = '' OR coalesce(btrim(p_consent_text), '') = '' THEN
    RAISE EXCEPTION 'The notice version and text are required' USING ERRCODE = '22023';
  END IF;
  IF public.player_own_consent_choice(auth.uid()) IS TRUE THEN
    RETURN; -- already consents; the existing record stands
  END IF;
  INSERT INTO public.player_own_consents
    (player_user_id, notice_version, consent_text, consent_age, player_age_at_consent, granted_at)
  VALUES (auth.uid(), p_notice_version, p_consent_text, v.consent_age, v.age, now());
END;
$fn$;

CREATE FUNCTION public.withdraw_my_consent()
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM trak_private.own_consent_check(auth.uid());
  -- A new row, so the choice is recorded even when the only consent so far
  -- was a guardian's: from now on the young person's refusal counts.
  INSERT INTO public.player_own_consents
    (player_user_id, notice_version, consent_text, consent_age, player_age_at_consent, withdrawn_at)
  VALUES (auth.uid(), 'withdrawal', 'Withdrawn by the player', v.consent_age, v.age, now());
END;
$fn$;
REVOKE ALL ON FUNCTION public.give_my_consent(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_my_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.give_my_consent(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_my_consent() TO authenticated;

-- ── 5. What the app reads at sign-in ──────────────────────────
CREATE OR REPLACE FUNCTION public.my_consent_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'age',            public.player_age_years(auth.uid()),
    'threshold',      public.consent_threshold_age(),
    'consent_age',    public.player_consent_age(auth.uid()),
    'required',       public.player_consent_required(auth.uid()),
    'granted',        public.player_has_parental_consent(auth.uid()),
    'own_choice',     public.player_own_consent_choice(auth.uid()),
    'invited_parent', (SELECT parent_email FROM public.parent_invites
                        WHERE player_user_id = auth.uid()
                        ORDER BY created_at DESC LIMIT 1)
  );
$fn$;
