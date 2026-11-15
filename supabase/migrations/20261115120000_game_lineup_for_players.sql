-- TRAK-441 slice 3 (Imad, 12 and 15 Nov): a player sees the whole line-up of a shared plan: the formation, the
-- starters in their places and the bench. Until now a player's copy held only their own role, job and note, and no
-- other player.
--
-- Share writes one more copy: a row for each starter and each player on the bench, with their name and place.
-- Nothing else: no job, no note, no context, no expectation, and no row for a player who is left out or can't come,
-- so the copy never says who was left out or why. The squad's players read it, each once their own copy of the plan
-- is out. A guardian never reads it (a parent's match page has no line-up), and neither does any other coach.
--
-- A child whose consent is pending is never written (game_copies' rule). A child who leaves the roster, or whose
-- consent is withdrawn after the share, stops showing to team-mates at once: the read rule checks the listed child
-- too, so it doesn't wait for the next share.
--
-- Plans shared before this change have no line-up copy. The coach reads "Changes not shared" on them, and players see
-- the line-up after the next share.

CREATE TABLE public.game_lineup_for_players (
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('starter', 'bench')),
  -- A starter's place, as game_plan_players.slot: 1 is the keeper, then each line from the back, left to right.
  slot smallint CHECK (slot BETWEEN 1 AND 11),
  name text NOT NULL,
  -- The plan's formation ("4-4-2"), the same on every row of a match.
  formation text,
  PRIMARY KEY (event_id, squad_player_id),
  CONSTRAINT game_lineup_for_players_slot_for_starters CHECK ((role = 'starter') = (slot IS NOT NULL))
);

-- The reader is a child whose own copy of this match's plan is out (so: their consent, their roster row, Games on, the
-- match published and not cancelled, as for every copy). The listed child is still on the roster with consent in place.
CREATE FUNCTION trak_private.player_reads_game_lineup(p_event_id uuid, p_squad_player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.game_for_player mine
      WHERE mine.event_id = p_event_id
        AND trak_private.game_copy_out(mine.event_id, mine.shared_at)
        AND trak_private.family_reads_game_copy(mine.event_id, mine.squad_player_id, false))
    AND EXISTS (
      SELECT 1 FROM public.squad_players sp
      WHERE sp.id = p_squad_player_id
        AND sp.status <> 'coach_departed'
        AND NOT public.squad_player_consent_required(sp.id));
