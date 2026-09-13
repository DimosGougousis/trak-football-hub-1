// Emails a parent or guardian their invitation to approve a child's account.
//
// Delivery goes through Supabase Auth's own invite email rather than a
// third-party mail provider. That is deliberate: Supabase is already a
// processor under a signed DPA, so this adds no new subprocessor and no new
// transfer to assess. Swapping in Resend later means changing only this file,
// but it also means a new DPA — do not do it casually, the recipients here are
// the parents of children.
//
// The caller is the signed-in player. We never take the parent's address from
// the request body: it is read from the invite row the player already created,
// so a compromised client cannot mail an arbitrary address from your domain.
//
// EVERY outcome is returned in the body and logged, including the underlying
// error text. The first version of this returned bare status codes, the client
// swallowed them, and the invite path failed silently for a day while every
// screen said "we'll email them". Never again: the caller must be able to tell
// the player the truth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Outcome = {
  sent: boolean;
  via?: "invite" | "magic_link";
  reason?: string;
  detail?: string;
  redirectTo?: string;
};

const json = (body: Outcome | { error: string; detail?: string }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Log the address without putting a parent's full email in the log stream.
const mask = (email: string) => {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    // Strip any trailing slash. A SITE_URL of "https://trakfootball.com/"
    // would otherwise produce "https://trakfootball.com//parent-invite".
    const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://trakfootball.com").replace(/\/+$/, "");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("send-parent-invite: service credentials are not configured");
      return json({ error: "Email is not configured yet" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: caller, error: callerError } = await admin.auth.getUser(jwt);
    if (callerError || !caller?.user) {
      console.warn("send-parent-invite: caller token rejected", callerError?.message);
      return json({ error: "Not authenticated" }, 401);
    }

    const playerId = caller.user.id;

    const { data: invite, error: inviteError } = await admin
      .from("parent_invites")
      .select("parent_email, invite_token, status")
      .eq("player_user_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error("send-parent-invite: invite lookup failed", inviteError.message);
      return json({ error: "Could not look up the invitation", detail: inviteError.message }, 500);
    }
    if (!invite) {
      console.warn("send-parent-invite: no invite row for player", playerId);
      return json({ sent: false, reason: "no_invite" }, 404);
    }
    if (invite.status !== "pending") {
      return json({ sent: false, reason: "already_accepted" });
    }

    // No token in the URL, on purpose. The parent is resolved by email address
    // once they land (get_my_pending_parent_invite), so the token adds nothing.
    // It did add something bad: a URL of the shape
    //   verify?token=…&redirect_to=…/parent-invite%3Ftoken%3D…
    // is a textbook phishing signature, and on a new sending domain that is a
    // plausible reason the invite was being dropped while a dashboard resend,
    // which carries no custom redirect, arrived fine.
    const redirectTo = `${SITE_URL}/parent-invite`;
    const to = invite.parent_email;

    console.info("send-parent-invite: inviting", { player: playerId, to: mask(to), redirectTo });

    const { error: inviteSendError } = await admin.auth.admin.inviteUserByEmail(to, {
      redirectTo,
      data: { invited_as: "parent" },
    });

    if (!inviteSendError) {
      console.info("send-parent-invite: invite accepted by auth", { to: mask(to) });
      return json({ sent: true, via: "invite", redirectTo });
    }

    const alreadyExists = /already.*registered|already.*exists|already been registered/i.test(
      inviteSendError.message,
    );

    if (!alreadyExists) {
      console.error("send-parent-invite: invite REJECTED by auth", {
        to: mask(to),
        status: (inviteSendError as { status?: number }).status,
        message: inviteSendError.message,
      });
      return json(
        { sent: false, reason: "invite_rejected", detail: inviteSendError.message, redirectTo },
        502,
      );
    }

    // The parent already has an account: a second child at the academy, or a
    // previous invitation. Supabase will not invite an existing user, so send a
    // magic link to the same destination. They land signed in on
    // /parent-invite, which resolves their pending invitation by email.
    //
    // signInWithOtp is a public-endpoint call, so it goes through a client
    // holding the anon key rather than the service role.
    console.info("send-parent-invite: parent exists, sending magic link", { to: mask(to) });

    const pub = createClient(SUPABASE_URL, ANON_KEY ?? SERVICE_ROLE);
    const { error: magicLinkError } = await pub.auth.signInWithOtp({
      email: to,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });

    if (magicLinkError) {
      console.error("send-parent-invite: magic link REJECTED by auth", {
        to: mask(to),
        status: (magicLinkError as { status?: number }).status,
        message: magicLinkError.message,
      });
      return json(
        { sent: false, reason: "magic_link_rejected", detail: magicLinkError.message, redirectTo },
        502,
      );
    }

    console.info("send-parent-invite: magic link accepted by auth", { to: mask(to) });
    return json({ sent: true, via: "magic_link", reason: "already_registered", redirectTo });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("send-parent-invite: unexpected failure", detail);
    return json({ error: "Could not send the email", detail }, 500);
  }
});
