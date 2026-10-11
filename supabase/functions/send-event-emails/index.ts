// TRAK-135 (J8.12): see handler.ts. The service-role client reaches the
// notices only through the claim/record/finish functions; RESEND_API_KEY and
// EMAIL_FROM are the J8.3 secrets. The caller gets 202 at once and the
// sending carries on in the background, so a coach never waits on email.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendPlainEmail } from '../_shared/send-email.ts';
import { json, keyValues } from '../send-roster-invites/handler.ts';
import { handleEventEmailRequest } from './handler.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;

serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
    const secretKey = secretRaw ? (JSON.parse(secretRaw) as Record<string, string>).default : undefined;
    if (!url || !secretKey) {
      console.error('send-event-emails: credentials are not configured');
      return json({ accepted: false, error: 'Email is not configured yet' }, 500);
    }
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const sender = { apiKey: Deno.env.get('RESEND_API_KEY') ?? '', from: Deno.env.get('EMAIL_FROM') ?? '', fetch };
    const must = <T>({ data, error }: { data: T; error: unknown }): T => {
      if (error) throw new Error('database call failed');
      return data;
    };

    const { response, work } = await handleEventEmailRequest(req, {
      secretKeys: keyValues(secretRaw),
      async getCaller(jwt) {
        const { data, error } = await admin.auth.getUser(jwt);
        return { data: data.user, error };
      },
      async isCoach(userId) {
        const { data } = await admin.from('profiles').select('role').eq('user_id', userId).maybeSingle();
        return data?.role === 'coach';
      },
      async waitSeconds() {
        const wait = must(await admin.rpc('event_change_notices_wait'));
        return wait === null ? null : Number(wait);
      },
      async claim() {
        return must(await admin.rpc('claim_event_change_notices')) ?? [];
      },
      async recordDelivery(noticeIds, userId, providerId) {
        must(await admin.rpc('record_event_change_delivery', {
          p_notice_ids: noticeIds, p_recipient_user_id: userId, p_provider_id: providerId }));
      },
      async finish(noticeId, outcome, failed, error) {
        must(await admin.rpc('finish_event_change_notice', {
          p_notice_id: noticeId, p_status: outcome, p_failed: failed, p_error: error }));
      },
      send: message => sendPlainEmail(message, sender),
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });

    if (work) {
      // Counts only: no addresses, subjects or provider messages.
      const logged = work
        .then(report => console.info('send-event-emails: outcome', report))
        .catch(() => console.error('send-event-emails: sweep failed; pending notices go on the next call, claimed ones are retaken after 10 minutes'));
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(logged);
      else await logged;
    }
    return response;
  } catch {
    console.error('send-event-emails: initialization failed');
    return json({ accepted: false, error: 'Email delivery is unavailable' }, 500);
  }
});
