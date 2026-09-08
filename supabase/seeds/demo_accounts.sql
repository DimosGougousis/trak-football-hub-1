-- ============================================================
-- Trak Football — Demo Seed Data
-- Run AFTER creating the four demo accounts through the app.
--
-- Demo accounts to create first:
--   Coach:  demo.coach@trakfootball.com   / TrakDemo2026!
--   Player: demo.player@trakfootball.com  / TrakDemo2026!
--   Parent: demo.parent@trakfootball.com  / TrakDemo2026!
--   Club:   demo.club@trakfootball.com    / TrakDemo2026!
-- ============================================================

DO $$
DECLARE
  v_coach_id  uuid;
  v_player_id uuid;
  v_parent_id uuid;
  v_club_id   uuid;
  v_squad_player_id uuid;
  v_assessment_id   uuid;
BEGIN

  -- ── Look up user IDs by email ──────────────────────────────
  SELECT id INTO v_coach_id  FROM auth.users WHERE email = 'coach@trak.dev';
  SELECT id INTO v_player_id FROM auth.users WHERE email = 'player@trak.dev';
  SELECT id INTO v_parent_id FROM auth.users WHERE email = 'parent@trak.dev';
  SELECT id INTO v_club_id   FROM auth.users WHERE email = 'club@trak.dev';

  IF v_coach_id IS NULL THEN RAISE EXCEPTION 'Coach account not found — run dev setup first'; END IF;
  IF v_player_id IS NULL THEN RAISE EXCEPTION 'Player account not found — run dev setup first'; END IF;
  IF v_parent_id IS NULL THEN RAISE EXCEPTION 'Parent account not found — run dev setup first'; END IF;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Club account not found — run dev setup first'; END IF;

  -- ── Profiles ───────────────────────────────────────────────
  INSERT INTO public.profiles (user_id, role, full_name, nationality)
  VALUES
    (v_coach_id,  'coach',  'Alex Martinez',   'Spanish'),
    (v_player_id, 'player', 'Jamie Wilson',     'British'),
    (v_parent_id, 'parent', 'Sarah Wilson',     'British'),
    (v_club_id,   'club',   'David Thompson',   'British')
  ON CONFLICT (user_id) DO UPDATE
    SET full_name   = EXCLUDED.full_name,
        nationality = EXCLUDED.nationality,
        role        = EXCLUDED.role;

  -- ── Coach details ──────────────────────────────────────────
  INSERT INTO public.coach_details (user_id, current_club, team, coach_role)
  VALUES (v_coach_id, 'City FC Academy', 'U15 Wildcats', 'Head Coach')
  ON CONFLICT (user_id) DO UPDATE
    SET current_club = EXCLUDED.current_club,
        team         = EXCLUDED.team,
        coach_role   = EXCLUDED.coach_role;

  -- ── Player details ─────────────────────────────────────────
  INSERT INTO public.player_details (user_id, position, current_club, age_group, shirt_number, date_of_birth)
  VALUES (v_player_id, 'Midfielder', 'City FC Academy', 'U15', 8, '2011-03-14')
  ON CONFLICT (user_id) DO UPDATE
    SET position     = EXCLUDED.position,
        current_club = EXCLUDED.current_club,
        age_group    = EXCLUDED.age_group,
        shirt_number = EXCLUDED.shirt_number;

  -- ── Squad player (links coach → player) ───────────────────
  INSERT INTO public.squad_players
    (coach_user_id, player_name, position, age, shirt_number, linked_player_id)
  VALUES
    (v_coach_id, 'Jamie Wilson',   'Midfielder', 15, 8,  v_player_id),
    (v_coach_id, 'Marcus Green',   'Forward',    15, 9,  NULL),
    (v_coach_id, 'Liam Patel',     'Defender',   14, 4,  NULL),
    (v_coach_id, 'Owen Davies',    'Goalkeeper', 15, 1,  NULL),
    (v_coach_id, 'Noah Fernandez', 'Midfielder', 14, 6,  NULL),
    (v_coach_id, 'Ethan Brooks',   'Defender',   15, 5,  NULL),
    (v_coach_id, 'Tyler Hassan',   'Forward',    14, 11, NULL)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_squad_player_id;

  -- Get Jamie's squad_player_id specifically
  SELECT id INTO v_squad_player_id
  FROM public.squad_players
  WHERE coach_user_id = v_coach_id AND linked_player_id = v_player_id
  LIMIT 1;

  -- ── Match history for Jamie ────────────────────────────────
  INSERT INTO public.matches
    (user_id, opponent, team_score, opponent_score, competition, venue,
     position, age_group, minutes_played, goals, assists, card_received,
     body_condition, self_rating, computed_rating, created_at)
  VALUES
    (v_player_id, 'Riverside United',  2, 0, 'League',   'Home', 'Midfielder', 'U15', 90, 1, 1, 'None', 'Good',    'Good',    8.2, NOW() - INTERVAL '56 days'),
    (v_player_id, 'Eastfield Rangers', 1, 1, 'League',   'Away', 'Midfielder', 'U15', 90, 0, 1, 'None', 'Good',    'Good',    7.4, NOW() - INTERVAL '49 days'),
    (v_player_id, 'North Town FC',     3, 1, 'Cup',      'Home', 'Midfielder', 'U15', 90, 0, 2, 'None', 'Great',   'Great',   8.6, NOW() - INTERVAL '42 days'),
    (v_player_id, 'Valley Athletic',   0, 2, 'League',   'Away', 'Midfielder', 'U15', 75, 0, 0, 'None', 'Average', 'Average', 6.1, NOW() - INTERVAL '35 days'),
    (v_player_id, 'Southgate City',    2, 1, 'League',   'Home', 'Midfielder', 'U15', 90, 1, 0, 'None', 'Good',    'Good',    7.8, NOW() - INTERVAL '28 days'),
    (v_player_id, 'Brookfield SC',     1, 0, 'Cup',      'Away', 'Midfielder', 'U15', 90, 0, 1, 'None', 'Good',    'Good',    7.5, NOW() - INTERVAL '21 days'),
    (v_player_id, 'Hartwell Rovers',   2, 2, 'League',   'Home', 'Midfielder', 'U15', 90, 1, 0, 'None', 'Good',    'Good',    7.2, NOW() - INTERVAL '14 days'),
    (v_player_id, 'Westmoor Youth',    3, 0, 'Friendly', 'Home', 'Midfielder', 'U15', 90, 0, 1, 'None', 'Great',   'Great',   8.4, NOW() - INTERVAL '7 days')
  ON CONFLICT DO NOTHING;

  -- ── Coach assessment for Jamie ─────────────────────────────
  INSERT INTO public.coach_assessments
    (coach_user_id, squad_player_id, work_rate, tactical, attitude,
     technical, physical, coachability, created_at)
  VALUES
    (v_coach_id, v_squad_player_id, 8.0, 7.0, 8.5, 7.5, 8.0, 9.0, NOW() - INTERVAL '10 days')
  RETURNING id INTO v_assessment_id;

  -- Assessment note
  INSERT INTO public.coach_assessment_notes (assessment_id, note)
  VALUES (v_assessment_id,
    'Jamie has shown real leadership qualities this month. His work rate in the press is excellent and his attitude in training sets the tone for the group. Technically he needs to work on his weak foot but his positional awareness has improved significantly. Keep it up.')
  ON CONFLICT DO NOTHING;

  -- Second assessment (earlier)
  INSERT INTO public.coach_assessments
    (coach_user_id, squad_player_id, work_rate, tactical, attitude,
     technical, physical, coachability, created_at)
  VALUES
    (v_coach_id, v_squad_player_id, 7.5, 6.5, 8.0, 7.0, 7.5, 8.5, NOW() - INTERVAL '38 days')
  ON CONFLICT DO NOTHING;

  -- ── Recognition award ──────────────────────────────────────
  INSERT INTO public.recognition_awards
    (coach_user_id, squad_player_id, award_type, awarded_for, note, created_at)
  VALUES
    (v_coach_id, v_squad_player_id, 'player_of_week', 'vs North Town FC (Cup)',
     'Two assists and covered every blade of grass. Exactly the standard we expect.',
     NOW() - INTERVAL '41 days')
  ON CONFLICT DO NOTHING;

  -- ── Parent → player link ───────────────────────────────────
  INSERT INTO public.player_parent_links (player_user_id, parent_user_id)
  VALUES (v_player_id, v_parent_id)
  ON CONFLICT DO NOTHING;

  -- ── Club: set invite code on coach profile ─────────────────
  UPDATE public.profiles
  SET invite_code = 'TRK-DEMO1'
  WHERE user_id = v_coach_id AND (invite_code IS NULL OR invite_code = '');

  RAISE NOTICE 'Demo seed complete. All four accounts populated.';
END $$;
