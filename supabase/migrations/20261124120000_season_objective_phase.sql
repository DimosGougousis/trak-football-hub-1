-- Season plan pitch-ready page (Tarek, 24 Nov): each season objective may name its phase of play, for the coach's
-- objective cards. Coach-only for now: players and families read the shared snapshot (shared_title,
-- shared_looks_like), which has no phase, so a phase change never waits under "Not shared yet"
-- (note_season_objective_change watches title, looks_like and status only). Existing table grants and row
-- security already cover the new column.
ALTER TABLE public.season_objectives
  ADD COLUMN phase text CHECK (phase IN ('in_possession', 'out_of_possession', 'transition', 'set_pieces'));
