-- Scope the pilot scorecard to the pilot organisation.
--
-- The first rehearsal run exposed this: activation read 3.2% against a squad
-- that was ~54% claimed. The views counted EVERY squad_players row and every
-- parent_invite in the database — demo academies, dev accounts, months of old
-- seed data — so the pilot cohort was a rounding error inside its own metric.
--
-- This is not a rehearsal-only problem. The production database will still hold
-- all of that during the real pilot, and an unscoped denominator would make the
-- scorecard meaningless exactly when it matters most.
--
-- pilot_config.org_id already existed as a placeholder and is now load-bearing.
-- Left NULL, every view behaves as before and counts everything.

-- Coaches in the pilot organisation. squad_players carries no organization_id,
-- so org membership is reached through the coach.
CREATE OR REPLACE FUNCTION public.pilot_coach_ids()
RETURNS TABLE (coach_user_id uuid)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT cd.user_id
  FROM public.coach_details cd
  CROSS JOIN (SELECT org_id FROM public.pilot_config WHERE id) pc
  WHERE pc.org_id IS NULL OR cd.organization_id = pc.org_id;
$$;

COMMENT ON FUNCTION public.pilot_coach_ids() IS
  'Coaches in the pilot organisation. Returns every coach when pilot_config.org_id is NULL.';

-- ── 1. Activation ----------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_activation AS
WITH pilot_coaches AS (
  SELECT coach_user_id FROM public.pilot_coach_ids()
),
players AS (
  SELECT
    'player'::text  AS cohort,
    sp.id           AS invite_id,
    sp.player_name  AS who,
    sp.created_at   AS invited_at,
    p.created_at    AS activated_at
  FROM public.squad_players sp
  JOIN pilot_coaches pc ON pc.coach_user_id = sp.coach_user_id
  LEFT JOIN public.profiles p ON p.user_id = sp.linked_player_id
),
parent_invites_in_pilot AS (
  SELECT pi.id, pi.parent_email, pi.created_at, pi.player_user_id
  FROM public.parent_invites pi
  WHERE EXISTS (
    SELECT 1
    FROM public.squad_players sp
    JOIN pilot_coaches pc ON pc.coach_user_id = sp.coach_user_id
    WHERE sp.linked_player_id = pi.player_user_id
  )
),
parents AS (
  SELECT
    'parent'::text    AS cohort,
    pin.id            AS invite_id,
    pin.parent_email  AS who,
    pin.created_at    AS invited_at,
    ppl.created_at    AS activated_at
  FROM parent_invites_in_pilot pin
  -- LATERAL + LIMIT 1: a player who invites two parents would otherwise pair
  -- every invite with every link and inflate the denominator.
  LEFT JOIN LATERAL (
    SELECT l.created_at
    FROM public.player_parent_links l
    WHERE l.player_user_id = pin.player_user_id
      AND l.created_at >= pin.created_at
    ORDER BY l.created_at
    LIMIT 1
  ) ppl ON true
)
SELECT
  cohort, invite_id, who, invited_at, activated_at,
  activated_at IS NOT NULL                                      AS activated,
  activated_at IS NOT NULL
    AND activated_at <= invited_at + interval '7 days'          AS activated_within_7d
FROM (SELECT * FROM players UNION ALL SELECT * FROM parents) x;

COMMENT ON VIEW public.pilot_activation IS
  'Scorecard metric 1, scoped to pilot_config.org_id. Target: >=80% activated_within_7d.';

-- ── 2. Match coverage ------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_match_coverage AS
WITH fixtures AS (
  SELECT e.id AS fixture_id, e.coach_user_id, e.starts_at::date AS played_on, e.opponent
  FROM public.coach_calendar_events e
  JOIN public.pilot_coach_ids() pc ON pc.coach_user_id = e.coach_user_id
  WHERE e.event_type IN ('match', 'tournament')
),
expected AS (
  SELECT f.fixture_id, f.played_on, f.coach_user_id, sp.linked_player_id AS player_user_id
  FROM fixtures f
  JOIN public.squad_players sp
    ON sp.coach_user_id = f.coach_user_id
   AND sp.linked_player_id IS NOT NULL
)
SELECT
  public.pilot_week(e.played_on::timestamptz)  AS week,
  e.fixture_id,
  e.played_on,
  e.player_user_id,
  m.id                                         AS match_id,
  m.logged_by_role,
  m.id IS NOT NULL                             AS logged
