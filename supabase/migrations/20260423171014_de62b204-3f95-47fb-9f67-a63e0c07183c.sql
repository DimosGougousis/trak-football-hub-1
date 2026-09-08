-- Seed parent_invite + link for dev parent (Sarah Wilson) to dev player (Jamie Wilson)
INSERT INTO public.parent_invites (player_user_id, parent_email, status)
VALUES ('4658ae91-352c-41ac-8f15-ee8c0ea6d98c', 'sarah.wilson@example.com', 'accepted')
ON CONFLICT DO NOTHING;

INSERT INTO public.player_parent_links (parent_user_id, player_user_id)
SELECT '296bd672-9020-40de-8803-77b45e896c6f', '4658ae91-352c-41ac-8f15-ee8c0ea6d98c'
WHERE NOT EXISTS (
  SELECT 1 FROM public.player_parent_links
  WHERE parent_user_id = '296bd672-9020-40de-8803-77b45e896c6f'
    AND player_user_id = '4658ae91-352c-41ac-8f15-ee8c0ea6d98c'
);