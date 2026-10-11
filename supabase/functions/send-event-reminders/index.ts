// TRAK-136 (J8.13): see handler.ts. The service-role client reaches the
// reminders only through claim_event_reminders() and finish_event_reminder();
// RESEND_API_KEY and EMAIL_FROM are the J8.3 secrets. The caller gets 202 at
// once and the sending carries on in the background.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sendPlainEmail } from '../_shared/send-email.ts';
import { json, keyValues } from '../send-roster-invites/handler.ts';
import { handleReminderRequest } from './handler.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;

serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const secretRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
    const secretKey = secretRaw ? (JSON.parse(secretRaw) as Record<string, string>).default : undefined;
    if (!url || !secretKey) {
      console.error('send-event-reminders: credentials are not configured');
      return json({ accepted: false, error: 'Email is not configured yet' }, 500);
    }
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const sender = { apiKey: Deno.env.get('RESEND_API_KEY') ?? '', from: Deno.env.get('EMAIL_FROM') ?? '', fetch };
    const must = <T>({ data, error }: { data: T; error: unknown }): T => {
      if (error) throw new Error('database call failed');
      return data;
    };

    const { response, work } = await handleReminderRequest(req, {
      secretKeys: keyValues(secretRaw),
      cronToken: Deno.env.get('TRAK_CRON_TOKEN')?.trim() ?? '',
      async claim() {
        return must(await admin.rpc('claim_event_reminders')) ?? [];
      },
      async finish(userId, day, outcome, eventCount, providerId, error) {
        must(await admin.rpc('finish_event_reminder', {
          p_user_id: userId, p_day: day, p_status: outcome, p_event_count: eventCount,
          p_provider_id: providerId, p_error: error }));
      },
      send: message => sendPlainEmail(message, sender),
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });

    if (work) {
      // Counts only: no addresses, subjects or provider messages.
      const logged = work
        .then(report => console.info('send-event-reminders: outcome', report))
        .catch(() => console.error('send-event-reminders: run failed; claimed reminders are taken back after 10 minutes'));
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(logged);
      else await logged;
    }
    return response;
  } catch {
    console.error('send-event-reminders: initialization failed');
    return json({ accepted: false, error: 'Email delivery is unavailable' }, 500);
  }
});
