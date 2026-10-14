-- TRAK-164 follow-up (J8): families read events only through child_events().
--
-- The policy "Family reads published squad events with consent" let any
-- linked player or guardian select coach_calendar_events directly through the
-- API, every column included: the coach-only notes and the raw cancel reason.
-- child_events() (SECURITY DEFINER) already gives families what they may see:
-- that child's consent, the squad and academy rule, published only, never
-- notes, and a cancel reason only when it names no squad child and holds no
-- link (TRAK-164). Since #285 every family screen reads through it, so the
-- policy is dropped and the function becomes the one family read path.
-- Decided 12 Oct (Imad). Prod had 0 events with notes (read-only), so nothing
-- leaked. Coaches keep reading their own events through "Coaches can select
-- own events"; the calendar feed, emails and register use their own
-- SECURITY DEFINER functions.

DROP POLICY "Family reads published squad events with consent" ON public.coach_calendar_events;
