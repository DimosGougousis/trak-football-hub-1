-- Pilot scorecard — one view per metric in section 04 of the pilot scope,
-- plus a single weekly roll-up.
--
-- Design rule: every view answers exactly one row of the scorecard, so a number
-- that looks wrong can be drilled into without unpicking a join. Read them with
-- the service role (SQL editor); none is exposed to the app.

-- ---------------------------------------------------------------------------
-- 0. Pilot window. Set once, on the day the pilot starts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pilot_config (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),   -- single-row table
  org_id      uuid,
  starts_on   date NOT NULL,
  weeks       integer NOT NULL DEFAULT 8,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pilot_config ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

INSERT INTO public.pilot_config (id, starts_on)
VALUES (true, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Week 1 is the first 7 days from starts_on. Anything earlier is week 0 or less
-- (the demo and setup phase), which is why the number is allowed to go negative.
CREATE OR REPLACE FUNCTION public.pilot_week(ts timestamptz)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT floor((ts::date - (SELECT starts_on FROM public.pilot_config WHERE id))::numeric / 7)::int + 1;
$$;

-- Band vocabulary as an ordered scale, so "within one band" is arithmetic.
CREATE OR REPLACE FUNCTION public.band_ordinal(band text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(band)
    WHEN 'difficult'   THEN 1
    WHEN 'developing'  THEN 2
    WHEN 'mixed'       THEN 3
    WHEN 'steady'      THEN 4
    WHEN 'good'        THEN 5
    WHEN 'standout'    THEN 6
    WHEN 'exceptional' THEN 7
  END;
$$;

CREATE OR REPLACE FUNCTION public.score_to_band(score numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN score >= 9 THEN 'exceptional'
    WHEN score >= 8 THEN 'standout'
    WHEN score >= 7 THEN 'good'
    WHEN score >= 6 THEN 'steady'
    WHEN score >= 4 THEN 'mixed'
    WHEN score >= 2 THEN 'developing'
    ELSE 'difficult'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Activation  — target >=80% within 7 days
-- A roster row created by the coach IS the invitation: UC-02 builds the squad
-- by hand before anyone signs up, so an unlinked row is an outstanding invite.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_activation AS
WITH players AS (
  SELECT
    'player'::text                                        AS cohort,
    sp.id                                                 AS invite_id,
    sp.player_name                                        AS who,
    sp.created_at                                         AS invited_at,
    p.created_at                                          AS activated_at
  FROM public.squad_players sp
  LEFT JOIN public.profiles p ON p.user_id = sp.linked_player_id
),
parents AS (
  SELECT
    'parent'::text                                        AS cohort,
    pi.id                                                 AS invite_id,
    pi.parent_email                                       AS who,
    pi.created_at                                         AS invited_at,
    ppl.created_at                                        AS activated_at
  FROM public.parent_invites pi
  -- LATERAL + LIMIT 1: a player who invites two parents would otherwise pair
  -- every invite with every link and inflate the activation denominator.
  LEFT JOIN LATERAL (
    SELECT l.created_at
    FROM public.player_parent_links l
    WHERE l.player_user_id = pi.player_user_id
      AND l.created_at >= pi.created_at
    ORDER BY l.created_at
    LIMIT 1
  ) ppl ON true
)
SELECT
  cohort,
  invite_id,
  who,
  invited_at,
  activated_at,
  activated_at IS NOT NULL                                            AS activated,
  activated_at IS NOT NULL
    AND activated_at <= invited_at + interval '7 days'                AS activated_within_7d
FROM (SELECT * FROM players UNION ALL SELECT * FROM parents) x;

COMMENT ON VIEW public.pilot_activation IS
  'Scorecard metric 1. One row per invitation. Target: >=80% activated_within_7d.';

-- ---------------------------------------------------------------------------
-- 2. Match coverage — target >=70%
-- Denominator is the fixture list the coach entered (UC-13), expanded across
-- the squad. If the coach never enters fixtures, coverage is unmeasurable and
-- the view returns no rows — which is itself the finding.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_match_coverage AS
WITH fixtures AS (
  SELECT
    e.id                       AS fixture_id,
    e.coach_user_id,
    e.starts_at::date          AS played_on,
    e.opponent
  FROM public.coach_calendar_events e
  WHERE e.event_type IN ('match', 'tournament')
),
expected AS (
  SELECT
    f.fixture_id,
    f.played_on,
    f.coach_user_id,
    sp.linked_player_id AS player_user_id
  FROM fixtures f
  JOIN public.squad_players sp
    ON sp.coach_user_id = f.coach_user_id
   AND sp.linked_player_id IS NOT NULL
)
SELECT
  public.pilot_week(e.played_on::timestamptz)              AS week,
  e.fixture_id,
  e.played_on,
  e.player_user_id,
  m.id                                                     AS match_id,
  m.logged_by_role,
  m.id IS NOT NULL                                         AS logged
FROM expected e
LEFT JOIN public.matches m
       ON m.user_id = e.player_user_id
      AND m.match_date = e.played_on;

COMMENT ON VIEW public.pilot_match_coverage IS
  'Scorecard metric 2. One row per player per fixture. Target: >=70% logged.';

-- ---------------------------------------------------------------------------
-- 3. Assessment rate — target >=60% within 48h.  THE H1 NUMBER.
-- coach_assessments carries no match_id, so an assessment counts for a match
-- when it lands on the same player within 48 hours of that match being played.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_assessment_rate AS
SELECT
  public.pilot_week(m.match_date::timestamptz)             AS week,
  m.id                                                     AS match_id,
  m.user_id                                                AS player_user_id,
  m.match_date,
  m.logged_by_role,
  a.id                                                     AS assessment_id,
  a.created_at                                             AS assessed_at,
  a.coach_user_id,
  a.id IS NOT NULL                                         AS assessed_within_48h
FROM public.matches m
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
  'Scorecard metric 3 and hypothesis H1. Target: >=60% assessed_within_48h in weeks 4-6, unprompted.';

-- ---------------------------------------------------------------------------
-- 4. Time to assess — target median < 90s per player
-- Sourced from telemetry, since duration is an ops measurement and does not
-- belong in a child's assessment record.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_time_to_assess AS
SELECT
  public.pilot_week(t.created_at)                          AS week,
  t.user_id                                                AS coach_user_id,
  t.event_type,
  (t.metadata ->> 'duration_ms')::numeric / 1000.0         AS run_seconds,
  (t.metadata ->> 'players')::int                          AS players,
  -- A quick-assess run covers a whole squad in one timing, so the scorecard
  -- median is per player, not per run. A full assessment has players = 1.
  round(
    (t.metadata ->> 'duration_ms')::numeric / 1000.0
    / GREATEST((t.metadata ->> 'players')::numeric, 1), 1)  AS seconds,
  (t.metadata ->> 'mode')                                  AS mode,
  t.created_at
FROM public.telemetry_events t
WHERE t.event_type IN ('assessment_submitted', 'quick_assess_completed')
  AND t.metadata ? 'duration_ms'
  AND (t.metadata ->> 'duration_ms') IS NOT NULL
  AND COALESCE((t.metadata ->> 'players')::int, 1) > 0;

COMMENT ON VIEW public.pilot_time_to_assess IS
  'Scorecard metric 4. Target: median seconds < 90 per player assessed.';

-- ---------------------------------------------------------------------------
-- 5. Rating agreement — target >=75% within one band
--
-- Two sources, deliberately. Adding a "what would you have said?" step to the
-- assessment flow would have bought clean blindness at the cost of friction in
-- the exact flow H1 is measuring — so the primary source costs nothing:
--
--   DERIVED  (pilot_rating_agreement_derived) — the coach's assessment band for
--            a player against the engine's band for that player's match in the
--            same window. High volume, free, but not strictly blind: a coach
--            may have seen the player's logged band first.
--
--   BLIND    (pilot_rating_agreement) — bands captured in the weekly coach call
--            before the screen is shown, written in as `blind_rating_captured`
--            telemetry. Low volume, genuinely blind, and the tie-breaker when
--            the derived number is near the 75% line.
--
-- Report the derived number as the headline and the blind number as the check.
-- If they disagree sharply, the derived one is contaminated and the blind one
-- is the truth.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_rating_agreement AS
SELECT
  public.pilot_week(t.created_at)                          AS week,
  t.user_id                                                AS coach_user_id,
  t.metadata ->> 'player_user_id'                          AS player_user_id,
  t.metadata ->> 'position'                                AS position,
  t.metadata ->> 'gut_band'                                AS gut_band,
  t.metadata ->> 'computed_band'                           AS computed_band,
  public.band_ordinal(t.metadata ->> 'gut_band')           AS gut_ord,
  public.band_ordinal(t.metadata ->> 'computed_band')      AS computed_ord,
  abs(
    public.band_ordinal(t.metadata ->> 'gut_band')
    - public.band_ordinal(t.metadata ->> 'computed_band')
  )                                                        AS band_gap,
  abs(
    public.band_ordinal(t.metadata ->> 'gut_band')
    - public.band_ordinal(t.metadata ->> 'computed_band')
  ) <= 1                                                   AS agrees,
  -- Negative = the engine rated LOWER than the coach. Grouped by position this
  -- is the systematic-bias check the scope calls for (GK/DEF vs ATT).
  public.band_ordinal(t.metadata ->> 'computed_band')
    - public.band_ordinal(t.metadata ->> 'gut_band')       AS engine_bias,
  t.created_at
FROM public.telemetry_events t
WHERE t.event_type = 'blind_rating_captured';

COMMENT ON VIEW public.pilot_rating_agreement IS
  'Scorecard metric 5 and hypothesis H4. Target: >=75% agrees. Group by position to test for engine bias.';

CREATE OR REPLACE VIEW public.pilot_rating_agreement_derived AS
SELECT
  public.pilot_week(m.match_date::timestamptz)             AS week,
  a.coach_user_id,
  m.user_id                                                AS player_user_id,
  m.id                                                     AS match_id,
  m.position,
  m.match_date,
  public.score_to_band(a.coach_rating)                     AS coach_band,
  public.score_to_band(m.computed_rating)                  AS computed_band,
  abs(
    public.band_ordinal(public.score_to_band(a.coach_rating))
    - public.band_ordinal(public.score_to_band(m.computed_rating))
  )                                                        AS band_gap,
  abs(
    public.band_ordinal(public.score_to_band(a.coach_rating))
    - public.band_ordinal(public.score_to_band(m.computed_rating))
  ) <= 1                                                   AS agrees,
  -- Negative = the engine banded LOWER than the coach. Averaged per position
  -- this is the GK/DEF-versus-ATT bias check the scope asks for.
  public.band_ordinal(public.score_to_band(m.computed_rating))
    - public.band_ordinal(public.score_to_band(a.coach_rating))  AS engine_bias
FROM public.matches m
JOIN LATERAL (
  SELECT ca.*
  FROM public.coach_assessments ca
  JOIN public.squad_players sp ON sp.id = ca.squad_player_id
  WHERE sp.linked_player_id = m.user_id
    AND ca.created_at >= m.match_date::timestamptz
    AND ca.created_at <  m.match_date::timestamptz + interval '48 hours'
  ORDER BY ca.created_at
  LIMIT 1
) a ON true;

COMMENT ON VIEW public.pilot_rating_agreement_derived IS
  'Scorecard metric 5, primary source. Coach assessment band vs engine match band. Target >=75% agrees; group by position for engine bias.';

-- ---------------------------------------------------------------------------
-- 6 & 7. Weekly return by role — targets: players >=50%, parents >=40% by wk 6
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_weekly_active AS
SELECT
  public.pilot_week(t.created_at)                          AS week,
  COALESCE(t.role, p.role::text)                           AS role,
  t.user_id,
  count(*)                                                 AS events,
  min(t.created_at)                                        AS first_seen,
  max(t.created_at)                                        AS last_seen
FROM public.telemetry_events t
LEFT JOIN public.profiles p ON p.user_id = t.user_id
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.pilot_retention AS
WITH wk1 AS (
  SELECT DISTINCT role, user_id FROM public.pilot_weekly_active WHERE week = 1
),
cohort AS (
  SELECT role, count(*) AS week1_cohort FROM wk1 GROUP BY role
),
returners AS (
  SELECT a.week, a.role, a.user_id
  FROM public.pilot_weekly_active a
  JOIN wk1 ON wk1.user_id = a.user_id AND wk1.role = a.role
),
weeks AS (
  SELECT generate_series(1, (SELECT weeks FROM public.pilot_config WHERE id)) AS week
)
SELECT
  w.week,
  c.role,
  c.week1_cohort,
  count(DISTINCT r.user_id)                                             AS still_active,
  round(100.0 * count(DISTINCT r.user_id)
        / NULLIF(c.week1_cohort, 0), 1)                                 AS pct_returning
FROM weeks w
CROSS JOIN cohort c
LEFT JOIN returners r ON r.week = w.week AND r.role = c.role
GROUP BY w.week, c.role, c.week1_cohort
ORDER BY w.week, c.role;

COMMENT ON VIEW public.pilot_retention IS
  'Scorecard metrics 6 and 7. Targets at week 6: player >=50%, parent >=40%.';

-- ---------------------------------------------------------------------------
-- 8. Safeguarding — standing checks. Every one of these must return zero rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_safeguarding_checks AS
-- A parent linked to more than one child, or two parents on one child, is not
-- wrong in itself but is the shape a mis-redeemed PAR- code takes. Review each.
SELECT 'parent_linked_to_multiple_children'::text AS check_name,
       ppl.parent_user_id::text                    AS subject,
       count(*)::text                              AS detail
FROM public.player_parent_links ppl
GROUP BY ppl.parent_user_id
HAVING count(DISTINCT ppl.player_user_id) > 1

UNION ALL
-- A squad row linked to a player who is not, per their profile, a player.
SELECT 'squad_link_to_non_player',
       sp.id::text,
       p.role::text
FROM public.squad_players sp
JOIN public.profiles p ON p.user_id = sp.linked_player_id
WHERE p.role <> 'player'

UNION ALL
-- An assessment written by an account that is not a coach.
SELECT 'assessment_by_non_coach',
       ca.id::text,
       COALESCE(p.role::text, 'no profile')
FROM public.coach_assessments ca
LEFT JOIN public.profiles p ON p.user_id = ca.coach_user_id
WHERE p.role IS DISTINCT FROM 'coach'

UNION ALL
-- An award granted by an account that is not a coach.
SELECT 'award_by_non_coach',
       ra.id::text,
       COALESCE(p.role::text, 'no profile')
FROM public.recognition_awards ra
LEFT JOIN public.profiles p ON p.user_id = ra.coach_user_id
WHERE p.role IS DISTINCT FROM 'coach';

COMMENT ON VIEW public.pilot_safeguarding_checks IS
  'Scorecard metric 8. Must return zero rows. Any row pauses the pilot until explained.';

-- ---------------------------------------------------------------------------
-- The one query the founder runs. Every scorecard metric, by pilot week.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.pilot_scorecard AS
WITH weeks AS (
  SELECT generate_series(1, (SELECT weeks FROM public.pilot_config WHERE id)) AS week
)
SELECT
  w.week,

  (SELECT round(100.0 * count(*) FILTER (WHERE activated_within_7d) / NULLIF(count(*), 0), 1)
     FROM public.pilot_activation a
    WHERE public.pilot_week(a.invited_at) <= w.week)                      AS activation_pct,

  (SELECT round(100.0 * count(*) FILTER (WHERE logged) / NULLIF(count(*), 0), 1)
     FROM public.pilot_match_coverage c WHERE c.week = w.week)            AS match_coverage_pct,

  (SELECT round(100.0 * count(*) FILTER (WHERE assessed_within_48h) / NULLIF(count(*), 0), 1)
     FROM public.pilot_assessment_rate a WHERE a.week = w.week)           AS assessment_rate_pct,

  (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::numeric, 1)
     FROM public.pilot_time_to_assess t WHERE t.week = w.week)            AS median_assess_seconds,

  (SELECT round(100.0 * count(*) FILTER (WHERE agrees) / NULLIF(count(*), 0), 1)
     FROM public.pilot_rating_agreement_derived r WHERE r.week = w.week)  AS rating_agreement_pct,

  (SELECT round(100.0 * count(*) FILTER (WHERE agrees) / NULLIF(count(*), 0), 1)
     FROM public.pilot_rating_agreement r WHERE r.week = w.week)          AS rating_agreement_blind_pct,

  (SELECT pct_returning FROM public.pilot_retention r
    WHERE r.week = w.week AND r.role = 'player')                          AS player_return_pct,

  (SELECT pct_returning FROM public.pilot_retention r
    WHERE r.week = w.week AND r.role = 'parent')                          AS parent_return_pct,

  (SELECT count(*) FROM public.pilot_safeguarding_checks)                 AS safeguarding_flags
FROM weeks w
ORDER BY w.week;

COMMENT ON VIEW public.pilot_scorecard IS
  'Section 04 of the pilot scope, one row per week. SELECT * FROM pilot_scorecard;';
