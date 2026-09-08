-- ============================================================
-- Signup Provisioning RPC — fixes broken onboarding flows
--
-- Problems fixed:
--  1. Club admin signup was dead: RLS blocks INSERT of role='club'
--     profiles (20260526000005), but public signup offers it.
--  2. Player→coach linking always failed: client inserted into
--     squad_players directly, but RLS requires coach_user_id =
--     auth.uid() (the player's uid ≠ coach's uid).
--  3. Parent→child linking always failed: client inserted into
--     player_parent_links directly, but RLS is WITH CHECK (false).
--  4. Multi-step client-side provisioning was non-transactional:
--     a mid-sequence failure left half-created accounts forever.
--
-- All signup provisioning now happens in ONE atomic SECURITY
-- DEFINER RPC. The restrictive client-side RLS policies stay in
-- place — this RPC is the single controlled path.
--
-- Note on club role: org-scoped RLS (20260608000005) means a club
-- admin only sees coaches who voluntarily joined their org via
-- join code. Self-assigning 'club' grants no access to anyone
-- else's data, so public club signup is safe through this RPC.
-- ============================================================

-- ── 0. Age-group column for squad players ───────────────────
-- CoachAddPlayer was inserting 'U12' (text) into age (integer),
-- which Postgres rejects. Store the age group label properly.
ALTER TABLE public.squad_players
  ADD COLUMN IF NOT EXISTS age_group TEXT;

-- ── 1. Server-side unique code generator ────────────────────
-- Excludes ambiguous characters (0/O, 1/I/L).
CREATE OR REPLACE FUNCTION public.generate_unique_code(p_kind text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  chars CONSTANT text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..4 LOOP
      v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF p_kind = 'org' THEN
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE upper(join_code) = v_code);
    ELSE
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE upper(invite_code) = v_code);
    END IF;
  END LOOP;
  RETURN v_code;
END;
$fn$;

-- ── 2. Player→coach linking RPC ─────────────────────────────
-- Callable at signup (via provision_my_profile) and any time
-- later (e.g. from Settings). Idempotent.
CREATE OR REPLACE FUNCTION public.link_player_to_coach(p_code text)
RETURNS uuid  -- squad_players.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_coach uuid;
  v_sq    uuid;
  v_name  text;
  v_pos   text;
  v_shirt int;
  v_ag    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id INTO v_coach
  FROM public.profiles
  WHERE role = 'coach'
    AND invite_code IS NOT NULL
    AND upper(invite_code) = upper(regexp_replace(trim(p_code), '^TRK-', '', 'i'))
  LIMIT 1;

  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Invalid coach code';
  END IF;

  -- Already linked to this coach? Return the existing row.
  SELECT id INTO v_sq
  FROM public.squad_players
  WHERE coach_user_id = v_coach AND linked_player_id = v_uid
  LIMIT 1;
  IF v_sq IS NOT NULL THEN
    RETURN v_sq;
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = v_uid;
  SELECT position, shirt_number, age_group INTO v_pos, v_shirt, v_ag
  FROM public.player_details WHERE user_id = v_uid;

  INSERT INTO public.squad_players
    (coach_user_id, player_name, position, shirt_number, age_group, linked_player_id, status)
  VALUES
    (v_coach, COALESCE(v_name, 'Player'), v_pos, v_shirt, v_ag, v_uid, 'active')
  RETURNING id INTO v_sq;

  RETURN v_sq;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.link_player_to_coach(text) TO authenticated;

