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
  const { signUp } = useAuth();

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    supabase
      .rpc('get_parent_invite_by_token', { p_token: token })
      .maybeSingle()
      .then(({ data }) => {
        setInvite(data);
        if (data) setEmail(data.parent_email);
        setLoading(false);
      });
  }, [token]);

  if (loading) return <div className="app-container p-6 text-foreground">Loading...</div>;

  if (!token || !invite) {
    return (
      <div className="app-container flex flex-col items-center justify-center px-6 py-12 min-h-screen">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <IconAlerts size={28} color="hsl(var(--destructive))" />
        </div>
        <h1 className="text-2xl text-foreground mb-4">Invalid Invite</h1>
        <p className="text-muted-foreground text-center text-sm mb-6">
          This invite link is invalid or has expired. Ask your child to send you a new invite.
        </p>
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
      // Pass pendingProfile so AuthContext.writeProfileFromPendingData handles
      // profile creation and link_parent_to_players_by_email after email
      // confirmation — direct DB calls here fail because auth.uid() is null
      // until the user has confirmed their email and the session is active.
      const { error } = await signUp(email, password, {
        role: 'parent',
        full_name: name,
        nationality: null,
      });
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
      <p className="text-muted-foreground text-sm mb-6">You've been invited to follow a player's journey</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required className="bg-card" />
        <Input type="email" value={email} readOnly className="bg-muted cursor-not-allowed" />
        <Input type="password" placeholder={PASSWORD_HINT} value={password} onChange={e => setPassword(e.target.value)} required className="bg-card" />
        <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="bg-card" />
        <Button type="submit" disabled={submitting} className="w-full mt-2">
          {submitting ? 'Creating...' : 'Create Account'}
        </Button>
      </form>
    </div>
  );
};

export default ParentOnboarding;
