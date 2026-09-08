import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a sports schedule parser for a youth football academy app.
Extract every distinct event (match, training, tournament, friendly, meeting, etc.) from the user's input.
Return ONLY valid JSON via the provided tool. Use ISO 8601 for timestamps.
If the year is missing, assume the current or next occurrence (whichever is closest in the future).
If the time is missing, set starts_at to the date with time 00:00 and put a note like "time TBC".
Never invent opponents or venues — leave them empty if not stated.
Event types must be one of: match, training, tournament, other.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { text, imageBase64, imageMimeType, todayISO } = await req.json();
    if (!text && !imageBase64) {
      return new Response(JSON.stringify({ error: "Provide text or imageBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userParts: any[] = [];
    const todayLine = `Today is ${todayISO || new Date().toISOString().slice(0, 10)}.`;
    if (text) userParts.push({ type: "text", text: `${todayLine}\n\nSchedule input:\n${text}` });
    else userParts.push({ type: "text", text: `${todayLine}\n\nExtract all events from the attached image.` });
    if (imageBase64) {
      userParts.push({
        type: "image_url",
        image_url: { url: `data:${imageMimeType || "image/jpeg"};base64,${imageBase64}` },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userParts },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_events",
              description: "Return the extracted schedule events.",
              parameters: {
                type: "object",
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        event_type: { type: "string", enum: ["match", "training", "tournament", "other"] },
                        starts_at: { type: "string", description: "ISO 8601 timestamp" },
                        ends_at: { type: "string", description: "ISO 8601 timestamp or empty" },
                        venue: { type: "string" },
                        opponent: { type: "string" },
                        notes: { type: "string" },
                      },
                      required: ["title", "event_type", "starts_at"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["events"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_events" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in your Lovable workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let parsed: any = { events: [] };
    if (args) {
      try { parsed = typeof args === "string" ? JSON.parse(args) : args; }
      catch (e) { console.error("Parse failed", e); }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-schedule error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});