-- TRAK-164 (J8.11): a cancel reason that names a squad child, or holds a link,
-- is left out of the app too.
--
-- The change email (#264), the calendar feed (#258) and the WhatsApp text
-- (#266) already drop a coach's cancel reason when it names a child on the
-- squad or contains a link (Imad, 10 Oct). The app's event page and bells
-- showed it as typed to the same squad audience. Decided 12 Oct (Imad): the
-- same rule everywhere. Families read events through child_events(), so the
-- rule goes there once; the coach's own schedule still shows what they typed.
--
-- family_safe_reason() mirrors namePatterns() + LINK in
-- supabase/functions/_shared (ical-feed.ts, send-email.ts): every name part of
-- three or more letters, other than a name particle (al, el, bin...), on any
-- squad row of that coach in that academy, matched as a whole word; and http,
-- www, host/path or a bare host on a common domain. Departed squad rows count
-- too: a former squad-mate's name is still a name.

CREATE FUNCTION trak_private.family_safe_reason(p_reason text, p_coach uuid, p_org uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN p_reason IS NULL OR btrim(p_reason) = '' THEN NULL
    WHEN p_reason ~* ('\mhttps?://[^[:space:]<>"'')\]]+'
                    || '|\mwww\.[^[:space:]<>"'')\]]+'
                    || '|\m([a-z0-9-]+\.)+[a-z]{2,63}/[^[:space:]<>"'')\]]*'
                    || '|\m([a-z0-9-]+\.)+(com|net|org|info|biz|io|co|me|ly|gl|gg|to|tv|app|link|page|site|online|ae|uk|eu)(?![a-z0-9_-]|\.[a-z0-9_-])')
      THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.squad_players sp,
           LATERAL regexp_split_to_table(lower(sp.player_name), '[[:space:]''’-]+') AS part
      WHERE sp.coach_user_id = p_coach
        AND sp.organization_id IS NOT DISTINCT FROM p_org
        AND sp.player_name IS NOT NULL
        AND length(part) >= 3
        AND part <> ALL (ARRAY['al','el','bin','bint','ibn','abu','van','von','de','da','di','del','la','le'])
        AND p_reason ~* ('(^|[^[:alnum:]])'
                         || regexp_replace(part, '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
                         || '([^[:alnum:]]|$)'))
      THEN NULL
    ELSE p_reason
  END
$fn$;
REVOKE ALL ON FUNCTION trak_private.family_safe_reason(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Same columns, access rule and grants as 20261010160000; only cancel_reason
-- goes through the rule.
CREATE OR REPLACE FUNCTION public.child_events(p_child uuid)
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
         trak_private.family_safe_reason(e.cancel_reason, e.coach_user_id, e.organization_id),
         e.sequence, e.updated_at
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
