// Supabase Edge Function: scan-love-list
// Receives a base64 image of a handwritten/typed Love List, asks Claude to
// read it, and returns structured {name, qty} lines for review before
// anything gets added. Never auto-commits anything on its own — the
// frontend always shows an editable preview first.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Server not configured with an API key." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ ok: false, error: "No image provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `This is a photo of a handwritten or typed list of tools/supplies requested by a field crew member (a "Love List"). Extract every distinct item requested, with its quantity if one is written or implied (default to 1 if no quantity is given), and its unit of measure if one is written (e.g. "Dozen", "Case", "Box", "Roll", "Pair") — if no unit is written at all (just a bare number), use "each".

Respond with ONLY a JSON array, nothing else, no markdown fences, no preamble. Each entry: {"name": "...", "qty": number, "unit": "..."}.

If handwriting is genuinely ambiguous for a specific word, make your best reasonable guess rather than omitting the item — the person reviewing this will double check everything before it's saved.`;

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ ok: false, error: `API error: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const rawText = textBlock ? textBlock.text : "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let items;
    try {
      items = JSON.parse(cleaned);
      if (!Array.isArray(items)) throw new Error("not an array");
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Couldn't parse a clean item list from the scan." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true, items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
