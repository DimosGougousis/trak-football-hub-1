-- TRAK-286 (Games 4/8, spec TRAK-282): Share. Players and families see the plan in the app (no email, no push: Imad,
-- 27 Oct), from copies Share writes. They never read the coach's working copy (game_plans, game_plan_players). A row
-- rule can't hide a column, so each audience's words sit in rows its own rule opens:
--   game_for_family: each child's role and job, and whether the coach left them a note. The child and their guardians.
--   game_for_player: the goals and the coach's note. The child alone.
-- Expectation, context, how strong the opponent is and scouting are never copied. A copy is read while the match is
-- published and not cancelled, the academy's games switch is on, and the child is on the coach's current roster in
-- the match's squad with consent in place: the rules a family's event read uses (family_reads_event_for).
--
-- Share writes copies for every child the line-up may hold (game_plan_player_ok's rules) who can come, and for a
-- starter who said they can't make it. Edits after that stay in the working copy until the coach shares
-- again; then only the copies whose words change are written, and those read "Updated" (changed_at). game_shares logs
-- each share for the game's history. Only Share writes these three tables.

-- The caller is the child of squad row `p_squad_player_id` or, when `p_guardian`, one of their guardians, and may
-- read that child's copies for match `p_event_id`.
CREATE FUNCTION trak_private.family_reads_game_copy(p_event_id uuid, p_squad_player_id uuid, p_guardian boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_calendar_events e
    JOIN public.squad_players sp ON sp.id = p_squad_player_id
    WHERE e.id = p_event_id
      AND e.published AND e.event_type = 'match' AND e.status <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public.academy_features f WHERE f.organization_id = e.organization_id AND f.feature = 'games')
      AND sp.coach_user_id = e.coach_user_id
      AND sp.organization_id = e.organization_id
      AND sp.status <> 'coach_departed'
      AND (e.squad IS NULL OR sp.age_group = e.squad)
      AND NOT public.player_consent_required(sp.linked_player_id)
      AND (sp.linked_player_id = (SELECT auth.uid())
           OR (p_guardian AND EXISTS (SELECT 1 FROM public.player_parent_links l
                 WHERE l.player_user_id = sp.linked_player_id AND l.parent_user_id = (SELECT auth.uid()))))
  );
$$;
REVOKE ALL ON FUNCTION trak_private.family_reads_game_copy(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.family_reads_game_copy(uuid, uuid, boolean) TO authenticated, service_role;

CREATE TABLE public.game_shares (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  -- How many children's copies this share wrote, changed or took back: everyone's, the first time.
  changed integer NOT NULL CHECK (changed >= 0)
);
CREATE INDEX game_shares_event ON public.game_shares (event_id, shared_at);

CREATE TABLE public.game_for_family (
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('starter', 'bench', 'not_selected')),
  job text NOT NULL DEFAULT '' CHECK (char_length(job) <= 300),
  has_note boolean NOT NULL DEFAULT false,
  shared_at timestamptz NOT NULL DEFAULT now(),
  -- A later share changed it: the family reads "Updated" until kick-off.
  changed_at timestamptz,
  PRIMARY KEY (event_id, squad_player_id)
);
CREATE INDEX game_for_family_squad_player ON public.game_for_family (squad_player_id);

CREATE TABLE public.game_for_player (
  event_id uuid NOT NULL REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  goals jsonb NOT NULL DEFAULT '[]' CHECK (trak_private.valid_game_goals(goals)),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  shared_at timestamptz NOT NULL DEFAULT now(),
  -- A later share changed it: the player reads "Updated" until kick-off.
  changed_at timestamptz,
  PRIMARY KEY (event_id, squad_player_id)
);
CREATE INDEX game_for_player_squad_player ON public.game_for_player (squad_player_id);

ALTER TABLE public.game_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_for_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_for_player ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.game_shares, public.game_for_family, public.game_for_player FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.game_shares, public.game_for_family, public.game_for_player TO authenticated;

CREATE POLICY "Coaches read their own shares" ON public.game_shares
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = game_shares.event_id AND e.coach_user_id = (SELECT auth.uid())));
CREATE POLICY "Children and their guardians read the shared plan" ON public.game_for_family
  FOR SELECT TO authenticated
  USING (trak_private.family_reads_game_copy(event_id, squad_player_id, true));
CREATE POLICY "Children read the goals and their own note" ON public.game_for_player
  FOR SELECT TO authenticated
  USING (trak_private.family_reads_game_copy(event_id, squad_player_id, false));

