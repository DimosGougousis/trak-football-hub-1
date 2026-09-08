-- Add UNIQUE constraint on invite codes if not already present
-- Safe to re-run
-- Note: invite_code lives on public.profiles (added in 20260420000001_fix_schema_mismatches.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'profiles'
    AND indexname = 'profiles_invite_code_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;
