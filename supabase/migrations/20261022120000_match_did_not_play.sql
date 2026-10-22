-- TRAK-185 part 2 (J4, Imad 18 Oct): a player removed from a logged match is
-- never deleted. They stay on the match, marked "Didn't play", with no goals,
-- assists, card or rating, so it doesn't count in their stats.
--
-- The player's match row moves, whole, into match_non_appearances. Every stats
-- reader (the player's and family's screens, ratings, averages, the database's
-- match rules) reads public.matches, so none of them counts it, unchanged.
-- "Played after all" puts the original row back. Only the coach who logged
-- the match changes it, through mark_match_appearance(); the coach's edit
-- screen lists both through logged_match().

CREATE TABLE public.match_non_appearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_match_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.coach_sessions(id) ON DELETE SET NULL,
  opponent text,
  match_date date,
  logged_by uuid,
  -- The whole original matches row, as it was when marked.
  recorded jsonb NOT NULL,
  marked_by uuid,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
COMMENT ON TABLE public.match_non_appearances IS
  'TRAK-185: a player the coach marked "Didn''t play" on a logged match, with their original match row. Not counted in any stat. Read through logged_match() and export_my_account() only.';
ALTER TABLE public.match_non_appearances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_non_appearances FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.match_non_appearances TO service_role;

