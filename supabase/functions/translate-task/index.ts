// Supabase Edge Function: translate-task
//
// Translates a short worker-task title into Spanish, for the bilingual
// display Worker Tasks shows to workers marked as speaking Spanish (see
// taskTitleDisplay in src/lib/workertasks.js). Called once per task, when
// it's created or its title is edited — the result is cached on the task
// record, not re-requested every time it's displayed.
//
// Deploy with:
//   supabase functions deploy translate-task
//
// Requires the same ANTHROPIC_API_KEY secret already set for
// scan-receipt/scan-love-list — no new secret needed if that one's
// already configured. Check with: supabase secrets list

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "No text provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `Translate the following short work-crew task into natural, informal Spanish, the way a foreman would say it out loud on a rigging/steel erection job site. Keep any job numbers, part names, or SME# numbers exactly as written — don't translate proper nouns, model numbers, or numeric identifiers.

Task: "${text.trim()}"

Respond with ONLY the Spanish translation, nothing else — no quotes, no explanation, no original text repeated back.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Translation API error: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const translated = textBlock ? textBlock.text.trim() : "";

    if (!translated) {
      return new Response(
        JSON.stringify({ ok: false, error: "Couldn't get a translation back." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true, translated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
