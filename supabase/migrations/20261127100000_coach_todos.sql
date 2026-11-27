-- TRAK-612 (New Home 6/8, spec TRAK-606): the coach's own to-dos on Home. Kostas, 26 Nov: a dotted "Add a to-do" step
-- at the end of the To-do, with its text, a day (Today, Tomorrow or a date) and Urgent. Not linked to an event, not in
-- + Create. It shows on its day and, until ticked, every day after; a ticked one goes at the academy's midnight.
--
-- Only its coach reads, writes, ticks or removes it: no other coach, player, guardian, academy admin or anon. The
-- coach's own words, never shown to anyone else, so nothing about a child is asked for or kept here.

CREATE TABLE public.coach_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120 AND char_length(title) <= 120),
  -- The academy's day it is for.
  due_on date NOT NULL,
  urgent boolean NOT NULL DEFAULT false,
  -- When the coach ticked it; null while it waits.
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_todos_coach ON public.coach_todos (coach_user_id, due_on);
CREATE TRIGGER coach_todos_updated_at BEFORE UPDATE ON public.coach_todos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coach_todos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_todos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_todos TO authenticated;

CREATE POLICY "Coaches read their own to-dos" ON public.coach_todos
  FOR SELECT TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
CREATE POLICY "Coaches add their own to-dos" ON public.coach_todos
  FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches change their own to-dos" ON public.coach_todos
  FOR UPDATE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()))
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches remove their own to-dos" ON public.coach_todos
  FOR DELETE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
