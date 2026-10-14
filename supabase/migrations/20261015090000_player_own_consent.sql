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
        THEN COALESCE(public.player_own_consent_choice(p_user_id), EXISTS (
          -- Only a guardian approval given below the consent age carries over.
          SELECT 1 FROM public.parental_consents c
          WHERE c.player_user_id = p_user_id AND c.withdrawn_at IS NULL AND c.superseded_by IS NULL
            AND c.purposes->'coaching_records' = 'true'::jsonb
            AND c.player_age_at_consent < public.player_consent_age(p_user_id)))
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

-- ── 6. No guardian approval at or above the consent age ───────
-- One guard for both paths (record_parental_consent and record_roster_consent):
-- from the academy's consent age the young person decides, not a guardian.
CREATE FUNCTION trak_private.guardian_consent_below_consent_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_consent_age int := CASE
    WHEN NEW.player_user_id IS NOT NULL THEN public.player_consent_age(NEW.player_user_id)
    ELSE (SELECT o.consent_age FROM public.roster_children rc
          JOIN public.organizations o ON o.id = rc.organization_id
          WHERE rc.id = NEW.roster_child_id)
  END;
BEGIN
  IF NEW.player_age_at_consent >= COALESCE(v_consent_age, public.consent_threshold_age()) THEN
    RAISE EXCEPTION 'At this age the player gives their own consent in Trak' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.guardian_consent_below_consent_age() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guardian_consent_below_consent_age
  BEFORE INSERT ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION trak_private.guardian_consent_below_consent_age();

