-- TRAK-300 (found in TRAK-286's live check, 28 Oct): a player's note reads "From Coach <name> · just for you", but a
-- player can't read their coach's profile (a guardian can), so the player's page fell back to "your coach". Share now
-- copies the coach's name into each child's family copy, so the player and their guardian read that name and nothing
-- else from the profile (Imad, 28 Oct). No new rule on profiles. A new name reaches the copies on the next share and
-- marks nobody Updated. The copies already shared take the name now.

ALTER TABLE public.game_for_family ADD COLUMN coach_name text NOT NULL DEFAULT '';

UPDATE public.game_for_family f SET coach_name = COALESCE(btrim(p.full_name), '')
FROM public.coach_calendar_events e
JOIN public.profiles p ON p.user_id = e.coach_user_id
WHERE e.id = f.event_id;

-- As 20261028180000_game_sharing.sql, plus the coach's name on every family copy of the match.
CREATE OR REPLACE FUNCTION public.share_game_plan(p_event_id uuid, p_talked boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.coach_calendar_events;
  v_first boolean;
  v_changed uuid[];
  v_coach text;
BEGIN
  SELECT * INTO e FROM public.coach_calendar_events ev
  WHERE ev.id = p_event_id AND ev.coach_user_id = (SELECT auth.uid());
  IF NOT FOUND OR NOT public.is_coach() THEN
    RAISE EXCEPTION 'This match isn''t one of yours' USING ERRCODE = '42501';
  END IF;
  IF NOT public.feature_on('games') THEN
    RAISE EXCEPTION 'Games is switched off for your academy' USING ERRCODE = '42501';
  END IF;
  IF e.event_type <> 'match' THEN
    RAISE EXCEPTION 'Only a match has a game plan' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'cancelled' THEN
    RAISE EXCEPTION 'This match was cancelled, so its plan isn''t shared' USING ERRCODE = 'P0001';
  END IF;
  IF NOT e.published THEN
    RAISE EXCEPTION 'Share the logistics first: publish the match' USING ERRCODE = 'P0001';
  END IF;
  IF e.starts_at <= now() THEN
    RAISE EXCEPTION 'This match has kicked off, so its plan can''t be shared' USING ERRCODE = 'P0001';
  END IF;
  -- One share at a time for a match.
  PERFORM 1 FROM public.game_plans p WHERE p.event_id = e.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save the plan before you share it' USING ERRCODE = 'P0001';
  END IF;
  v_first := NOT EXISTS (SELECT 1 FROM public.game_shares s WHERE s.event_id = e.id);
  IF v_first AND p_talked IS NOT TRUE THEN
    RAISE EXCEPTION 'Talk selection through with the players, face to face, before you share it' USING ERRCODE = 'P0001';
  END IF;

  v_changed := ARRAY(SELECT trak_private.game_copy_changes(e.id));
  DELETE FROM public.game_for_family f WHERE f.event_id = e.id
    AND f.squad_player_id NOT IN (SELECT w.squad_player_id FROM trak_private.game_copies(e.id) w WHERE w.copied);
  DELETE FROM public.game_for_player p WHERE p.event_id = e.id
    AND p.squad_player_id NOT IN (SELECT w.squad_player_id FROM trak_private.game_copies(e.id) w WHERE w.copied);
  INSERT INTO public.game_for_family AS f (event_id, squad_player_id, role, job, has_note)
    SELECT e.id, w.squad_player_id, w.role, w.job, w.note <> '' FROM trak_private.game_copies(e.id) w WHERE w.copied
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET role = EXCLUDED.role, job = EXCLUDED.job, has_note = EXCLUDED.has_note, changed_at = now()
    WHERE (f.role, f.job, f.has_note) IS DISTINCT FROM (EXCLUDED.role, EXCLUDED.job, EXCLUDED.has_note);
  INSERT INTO public.game_for_player AS p (event_id, squad_player_id, goals, note)
    SELECT e.id, w.squad_player_id, w.goals, w.note FROM trak_private.game_copies(e.id) w WHERE w.copied
  ON CONFLICT (event_id, squad_player_id) DO UPDATE
    SET goals = EXCLUDED.goals, note = EXCLUDED.note, changed_at = now()
    WHERE (p.goals, p.note) IS DISTINCT FROM (EXCLUDED.goals, EXCLUDED.note);
  -- TRAK-300: the name the family reads the note under. Not a change, so changed_at stays as it is.
  v_coach := COALESCE((SELECT btrim(pr.full_name) FROM public.profiles pr WHERE pr.user_id = e.coach_user_id), '');
  UPDATE public.game_for_family f SET coach_name = v_coach
  WHERE f.event_id = e.id AND f.coach_name IS DISTINCT FROM v_coach;

  IF v_first OR cardinality(v_changed) > 0 THEN
    INSERT INTO public.game_shares (event_id, changed) VALUES (e.id, cardinality(v_changed));
  END IF;
  RETURN cardinality(v_changed);
END;
$$;
REVOKE ALL ON FUNCTION public.share_game_plan(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_game_plan(uuid, boolean) TO authenticated;
