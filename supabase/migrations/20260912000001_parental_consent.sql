-- ============================================================
-- Parental consent gate for players below the digital-consent age
--
-- Greek digital-consent age is 15 (Law 4624/2019 Art. 21). Below it, a holder
-- of parental responsibility must authorise consent-based processing, and the
-- controller must make reasonable efforts to verify that authorisation
-- (GDPR Art. 8(2)). Today there is no gate at all: a 13-year-old signs up,
-- claims a roster row and gets assessed, with no parent anywhere in the flow.
-- The parent email field is literally labelled "(optional)".
--
-- What this adds:
--   * parental_consents — an append-only, versioned record. NOT a boolean.
--     The Legal proposal is explicit that a mutable parent_consent = true
--     field is insufficient evidence.
--   * A gate on coach assessments and recognition awards for under-age
--     players who have no active consent.
--   * RPCs for the parent to grant and withdraw, and for either side to ask
--     what is outstanding.
--
-- What this deliberately does NOT do:
--   * It does not block signup. The child completes the same screens in the
--     same order and lands in a "waiting for your parent" state. They took
--     the initiative; they are waiting on the parent to finish, not to start.
--   * It does not touch players at or above the threshold. 15-18 year olds
--     self-consent under Greek law and their flow is unchanged.
--
-- KNOWN LIMITATION, flagged for legal review: the gate can only apply where
-- we know the player's age, which means roster rows linked to an account.
-- A coach-typed row with no linked player has no date of birth, so writes
-- against it are still allowed. That row is the academy's own paper record
-- of its own squad. If counsel disagrees, the fix is to require date of
-- birth on the coach's add-player screen and gate on that instead.
-- ============================================================

-- ── 1. Jurisdiction rules ───────────────────────────────────
-- One place to change. The pilot is a single reviewed market (Greece), per
-- the Legal proposal's instruction to restrict to named, legally reviewed
-- markets rather than infer applicable law per user. Multi-market needs a
-- country column on the academy, not on the child: a Greek-resident child of
-- any nationality is governed by Greek law, so nationality is the wrong key.
CREATE OR REPLACE FUNCTION public.consent_threshold_age()
RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT 15;  -- Greece. GDPR default is 16; member states may lower to 13.
$fn$;

COMMENT ON FUNCTION public.consent_threshold_age() IS
  'Digital-consent age for the single configured pilot market (Greece, 15). Change here, not at call sites.';


-- ── 2. Age derivation ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_age_years(p_user_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
           WHEN pd.date_of_birth IS NULL THEN NULL
           ELSE date_part('year', age(current_date, pd.date_of_birth))::int
         END
  FROM public.player_details pd
  WHERE pd.user_id = p_user_id;
$fn$;


-- ── 3. The consent record ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parental_consents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_user_id        uuid NOT NULL,
  parent_user_id        uuid NOT NULL,

  -- Who authorised, and how we satisfied Art. 8(2) "reasonable efforts".
  relationship_declared text NOT NULL
    CHECK (relationship_declared IN ('parent', 'legal_guardian')),
  verification_method   text NOT NULL
    CHECK (verification_method IN ('email_confirmed', 'club_admin_confirmed', 'paper_form')),
  verified_by_user_id   uuid,          -- set when a club admin confirmed it

  -- What was actually agreed. Separate choices, never one bundled yes.
  purposes              jsonb NOT NULL,
  notice_version        text NOT NULL,
  consent_text          text NOT NULL, -- the exact wording shown, stored verbatim

  -- Which rules were applied, so the record can be reconstructed later.
  threshold_age         int NOT NULL,
  player_age_at_consent int NOT NULL,

  -- Lifecycle. Withdrawal does not delete: it closes the record.
  granted_at            timestamptz NOT NULL DEFAULT now(),
  withdrawn_at          timestamptz,
  superseded_by         uuid REFERENCES public.parental_consents(id)
);

CREATE INDEX IF NOT EXISTS parental_consents_player_idx
  ON public.parental_consents (player_user_id) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS parental_consents_parent_idx
  ON public.parental_consents (parent_user_id);

ALTER TABLE public.parental_consents ENABLE ROW LEVEL SECURITY;

