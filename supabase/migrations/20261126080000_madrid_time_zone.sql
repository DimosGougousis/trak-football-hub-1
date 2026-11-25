-- An academy can run on Madrid time (Spain), beside Dubai and Athens (TRAK-175). Imad, 26 Nov 2026: DC Eleven plays in
-- Marbella. The list stays closed: it is the zones the calendar feed can describe (supabase/functions/_shared/
-- ical-feed.ts), which this change extends too. Nothing else in the database names a zone; academy_time_zone() and every
-- deadline read the setting.

ALTER TABLE public.organizations
  DROP CONSTRAINT organizations_time_zone_supported,
  ADD CONSTRAINT organizations_time_zone_supported CHECK (time_zone IN ('Asia/Dubai', 'Europe/Athens', 'Europe/Madrid'));
