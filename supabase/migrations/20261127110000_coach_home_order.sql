-- TRAK-613 (New Home 7/8, spec TRAK-606): the coach's own order for Home's To-do. Kostas, 26 Nov: the coach can move
-- to-dos up and down; their order holds until midnight. Saved on the account, so the phone and the laptop agree. One row
-- per coach, academy day and squad view ('all' or the squad); a row from an earlier day is simply never read again.
--
-- Only its coach reads or writes it. It holds to-do keys ("register:<event id>", "own:<id>"), never names or words.

CREATE TABLE public.coach_home_order (
  coach_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  squad_view text NOT NULL CHECK (char_length(squad_view) BETWEEN 1 AND 40),
  item_keys text[] NOT NULL CHECK (cardinality(item_keys) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, day, squad_view)
);
CREATE TRIGGER coach_home_order_updated_at BEFORE UPDATE ON public.coach_home_order
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coach_home_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coach_home_order FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_home_order TO authenticated;

CREATE POLICY "Coaches read their own Home order" ON public.coach_home_order
  FOR SELECT TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
CREATE POLICY "Coaches save their own Home order" ON public.coach_home_order
  FOR INSERT TO authenticated
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches change their own Home order" ON public.coach_home_order
  FOR UPDATE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()))
  WITH CHECK (coach_user_id = (SELECT auth.uid()) AND public.is_coach());
CREATE POLICY "Coaches clear their own Home order" ON public.coach_home_order
  FOR DELETE TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