-- Append-only by construction: no INSERT, UPDATE or DELETE policy exists.
-- Every write goes through the SECURITY DEFINER RPCs below, which is the same
-- pattern parent_invites uses. Reads are granted to the two parties involved.
DROP POLICY IF EXISTS "Parents read own consents" ON public.parental_consents;
CREATE POLICY "Parents read own consents"
  ON public.parental_consents FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS "Players read consents about them" ON public.parental_consents;
CREATE POLICY "Players read consents about them"
  ON public.parental_consents FOR SELECT TO authenticated
  USING (player_user_id = auth.uid());


-- ── 4. The questions the rest of the system asks ────────────
CREATE OR REPLACE FUNCTION public.player_has_parental_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.parental_consents
    WHERE player_user_id = p_user_id
      AND withdrawn_at IS NULL
      AND superseded_by IS NULL
  );
$fn$;

-- True when this player is below the threshold AND nobody has authorised.
-- NULL date of birth is treated as NOT requiring consent, because we cannot
-- assert an age we do not have; the alternative would lock out every existing
-- account that predates this migration. Date of birth is collected at signup,
-- so this only affects legacy rows.
CREATE OR REPLACE FUNCTION public.player_consent_required(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    public.player_age_years(p_user_id) < public.consent_threshold_age()
      AND NOT public.player_has_parental_consent(p_user_id),
    false
  );
$fn$;

-- Same question, asked about a roster row rather than an account.
CREATE OR REPLACE FUNCTION public.squad_player_consent_required(p_squad_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    public.player_consent_required(sp.linked_player_id),
    false  -- unlinked roster row: no account, no date of birth. See header note.
  )
  FROM public.squad_players sp
  WHERE sp.id = p_squad_player_id;
$fn$;