$$;
REVOKE ALL ON FUNCTION trak_private.player_reads_game_lineup(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.player_reads_game_lineup(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.game_lineup_for_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_lineup_for_players FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.game_lineup_for_players TO authenticated;
CREATE POLICY "Players read the shared line-up" ON public.game_lineup_for_players
  FOR SELECT TO authenticated
  USING (trak_private.player_reads_game_lineup(event_id, squad_player_id));

-- The line-up a share would write now: who gets a copy (game_copies) and starts or is on the bench.
CREATE FUNCTION trak_private.game_lineup(p_event_id uuid)
RETURNS TABLE (squad_player_id uuid, role text, slot smallint, name text, formation text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.squad_player_id, w.role, gp.slot, COALESCE(sp.player_name, ''), plan.formation
  FROM trak_private.game_copies(p_event_id) w
  JOIN public.squad_players sp ON sp.id = w.squad_player_id
  LEFT JOIN public.game_plan_players gp ON gp.event_id = p_event_id AND gp.squad_player_id = w.squad_player_id
  LEFT JOIN public.game_plans plan ON plan.event_id = p_event_id
  WHERE w.copied AND w.role IN ('starter', 'bench');
$$;
REVOKE ALL ON FUNCTION trak_private.game_lineup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.game_lineup(uuid) TO authenticated, service_role;

-- Whether a share would change the line-up players read. Only children who still get a copy are compared. A child
-- who left the roster or lost consent is not a change: team-mates stopped reading that row already. A child who can no
-- longer come is their own change (game_copy_changes), as before, and the next share takes them off the line-up.
CREATE FUNCTION trak_private.game_lineup_changed(p_event_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH now_is AS (SELECT * FROM trak_private.game_lineup(p_event_id)),
  was AS (
    SELECT l.squad_player_id, l.role, l.slot, l.name, l.formation
    FROM public.game_lineup_for_players l
    WHERE l.event_id = p_event_id
      AND l.squad_player_id IN (SELECT w.squad_player_id FROM trak_private.game_copies(p_event_id) w WHERE w.copied))
  SELECT EXISTS (SELECT * FROM now_is EXCEPT SELECT * FROM was)
      OR EXISTS (SELECT * FROM was EXCEPT SELECT * FROM now_is);
$$;
REVOKE ALL ON FUNCTION trak_private.game_lineup_changed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.game_lineup_changed(uuid) TO authenticated, service_role;

-- As 20261030200000_games_job_player_only.sql, and: when the line-up changed, every child with a copy reads a
-- different line-up, so each of them is a change to share.
CREATE OR REPLACE FUNCTION trak_private.game_copy_changes(p_event_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.squad_player_id
  FROM trak_private.game_copies(p_event_id) w
  LEFT JOIN public.game_for_family f ON f.event_id = p_event_id AND f.squad_player_id = w.squad_player_id
  LEFT JOIN public.game_for_player p ON p.event_id = p_event_id AND p.squad_player_id = w.squad_player_id
  WHERE CASE WHEN w.copied
    THEN f.squad_player_id IS NULL OR p.squad_player_id IS NULL
      OR f.role IS DISTINCT FROM w.role
      OR (p.goals, p.note, p.job) IS DISTINCT FROM (w.goals, w.note, w.job)
      OR trak_private.game_lineup_changed(p_event_id)
    ELSE f.squad_player_id IS NOT NULL OR p.squad_player_id IS NOT NULL END;
$$;

-- As 20261030200000_games_job_player_only.sql, and the line-up copy, written whole each time.
CREATE OR REPLACE FUNCTION trak_private.write_game_copies(p_event_id uuid, p_at timestamptz)
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_changed uuid[] := ARRAY(SELECT trak_private.game_copy_changes(p_event_id));
  v_coach text;
BEGIN
  DELETE FROM public.game_for_family f WHERE f.event_id = p_event_id
    AND f.squad_player_id NOT IN (SELECT w.squad_player_id FROM trak_private.game_copies(p_event_id) w WHERE w.copied);
  DELETE FROM public.game_for_player p WHERE p.event_id = p_event_id
    AND p.squad_player_id NOT IN (SELECT w.squad_player_id FROM trak_private.game_copies(p_event_id) w WHERE w.copied);
  INSERT INTO public.game_for_family AS f (event_id, squad_player_id, role, job, has_note, shared_at)
    SELECT p_event_id, w.squad_player_id, w.role, '', false, p_at
    FROM trak_private.game_copies(p_event_id) w WHERE w.copied
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET role = EXCLUDED.role, job = '', has_note = false,
      changed_at = CASE WHEN f.shared_at <= now() THEN now() ELSE f.changed_at END
    WHERE f.role IS DISTINCT FROM EXCLUDED.role;
  INSERT INTO public.game_for_player AS p (event_id, squad_player_id, goals, note, job, shared_at)
    SELECT p_event_id, w.squad_player_id, w.goals, w.note, w.job, p_at
    FROM trak_private.game_copies(p_event_id) w WHERE w.copied
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET goals = EXCLUDED.goals, note = EXCLUDED.note, job = EXCLUDED.job,
      changed_at = CASE WHEN p.shared_at <= now() THEN now() ELSE p.changed_at END
    WHERE (p.goals, p.note, p.job) IS DISTINCT FROM (EXCLUDED.goals, EXCLUDED.note, EXCLUDED.job);
  UPDATE public.game_for_family f SET shared_at = p_at
  WHERE f.event_id = p_event_id AND f.shared_at > now() AND f.shared_at <> p_at;
  UPDATE public.game_for_player p SET shared_at = p_at
  WHERE p.event_id = p_event_id AND p.shared_at > now() AND p.shared_at <> p_at;
  -- TRAK-441: the line-up players read. It goes out with each reader's own copy, so it holds no time of its own.
  DELETE FROM public.game_lineup_for_players l WHERE l.event_id = p_event_id;
  INSERT INTO public.game_lineup_for_players (event_id, squad_player_id, role, slot, name, formation)
    SELECT p_event_id, x.squad_player_id, x.role, x.slot, x.name, x.formation FROM trak_private.game_lineup(p_event_id) x;
  -- TRAK-300: the name the family reads the plan under. Not a change, so changed_at stays as it is.
  v_coach := COALESCE((SELECT btrim(pr.full_name) FROM public.coach_calendar_events e
    JOIN public.profiles pr ON pr.user_id = e.coach_user_id WHERE e.id = p_event_id), '');
  UPDATE public.game_for_family f SET coach_name = v_coach
  WHERE f.event_id = p_event_id AND f.coach_name IS DISTINCT FROM v_coach;
  RETURN v_changed;
END;
$$;