-- ── 3. The provisioning RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_my_profile(p jsonb)
RETURNS jsonb  -- { "warnings": ["..."] }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid           uuid := auth.uid();
  v_email         text;
  v_role          text := p->>'role';
  v_existing_role text;
  v_org           uuid;
  v_academy_code  text;
  v_coach_code    text;
  v_warnings      jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_role IS NULL OR v_role NOT IN ('player', 'coach', 'parent', 'club') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF COALESCE(trim(p->>'full_name'), '') = '' THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Never allow switching an existing profile to a different role
  SELECT role::text INTO v_existing_role FROM public.profiles WHERE user_id = v_uid;
  IF v_existing_role IS NOT NULL AND v_existing_role <> v_role THEN
    RAISE EXCEPTION 'Profile already exists with a different role';
  END IF;

  -- ── Profile ────────────────────────────────────────────────
  INSERT INTO public.profiles (user_id, role, full_name, nationality)
  VALUES (v_uid, v_role::public.user_role, trim(p->>'full_name'), NULLIF(trim(COALESCE(p->>'nationality', '')), ''))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name   = EXCLUDED.full_name,
        nationality = COALESCE(EXCLUDED.nationality, profiles.nationality);

  -- ── Player ─────────────────────────────────────────────────
  IF v_role = 'player' AND p ? 'player_details' THEN
    INSERT INTO public.player_details
      (user_id, date_of_birth, position, current_club, age_group, shirt_number)
    VALUES (
      v_uid,
      NULLIF(p#>>'{player_details,date_of_birth}', '')::date,
      NULLIF(p#>>'{player_details,position}', ''),
      NULLIF(p#>>'{player_details,current_club}', ''),
      NULLIF(p#>>'{player_details,age_group}', ''),
      NULLIF(p#>>'{player_details,shirt_number}', '')::int
    )
    ON CONFLICT (user_id) DO UPDATE
      SET date_of_birth = COALESCE(EXCLUDED.date_of_birth, player_details.date_of_birth),
          position      = COALESCE(EXCLUDED.position, player_details.position),
          current_club  = COALESCE(EXCLUDED.current_club, player_details.current_club),
          age_group     = COALESCE(EXCLUDED.age_group, player_details.age_group),
          shirt_number  = COALESCE(EXCLUDED.shirt_number, player_details.shirt_number);

    -- Parent invite
    IF COALESCE(trim(p->>'parent_email'), '') <> '' THEN
      INSERT INTO public.parent_invites (player_user_id, parent_email)
      SELECT v_uid, lower(trim(p->>'parent_email'))
      WHERE NOT EXISTS (
        SELECT 1 FROM public.parent_invites
        WHERE player_user_id = v_uid
          AND lower(parent_email) = lower(trim(p->>'parent_email'))
      );
    END IF;

    -- Coach linking (non-fatal: a bad code shouldn't fail signup)
    v_coach_code := COALESCE(trim(p->>'coach_invite_code'), '');
    IF v_coach_code <> '' THEN
      BEGIN
        PERFORM public.link_player_to_coach(v_coach_code);
      EXCEPTION WHEN OTHERS THEN
        v_warnings := v_warnings || to_jsonb(
          'Coach code "' || v_coach_code || '" was not recognised — you can link to your coach later in Settings.'
        );
      END;
    END IF;
  END IF;

  -- ── Coach ──────────────────────────────────────────────────
  IF v_role = 'coach' THEN
    -- Academy code lookup (non-fatal)
    v_org := NULL;
    v_academy_code := COALESCE(trim(p#>>'{coach_details,academy_code}'), '');
    IF v_academy_code <> '' THEN
      SELECT id INTO v_org
      FROM public.organizations
      WHERE upper(join_code) = upper(regexp_replace(v_academy_code, '^TRK-', '', 'i'));
      IF v_org IS NULL THEN
        v_warnings := v_warnings || to_jsonb(
          'Academy code "' || v_academy_code || '" was not recognised — you can join your academy later from your profile.'
        );
      END IF;
    END IF;

    INSERT INTO public.coach_details (user_id, current_club, team, coach_role, organization_id)
    VALUES (
      v_uid,
      NULLIF(p#>>'{coach_details,current_club}', ''),
      NULLIF(p#>>'{coach_details,team}', ''),
      NULLIF(p#>>'{coach_details,coach_role}', ''),
      v_org
    )
    ON CONFLICT (user_id) DO UPDATE
      SET current_club    = COALESCE(EXCLUDED.current_club, coach_details.current_club),
          team            = COALESCE(EXCLUDED.team, coach_details.team),
          coach_role      = COALESCE(EXCLUDED.coach_role, coach_details.coach_role),
          organization_id = COALESCE(EXCLUDED.organization_id, coach_details.organization_id);

    -- Invite code for players to link with
    UPDATE public.profiles
    SET invite_code = public.generate_unique_code('profile')
    WHERE user_id = v_uid AND invite_code IS NULL;
  END IF;

  -- ── Club admin ─────────────────────────────────────────────
  IF v_role = 'club' THEN
    IF COALESCE(trim(p#>>'{club_details,academy_name}'), '') = '' THEN
      RAISE EXCEPTION 'Academy name is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE admin_user_id = v_uid) THEN
      INSERT INTO public.organizations (admin_user_id, name, join_code)
      VALUES (v_uid, trim(p#>>'{club_details,academy_name}'), public.generate_unique_code('org'));
    END IF;
  END IF;

  -- ── Parent ─────────────────────────────────────────────────
  IF v_role = 'parent' AND v_email IS NOT NULL THEN
    PERFORM public.link_parent_to_players_by_email(v_email);
  END IF;

  RETURN jsonb_build_object('warnings', v_warnings);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.provision_my_profile(jsonb) TO authenticated;
