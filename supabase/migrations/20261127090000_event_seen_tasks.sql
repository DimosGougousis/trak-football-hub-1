-- TRAK-580 (coach–player P03): when a coach changes a published event in a way families can see, each player on its
-- squad is asked to see it again. The ask is a TRAK-578 "seen" task: one per event and squad (a whole-roster event
-- has one per squad of the coach), raised to the event's change count (sequence) on every such change, so a player's
-- earlier seen becomes outdated. The player's app records seen when they open the event (respond_to_task); there is no
-- button and no count of who has seen it.
--
-- What counts: a change to what child_events gives families (date, times, venue, kit, opponent, home or away, title,
-- the note, a cancellation and its reason). Publishing isn't a change, a draft's edits ask nothing, and a field only
-- the coach reads (a training theme, the competition) moves the event's change count but asks nobody.
-- Only where the academy's tasks switch is on, as for every task. The task is open until the event starts.
-- An event moved to another squad asks nobody on its own; its next change asks the new squad.

CREATE UNIQUE INDEX trak_tasks_event_seen_idx ON public.trak_tasks (source_id, squad) WHERE source_type = 'event';

CREATE FUNCTION trak_private.ask_players_to_see_event_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NOT (OLD.published AND NEW.published) OR NEW.organization_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF (OLD.event_type, OLD.title, OLD.event_date, OLD.start_time, OLD.starts_at, OLD.meet_time, OLD.venue, OLD.kit,
      OLD.opponent, OLD.home_away, OLD.status, OLD.cancel_reason, OLD.family_note, OLD.kit_snapshot)
     IS NOT DISTINCT FROM
     (NEW.event_type, NEW.title, NEW.event_date, NEW.start_time, NEW.starts_at, NEW.meet_time, NEW.venue, NEW.kit,
      NEW.opponent, NEW.home_away, NEW.status, NEW.cancel_reason, NEW.family_note, NEW.kit_snapshot) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_features f WHERE f.organization_id = NEW.organization_id AND f.feature = 'tasks') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.trak_tasks (organization_id, coach_user_id, squad, source_type, source_id, source_version, answer_kind, title, due_at)
  SELECT NEW.organization_id, NEW.coach_user_id, s.squad, 'event', NEW.id, NEW.sequence, 'seen',
    -- A blank title would fail the task's check and, with it, the coach's save: the event's kind stands in.
    btrim(left(coalesce(nullif(btrim(NEW.title), ''), initcap(NEW.event_type)), 80)), NEW.starts_at
  FROM (SELECT DISTINCT btrim(sp.age_group) AS squad FROM public.squad_players sp
        WHERE sp.coach_user_id = NEW.coach_user_id AND sp.organization_id = NEW.organization_id AND sp.status = 'active'
          AND btrim(sp.age_group) <> '' AND (NEW.squad IS NULL OR btrim(sp.age_group) = btrim(NEW.squad))) s
  ON CONFLICT (source_id, squad) WHERE source_type = 'event'
  DO UPDATE SET source_version = EXCLUDED.source_version, title = EXCLUDED.title, due_at = EXCLUDED.due_at, status = 'open';
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION trak_private.ask_players_to_see_event_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_ask_players_to_see_event_change
  AFTER UPDATE ON public.coach_calendar_events
  FOR EACH ROW EXECUTE FUNCTION trak_private.ask_players_to_see_event_change();
