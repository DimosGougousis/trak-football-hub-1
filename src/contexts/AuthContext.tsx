import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';
import { setTelemetryRole, trackSessionOpen } from '@/lib/telemetry';

type UserRole = 'player' | 'coach' | 'parent' | 'club';
const PENDING_PROFILE_KEY = 'trak_pending_profile';

interface PendingProfileData {
  role: UserRole;
  full_name: string;
  nationality: string | null;
  player_details?: {
    date_of_birth: string;
    position: string;
    current_club: string;
    age_group: string;
    shirt_number: number | null;
  };
  coach_details?: {
    current_club: string;
    team: string;
    coach_role: string;
    academy_code?: string;
  };
  club_details?: {
    academy_name: string;
  };
  parent_email?: string | null;
  coach_invite_code?: string | null;
}

interface Profile {
  id: string;
  user_id: string;
  role: UserRole;
  full_name: string;
  nationality: string | null;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, pendingProfile?: PendingProfileData) => Promise<{ user: User | null; error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

/** Write pending onboarding data from localStorage to Supabase */
const isValidRole = (value: unknown): value is UserRole => value === 'player' || value === 'coach' || value === 'parent' || value === 'club';

const parsePendingProfile = (value: unknown): PendingProfileData | null => {
  if (!value || typeof value !== 'object') return null;

  const data = value as Record<string, unknown>;
  if (!isValidRole(data.role) || typeof data.full_name !== 'string') return null;

  return {
    role: data.role,
    full_name: data.full_name,
    nationality: typeof data.nationality === 'string' ? data.nationality : null,
    player_details: data.player_details as PendingProfileData['player_details'] | undefined,
    coach_details: data.coach_details as PendingProfileData['coach_details'] | undefined,
    club_details: data.club_details as PendingProfileData['club_details'] | undefined,
    parent_email: typeof data.parent_email === 'string' ? data.parent_email : null,
    coach_invite_code: typeof data.coach_invite_code === 'string' ? data.coach_invite_code : null,
  };
};

const readPendingProfileFromLocalStorage = (): PendingProfileData | null => {
  const raw = localStorage.getItem(PENDING_PROFILE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Expire onboarding data after 24 hours to avoid stale state
    if (parsed._savedAt && Date.now() - parsed._savedAt > 86_400_000) {
      localStorage.removeItem(PENDING_PROFILE_KEY);
      return null;
    }
    return parsePendingProfile(parsed);
  } catch {
    return null;
  }
};

const readPendingProfileFromMetadata = (user: User): PendingProfileData | null => {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  return parsePendingProfile(metadata?.trak_onboarding);
};

async function writeProfileFromPendingData(userId: string, data: PendingProfileData): Promise<Profile | null> {
  // All provisioning happens server-side in ONE atomic SECURITY DEFINER RPC.
  // This fixes: club profile creation (blocked by RLS for direct inserts),
  // player→coach linking, parent→child linking, and partial-failure states.
  const { data: result, error } = await supabase.rpc('provision_my_profile' as any, {
    p: data as unknown as Record<string, unknown>,
  });
  if (error) throw error;

  // Surface non-fatal warnings (e.g. unrecognised coach/academy code)
  const warnings = (result as { warnings?: string[] } | null)?.warnings ?? [];
  for (const w of warnings) toast.warning(w, { duration: 8000 });

  const { data: newProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (newProfile as unknown as Profile | null);
}

async function clearPendingProfile() {
  localStorage.removeItem(PENDING_PROFILE_KEY);
  // Clear the metadata copy too so provisioning doesn't re-run every session
  try {
    await supabase.auth.updateUser({ data: { trak_onboarding: null } });
  } catch {
    // Non-critical — provisioning is idempotent if this fails
  }
}

async function writePendingProfile(user: User): Promise<Profile | null> {
  const data = readPendingProfileFromLocalStorage() || readPendingProfileFromMetadata(user);
  if (!data) return null;

  try {
    const created = await writeProfileFromPendingData(user.id, data);
    if (created) await clearPendingProfile();
    return created;
  } catch (err: any) {
    console.error('Failed to write pending profile:', err);
    toast.error(`Account setup hit a problem: ${err?.message || 'unknown error'}. Pull to refresh or sign in again to retry.`);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrCreateProfile = async (currentUser: User) => {
    // Try to fetch existing profile
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (data) {
      // Repair path: if pending onboarding data was never cleared, a previous
      // provisioning run failed partway (e.g. profile created but details/org/
      // links missing). Re-run it — the RPC is idempotent.
      const pending = readPendingProfileFromLocalStorage() || readPendingProfileFromMetadata(currentUser);
      if (pending && pending.role === (data as { role: string }).role) {
        void writePendingProfile(currentUser);
      }
      setProfile(data as unknown as Profile);
      return;
    }

    // No profile — try writing pending data from localStorage or auth metadata
    const created = await writePendingProfile(currentUser);
    setProfile(created);
  };

  const refreshProfile = async () => {
    if (user) await fetchOrCreateProfile(user);
  };

  useEffect(() => {
    const hydrate = async (currentUser: User | null) => {
      if (!currentUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        await fetchOrCreateProfile(currentUser);
      } finally {
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // On the reset password page, suppress all auth redirects so the
      // form stays visible. ResetPassword.tsx handles its own auth events.
      if (window.location.pathname === '/reset-password') {
        if (event === 'PASSWORD_RECOVERY') return;
        if (event === 'SIGNED_IN') return;
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        window.location.replace('/');
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/reset-password');
        return;
      }

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoading(true);
      void hydrate(currentUser);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      // If we're on the reset password page, don't auto-redirect — let
      // the ResetPassword component handle the PASSWORD_RECOVERY event.
      if (window.location.pathname === '/reset-password') {
        setLoading(false);
        return;
      }
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoading(true);
      void hydrate(currentUser);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Pilot instrumentation. One place, so every sign-in path is covered:
  // the role stamps subsequent events, and `app_opened` fires once per
  // browser session — the sole source for the week-6 return metrics.
  useEffect(() => {
    setTelemetryRole(profile?.role ?? null);
    if (user && profile) trackSessionOpen(user.id, profile.role);
  }, [user?.id, profile?.role]);

  const signUp = async (email: string, password: string, pendingProfile?: PendingProfileData) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        ...(pendingProfile ? { data: { trak_onboarding: pendingProfile } } : {}),
      },
    });

    if (error && /already registered|already exists|user exists/i.test(error.message)) {
      return { user: null, error: new Error('An account with this email already exists. Please sign in instead.') };
    }

    return { user: data.user, error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
