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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://trakfootball.com";

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      console.error("send-parent-invite: service credentials are not configured");
      return json({ error: "Email is not configured yet" }, 500);
    }

    // Identify the caller from their own token. This is the only thing the
    // request is trusted for.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: caller, error: callerError } = await admin.auth.getUser(jwt);
    if (callerError || !caller?.user) return json({ error: "Not authenticated" }, 401);

    const playerId = caller.user.id;

    // The invite row is the source of truth for who gets mailed.
    const { data: invite, error: inviteError } = await admin
      .from("parent_invites")
      .select("parent_email, invite_token, status")
      .eq("player_user_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error("send-parent-invite: invite lookup failed", inviteError.message);
      return json({ error: "Could not look up the invitation" }, 500);
    }
    if (!invite) return json({ error: "No parent invitation to send" }, 404);
    if (invite.status !== "pending") return json({ sent: false, reason: "already_accepted" });

    const { data: player } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", playerId)
      .maybeSingle();

    const redirectTo = `${SITE_URL}/parent-invite?token=${invite.invite_token}`;

    // inviteUserByEmail creates the auth user and mails them a link. If the
    // parent already has an account — a second child at the same academy, or
    // they signed up first — that is not an error, it just means they can
    // follow the link straight in.
    const { error: inviteSendError } = await admin.auth.admin.inviteUserByEmail(
      invite.parent_email,
      {
        redirectTo,
        data: {
          invited_as: "parent",
          child_name: player?.full_name ?? null,
          invite_token: invite.invite_token,
        },
      },
    );

    if (inviteSendError) {
      const alreadyExists = /already.*registered|already.*exists/i.test(inviteSendError.message);
      if (!alreadyExists) {
        console.error("send-parent-invite: send failed", inviteSendError.message);
        return json({ error: "Could not send the email" }, 502);
      }
      return json({ sent: false, reason: "already_registered", redirectTo });
    }

    return json({ sent: true });
  } catch (err) {
    console.error("send-parent-invite: unexpected failure", err);
    return json({ error: "Could not send the email" }, 500);
  }
});
