-- TRAK-203 / J8: reusable squad kits and an independent design on each event.
-- Only structured colors/patterns are stored; no uploads, URLs, names or logos.
CREATE FUNCTION trak_private.valid_kit_design(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE part text;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(value)) <> 6 THEN RETURN false; END IF;
 IF NOT COALESCE(value->>'pattern' IN ('solid','stripes','hoops','sash','halves','chest-band'),false) THEN RETURN false; END IF;
 FOREACH part IN ARRAY ARRAY['shirt','secondary','trim','shorts','socks'] LOOP
  IF NOT COALESCE(jsonb_typeof(value->part)='string' AND value->>part ~ '^#[0-9a-fA-F]{6}$',false) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION trak_private.valid_team_kits(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 RETURN COALESCE((SELECT count(*) FROM jsonb_object_keys(value))=4 AND value->'version'='1'::jsonb
  AND trak_private.valid_kit_design(value->'home') AND trak_private.valid_kit_design(value->'away')
  AND trak_private.valid_kit_design(value->'alternate'),false);
END $$;
CREATE FUNCTION trak_private.valid_event_kit(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 RETURN COALESCE((SELECT count(*) FROM jsonb_object_keys(value))=3 AND value->'version'='1'::jsonb
  AND value->>'slot' IN ('home','away','alternate') AND trak_private.valid_kit_design(value->'design'),false);
END $$;
REVOKE ALL ON FUNCTION trak_private.valid_kit_design(jsonb), trak_private.valid_team_kits(jsonb), trak_private.valid_event_kit(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trak_private.valid_kit_design(jsonb), trak_private.valid_team_kits(jsonb), trak_private.valid_event_kit(jsonb) TO authenticated, service_role;

CREATE TABLE public.coach_team_kits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL DEFAULT public.my_coach_organization_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
 -- Empty string is the whole roster, matching events with squad IS NULL.
 squad text NOT NULL DEFAULT '',
 kits jsonb NOT NULL CHECK (trak_private.valid_team_kits(kits)),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, coach_user_id, squad)
);
REVOKE ALL ON public.coach_team_kits FROM PUBLIC, anon, authenticated;
ALTER TABLE public.coach_team_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_owns_team_kits ON public.coach_team_kits FOR ALL TO authenticated
 USING (coach_user_id=(SELECT auth.uid()) AND organization_id=(SELECT public.my_coach_organization_id())
        AND (SELECT public.is_coach()) AND (SELECT public.feature_on('events')))
 WITH CHECK (coach_user_id=(SELECT auth.uid()) AND organization_id=(SELECT public.my_coach_organization_id())
        AND (SELECT public.is_coach()) AND (SELECT public.feature_on('events')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_team_kits TO authenticated;
GRANT ALL ON public.coach_team_kits TO service_role;

CREATE FUNCTION trak_private.check_team_kit_squad() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.squad <> '' AND NOT EXISTS (SELECT 1 FROM public.squad_players sp
  WHERE sp.coach_user_id=NEW.coach_user_id AND sp.organization_id=NEW.organization_id
   AND sp.age_group=NEW.squad AND sp.status <> 'coach_departed') THEN
  RAISE EXCEPTION 'That squad is not on your roster' USING ERRCODE='23514';
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trak_private.check_team_kit_squad() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER check_team_kit_squad BEFORE INSERT OR UPDATE ON public.coach_team_kits
 FOR EACH ROW EXECUTE FUNCTION trak_private.check_team_kit_squad();

ALTER TABLE public.coach_calendar_events ADD COLUMN kit_snapshot jsonb
 CHECK (kit_snapshot IS NULL OR trak_private.valid_event_kit(kit_snapshot));
COMMENT ON COLUMN public.coach_calendar_events.kit_snapshot IS
 'Versioned design selected for this event. Template edits do not change existing announcements.';

-- A cached/rolled-back text-only client can still edit kit. If it changes the
-- instruction without replacing the design, show its new text rather than stale art.
CREATE FUNCTION trak_private.clear_changed_text_kit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.kit IS DISTINCT FROM OLD.kit AND NEW.kit_snapshot IS NOT DISTINCT FROM OLD.kit_snapshot THEN
  NEW.kit_snapshot := NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trak_private.clear_changed_text_kit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_clear_changed_text_kit BEFORE UPDATE OF kit ON public.coach_calendar_events
 FOR EACH ROW EXECUTE FUNCTION trak_private.clear_changed_text_kit();

-- Return-type extension requires a drop/recreate. Keep every existing family,
-- consent, publication, academy and squad condition from TRAK-176 unchanged.
DROP FUNCTION public.child_events(uuid);
CREATE FUNCTION public.child_events(p_child uuid)
RETURNS TABLE (
 id uuid, event_type text, title text, event_date date, start_time time,
 starts_at timestamptz, meet_time time, venue text, kit text, opponent text,
 home_away text, status text, cancel_reason text, sequence integer,
 updated_at timestamptz, family_note text, kit_snapshot jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT e.id, e.event_type, e.title, e.event_date, e.start_time, e.starts_at,
  e.meet_time, e.venue, e.kit, e.opponent, e.home_away, e.status,
  trak_private.family_safe_reason(e.cancel_reason,e.coach_user_id,e.organization_id),
  e.sequence,e.updated_at,
  trak_private.family_safe_reason(e.family_note,e.coach_user_id,e.organization_id),e.kit_snapshot
 FROM public.coach_calendar_events e
 WHERE e.published
  AND (p_child=auth.uid() OR EXISTS (SELECT 1 FROM public.player_parent_links l
       WHERE l.player_user_id=p_child AND l.parent_user_id=auth.uid()))
  AND NOT public.player_consent_required(p_child)
  AND EXISTS (SELECT 1 FROM public.squad_players sp
       WHERE sp.linked_player_id=p_child AND sp.coach_user_id=e.coach_user_id
        AND sp.organization_id=e.organization_id AND sp.status <> 'coach_departed'
        AND (e.squad IS NULL OR sp.age_group=e.squad));
$$;
REVOKE ALL ON FUNCTION public.child_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.child_events(uuid) TO authenticated;
