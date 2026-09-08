CREATE POLICY "Parents can read own invites by email"
  ON public.parent_invites
  FOR SELECT
  TO authenticated
  USING (
    lower(parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "Players can update own wellness"
  ON public.wellness_logs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Players can delete own wellness"
  ON public.wellness_logs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Players can delete own matches"
  ON public.matches
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());