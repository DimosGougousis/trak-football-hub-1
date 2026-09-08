-- Add avatar_url column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create a public avatars storage bucket (5 MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload/replace their own avatar (path = user_id)
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'avatars' AND name = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

-- Public read — avatar URLs are embedded in the passport and visible to coaches/parents
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
