-- TRAK-200 (Imad, 18 Oct): a draft assessment's bands must not reach the
-- player or their parents. Until now "Save draft" only held back the message
-- (coach_shared_feedback.published_at); the six bands were readable by the
-- family the moment they were saved.
--
-- published_at NULL = draft: only the coach who wrote it reads it. Publish
-- sets it, Unpublish clears it. The default keeps today's behaviour for any
-- save that doesn't say (an old open tab), and every existing row is
-- backfilled, so nothing a family can see today disappears.
--
-- One restrictive policy, beside "Family reads assessments only with
-- consent" (20260927130000), so every family read through the table follows
-- it. Untouched on purpose: export_my_account / delete_my_account (a data
-- export still holds every row about the child) and the admin pilot_* views.

ALTER TABLE public.coach_assessments ADD COLUMN published_at timestamptz;
UPDATE public.coach_assessments SET published_at = coalesce(created_at, now()) WHERE published_at IS NULL;
ALTER TABLE public.coach_assessments ALTER COLUMN published_at SET DEFAULT now();

COMMENT ON COLUMN public.coach_assessments.published_at IS
  'TRAK-200: NULL = draft, readable only by its coach. Set on Publish, cleared on Unpublish.';

CREATE POLICY "Only the coach reads a draft assessment" ON public.coach_assessments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (published_at IS NOT NULL OR coach_user_id = (SELECT auth.uid()));
