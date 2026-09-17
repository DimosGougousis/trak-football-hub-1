-- Guarded on the dev coach existing. These rows reference an auth user that
-- exists only in the original project. Unguarded, they are orphans on any fresh
-- database, and 20260425000001_security_hardening then fails adding
-- squad_players_coach_user_id_fkey. Found standing up the dev project, 2026-09-17.
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'f9f4f14c-4a87-4fca-bde5-f316d12f2a6e') THEN
    INSERT INTO public.squad_players (coach_user_id, player_name, position, shirt_number, age) VALUES
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Liam O''Connor', 'Goalkeeper', 1, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Marcus Chen', 'Defender', 2, 15),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Diego Hernandez', 'Defender', 4, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Tomás Silva', 'Defender', 5, 15),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Noah Williams', 'Defender', 3, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Kai Nakamura', 'Midfielder', 6, 15),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Ethan Brooks', 'Midfielder', 8, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Samir Patel', 'Midfielder', 10, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Lucas Dubois', 'Midfielder', 14, 15),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Jude Bellamy', 'Attacker', 7, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Mateo Rossi', 'Attacker', 9, 16),
    ('f9f4f14c-4a87-4fca-bde5-f316d12f2a6e', 'Finn Murphy', 'Attacker', 11, 15);
  END IF;
END
$seed$;
