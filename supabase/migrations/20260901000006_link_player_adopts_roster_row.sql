-- Player signup should claim the coach's roster entry, not duplicate it.
--
-- The demo script runs UC-02 (coach types the roster by hand) and then UC-03
-- (player signs up with the TRK- code). link_player_to_coach only ever looked
-- for a row already linked to that player, found none, and inserted a new one —
-- so every player who signs up leaves behind an unclaimed ghost of themselves.
--
-- Consequences beyond the clutter:
--   * the club dashboard over-counts players, the same class of defect as the
--     "1 player above squads totalling 29" bug;
--   * pilot_activation treats every roster row as an invitation, so the ghosts
--     are permanent never-activated entries and activation reads roughly half
--     what it should.
--
-- Adoption is deliberately conservative: it claims a row only when EXACTLY ONE
-- unclaimed row matches the player's name. Two players called Andreas Papadakis
-- fall back to inserting, because a wrong merge is far worse than a duplicate —
-- it would hand one child another child's assessment history.

CREATE OR REPLACE FUNCTION public.link_player_to_coach(p_code text)
RETURNS uuid  -- squad_players.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_coach  uuid;
  v_sq     uuid;
  v_name   text;
  v_pos    text;
  v_shirt  int;
  v_ag     text;
  v_match_count int;
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

  -- Already linked to this coach? Return the existing row. (Idempotent.)
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

  -- Adopt the coach's own roster entry when the name is unambiguous.
  IF COALESCE(trim(v_name), '') <> '' THEN
    SELECT count(*) INTO v_match_count
    FROM public.squad_players
    WHERE coach_user_id = v_coach
      AND linked_player_id IS NULL
      AND lower(trim(player_name)) = lower(trim(v_name));

    IF v_match_count = 1 THEN
      UPDATE public.squad_players
         SET linked_player_id = v_uid,
             -- The player's own details win where they gave one; the coach's
             -- typed value is kept otherwise, so nothing entered is lost.
             position     = COALESCE(v_pos,   position),
             shirt_number = COALESCE(v_shirt, shirt_number),
             age_group    = COALESCE(v_ag,    age_group),
             status       = 'active'
       WHERE coach_user_id = v_coach
         AND linked_player_id IS NULL
         AND lower(trim(player_name)) = lower(trim(v_name))
      RETURNING id INTO v_sq;

      IF v_sq IS NOT NULL THEN
        RETURN v_sq;
      END IF;
    END IF;
  END IF;

  -- No unambiguous match: behave as before.
  INSERT INTO public.squad_players
    (coach_user_id, player_name, position, shirt_number, age_group, linked_player_id, status)
  VALUES
    (v_coach, COALESCE(v_name, 'Player'), v_pos, v_shirt, v_ag, v_uid, 'active')
  RETURNING id INTO v_sq;

  RETURN v_sq;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.link_player_to_coach(text) TO authenticated;

-- Existing duplicates are NOT merged automatically: merging is destructive and
-- assessments already hang off both rows. This surfaces them for a human to
-- decide on. Should return zero rows on a clean database.
CREATE OR REPLACE VIEW public.squad_duplicate_candidates AS
SELECT
  ghost.coach_user_id,
  ghost.id                AS unclaimed_row,
  claimed.id              AS claimed_row,
  ghost.player_name,
  (SELECT count(*) FROM public.coach_assessments ca WHERE ca.squad_player_id = ghost.id)
                          AS assessments_on_unclaimed,
  (SELECT count(*) FROM public.recognition_awards ra WHERE ra.squad_player_id = ghost.id)
                          AS awards_on_unclaimed
FROM public.squad_players ghost
JOIN public.squad_players claimed
  ON claimed.coach_user_id = ghost.coach_user_id
 AND lower(trim(claimed.player_name)) = lower(trim(ghost.player_name))
 AND claimed.linked_player_id IS NOT NULL
WHERE ghost.linked_player_id IS NULL;

COMMENT ON VIEW public.squad_duplicate_candidates IS
  'Unclaimed roster rows that share a name with a claimed one — the UC-02/UC-03 duplicate. Review before merging; assessments may hang off either row.';
