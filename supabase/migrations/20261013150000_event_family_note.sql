-- TRAK-161 (J8.8): a short note families can read on every event ("Bring
-- extra water, it's a hot day"), shown under Kit (Imad, 12 Oct).
--
-- Its own column, not the existing notes: notes is coach-only by contract
-- (never in event emails, the calendar feed or WhatsApp text, and child_events
-- has never returned it). On prod, 13 Oct, notes was empty on all 43 events
-- and no screen writes it, so nothing private moves; a new name keeps that
-- line obvious.
--
-- Families read events only through child_events(), so the note gets the
-- cancel reason's rule there (TRAK-164): a note naming a child on that
-- coach's squad, or holding a link, reaches no family. The coach's own
-- schedule still shows what they typed.

ALTER TABLE public.coach_calendar_events
  ADD COLUMN family_note text
  CONSTRAINT coach_calendar_events_family_note_short CHECK (char_length(family_note) <= 200);

COMMENT ON COLUMN public.coach_calendar_events.family_note IS
  'TRAK-161: what families and players read under Kit. Scrubbed for squad names and links in child_events(). Distinct from notes, which is coach-only.';

-- Adding a returned column changes the function's type, so it is dropped and
-- made again. Same access rule and grants as 20261012140000.
DROP FUNCTION public.child_events(uuid);

CREATE FUNCTION public.child_events(p_child uuid)
RETURNS TABLE (
  id uuid,
  event_type text,
  title text,
  event_date date,
  start_time time,
  starts_at timestamptz,
  meet_time time,
  venue text,
  kit text,
  opponent text,
  home_away text,
  status text,
  cancel_reason text,
  sequence integer,
  updated_at timestamptz,
  family_note text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT e.id, e.event_type, e.title, e.event_date, e.start_time, e.starts_at,
         e.meet_time, e.venue, e.kit, e.opponent, e.home_away, e.status,
         trak_private.family_safe_reason(e.cancel_reason, e.coach_user_id, e.organization_id),
         e.sequence, e.updated_at,
         trak_private.family_safe_reason(e.family_note, e.coach_user_id, e.organization_id)
  FROM public.coach_calendar_events e
  WHERE e.published
    AND (p_child = auth.uid()
         OR EXISTS (SELECT 1 FROM public.player_parent_links l
                    WHERE l.player_user_id = p_child AND l.parent_user_id = auth.uid()))
    AND NOT public.player_consent_required(p_child)
    AND EXISTS (SELECT 1 FROM public.squad_players sp
                WHERE sp.linked_player_id = p_child
                  AND sp.coach_user_id = e.coach_user_id
                  AND sp.organization_id = e.organization_id
                  AND sp.status <> 'coach_departed');
$fn$;
REVOKE ALL ON FUNCTION public.child_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.child_events(uuid) TO authenticated;
COMMENT ON FUNCTION public.child_events(uuid) IS
  'TRAK-131 (J8.8), TRAK-134 (J8.11), TRAK-161 (J8.8). One child''s published squad events under that child''s consent, for the child or a linked guardian, with when each last changed and the family note. Never notes.';
