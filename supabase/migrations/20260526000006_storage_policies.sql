-- ============================================================
-- Storage policies
-- 1. Allow users to delete their own avatar
-- 2. Disable public bucket listing on avatars bucket
-- ============================================================

-- Allow authenticated users to delete their own avatar files.
-- Avatar files are stored under a folder matching their user_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Users can delete own avatar'
  ) THEN
    CREATE POLICY "Users can delete own avatar"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Disable public listing of the avatars bucket
-- (individual files remain accessible via their URL)
UPDATE storage.buckets
  SET public = false
  WHERE id = 'avatars' AND public = true;
