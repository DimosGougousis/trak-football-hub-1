-- TRAK-287 (Games 5/8, spec TRAK-282): locked at kick-off. Once a match's start has passed, nobody in the app changes
-- its plan: the opponent, the goals, the line-up, the jobs, the notes, the context or the expectations. The evaluation
-- (TRAK-288) then reads against what the coach expected before the game. A plan never shared locks as a draft, and an
-- unset expectation is already Usual. share_game_plan refuses after kick-off already.
--
-- As 20261021030000_started_event_locked.sql does for the event: the lock reads the event's start (starts_at, on the
-- academy's clock since TRAK-175) each time, so moving the match moves the lock, and the operator (service key, SQL
-- editor) can still correct a row.

CREATE FUNCTION trak_private.refuse_locked_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.coach_calendar_events e WHERE e.id = NEW.event_id AND e.starts_at <= now()) THEN
    RAISE EXCEPTION 'This match has kicked off, so its plan is locked' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.refuse_locked_plan_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_refuse_locked_plan_change
  BEFORE INSERT OR UPDATE ON public.game_plans
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_locked_plan_change();
CREATE TRIGGER trg_refuse_locked_line_up_change
  BEFORE INSERT OR UPDATE ON public.game_plan_players
  FOR EACH ROW EXECUTE FUNCTION trak_private.refuse_locked_plan_change();

-- The changes that weren't shared stay countable after kick-off, for the lock's note (Imad, 28 Oct). Before kick-off
-- they still drive the Share step's alert and Needs you.
CREATE OR REPLACE FUNCTION public.game_plan_changes(p_event_ids uuid[])
RETURNS TABLE (event_id uuid, squad_player_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id, c.squad_player_id
  FROM public.coach_calendar_events e
  CROSS JOIN LATERAL trak_private.game_copy_changes(e.id) AS c(squad_player_id)
  WHERE e.id = ANY (p_event_ids)
    AND e.coach_user_id = (SELECT auth.uid()) AND public.is_coach()
    AND e.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM public.game_shares s WHERE s.event_id = e.id);
$$;
REVOKE ALL ON FUNCTION public.game_plan_changes(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_plan_changes(uuid[]) TO authenticated;
