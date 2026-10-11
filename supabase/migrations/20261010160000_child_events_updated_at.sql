-- TRAK-134 (J8.11): child_events() also says when each event last changed.
--
-- The parent's alerts bell counts an item as new when it happened after the
-- bell was last opened on that device (TRAK-74). For an event, "happened" is
-- when it was published, moved or cancelled, which is updated_at. Everything
-- else is 20261009200000 unchanged: that child's consent, a current squad row
-- of the event's coach in the event's academy, published only, named columns,
-- never the coach's notes. A new return column needs DROP and CREATE; the
-- grants below are the same as before.

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
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT e.id, e.event_type, e.title, e.event_date, e.start_time, e.starts_at,
         e.meet_time, e.venue, e.kit, e.opponent, e.home_away, e.status,
         e.cancel_reason, e.sequence, e.updated_at
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
  'TRAK-131 (J8.8), TRAK-134 (J8.11). One child''s published squad events under that child''s consent, for the child or a linked guardian, with when each last changed. Never notes.';
