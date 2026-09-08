DROP POLICY IF EXISTS "Parents can insert validated links" ON public.player_parent_links;

CREATE POLICY "Parents can insert validated links"
  ON public.player_parent_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    parent_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.parent_invites pi
      WHERE pi.player_user_id = player_parent_links.player_user_id
        AND pi.status = 'pending'
        AND lower(pi.parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

DROP POLICY IF EXISTS "Parents can accept own pending invite" ON public.parent_invites;

CREATE POLICY "Parents can accept own pending invite"
  ON public.parent_invites
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND lower(parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND EXISTS (
      SELECT 1
      FROM public.player_parent_links ppl
      WHERE ppl.player_user_id = parent_invites.player_user_id
        AND ppl.parent_user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('accepted', 'pending')
    AND lower(parent_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY "Players can read own meeting requests"
  ON public.meeting_requests
  FOR SELECT
  TO authenticated
  USING (
    squad_player_id IN (
      SELECT sp.id
      FROM public.squad_players sp
      WHERE sp.linked_player_id = auth.uid()
    )
  );

CREATE POLICY "Parents can read child meeting requests"
  ON public.meeting_requests
  FOR SELECT
  TO authenticated
  USING (
    squad_player_id IN (
      SELECT sp.id
      FROM public.squad_players sp
      JOIN public.player_parent_links ppl
        ON ppl.player_user_id = sp.linked_player_id
      WHERE ppl.parent_user_id = auth.uid()
    )
  );