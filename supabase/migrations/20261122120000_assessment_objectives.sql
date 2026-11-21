-- TRAK-526 (Reports 3/10, Imad 21 Nov): Assess player asks about the player's objectives, as the squad evaluation does:
-- Not yet, Some progress, On track or Met for each open objective, and the coach can add one. A squad with no shared
-- season plan skips it.
--
-- Decided (Tarek, 21 Nov):
-- * Assess's answers live in their own table. objective_progress (the squad evaluations' answers) is untouched, so
--   its rows, the stuck rule (three Not yets in a row in squad evaluations) and the families' Progress line read
--   exactly as before.
-- * A draft keeps its answers and any objective the coach adds; Met closes an objective, and an added one is created,
--   only when the assessment is published. Once published they are final.
--
-- save_assessment_with_objectives() writes the assessment row as the coach (every existing policy on
-- coach_assessments applies) and the answers in the same transaction.

-- ── An assessment's check-in: one row per answer, and one per objective added ──
CREATE TABLE public.assessment_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.coach_assessments(id) ON DELETE CASCADE,
  -- An answer's objective; for an added one, the objective it became once published (null in a draft).
  player_objective_id uuid REFERENCES public.player_objectives(id) ON DELETE CASCADE,
  status text CHECK (status IN ('not_yet', 'some_progress', 'on_track', 'met')),
  added_title text CHECK (added_title = btrim(added_title) AND char_length(added_title) BETWEEN 1 AND 120),
  -- When the assessment was published: Met applied and added objectives created. Null in a draft.
  applied_at timestamptz,
  CONSTRAINT assessment_objectives_answer_or_added CHECK (
    (status IS NOT NULL AND player_objective_id IS NOT NULL AND added_title IS NULL)
    OR (status IS NULL AND added_title IS NOT NULL)),
  CONSTRAINT assessment_objectives_once UNIQUE (assessment_id, player_objective_id)
);
CREATE INDEX assessment_objectives_objective_idx ON public.assessment_objectives (player_objective_id);
ALTER TABLE public.assessment_objectives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assessment_objectives FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assessment_objectives TO authenticated;
-- Coach-only, like player_objectives and objective_progress: families never read it.
CREATE POLICY "Coaches read their own assessments' objectives" ON public.assessment_objectives
  FOR SELECT TO authenticated
  USING (public.is_coach() AND EXISTS (SELECT 1 FROM public.coach_assessments ca
    WHERE ca.id = assessment_objectives.assessment_id AND ca.coach_user_id = auth.uid()));
COMMENT ON TABLE public.assessment_objectives IS
  'TRAK-526: Assess player''s objective check-in. Coach-only; squad evaluations keep theirs in objective_progress.';