-- ── Marking a player as not having played, or back ───────────────────────
CREATE FUNCTION public.mark_match_appearance(p_session_id uuid, p_user_id uuid, p_played boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_sp uuid;
  v_opponent text;
  v_day date;
  v_match public.matches;
  v_kept public.match_non_appearances;
  v_team integer;
  v_them integer;
  v_goals integer;
  v_assists integer;
BEGIN
  IF NOT public.is_coach() THEN
    RAISE EXCEPTION 'Not authorised: only a coach can change a match' USING ERRCODE = '42501';
  END IF;
  IF p_played IS NULL THEN
    RAISE EXCEPTION 'Say whether the player played';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coach_sessions s
                 WHERE s.id = p_session_id AND s.coach_user_id = auth.uid() AND s.session_type = 'match') THEN
    RAISE EXCEPTION 'This is not a match you logged' USING ERRCODE = '42501';
  END IF;
  SELECT sp.id INTO v_sp FROM public.squad_players sp
  WHERE sp.linked_player_id = p_user_id AND public.squad_player_is_mine(sp.id)
  ORDER BY sp.created_at LIMIT 1;
  IF v_sp IS NULL THEN
    RAISE EXCEPTION 'Not authorised: this player is not in your squad' USING ERRCODE = '42501';
  END IF;
  -- G1: nothing about a child changes without a parent's consent.
  IF public.squad_player_consent_required(v_sp) THEN
    RAISE EXCEPTION 'Waiting for parent: this player can''t be changed until a parent approves' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(coalesce(x.opponent, ''))), x.match_date INTO v_opponent, v_day FROM (
    SELECT m.opponent, m.match_date FROM public.matches m
    WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
    UNION ALL
    SELECT k.opponent, k.match_date FROM public.match_non_appearances k
    WHERE k.session_id = p_session_id AND k.logged_by = auth.uid()
  ) x LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No players are logged in this match';
  END IF;
  -- The same lock as logging and editing, so they take turns on one match.
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || '|' || v_day::text || '|' || v_opponent, 149));

  IF NOT p_played THEN
    SELECT * INTO v_match FROM public.matches m
    WHERE m.session_id = p_session_id AND m.user_id = p_user_id
      AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This player is not marked as playing in this match';
    END IF;
    IF (SELECT count(*) FROM public.matches m
        WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach') <= 1 THEN
      RAISE EXCEPTION 'A match keeps at least one player who played';
    END IF;
    IF EXISTS (SELECT 1 FROM public.coach_assessments a
               JOIN public.squad_players sp ON sp.id = a.squad_player_id
               WHERE a.session_id = p_session_id AND sp.linked_player_id = p_user_id) THEN
      RAISE EXCEPTION 'This player has an assessment on this match, which says they played. Change the assessment first.';
    END IF;
    INSERT INTO public.match_non_appearances (original_match_id, user_id, session_id, opponent, match_date, logged_by, recorded, marked_by)
    VALUES (v_match.id, v_match.user_id, v_match.session_id, v_match.opponent, v_match.match_date,
            v_match.logged_by, to_jsonb(v_match), auth.uid());
    DELETE FROM public.matches WHERE id = v_match.id;
    UPDATE public.session_attendance SET status = 'absent'
    WHERE session_id = p_session_id AND squad_player_id = v_sp;
  ELSE
    SELECT * INTO v_kept FROM public.match_non_appearances k
    WHERE k.session_id = p_session_id AND k.user_id = p_user_id AND k.logged_by = auth.uid()
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This player is not marked as not playing in this match';
    END IF;
    -- Back on the match's current score; their own numbers must still fit it.
    SELECT min(m.team_score), min(m.opponent_score), coalesce(sum(m.goals), 0), coalesce(sum(m.assists), 0)
      INTO v_team, v_them, v_goals, v_assists
    FROM public.matches m
    WHERE m.session_id = p_session_id AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach';
    IF v_goals + (v_kept.recorded->>'goals')::integer > v_team THEN
      RAISE EXCEPTION '% goals would be entered, but the team scored %. Correct the score first.',
        v_goals + (v_kept.recorded->>'goals')::integer, v_team;
    END IF;
    IF v_assists + (v_kept.recorded->>'assists')::integer > v_team THEN
      RAISE EXCEPTION '% assists would be entered, but the team scored %. Correct the score first.',
        v_assists + (v_kept.recorded->>'assists')::integer, v_team;
    END IF;
    INSERT INTO public.matches
    SELECT * FROM jsonb_populate_record(NULL::public.matches,
      v_kept.recorded || jsonb_build_object('team_score', v_team, 'opponent_score', v_them));
    DELETE FROM public.match_non_appearances WHERE id = v_kept.id;
    UPDATE public.session_attendance SET status = 'present'
    WHERE session_id = p_session_id AND squad_player_id = v_sp;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.mark_match_appearance(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_match_appearance(uuid, uuid, boolean) TO authenticated;
COMMENT ON FUNCTION public.mark_match_appearance(uuid, uuid, boolean) IS
  'TRAK-185: the coach marks a player on their logged match as Didn''t play (their row is kept, not counted) or back as played.';

-- ── The edit screen lists both ───────────────────────────────────────────
DROP FUNCTION public.logged_match(uuid);
CREATE FUNCTION public.logged_match(p_session_id uuid)
RETURNS TABLE (
  user_id uuid, player_name text, "position" text, age_group text, competition text, venue text,
  opponent text, match_date date, minutes_played integer, goals integer, assists integer,
  card_received text, team_score integer, opponent_score integer,
  -- A child waiting for a parent's consent: shown by name, numbers withheld, not editable (G1).
  locked boolean,
  -- false: marked "Didn't play" (TRAK-185 part 2); numbers withheld, not counted.
  played boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT x.* FROM (
    SELECT m.user_id, sp.player_name, m.position, m.age_group, m.competition, m.venue,
           m.opponent, m.match_date, m.minutes_played,
           CASE WHEN sp.consent_required THEN NULL ELSE m.goals END AS goals,
           CASE WHEN sp.consent_required THEN NULL ELSE m.assists END AS assists,
           CASE WHEN sp.consent_required THEN NULL ELSE m.card_received END AS card_received,
           m.team_score, m.opponent_score, sp.consent_required AS locked, true AS played
    FROM public.matches m
    JOIN public.coach_sessions s ON s.id = m.session_id
    CROSS JOIN LATERAL (
      SELECT r.player_name, public.squad_player_consent_required(r.id) AS consent_required
      FROM public.squad_players r
      WHERE r.linked_player_id = m.user_id AND public.squad_player_is_mine(r.id)
      ORDER BY r.created_at LIMIT 1
    ) sp
    WHERE public.is_coach() AND m.session_id = p_session_id
      AND s.coach_user_id = auth.uid() AND s.session_type = 'match'
      AND m.logged_by = auth.uid() AND m.logged_by_role = 'coach'
    UNION ALL
    SELECT k.user_id, sp.player_name, k.recorded->>'position', k.recorded->>'age_group',
           k.recorded->>'competition', k.recorded->>'venue', k.opponent, k.match_date, NULL::integer,
           NULL::integer, NULL::integer, NULL::text,
           (SELECT min(m2.team_score) FROM public.matches m2 WHERE m2.session_id = k.session_id AND m2.logged_by = auth.uid()),
           (SELECT min(m2.opponent_score) FROM public.matches m2 WHERE m2.session_id = k.session_id AND m2.logged_by = auth.uid()),
           sp.consent_required, false
    FROM public.match_non_appearances k
    JOIN public.coach_sessions s ON s.id = k.session_id
    CROSS JOIN LATERAL (
      SELECT r.player_name, public.squad_player_consent_required(r.id) AS consent_required
      FROM public.squad_players r
      WHERE r.linked_player_id = k.user_id AND public.squad_player_is_mine(r.id)
      ORDER BY r.created_at LIMIT 1
    ) sp
    WHERE public.is_coach() AND k.session_id = p_session_id
      AND s.coach_user_id = auth.uid() AND s.session_type = 'match' AND k.logged_by = auth.uid()
  ) x
  ORDER BY x.played DESC, x.player_name;
$fn$;
REVOKE ALL ON FUNCTION public.logged_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.logged_match(uuid) TO authenticated;
COMMENT ON FUNCTION public.logged_match(uuid) IS
  'TRAK-185: the coach''s own logged match, one row per player, played or marked Didn''t play, for the edit screen. Numbers are withheld for a child waiting for consent and for Didn''t play.';

-- ── GDPR export: the player's own kept records too ───────────────────────
-- export_my_account() as in 20261015090000, plus match_non_appearances.
CREATE OR REPLACE FUNCTION public.export_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
  v_obs   boolean := public.export_scope_includes_observations();
  v_out   jsonb;
  v_sq    uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role::text INTO v_role FROM public.profiles WHERE user_id = v_uid;

  -- Header. A subject reading this needs to know what it covers and what it
  -- does not, in the document itself — not in a support email they never got.
  v_out := jsonb_build_object(
    'exported_at',   now(),
    'account',       jsonb_build_object('user_id', v_uid, 'role', v_role),
    'scope', jsonb_build_object(
      'includes_observations_about_you', v_obs,
      'note', CASE WHEN v_obs
        THEN 'Includes assessments and awards recorded about you by a coach, as well as data you provided.'
        ELSE 'Includes only data you provided. Assessments recorded about you by a coach are available on request.'
      END,
      'never_included', 'Private coaching notes, and any record belonging to another person.'
    )
  );

  -- ── Everyone: the account itself ───────────────────────────
  v_out := v_out || jsonb_build_object(
    'profile', (
      SELECT to_jsonb(p) - 'user_id'
      FROM public.profiles p WHERE p.user_id = v_uid
    ),
    'telemetry_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) - 'user_id' ORDER BY t.created_at)
      FROM public.telemetry_events t WHERE t.user_id = v_uid
    ), '[]'::jsonb)
  );

  -- ── Player ─────────────────────────────────────────────────
  IF v_role = 'player' THEN
    -- Roster rows that are THIS player's link. Used to reach assessments; a
    -- coach's other children are never in this set.
    SELECT COALESCE(array_agg(sp.id), '{}') INTO v_sq
    FROM public.squad_players sp WHERE sp.linked_player_id = v_uid;

    v_out := v_out || jsonb_build_object(
      'player_details', (
        SELECT to_jsonb(d) - 'user_id' FROM public.player_details d WHERE d.user_id = v_uid
      ),
      -- Provided by the subject: they logged these.
      'matches', COALESCE((
        SELECT jsonb_agg(to_jsonb(m) - 'user_id' ORDER BY m.match_date)
        FROM public.matches m WHERE m.user_id = v_uid
      ), '[]'::jsonb),
      -- TRAK-185: matches the coach marked "Didn't play", kept with their original record.
      'match_non_appearances', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('match_date', k.match_date, 'opponent', k.opponent,
                 'marked_at', k.marked_at, 'recorded', k.recorded - 'user_id') ORDER BY k.match_date)
        FROM public.match_non_appearances k WHERE k.user_id = v_uid
      ), '[]'::jsonb),
      'parent_links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('parent_user_id', l.parent_user_id, 'created_at', l.created_at))
        FROM public.player_parent_links l WHERE l.player_user_id = v_uid
      ), '[]'::jsonb),
      'parental_consents', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.granted_at)
        FROM public.parental_consents c WHERE c.player_user_id = v_uid
      ), '[]'::jsonb),
      -- TRAK-177: the young person's own choices (granted, withdrawn, notice version, when).
      'own_consents', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) - 'player_user_id' ORDER BY o.seq)
        FROM public.player_own_consents o WHERE o.player_user_id = v_uid
      ), '[]'::jsonb)
    );

    -- Observations ABOUT the player. Gated on the scope switch above.
    -- coach_assessment_notes is absent by design and stays absent whatever
    -- the switch says: K9 made it coach-private and portability does not
    -- reopen it.
    IF v_obs THEN
      v_out := v_out || jsonb_build_object(
        'coach_assessments', COALESCE((
          SELECT jsonb_agg(to_jsonb(a) - 'coach_user_id' ORDER BY a.created_at)
          FROM public.coach_assessments a WHERE a.squad_player_id = ANY(v_sq)
        ), '[]'::jsonb),
        'recognition_awards', COALESCE((
          SELECT jsonb_agg(to_jsonb(r) - 'coach_user_id' ORDER BY r.created_at)
          FROM public.recognition_awards r WHERE r.squad_player_id = ANY(v_sq)
        ), '[]'::jsonb)
      );
    END IF;
  END IF;

  -- ── Coach ──────────────────────────────────────────────────
  -- A coach's own work product. The children's own records (their match logs,
  -- their parent links) are theirs, not the coach's, and are not here.
  IF v_role = 'coach' THEN
    v_out := v_out || jsonb_build_object(
      'coach_details', (
        SELECT to_jsonb(d) - 'user_id' FROM public.coach_details d WHERE d.user_id = v_uid
      ),
      'squad_players', COALESCE((
        SELECT jsonb_agg(to_jsonb(sp) - 'coach_user_id' ORDER BY sp.created_at)
        FROM public.squad_players sp WHERE sp.coach_user_id = v_uid
          AND public.squad_player_is_mine(sp.id)
      ), '[]'::jsonb),
      'coach_assessments', COALESCE((
        SELECT jsonb_agg(to_jsonb(a) - 'coach_user_id' ORDER BY a.created_at)
        FROM public.coach_assessments a WHERE a.coach_user_id = v_uid
          AND public.squad_player_is_mine(a.squad_player_id)
      ), '[]'::jsonb),
      'coach_assessment_notes', COALESCE((
        SELECT jsonb_agg(to_jsonb(n) - 'coach_user_id' ORDER BY n.created_at)
        FROM public.coach_assessment_notes n WHERE n.coach_user_id = v_uid
          AND EXISTS (SELECT 1 FROM public.coach_assessments a
            WHERE a.id = n.assessment_id
              AND a.coach_user_id = v_uid
              AND public.squad_player_is_mine(a.squad_player_id))
      ), '[]'::jsonb),
      'coach_sessions', COALESCE((
        SELECT jsonb_agg(to_jsonb(s) - 'coach_user_id' ORDER BY s.created_at)
        FROM public.coach_sessions s WHERE s.coach_user_id = v_uid
      ), '[]'::jsonb),
      'coach_calendar_events', COALESCE((
        SELECT jsonb_agg(to_jsonb(e) - 'coach_user_id' ORDER BY e.starts_at)
        FROM public.coach_calendar_events e WHERE e.coach_user_id = v_uid
      ), '[]'::jsonb),
      'recognition_awards', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) - 'coach_user_id' ORDER BY r.created_at)
        FROM public.recognition_awards r WHERE r.coach_user_id = v_uid
          AND public.squad_player_is_mine(r.squad_player_id)
      ), '[]'::jsonb),
      'staff_compliance', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) - 'coach_user_id')
        FROM public.staff_compliance sc WHERE sc.coach_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  -- ── Parent ─────────────────────────────────────────────────
  -- The links and consents the parent themselves granted. Their child's
  -- records belong to the child and are exported from the child's account.
  IF v_role = 'parent' THEN
    v_out := v_out || jsonb_build_object(
      'child_links', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('player_user_id', l.player_user_id, 'created_at', l.created_at))
        FROM public.player_parent_links l WHERE l.parent_user_id = v_uid
      ), '[]'::jsonb),
      'consents_granted', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.granted_at)
        FROM public.parental_consents c WHERE c.parent_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  -- ── Club admin ─────────────────────────────────────────────
  IF v_role = 'club' THEN
    v_out := v_out || jsonb_build_object(
      'organizations', COALESCE((
        SELECT jsonb_agg(to_jsonb(o) - 'admin_user_id')
        FROM public.organizations o WHERE o.admin_user_id = v_uid
      ), '[]'::jsonb),
      'admin_notes', COALESCE((
        SELECT jsonb_agg(to_jsonb(n) - 'admin_user_id' ORDER BY n.created_at)
        FROM public.admin_notes n WHERE n.admin_user_id = v_uid
      ), '[]'::jsonb)
    );
  END IF;

  RETURN v_out;
END;
$fn$;