FROM expected e
LEFT JOIN public.matches m
       ON m.user_id = e.player_user_id
      AND m.match_date = e.played_on;

COMMENT ON VIEW public.pilot_match_coverage IS
  'Scorecard metric 2, scoped to the pilot org. Target: >=70% logged.';

-- ── 3. Assessment rate — the H1 number -------------------------------------

CREATE OR REPLACE VIEW public.pilot_assessment_rate AS
SELECT
  public.pilot_week(m.match_date::timestamptz)  AS week,
  m.id                                          AS match_id,
  m.user_id                                     AS player_user_id,
  m.match_date,
  m.logged_by_role,
  a.id                                          AS assessment_id,
  a.created_at                                  AS assessed_at,
  a.coach_user_id,
  a.id IS NOT NULL                              AS assessed_within_48h
FROM public.matches m
-- Restrict to players in a pilot squad. An inner LATERAL drops everyone else.
JOIN LATERAL (
  SELECT 1
  FROM public.squad_players sp
  JOIN public.pilot_coach_ids() pc ON pc.coach_user_id = sp.coach_user_id
  WHERE sp.linked_player_id = m.user_id
  LIMIT 1
) scope ON true
LEFT JOIN LATERAL (
  SELECT ca.*
  FROM public.coach_assessments ca
  JOIN public.squad_players sp ON sp.id = ca.squad_player_id
  WHERE sp.linked_player_id = m.user_id
    AND ca.created_at >= m.match_date::timestamptz
    AND ca.created_at <  m.match_date::timestamptz + interval '48 hours'
  ORDER BY ca.created_at
  LIMIT 1
) a ON true;

COMMENT ON VIEW public.pilot_assessment_rate IS
  'Scorecard metric 3 and hypothesis H1, scoped to the pilot org. Target: >=60% within 48h.';

-- ── 4. Derived rating agreement --------------------------------------------

CREATE OR REPLACE VIEW public.pilot_rating_agreement_derived AS
SELECT
  public.pilot_week(m.match_date::timestamptz)  AS week,
  a.coach_user_id,
  m.user_id                                     AS player_user_id,
  m.id                                          AS match_id,
  m.position,
  m.match_date,
  public.score_to_band(a.coach_rating)          AS coach_band,
  public.score_to_band(m.computed_rating)       AS computed_band,
  abs(public.band_ordinal(public.score_to_band(a.coach_rating))
      - public.band_ordinal(public.score_to_band(m.computed_rating)))       AS band_gap,
  abs(public.band_ordinal(public.score_to_band(a.coach_rating))
      - public.band_ordinal(public.score_to_band(m.computed_rating))) <= 1  AS agrees,
  -- Negative = the engine banded LOWER than the coach. Averaged per position
  -- this is the GK/DEF-versus-ATT bias check the scope asks for.
  public.band_ordinal(public.score_to_band(m.computed_rating))
    - public.band_ordinal(public.score_to_band(a.coach_rating))             AS engine_bias
FROM public.matches m
JOIN LATERAL (
  SELECT ca.*
  FROM public.coach_assessments ca
  JOIN public.squad_players sp ON sp.id = ca.squad_player_id
  JOIN public.pilot_coach_ids() pc ON pc.coach_user_id = sp.coach_user_id
  WHERE sp.linked_player_id = m.user_id
    AND ca.created_at >= m.match_date::timestamptz
    AND ca.created_at <  m.match_date::timestamptz + interval '48 hours'
  ORDER BY ca.created_at
  LIMIT 1
) a ON true;

COMMENT ON VIEW public.pilot_rating_agreement_derived IS
  'Scorecard metric 5 and hypothesis H4, scoped to the pilot org. Target: >=75% agrees.';
