// TRAK-482: "Send sign-in link" on a child's parent invitation (/parent-invite?token=…).
// The parent isn't signed in, so the browser can't save on their account which
// child invited them, and the code email (Magic link template) would say only
// "Sign in to Trak" or name a child the academy added earlier. This function
// does what send-parent-invite does when the child sends the invitation: a new
// account gets the invitation email naming the child, and an existing account
// is labelled first (invitedByChild), then gets the sign-in code.
//
// It acts only when the invitation token and the typed email match one
// pending, unexpired invitation, so it emails only the address the child
// already invited. Anything else answers "no_match" and sends nothing; the page
// then asks Auth for a plain code, as before this function. "no_match" tells
// only someone holding the invitation's secret token whether they typed the
// invited address. Codes keep Auth's own per-address limits.
import { corsHeaders, invitedByChild, json, type InvitedByChild } from '../send-parent-invite/handler.ts';

export { corsHeaders };

interface DeliveryError { message: string; code?: string; status?: number }
export interface TokenInvite { parent_email: string; status: string; expires_at: string; player_user_id: string }
export interface InviteCodeDependencies {
  siteUrl: string;
  /** The invitation with this token (service key; the caller has no session). */
  findInvite(token: string): Promise<{ data: TokenInvite | null; error: DeliveryError | null }>;
  /** The inviting player's full name. A failed read sends the email without it ("Your child"). */
  getPlayerName(playerUserId: string): Promise<string | null>;
  sendInvite(email: string, redirectTo: string, metadata: InvitedByChild): Promise<{ error: DeliveryError | null }>;
  labelAccount(email: string, metadata: InvitedByChild): Promise<void>;
  sendMagicLink(email: string, redirectTo: string): Promise<{ error: DeliveryError | null }>;
  now?: () => number;
}

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const alreadyRegistered = (e: DeliveryError) => e.code === 'email_exists' || e.code === 'user_already_exists' ||
  /already.*registered|already.*exists|already been registered/i.test(e.message);

export async function handleInviteCodeRequest(req: Request, deps: InviteCodeDependencies): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ sent: false, reason: 'method_not_allowed' }, 405);

  let token: string; let email: string;
  try {
    const body: unknown = JSON.parse(await req.text());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => key !== 'token' && key !== 'email') ||
        typeof input.token !== 'string' || !TOKEN.test(input.token) ||
        typeof input.email !== 'string' || !input.email.includes('@') || input.email.length > 320) throw new Error('Invalid body');
    token = input.token; email = normalizeEmail(input.email);
  } catch {
    return json({ sent: false, reason: 'invalid_request' }, 400);
  }

  try {
    const { data: invite, error } = await deps.findInvite(token);
    if (error) return json({ sent: false, reason: 'lookup_failed' }, 500);
    const now = (deps.now ?? Date.now)();
    if (!invite || invite.status !== 'pending' || !(Date.parse(invite.expires_at) > now) ||
        normalizeEmail(invite.parent_email) !== email) return json({ sent: false, reason: 'no_match' });

    const fullName = await deps.getPlayerName(invite.player_user_id).catch(() => null);
    const metadata = invitedByChild(fullName?.trim().split(/\s+/)[0] ?? '');
    // Tokenless, as send-parent-invite: the page lists every invitation for the verified email.
    const redirectTo = `${deps.siteUrl.replace(/\/+$/, '')}/parent-invite`;

    const { error: inviteError } = await deps.sendInvite(invite.parent_email, redirectTo, metadata);
    if (!inviteError) return json({ sent: true, via: 'invite' });
    if (!alreadyRegistered(inviteError)) return json({ sent: false, reason: 'invite_rejected' }, 502);

    // A failed write still sends the code, with the template's plain wording.
    await deps.labelAccount(invite.parent_email, metadata).catch(() => {});
    const { error: magicError } = await deps.sendMagicLink(invite.parent_email, redirectTo);
    if (magicError) return json({ sent: false, reason: 'magic_link_rejected' }, 502);
    return json({ sent: true, via: 'magic_link' });
  } catch {
    return json({ sent: false, reason: 'delivery_failed' }, 500);
  }
}
