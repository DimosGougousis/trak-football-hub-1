// TRAK-482: the parent invitation page's "Send sign-in link", for a parent who
// isn't signed in. See handler.ts for who may be emailed and why.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json } from '../send-parent-invite/handler.ts';
import { corsHeaders, handleInviteCodeRequest } from './handler.ts';

const defaultKey = (raw: string | undefined): string | undefined => {
  try { return (JSON.parse(raw ?? '') as Record<string, string>).default || undefined; } catch { return undefined; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretKey = defaultKey(Deno.env.get('SUPABASE_SECRET_KEYS'));
    const publishableKey = defaultKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://trakfootball.com';
    if (!url || !secretKey || !publishableKey) {
      console.error('send-parent-invite-code: email credentials are not configured');
      return json({ sent: false, reason: 'not_configured' }, 500);
    }

    const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(url, secretKey, clientOptions);
    const publicAuth = createClient(url, publishableKey, clientOptions);

    const response = await handleInviteCodeRequest(req, {
      siteUrl,
      async findInvite(token) {
        return await admin.from('parent_invites')
          .select('parent_email, status, expires_at, player_user_id').eq('invite_token', token).maybeSingle();
      },
      async getPlayerName(playerUserId) {
        const { data } = await admin.from('profiles').select('full_name').eq('user_id', playerUserId).maybeSingle();
        return data?.full_name ?? null;
      },
      // invited_by: 'player' picks invite-parent.html's "<name> has invited you" version.
      async sendInvite(email, redirectTo, metadata) {
        return await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: metadata });
      },
      async labelAccount(email, metadata) {
        // ponytail: one page of 1,000 accounts, as send-parent-invite; page through when prod passes that.
        const { data: page } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const account = page?.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
        if (account) await admin.auth.admin.updateUserById(account.id, { user_metadata: metadata });
        else console.warn('send-parent-invite-code: existing account not found for the sign-in email');
      },
      async sendMagicLink(email, redirectTo) {
        return await publicAuth.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
      },
    });
    // Outcomes only: no addresses, tokens or provider messages.
    const outcome = await response.clone().json();
    console.info('send-parent-invite-code: outcome', { status: response.status, sent: outcome.sent, reason: outcome.reason, via: outcome.via });
    return response;
  } catch {
    console.error('send-parent-invite-code: delivery initialization failed');
    return json({ sent: false, reason: 'unavailable' }, 500);
  }
});
