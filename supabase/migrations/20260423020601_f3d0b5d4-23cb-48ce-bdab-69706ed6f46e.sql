
-- Calendar events parsed from schedules
CREATE TABLE public.coach_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'training', -- 'match' | 'training' | 'tournament' | 'other'
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  venue text,
  opponent text,
  notes text,
  published boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'ai_text' | 'ai_image'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_calendar_events_coach_starts ON public.coach_calendar_events (coach_user_id, starts_at);

ALTER TABLE public.coach_calendar_events ENABLE ROW LEVEL SECURITY;

-- Coach manages own events
CREATE POLICY "Coaches manage own events"
ON public.coach_calendar_events
FOR ALL
TO authenticated
USING (coach_user_id = auth.uid())
WITH CHECK (coach_user_id = auth.uid());

-- Players (linked via squad_players) can read PUBLISHED events for their coach
CREATE POLICY "Players read published events from their coach"
ON public.coach_calendar_events
FOR SELECT
TO authenticated
USING (
  published = true
  AND coach_user_id IN (
    SELECT sp.coach_user_id FROM public.squad_players sp
    WHERE sp.linked_player_id = auth.uid()
  )
);

-- Parents read PUBLISHED events for their child's coach
CREATE POLICY "Parents read published events for child coach"
ON public.coach_calendar_events
FOR SELECT
TO authenticated
USING (
  published = true
  AND coach_user_id IN (
    SELECT sp.coach_user_id FROM public.squad_players sp
    JOIN public.player_parent_links ppl ON ppl.player_user_id = sp.linked_player_id
    WHERE ppl.parent_user_id = auth.uid()
  )
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coach_calendar_events_updated_at
BEFORE UPDATE ON public.coach_calendar_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
