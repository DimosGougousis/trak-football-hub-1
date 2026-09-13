import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { IconAlerts } from '@/components/icons/TrakIcons';
import { validatePassword, PASSWORD_HINT } from '@/lib/password'

const ParentOnboarding = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { signUp, user } = useAuth();

  // A parent who arrives from the emailed invitation is already signed in —
  // Supabase created their account when it sent the invite. They only need to
  // set a password, not register from scratch. A parent who was handed the
  // link some other way is not signed in and registers normally.
  const isInvitedSession = Boolean(user);

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Two ways to resolve the invitation, and the second one matters more than it
  // looks. The token in the URL is lost whenever a link is resent from the
  // Supabase dashboard, forwarded, truncated by a mail client, or opened on
  // another device. A signed-in parent is then stranded: authenticated, no
  // profile, no role, no link to their child. So fall back to matching their
  // own verified email against pending invites, which is the same key the
  // linking already uses.
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (token) {
        const { data } = await supabase
          .rpc('get_parent_invite_by_token', { p_token: token })
          .maybeSingle();
        if (!cancelled && data) {
          setInvite(data);
          setEmail((data as { parent_email: string }).parent_email);
          setLoading(false);
          return;
        }
      }

      if (user) {
        // `as any`: generated types predate this migration.
        const { data } = await (supabase.rpc as any)('get_my_pending_parent_invite');
        const row = (data as { parent_email: string }[] | null)?.[0] ?? null;
        if (!cancelled && row) {
          setInvite(row);
          setEmail(row.parent_email);
          setLoading(false);
          return;
        }
      }

      if (!cancelled) setLoading(false);
    };

    void resolve();
    return () => { cancelled = true };
  }, [token, user]);

  if (loading) return <div className="app-container p-6 text-foreground">Loading...</div>;

  if (!invite) {
    return (
      <div className="app-container flex flex-col items-center justify-center px-6 py-12 min-h-screen">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <IconAlerts size={28} color="hsl(var(--destructive))" />
        </div>
        <h1 className="text-2xl text-foreground mb-4">No invitation found</h1>
        <p className="text-muted-foreground text-center text-sm mb-6">
          {user
            ? "We couldn't find an invitation for this email address. It may have already been used, or the invitation may have been sent to a different address."
            : 'This invite link is invalid or has expired. Ask your child to send you a new invite.'}
        </p>
        {user && (
          <p className="text-muted-foreground/70 text-center text-xs mb-6 max-w-[300px]">
            Signed in as {user.email}
          </p>
        )}
        <a href="/" className="text-primary text-sm font-semibold">← Back to home</a>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    const pwError = validatePassword(password); if (pwError) { toast.error(pwError); return; }

    setSubmitting(true);
    try {
      const pendingProfile = {
        role: 'parent' as const,
        full_name: name,
        nationality: null,
      };

      if (isInvitedSession) {
        // Already authenticated from the invite link: set the password on the
        // existing account, then provision. The session is live, so auth.uid()
        // resolves and the RPC can link them to their child immediately.
        const { error: pwdError } = await supabase.auth.updateUser({
          password,
          data: { trak_onboarding: pendingProfile },
        });
        if (pwdError) throw pwdError;

        const { error: rpcError } = await supabase.rpc(
          'provision_my_profile' as any,
          { p: pendingProfile as unknown as Record<string, unknown> },
        );
        if (rpcError) throw rpcError;

        toast.success('Account ready');
        navigate('/parent/consent', { replace: true });
        return;
      }

      // Pass pendingProfile so AuthContext.writeProfileFromPendingData handles
      // profile creation and link_parent_to_players_by_email after email
      // confirmation — direct DB calls here fail because auth.uid() is null
      // until the user has confirmed their email and the session is active.
      const { error } = await signUp(email, password, pendingProfile);
      if (error) throw error;

      toast.success('Account created! Check your email to verify.');
      navigate('/parent/home', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container px-6 py-8">
      <h1 className="text-2xl text-foreground mb-1">Parent Registration</h1>
      <p className="text-muted-foreground text-sm mb-6">
        {isInvitedSession
          ? "Set a password, then approve your child's account"
          : "You've been invited to follow a player's journey"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required className="bg-card" />
        <Input type="email" value={email} readOnly className="bg-muted cursor-not-allowed" />
        <Input type="password" placeholder={PASSWORD_HINT} value={password} onChange={e => setPassword(e.target.value)} required className="bg-card" />
        <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="bg-card" />
        <Button type="submit" disabled={submitting} className="w-full mt-2">
          {submitting ? 'Saving...' : isInvitedSession ? 'Continue' : 'Create Account'}
        </Button>
      </form>
    </div>
  );
};

export default ParentOnboarding;
