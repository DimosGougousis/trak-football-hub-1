-- ============================================================
-- Admin-Only Tables
-- Staff compliance tracking and admin notes — managed entirely
-- by the academy admin, invisible to coaches and players.
-- ============================================================

-- ── Staff Compliance Tracking ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_level TEXT,
  license_expiry DATE,
  dbs_status TEXT CHECK (dbs_status IN ('valid', 'expired', 'pending', 'none')),
  dbs_expiry DATE,
  safeguarding_completed BOOLEAN NOT NULL DEFAULT false,
  first_aid_expiry DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, coach_user_id)
);

ALTER TABLE public.staff_compliance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages own org staff compliance"
  ON public.staff_compliance FOR SELECT TO authenticated
  USING (organization_id = public.my_organization_id());

CREATE POLICY "Admin can insert staff compliance"
  ON public.staff_compliance FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.my_organization_id());

CREATE POLICY "Admin can update staff compliance"
  ON public.staff_compliance FOR UPDATE TO authenticated
  USING (organization_id = public.my_organization_id())
  WITH CHECK (organization_id = public.my_organization_id());

CREATE POLICY "Admin can delete staff compliance"
  ON public.staff_compliance FOR DELETE TO authenticated
  USING (organization_id = public.my_organization_id());

-- ── Admin Notes ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('player', 'coach')),
  target_squad_player_id UUID REFERENCES public.squad_players(id) ON DELETE CASCADE,
  target_coach_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages own notes"
  ON public.admin_notes FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid());

CREATE POLICY "Admin can insert notes"
  ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid());

CREATE POLICY "Admin can update own notes"
  ON public.admin_notes FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid())
  WITH CHECK (admin_user_id = auth.uid());

CREATE POLICY "Admin can delete own notes"
  ON public.admin_notes FOR DELETE TO authenticated
  USING (admin_user_id = auth.uid());