-- ── Applying a check-in, when its assessment is published ────────────────────
-- Met closes its objective, and each added one is created in a free place (two open at most). Only what isn't applied
-- yet: publishing again after Unpublish changes nothing. Run by save_assessment_objectives() and
-- set_assessment_published(), both as the coach.
CREATE FUNCTION trak_private.apply_assessment_objectives(p_assessment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_a public.coach_assessments%ROWTYPE;
 v_slot smallint;
 v_new uuid;
 v_item record;
BEGIN
 SELECT * INTO v_a FROM public.coach_assessments ca WHERE ca.id = p_assessment_id;
 IF NOT FOUND OR auth.uid() IS NULL OR v_a.coach_user_id <> auth.uid() OR v_a.published_at IS NULL THEN
  RAISE EXCEPTION 'Not authorized for this assessment' USING ERRCODE = '42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL) THEN
  RETURN;
 END IF;
 UPDATE public.player_objectives po SET status = 'met', retired_at = now()
  FROM public.assessment_objectives ao
  WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL AND ao.status = 'met' AND po.id = ao.player_objective_id AND po.status = 'open';
 FOR v_item IN SELECT ao.id, ao.added_title FROM public.assessment_objectives ao
     WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NULL AND ao.added_title IS NOT NULL ORDER BY ao.added_title LOOP
  SELECT s INTO v_slot FROM unnest(ARRAY[1, 2]::smallint[]) s
   WHERE NOT EXISTS (SELECT 1 FROM public.player_objectives po
     WHERE po.squad_player_id = v_a.squad_player_id AND po.status = 'open' AND po.slot = s)
   ORDER BY s LIMIT 1;
  IF v_slot IS NULL THEN
   RAISE EXCEPTION 'A player works on up to two objectives at once' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.player_objectives (squad_player_id, slot, title, source, created_by)
   VALUES (v_a.squad_player_id, v_slot, v_item.added_title, 'own', auth.uid()) RETURNING id INTO v_new;
  UPDATE public.assessment_objectives SET player_objective_id = v_new WHERE id = v_item.id;
 END LOOP;
 UPDATE public.assessment_objectives SET applied_at = now() WHERE assessment_id = v_a.id AND applied_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION trak_private.apply_assessment_objectives(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION trak_private.apply_assessment_objectives(uuid) TO authenticated;

-- ── The answers, applied on publish ─────────────────────────────────────────
-- p_progress: [{player_objective_id, status}] for every open objective, or null to leave the answers as they are
-- (an edit of a published assessment). p_add: titles to add. Run by save_assessment_with_objectives() as the coach.
CREATE FUNCTION trak_private.save_assessment_objectives(p_assessment_id uuid, p_progress jsonb, p_add jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_a public.coach_assessments%ROWTYPE;
 v_player public.squad_players%ROWTYPE;
 v_add jsonb := coalesce(p_add, '[]'::jsonb);
 v_open uuid[];
 v_seen uuid[] := '{}';
 v_row jsonb;
 v_oid uuid;
 v_title text;
BEGIN
 SELECT * INTO v_a FROM public.coach_assessments ca WHERE ca.id = p_assessment_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR v_a.coach_user_id <> auth.uid() OR NOT public.is_coach()
   OR NOT public.squad_player_is_mine(v_a.squad_player_id) THEN
  RAISE EXCEPTION 'Not authorized for this assessment' USING ERRCODE = '42501';
 END IF;
 IF p_progress IS NULL AND p_add IS NULL THEN RETURN; END IF;
 IF v_a.evaluation_id IS NOT NULL THEN
  RAISE EXCEPTION 'A squad evaluation''s answers are its own' USING ERRCODE = '22023';
 END IF;
 IF EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.applied_at IS NOT NULL) THEN
  RAISE EXCEPTION 'A published assessment''s answers stay as they were' USING ERRCODE = 'P0001';
 END IF;
 IF trak_private.squad_player_consent_required(v_a.squad_player_id) THEN
  RAISE EXCEPTION 'Waiting for consent: nothing is recorded about this player yet' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO v_player FROM public.squad_players sp WHERE sp.id = v_a.squad_player_id;
 -- The step is asked only where the season plan is on and the player's squad has a shared plan.
 IF NOT public.feature_on('season_plan') OR NOT EXISTS (SELECT 1 FROM public.season_plans pl
     WHERE pl.coach_user_id = v_player.coach_user_id AND pl.squad = btrim(v_player.age_group) AND pl.shared_at IS NOT NULL) THEN
  IF jsonb_array_length(coalesce(p_progress, '[]'::jsonb)) > 0 OR jsonb_array_length(v_add) > 0 THEN
   RAISE EXCEPTION 'This squad has no shared season plan' USING ERRCODE = '22023';
  END IF;
  RETURN;
 END IF;
 IF jsonb_typeof(coalesce(p_progress, '[]'::jsonb)) <> 'array' OR jsonb_typeof(v_add) <> 'array' THEN
  RAISE EXCEPTION 'Progress and added objectives come as lists' USING ERRCODE = '22023';
 END IF;

 -- Every open objective once, as the squad evaluation asks.
 SELECT coalesce(array_agg(po.id), '{}') INTO v_open FROM public.player_objectives po
  WHERE po.squad_player_id = v_player.id AND po.status = 'open';
 DELETE FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id;
 FOR v_row IN SELECT e FROM jsonb_array_elements(coalesce(p_progress, '[]'::jsonb)) e LOOP
  IF jsonb_typeof(v_row) <> 'object' OR jsonb_typeof(v_row -> 'player_objective_id') IS DISTINCT FROM 'string'
    OR coalesce(v_row ->> 'status', '') NOT IN ('not_yet', 'some_progress', 'on_track', 'met') THEN
   RAISE EXCEPTION 'Each objective gets Not yet, Some progress, On track or Met' USING ERRCODE = '22023';
  END IF;
  v_oid := (v_row ->> 'player_objective_id')::uuid;
  IF NOT v_oid = ANY (v_open) OR v_oid = ANY (v_seen) THEN
   RAISE EXCEPTION 'Progress is for a player''s open objectives, each once' USING ERRCODE = '22023';
  END IF;
  v_seen := v_seen || v_oid;
  INSERT INTO public.assessment_objectives (assessment_id, player_objective_id, status) VALUES (v_a.id, v_oid, v_row ->> 'status');
 END LOOP;
 IF cardinality(v_open) <> cardinality(v_seen) THEN
  RAISE EXCEPTION 'Say how each of a player''s objectives is going' USING ERRCODE = '22023';
 END IF;

 IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_add) a WHERE jsonb_typeof(a) <> 'string') THEN
  RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
 END IF;
 FOR v_title IN SELECT e FROM jsonb_array_elements_text(v_add) e LOOP
  IF v_title <> btrim(v_title) OR char_length(v_title) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'An objective is one line of 1 to 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_player.position IS NULL OR v_player.position NOT IN ('Goalkeeper', 'Defender', 'Midfielder', 'Attacker') THEN
   RAISE EXCEPTION 'Give them a position first' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.player_objectives po
      WHERE po.squad_player_id = v_player.id AND po.status = 'open' AND lower(po.title) = lower(v_title))
    OR EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND lower(ao.added_title) = lower(v_title)) THEN
   RAISE EXCEPTION 'They are already working on that objective' USING ERRCODE = '22023';
  END IF;
  -- Room after this check-in's Met answers: up to two open at once.
  IF (SELECT count(*) FROM public.player_objectives po WHERE po.squad_player_id = v_player.id AND po.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.player_objective_id = po.id AND ao.status = 'met'))
     + (SELECT count(*) FROM public.assessment_objectives ao WHERE ao.assessment_id = v_a.id AND ao.added_title IS NOT NULL) >= 2 THEN
   RAISE EXCEPTION 'A player works on up to two objectives at once' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.assessment_objectives (assessment_id, added_title) VALUES (v_a.id, v_title);
 END LOOP;

 IF v_a.published_at IS NOT NULL THEN PERFORM trak_private.apply_assessment_objectives(v_a.id); END IF;
