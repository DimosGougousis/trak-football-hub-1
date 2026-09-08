CREATE POLICY "Parents can read linked child profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT ppl.player_user_id
    FROM public.player_parent_links ppl
    WHERE ppl.parent_user_id = auth.uid()
  )
);

CREATE POLICY "Parents can read linked child coach profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT sp.coach_user_id
    FROM public.squad_players sp
    JOIN public.player_parent_links ppl
      ON ppl.player_user_id = sp.linked_player_id
    WHERE ppl.parent_user_id = auth.uid()
  )
);

CREATE POLICY "Parents can read linked child details"
ON public.player_details
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT ppl.player_user_id
    FROM public.player_parent_links ppl
    WHERE ppl.parent_user_id = auth.uid()
  )
);

CREATE POLICY "Parents can read linked child matches"
ON public.matches
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT ppl.player_user_id
    FROM public.player_parent_links ppl
    WHERE ppl.parent_user_id = auth.uid()
  )
);