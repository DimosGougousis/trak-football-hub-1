-- TRAK-295 (Training 2/5, spec TRAK-293): a training's plan. One plan per training event, its practices in order
-- (at most 12). Only the training's coach reads or writes it; no player, guardian, other coach or academy admin.
-- Writes also need the academy's training switch on and the coach's own training, not cancelled, enforced as
-- restrictive rules, as drills' and events' switches are. Reads don't need the switch, so switching Training off
-- hides the tab without losing a plan. A plan goes with its training (a published event is cancelled, never
-- deleted).
--
-- A plan is saved whole by save_training_plan(): every practice or none, so a half-saved plan can't exist. It runs
-- as the coach (SECURITY INVOKER), so the rules below apply unchanged. A practice the coach ticks "Save to My drills"
-- also becomes one of their drills (coach_drills) in the same save.

CREATE TABLE public.training_plans (
  event_id uuid PRIMARY KEY REFERENCES public.coach_calendar_events(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_plans_coach ON public.training_plans (coach_user_id, updated_at DESC);
CREATE TRIGGER training_plans_updated_at BEFORE UPDATE ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A practice is a copy, so changing or deleting a drill later never changes a plan. The limits are coach_drills'.
CREATE TABLE public.training_plan_practices (
  event_id uuid NOT NULL REFERENCES public.training_plans(event_id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 12),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  minutes smallint NOT NULL CHECK (minutes BETWEEN 5 AND 60),
  how text NOT NULL DEFAULT '' CHECK (char_length(how) <= 1000),
  tell text NOT NULL DEFAULT '' CHECK (char_length(tell) <= 500),
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 120),
  numbers text NOT NULL DEFAULT '' CHECK (char_length(numbers) <= 120),
  direction text NOT NULL DEFAULT '' CHECK (char_length(direction) <= 120),
  targets text NOT NULL DEFAULT '' CHECK (char_length(targets) <= 120),
  conditions text NOT NULL DEFAULT '' CHECK (char_length(conditions) <= 120),
  -- Where it came from: written here, one of the coach's drills, or a Library session (TRAK-296).
  source text NOT NULL DEFAULT 'own' CHECK (source IN ('own', 'drill', 'library')),
  -- The drill it came from; unset again if the coach deletes that drill.
  drill_id uuid REFERENCES public.coach_drills(id) ON DELETE SET NULL,
  -- The Library session it came from, by its address.
  library_session text CHECK (char_length(library_session) BETWEEN 1 AND 200),
  PRIMARY KEY (event_id, position),
  CHECK (drill_id IS NULL OR source = 'drill'),
  CHECK ((library_session IS NOT NULL) = (source = 'library'))
);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_practices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_plans, public.training_plan_practices FROM PUBLIC, anon, authenticated;
-- Saving replaces the practices whole, so they are never updated in place.
GRANT SELECT, INSERT, UPDATE ON TABLE public.training_plans TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.training_plan_practices TO authenticated;

-- A plan's coach is the coach who wrote it, and the training must be theirs.
CREATE POLICY "Coaches read their own training plans" ON public.training_plans
  FOR SELECT TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
CREATE POLICY "Coaches start plans for their own trainings" ON public.training_plans
  FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach() AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plans.event_id AND e.coach_user_id = (SELECT auth.uid())));
CREATE POLICY "Coaches change their own training plans" ON public.training_plans
  FOR UPDATE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()))
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach() AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plans.event_id AND e.coach_user_id = (SELECT auth.uid())));

CREATE POLICY "Coaches read their own plans' practices" ON public.training_plan_practices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_plans p
    WHERE p.event_id = training_plan_practices.event_id AND p.coach_user_id = (SELECT auth.uid())));
-- A practice can name only one of the coach's own drills.
CREATE POLICY "Coaches add practices to their own plans" ON public.training_plan_practices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_coach() AND EXISTS (SELECT 1 FROM public.training_plans p
      WHERE p.event_id = training_plan_practices.event_id AND p.coach_user_id = (SELECT auth.uid()))
    AND (drill_id IS NULL OR EXISTS (SELECT 1 FROM public.coach_drills d
      WHERE d.id = training_plan_practices.drill_id AND d.coach_user_id = (SELECT auth.uid()))));
CREATE POLICY "Coaches remove practices from their own plans" ON public.training_plan_practices
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_plans p
    WHERE p.event_id = training_plan_practices.event_id AND p.coach_user_id = (SELECT auth.uid())));