REVOKE ALL ON FUNCTION public.player_age_years(uuid) FROM public;
REVOKE ALL ON FUNCTION public.player_has_parental_consent(uuid) FROM public;
REVOKE ALL ON FUNCTION public.player_consent_required(uuid) FROM public;
REVOKE ALL ON FUNCTION public.squad_player_consent_required(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.player_age_years(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_has_parental_consent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_consent_required(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.squad_player_consent_required(uuid) TO authenticated;


-- ── 5. The gate ─────────────────────────────────────────────
-- Extends 20260614000001, which added the is_coach() role check. Both
-- conditions must survive: a writer must be a coach writing as themselves,
-- AND the child must not be waiting on a parent.
DROP POLICY IF EXISTS "Coaches can insert assessments" ON public.coach_assessments;
CREATE POLICY "Coaches can insert assessments"
  ON public.coach_assessments FOR INSERT TO authenticated
  WITH CHECK (
    coach_user_id = auth.uid()
    AND public.is_coach()
    AND NOT public.squad_player_consent_required(squad_player_id)
  );

DROP POLICY IF EXISTS "Coaches can insert awards" ON public.recognition_awards;
CREATE POLICY "Coaches can insert awards"
  ON public.recognition_awards FOR INSERT TO authenticated
  WITH CHECK (
    coach_user_id = auth.uid()
    AND public.is_coach()
    AND NOT public.squad_player_consent_required(squad_player_id)
  );


-- ── 6. Granting ─────────────────────────────────────────────
-- Called by the signed-in parent after they have confirmed their relationship
-- and made their per-purpose choices. Idempotent per player: re-granting
-- supersedes rather than duplicating, so the history stays reconstructable.
CREATE OR REPLACE FUNCTION public.record_parental_consent(
  p_player_user_id        uuid,
  p_relationship          text,
  p_purposes              jsonb,
  p_notice_version        text,
  p_consent_text          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_parent uuid := auth.uid();
  v_age    int;
  v_new    uuid;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The parent must already be linked to this child. The link is established
  -- by redeeming the invite, which proves control of the invited address.
  IF NOT EXISTS (
    SELECT 1 FROM public.player_parent_links
    WHERE parent_user_id = v_parent AND player_user_id = p_player_user_id
  ) THEN
    RAISE EXCEPTION 'You are not linked to this player';
  END IF;

  IF p_relationship NOT IN ('parent', 'legal_guardian') THEN
    RAISE EXCEPTION 'Relationship must be parent or legal_guardian';
  END IF;

  IF p_purposes IS NULL OR jsonb_typeof(p_purposes) <> 'object' THEN
    RAISE EXCEPTION 'Purposes must be an object of individual choices';
  END IF;

  IF COALESCE(trim(p_notice_version), '') = ''
     OR COALESCE(trim(p_consent_text), '') = '' THEN
    RAISE EXCEPTION 'Notice version and consent wording must both be recorded';
  END IF;

  v_age := public.player_age_years(p_player_user_id);
  IF v_age IS NULL THEN
    RAISE EXCEPTION 'Player has no date of birth on record';
  END IF;

  -- Close any standing consent rather than editing it.
  UPDATE public.parental_consents
     SET withdrawn_at = now()
   WHERE player_user_id = p_player_user_id
     AND withdrawn_at IS NULL
     AND superseded_by IS NULL;

  INSERT INTO public.parental_consents (
    player_user_id, parent_user_id, relationship_declared, verification_method,
    purposes, notice_version, consent_text, threshold_age, player_age_at_consent
  ) VALUES (
    p_player_user_id, v_parent, p_relationship, 'email_confirmed',
    p_purposes, trim(p_notice_version), trim(p_consent_text),
    public.consent_threshold_age(), v_age
  )
  RETURNING id INTO v_new;

  UPDATE public.parental_consents
     SET superseded_by = v_new
   WHERE player_user_id = p_player_user_id
     AND id <> v_new
     AND superseded_by IS NULL
     AND withdrawn_at IS NOT NULL;

  RETURN v_new;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_parental_consent(uuid, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_parental_consent(uuid, text, jsonb, text, text) TO authenticated;


-- ── 7. Withdrawal ───────────────────────────────────────────
-- "As easy to withdraw as it was to give." Closes the record; does not delete
-- it, because withdrawal does not retrospectively invalidate lawful past
-- processing and the evidence must survive.
CREATE OR REPLACE FUNCTION public.withdraw_parental_consent(p_player_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_parent uuid := auth.uid();
  v_count  int;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.parental_consents
     SET withdrawn_at = now()
   WHERE player_user_id = p_player_user_id
     AND parent_user_id = v_parent
     AND withdrawn_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.withdraw_parental_consent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.withdraw_parental_consent(uuid) TO authenticated;


-- ── 8. What is outstanding ──────────────────────────────────
-- For the parent's screen: which of my linked children still need me to act.
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
    AND public.player_consent_required(ppl.player_user_id);
$fn$;

REVOKE ALL ON FUNCTION public.get_children_awaiting_consent() FROM public;
GRANT EXECUTE ON FUNCTION public.get_children_awaiting_consent() TO authenticated;

-- For the player's own screen: am I waiting on a parent?
CREATE OR REPLACE FUNCTION public.my_consent_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'age',            public.player_age_years(auth.uid()),
    'threshold',      public.consent_threshold_age(),
    'required',       public.player_consent_required(auth.uid()),
    'granted',        public.player_has_parental_consent(auth.uid()),
    'invited_parent', (SELECT parent_email FROM public.parent_invites
                        WHERE player_user_id = auth.uid()
                        ORDER BY created_at DESC LIMIT 1)
  );
$fn$;

REVOKE ALL ON FUNCTION public.my_consent_status() FROM public;
GRANT EXECUTE ON FUNCTION public.my_consent_status() TO authenticated;


-- ── 9. Pre-consent record expiry ────────────────────────────
-- A 13-year-old whose parent never responds must not leave their data sitting
-- here indefinitely. The Legal proposal requires pre-consent records to carry
-- minimum fields and a defined expiry. This reports them; it does not delete
-- automatically, because deletion of a child's account is not something to
-- run unattended before anyone has watched it work once.
CREATE OR REPLACE VIEW public.stale_pending_consent AS
SELECT pd.user_id           AS player_user_id,
       p.full_name,
       public.player_age_years(pd.user_id) AS age_years,
       pi.parent_email,
       pi.created_at        AS invited_at,
       now() - pi.created_at AS waiting_for
FROM public.player_details pd
JOIN public.profiles p ON p.user_id = pd.user_id
LEFT JOIN public.parent_invites pi ON pi.player_user_id = pd.user_id
WHERE public.player_consent_required(pd.user_id)
  AND COALESCE(pi.created_at, now()) < now() - interval '30 days';

COMMENT ON VIEW public.stale_pending_consent IS
  'Under-age players whose parent has not authorised within 30 days. Review and erase via delete_my_account or an admin path; do not leave indefinitely.';