-- Every child the line-up may hold (game_plan_player_ok's rules, checked without raising), and the words their
-- copies would hold if the match's coach shared now. Someone who isn't placed is on the bench (Imad, 28 Oct). Who
-- said they can't make it gets no copy, as the coach's line-up lists them apart, unless they're still on the pitch:
-- their slot is flagged until the coach moves them.
CREATE FUNCTION trak_private.game_copies(p_event_id uuid)
RETURNS TABLE (squad_player_id uuid, copied boolean, role text, job text, note text, goals jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sp.id,
    gp.role = 'starter'
      OR NOT EXISTS (SELECT 1 FROM public.event_absences a WHERE a.event_id = e.id AND a.squad_player_id = sp.id),
    COALESCE(gp.role, 'bench'), COALESCE(gp.job, ''), COALESCE(gp.note, ''), COALESCE(plan.goals, '[]'::jsonb)
  FROM public.coach_calendar_events e
  JOIN public.squad_players sp ON sp.coach_user_id = e.coach_user_id
  LEFT JOIN public.game_plans plan ON plan.event_id = e.id
  LEFT JOIN public.game_plan_players gp ON gp.event_id = e.id AND gp.squad_player_id = sp.id
  WHERE e.id = p_event_id
    AND e.coach_user_id = (SELECT auth.uid())
    AND public.squad_player_is_mine(sp.id)
    AND sp.organization_id IS NOT DISTINCT FROM e.organization_id
    AND sp.status <> 'coach_departed'
    AND (e.squad IS NULL OR sp.age_group = e.squad)
    AND NOT public.squad_player_consent_required(sp.id);
$$;
REVOKE ALL ON FUNCTION trak_private.game_copies(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.game_copies(uuid) TO authenticated, service_role;

-- The children whose copies would change if the coach shared now: copies to write or rewrite, or to take back from
-- someone who can't make it. A child who left or lost consent reads nothing already, so isn't a change; Share
-- clears their copies anyway.
CREATE FUNCTION trak_private.game_copy_changes(p_event_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.squad_player_id
  FROM trak_private.game_copies(p_event_id) w
  LEFT JOIN public.game_for_family f ON f.event_id = p_event_id AND f.squad_player_id = w.squad_player_id
  LEFT JOIN public.game_for_player p ON p.event_id = p_event_id AND p.squad_player_id = w.squad_player_id
  WHERE CASE WHEN w.copied
    THEN f.squad_player_id IS NULL OR p.squad_player_id IS NULL
      OR (f.role, f.job, f.has_note) IS DISTINCT FROM (w.role, w.job, w.note <> '')
      OR (p.goals, p.note) IS DISTINCT FROM (w.goals, w.note)
    ELSE f.squad_player_id IS NOT NULL OR p.squad_player_id IS NOT NULL END;
$$;
REVOKE ALL ON FUNCTION trak_private.game_copy_changes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.game_copy_changes(uuid) TO authenticated, service_role;

-- Share now, and Share the changes. The first share needs the logistics shared and the coach's word that they've
-- talked selection through, face to face; later ones write only what changed. Before kick-off, on a match that isn't
-- cancelled, with the games switch on. Returns how many children's copies changed.
CREATE FUNCTION public.share_game_plan(p_event_id uuid, p_talked boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.coach_calendar_events;
  v_first boolean;
  v_changed uuid[];
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

  IF v_first OR cardinality(v_changed) > 0 THEN
    INSERT INTO public.game_shares (event_id, changed) VALUES (e.id, cardinality(v_changed));
  END IF;
  RETURN cardinality(v_changed);
END;
$$;
REVOKE ALL ON FUNCTION public.share_game_plan(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_game_plan(uuid, boolean) TO authenticated;

-- Who would read something new if the coach shared now, for each of their matches already shared, not cancelled and
-- before kick-off. The game page's alert and Home's Needs you ask; nothing is written.
CREATE FUNCTION public.game_plan_changes(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, squad_player_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id, c.squad_player_id
  FROM public.coach_calendar_events e
  CROSS JOIN LATERAL trak_private.game_copy_changes(e.id) AS c(squad_player_id)
  WHERE e.id = ANY (p_event_ids)
    AND e.coach_user_id = (SELECT auth.uid()) AND public.is_coach()
    AND e.status <> 'cancelled' AND e.starts_at > now()
    AND EXISTS (SELECT 1 FROM public.game_shares s WHERE s.event_id = e.id);
$$;
REVOKE ALL ON FUNCTION public.game_plan_changes(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_plan_changes(uuid[]) TO authenticated;
