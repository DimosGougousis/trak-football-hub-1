-- TRAK-525 (Reports 2/10, Imad 21 Nov): the season plan's rhythm adds every 3 months, every 6 months and Custom.
-- The rhythm stays one text column: 'month', '3m', '6m', or Custom as its number of weeks, '2w' to '26w'. The plans
-- saved as every 2 or 6 weeks ('2w', '6w') stay valid and keep their dates, now as Custom. The shared copy takes the
-- same values (share_season_plan() copies eval_every as it is), so no column or function changes.
ALTER TABLE public.season_plans
  DROP CONSTRAINT season_plans_eval_every_check,
  ADD CONSTRAINT season_plans_eval_every_check
    CHECK (eval_every IN ('month', '3m', '6m') OR eval_every ~ '^([2-9]|1[0-9]|2[0-6])w$'),
  DROP CONSTRAINT season_plans_shared_eval_every_check,
  ADD CONSTRAINT season_plans_shared_eval_every_check
    CHECK (shared_eval_every IN ('month', '3m', '6m') OR shared_eval_every ~ '^([2-9]|1[0-9]|2[0-6])w$');