END $$;
REVOKE ALL ON FUNCTION trak_private.save_assessment_objectives(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- Reached through save_assessment_with_objectives(), which runs as the coach; it checks the coach itself.
GRANT EXECUTE ON FUNCTION trak_private.save_assessment_objectives(uuid, jsonb, jsonb) TO authenticated;

-- ── One save: the assessment and its objectives ──────────────────────────────
-- p_row: the fields Assess writes (the six ratings, the card stats, coach_name_snapshot, squad_player_id and, when
-- it sets one, published_at). SECURITY INVOKER: the row is written as the coach, so the policies on coach_assessments
-- (owner, squad, academy, consent) decide, as for the direct insert this replaces.
CREATE FUNCTION public.save_assessment_with_objectives(p_assessment_id uuid, p_row jsonb, p_progress jsonb, p_add jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 r public.coach_assessments;
 v_id uuid;
BEGIN
 IF jsonb_typeof(p_row) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'The assessment comes as one object' USING ERRCODE = '22023';
 END IF;
 r := jsonb_populate_record(NULL::public.coach_assessments, p_row);
 IF p_assessment_id IS NULL THEN
  INSERT INTO public.coach_assessments (coach_user_id, coach_name_snapshot, squad_player_id, work_rate, tactical, attitude,
    technical, physical, coachability, consistency, impact, workrate, technique, spirit, published_at)
   VALUES (auth.uid(), r.coach_name_snapshot, r.squad_player_id, r.work_rate, r.tactical, r.attitude, r.technical, r.physical,
    r.coachability, r.consistency, r.impact, r.workrate, r.technique, r.spirit,
    CASE WHEN p_row ? 'published_at' THEN r.published_at ELSE now() END)
   RETURNING id INTO v_id;
 ELSE
  UPDATE public.coach_assessments ca SET coach_name_snapshot = r.coach_name_snapshot, work_rate = r.work_rate,
    tactical = r.tactical, attitude = r.attitude, technical = r.technical, physical = r.physical,
    coachability = r.coachability, consistency = r.consistency, impact = r.impact, workrate = r.workrate,
    technique = r.technique, spirit = r.spirit,
    published_at = CASE WHEN p_row ? 'published_at' THEN r.published_at ELSE ca.published_at END
   WHERE ca.id = p_assessment_id AND ca.coach_user_id = auth.uid() AND ca.squad_player_id = r.squad_player_id
   RETURNING ca.id INTO v_id;
 END IF;
 IF v_id IS NULL THEN
  -- What the direct update said by matching nothing: refused, deleted or moved since the page loaded.
  RAISE EXCEPTION 'Nothing was saved' USING ERRCODE = '42501';
 END IF;
 PERFORM trak_private.save_assessment_objectives(v_id, p_progress, p_add);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_assessment_with_objectives(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_assessment_with_objectives(uuid, jsonb, jsonb, jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_assessment_with_objectives(uuid, jsonb, jsonb, jsonb) IS
  'TRAK-526: Assess player''s save: the assessment, as the coach under its policies, and its objective check-in, in one transaction.';

-- ── Publish from the card applies a draft's check-in too ─────────────────────
-- As 20261018200000, plus: publishing applies the check-in (TRAK-526). Unpublish leaves an applied one as it is.
CREATE OR REPLACE FUNCTION public.set_assessment_published(p_assessment_id uuid, p_published boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_at timestamptz := CASE WHEN p_published THEN now() END;
BEGIN
  UPDATE public.coach_assessments SET published_at = v_at
  WHERE id = p_assessment_id AND coach_user_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assessment_not_found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.coach_shared_feedback SET published_at = v_at
  WHERE assessment_id = p_assessment_id AND coach_user_id = (SELECT auth.uid())
    AND (NOT p_published OR btrim(body) <> '');
  IF p_published THEN
    PERFORM trak_private.apply_assessment_objectives(p_assessment_id);
  END IF;
  RETURN v_at;
END;
$function$;
