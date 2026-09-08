-- Allow players to SELECT their own coach assessment notes.
-- Previously notes were coach-only. Now the player feedback feature
-- needs players to read notes for assessments linked to their squad_player record.
-- Coaches still have exclusive write access — this only adds player read.

CREATE POLICY "Players can read notes for their own assessments"
  ON public.coach_assessment_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_assessments ca
      JOIN public.squad_players sp ON ca.squad_player_id = sp.id
      WHERE ca.id = coach_assessment_notes.assessment_id
        AND sp.linked_player_id = auth.uid()
    )
  );