-- Restrictive: no stray grant or permissive rule can open writes for an academy that is off, or to a plan for a
-- match or a cancelled training.
CREATE POLICY "Training switch and an open training gate plan inserts" ON public.training_plans
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('training')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plans.event_id AND e.event_type = 'training' AND e.status <> 'cancelled'));
CREATE POLICY "Training switch and an open training gate plan updates" ON public.training_plans
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('training')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plans.event_id AND e.event_type = 'training' AND e.status <> 'cancelled'))
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('training')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plans.event_id AND e.event_type = 'training' AND e.status <> 'cancelled'));
CREATE POLICY "Training switch and an open training gate practice inserts" ON public.training_plan_practices
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_coach() AND (SELECT public.feature_on('training')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plan_practices.event_id AND e.event_type = 'training' AND e.status <> 'cancelled'));
CREATE POLICY "Training switch and an open training gate practice deletes" ON public.training_plan_practices
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_coach() AND (SELECT public.feature_on('training')) AND EXISTS (SELECT 1 FROM public.coach_calendar_events e
    WHERE e.id = training_plan_practices.event_id AND e.event_type = 'training' AND e.status <> 'cancelled'));

-- p_practices: an array of 1 to 12 objects, in order, each with name, minutes, how, tell, area, numbers, direction,
-- targets, conditions, source ('own' | 'drill' | 'library'), drill_id, library_session, and save_to_drills (true
-- makes a practice written here one of the coach's drills too). A bad value stops the whole save.
CREATE FUNCTION public.save_training_plan(p_event_id uuid, p_practices jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  e public.coach_calendar_events;
  p jsonb;
  v_position smallint := 0;
  v_source text;
  v_drill uuid;
BEGIN
  SELECT * INTO e FROM public.coach_calendar_events ev
  WHERE ev.id = p_event_id AND ev.coach_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This training is not on your schedule' USING ERRCODE = 'P0001';
  END IF;
  IF e.event_type <> 'training' THEN
    RAISE EXCEPTION 'Only a training has a training plan' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'cancelled' THEN
    RAISE EXCEPTION 'This training was cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_practices) IS DISTINCT FROM 'array' OR jsonb_array_length(p_practices) = 0 THEN
    RAISE EXCEPTION 'Add a practice before saving the plan' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_practices) > 12 THEN
    RAISE EXCEPTION 'A plan holds at most 12 practices' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.training_plans (event_id) VALUES (e.id)
  ON CONFLICT (event_id) DO UPDATE SET updated_at = now();
  DELETE FROM public.training_plan_practices t WHERE t.event_id = e.id;

  FOR p IN SELECT value FROM jsonb_array_elements(p_practices) LOOP
    IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'A practice must be an object' USING ERRCODE = '22023';
    END IF;
    v_position := v_position + 1;
    v_source := COALESCE(p->>'source', 'own');
    v_drill := NULLIF(p->>'drill_id', '')::uuid;
    IF v_source = 'own' AND COALESCE((p->>'save_to_drills')::boolean, false) THEN
      INSERT INTO public.coach_drills (name, minutes, how, tell, area, numbers, direction, targets, conditions)
      VALUES (p->>'name', (p->>'minutes')::smallint, COALESCE(p->>'how', ''), COALESCE(p->>'tell', ''),
              COALESCE(p->>'area', ''), COALESCE(p->>'numbers', ''), COALESCE(p->>'direction', ''),
              COALESCE(p->>'targets', ''), COALESCE(p->>'conditions', ''))
      RETURNING id INTO v_drill;
      v_source := 'drill';
    END IF;
    INSERT INTO public.training_plan_practices (event_id, position, name, minutes, how, tell, area, numbers, direction,
      targets, conditions, source, drill_id, library_session)
    VALUES (e.id, v_position, p->>'name', (p->>'minutes')::smallint, COALESCE(p->>'how', ''), COALESCE(p->>'tell', ''),
            COALESCE(p->>'area', ''), COALESCE(p->>'numbers', ''), COALESCE(p->>'direction', ''),
            COALESCE(p->>'targets', ''), COALESCE(p->>'conditions', ''), v_source, v_drill, p->>'library_session');
  END LOOP;
END
$fn$;
REVOKE ALL ON FUNCTION public.save_training_plan(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_training_plan(uuid, jsonb) TO authenticated;
