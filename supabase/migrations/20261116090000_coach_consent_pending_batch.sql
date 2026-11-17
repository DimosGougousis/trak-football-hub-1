-- TRAK-312: coach pages asked coach_squad_player_consent_required once per
-- player (27 requests for a 27-player roster, on every load). This answers for
-- a whole list in one call. It changes no policy: every write is still refused
-- by the same consent check as before.
--
-- Returns the ids, from the list given, that the coach can't record anything
-- about yet:
--   * their own squad player still waiting for consent (the same predicate as
--     coach_squad_player_consent_required), or
--   * an id that isn't on the caller's current roster (another coach's player,
--     a departed one, or a missing id).
-- The second rule fails closed: a foreign id always comes back, whatever its
-- consent, so the answer says nothing about another coach's children.
CREATE FUNCTION public.coach_squad_players_consent_pending(p_squad_player_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_coach() THEN
    RAISE EXCEPTION 'Not authorized for this squad player' USING ERRCODE = '42501';
  END IF;
  -- A roster is tens of players; refuse anything far past that.
  IF coalesce(cardinality(p_squad_player_ids), 0) > 1000 THEN
    RAISE EXCEPTION 'Too many squad players in one consent check' USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((
    SELECT array_agg(DISTINCT ids.id)
    FROM unnest(coalesce(p_squad_player_ids, '{}'::uuid[])) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND (NOT public.squad_player_is_mine(ids.id)
           OR public.squad_player_consent_required(ids.id))
  ), '{}'::uuid[]);
END;
$fn$;

REVOKE ALL ON FUNCTION public.coach_squad_players_consent_pending(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coach_squad_players_consent_pending(uuid[]) TO authenticated;
COMMENT ON FUNCTION public.coach_squad_players_consent_pending(uuid[]) IS
  'TRAK-312: the ids from the list the signed-in coach can''t record for yet (waiting for consent, or not on their roster). One call per page; the policies still gate every write.';
