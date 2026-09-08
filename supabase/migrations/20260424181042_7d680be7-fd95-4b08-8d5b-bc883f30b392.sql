CREATE POLICY "Players can read own attendance"
ON public.session_attendance
FOR SELECT
TO authenticated
USING (
  squad_player_id IN (
    SELECT sp.id
    FROM public.squad_players sp
    WHERE sp.linked_player_id = auth.uid()
  )
);