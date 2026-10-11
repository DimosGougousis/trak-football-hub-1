import { supabase } from '@/integrations/supabase/client'

/**
 * TRAK-135 (J8.12): after a published event is changed or cancelled, ask the
 * server to send the emails the database has queued for it. The database
 * decides whether anything is due and who gets it; this only says "now".
 * Fire and forget: the save has already succeeded, the coach never waits on
 * email, and a call that fails leaves the emails queued for the next one.
 */
export function askToEmailFamilies(): void {
  supabase.functions.invoke('send-event-emails', { body: {} }).catch(() => {})
}