-- ── 7. Roster path: the academy's consent age, not the global 18 ──
-- A guardian is asked to approve only children below the academy's consent age.
CREATE OR REPLACE FUNCTION public.get_roster_children_awaiting_consent()
RETURNS TABLE (roster_child_id uuid, first_name text, age_years int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' SET TimeZone = 'UTC'
AS $fn$
  SELECT rc.id,
         split_part(btrim(sp.player_name), ' ', 1),
         date_part('year', age(current_date, rc.date_of_birth))::int
  FROM public.roster_guardians rg
  JOIN public.roster_children rc ON rc.id = rg.roster_child_id
  JOIN public.squad_players sp   ON sp.id = rc.squad_player_id
  JOIN public.organizations o    ON o.id = rc.organization_id
  WHERE rg.parent_user_id = auth.uid()
    AND rc.player_user_id IS NULL
    AND date_part('year', age(current_date, rc.date_of_birth)) < o.consent_age
    AND NOT EXISTS (
      SELECT 1 FROM public.parental_consents c
      WHERE c.roster_child_id = rc.id
        AND c.withdrawn_at IS NULL
        AND c.superseded_by IS NULL
        AND c.purposes->'coaching_records' = 'true'::jsonb
    )
  ORDER BY 2, 1;
$fn$;

-- The child is invited directly from the academy's consent age (they consent
-- at their own first sign-in); below it, only after a guardian approves.
-- Body as in 20260928120000 (renamed by 20260930090127), with the age line changed.
CREATE OR REPLACE FUNCTION public.roster_email_invite_targets(p_roster_child_id uuid, p_guardian_user_id uuid DEFAULT NULL)
RETURNS TABLE (kind text, email text, first_name text, academy text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET TimeZone = 'UTC'
AS $fn$
DECLARE
  v_child   public.roster_children%ROWTYPE;
  v_first   text;
  v_academy text;
  v_self    boolean;
BEGIN
  SELECT rc.* INTO v_child FROM public.roster_children rc WHERE rc.id = p_roster_child_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_roster_child' USING ERRCODE = 'P0002';
  END IF;
  SELECT split_part(btrim(sp.player_name), ' ', 1) INTO v_first
  FROM public.squad_players sp WHERE sp.id = v_child.squad_player_id;
  SELECT o.name INTO v_academy FROM public.organizations o WHERE o.id = v_child.organization_id;
  v_self := date_part('year', age(current_date, v_child.date_of_birth)) >= COALESCE(
    (SELECT o.consent_age FROM public.organizations o WHERE o.id = v_child.organization_id),
    public.consent_threshold_age());

  IF p_guardian_user_id IS NULL THEN
    RETURN QUERY
      SELECT 'guardian'::text, rg.email, v_first, v_academy
      FROM public.roster_guardians rg
      WHERE rg.roster_child_id = v_child.id AND rg.parent_user_id IS NULL
      UNION ALL
      SELECT 'child'::text, v_child.child_email, v_first, v_academy
      WHERE v_self AND v_child.player_user_id IS NULL AND v_child.child_email IS NOT NULL;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roster_guardians rg
                 WHERE rg.roster_child_id = v_child.id AND rg.parent_user_id = p_guardian_user_id) THEN
    RAISE EXCEPTION 'not_guardian' USING ERRCODE = '42501';
  END IF;
  IF NOT v_self AND NOT EXISTS (
    SELECT 1 FROM public.parental_consents c
    WHERE c.roster_child_id = v_child.id
      AND c.parent_user_id = p_guardian_user_id
      AND c.withdrawn_at IS NULL
      AND c.superseded_by IS NULL
      AND c.purposes->'coaching_records' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'consent_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT 'child'::text, v_child.child_email, v_first, v_academy
    WHERE v_child.player_user_id IS NULL AND v_child.child_email IS NOT NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.roster_email_invite_targets(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 8. Roster: no guardian needed from the consent age ────────
-- Body as in 20260928120000, with the guardian check changed. Grants unchanged.
CREATE OR REPLACE FUNCTION public.admit_roster_child(
  p_organization_id uuid,
  p_coach_user_id   uuid,
  p_child_name      text,
  p_age_group       text,
  p_date_of_birth   date,
  p_child_email     text,
  p_guardian_emails text[],
  p_loaded_by       text,
  p_source_file     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  -- TRAK-84: a blank email means the child has none (stored as NULL, never '').
  v_child_email text := NULLIF(lower(btrim(COALESCE(p_child_email, ''))), '');
  v_guardians   text[];
  v_squad_id    uuid;
  v_roster_id   uuid;
BEGIN
  IF btrim(COALESCE(p_child_name, '')) = '' THEN
    RAISE EXCEPTION 'The child''s name is required' USING ERRCODE = '22023';
  END IF;
  IF p_date_of_birth IS NULL THEN
    RAISE EXCEPTION 'The child''s date of birth is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.coach_details cd
    WHERE cd.user_id = p_coach_user_id AND cd.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'The coach does not work for this academy' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT e), '{}') INTO v_guardians
  FROM (SELECT lower(btrim(g)) AS e FROM unnest(COALESCE(p_guardian_emails, '{}')) g) s
  WHERE e <> '';
  -- TRAK-177: from the academy's consent age, a child with their own email
  -- needs no guardian on the roster (they consent for themselves).
  IF cardinality(v_guardians) = 0 AND NOT (
    v_child_email IS NOT NULL
    AND date_part('year', age(current_date, p_date_of_birth)) >= COALESCE(
      (SELECT o.consent_age FROM public.organizations o WHERE o.id = p_organization_id),
      public.consent_threshold_age())
  ) THEN
    RAISE EXCEPTION 'At least one guardian email is required' USING ERRCODE = '22023';
  END IF;
  IF v_child_email = ANY (v_guardians) THEN
    RAISE EXCEPTION 'A child''s email cannot also be a guardian''s email on the roster'
      USING ERRCODE = '23514';
  END IF;

  -- Without an email, the academy, name and date of birth identify the child,
  -- so a re-run of the same file refuses the second copy (the loader skips it).
  IF v_child_email IS NULL AND EXISTS (
    SELECT 1 FROM public.roster_children rc
    JOIN public.squad_players sp ON sp.id = rc.squad_player_id
    WHERE rc.organization_id = p_organization_id AND rc.child_email IS NULL
      AND rc.date_of_birth = p_date_of_birth
      AND lower(btrim(sp.player_name)) = lower(btrim(p_child_name))
  ) THEN
    RAISE EXCEPTION 'This child is already on the academy''s roster' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.squad_players (coach_user_id, player_name, age_group)
  VALUES (p_coach_user_id, btrim(p_child_name), NULLIF(btrim(COALESCE(p_age_group, '')), ''))
  RETURNING id INTO v_squad_id;

  INSERT INTO public.roster_children
    (organization_id, squad_player_id, date_of_birth, child_email, loaded_by, source_file)
  VALUES (p_organization_id, v_squad_id, p_date_of_birth, v_child_email, p_loaded_by, p_source_file)
  RETURNING id INTO v_roster_id;

  INSERT INTO public.roster_guardians (roster_child_id, email, loaded_by)
  SELECT v_roster_id, e, p_loaded_by FROM unnest(v_guardians) e;

  RETURN v_roster_id;
END;
$fn$;


-- ── 9. The coach's reason: waiting for the player, not a parent ──
-- From the academy's consent age the player agrees for themselves, so the
-- coach is told 'player' rather than sent to chase a parent. Body as in
-- 20261001150000 with that one branch added; grants and comment unchanged.
CREATE OR REPLACE FUNCTION public.coach_squad_player_wait_reason(p_squad_player_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_coach()
     OR NOT public.squad_player_is_mine(p_squad_player_id) THEN
    RAISE EXCEPTION 'Not authorized for this squad player' USING ERRCODE = '42501';
  END IF;
  IF NOT public.squad_player_consent_required(p_squad_player_id) THEN
    RETURN 'ready';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.squad_players sp
    LEFT JOIN public.roster_children rc ON rc.squad_player_id = sp.id AND sp.linked_player_id IS NULL
    LEFT JOIN public.organizations o ON o.id = rc.organization_id
    WHERE sp.id = p_squad_player_id
      AND CASE WHEN sp.linked_player_id IS NOT NULL
            THEN public.player_age_years(sp.linked_player_id) >= public.player_consent_age(sp.linked_player_id)
             AND public.player_age_years(sp.linked_player_id) < public.consent_threshold_age()
            ELSE date_part('year', age(current_date, rc.date_of_birth)) >= o.consent_age
             AND date_part('year', age(current_date, rc.date_of_birth)) < public.consent_threshold_age()
          END
  ) THEN
    RETURN 'player';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.squad_players sp
    JOIN public.roster_children rc ON rc.squad_player_id = sp.id
    JOIN public.parental_consents c ON c.roster_child_id = rc.id
    WHERE sp.id = p_squad_player_id
      AND sp.linked_player_id IS NULL
      AND c.withdrawn_at IS NULL
      AND c.superseded_by IS NULL
      AND c.purposes->'coaching_records' = 'true'::jsonb
  ) THEN
    RETURN 'signup';
  END IF;
  RETURN 'parent';
END;
$fn$;
