-- ============================================================
-- Organizations Table
-- Introduces a formal academy/club entity owned by a club admin.
-- Coaches link to an org via join code; the org becomes the
-- anchor for scoped admin visibility.
-- ============================================================

-- 1. Create the organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Add organization_id to coach_details (before policies that reference it)
ALTER TABLE public.coach_details
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coach_details_org
  ON public.coach_details (organization_id)
  WHERE organization_id IS NOT NULL;

-- Admin can manage their own org
CREATE POLICY "Admin manages own org"
  ON public.organizations FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid());

CREATE POLICY "Admin can insert own org"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid());

CREATE POLICY "Admin can update own org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid())
  WITH CHECK (admin_user_id = auth.uid());

-- Coaches can read the org they belong to (needed for displaying academy name)
CREATE POLICY "Coaches can read own org"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coach_details cd
      WHERE cd.user_id = auth.uid()
        AND cd.organization_id = organizations.id
    )
  );

-- 3. Lookup RPC for coaches joining an academy by code
CREATE OR REPLACE FUNCTION public.get_org_id_by_join_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizations
  WHERE upper(join_code) = upper(p_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_id_by_join_code(text) TO authenticated;

-- 4. RPC for a coach to join an org by code
CREATE OR REPLACE FUNCTION public.join_organization(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE upper(join_code) = upper(p_code);

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invalid academy code';
  END IF;

  UPDATE public.coach_details
  SET organization_id = v_org_id
  WHERE user_id = auth.uid();

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_organization(text) TO authenticated;

-- 5. Helper to get current user's organization id
CREATE OR REPLACE FUNCTION public.my_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizations
  WHERE admin_user_id = auth.uid()
  LIMIT 1;
$$;
