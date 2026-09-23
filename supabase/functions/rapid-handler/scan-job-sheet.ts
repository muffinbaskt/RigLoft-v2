// Supabase Edge Function: scan-job-sheet
//
// Reads one or more photographed/scanned pages of a job requisition
// sheet (the kind with a QTY / SHIP'D / RETURN / DESCRIPTION table,
// category headers, and "X Per Crane" rate lines) and returns a flat
// list of items — one per filled-in QTY cell — each with a rough bounding
// box so the app can crop and show exactly the row it was read from for
// you to confirm before anything gets imported.
//
// Deliberately does NOT multiply "Per Crane" quantities out itself —
// that's a job-specific number (how many cranes THIS job actually has)
// that the sheet alone doesn't know, and it's exactly the kind of silent
// judgment call that's better left to a human glancing at the real
// number than baked into extraction. The raw rate and its label come
// back separately; the app's review screen does the multiplying, live,
// in front of you.
//
// Deploy: paste this file's contents into a new Edge Function in your
// Supabase project (Dashboard → Edge Functions → New Function, name it
// "scan-job-sheet"), or via the CLI:
//   supabase functions deploy scan-job-sheet
// Needs the same ANTHROPIC_API_KEY secret the other scan functions
// (scan-receipt, scan-love-list) already use — nothing new to configure
// if those are already working.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_TOOL = {
  name: "record_job_sheet_items",
  description:
    "Records every requested line item found across all pages of a job requisition sheet.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description:
                "The full, human-readable item description — combine a category header " +
                "(e.g. \"CHOKERS SPLICED (EACH)\") with its specific line (e.g. \"3/8\\\" + 6'\") " +
                "into one name (e.g. \"3/8\\\" + 6' Choker Spliced\"), the way a rigger would " +
                "actually say the item, not the raw table cell text alone. IMPORTANT: this " +
                "combining is a TEXT-ONLY convenience — it must never change which row the " +
                "bbox below points to. The bbox always belongs to the specific data row (the " +
                "one with the actual quantity written in it), never the category header's own " +
                "row above it, even though the header's words appear in this description.",
            },
            quantity: {
              type: "number",
              description:
                "The number actually printed/written in the QTY column for this line, exactly " +
                "as written — never multiplied, scaled, or adjusted.",
            },
            quantityLabel: {
              type: ["string", "null"],
              description:
                "The rate qualifier printed next to the quantity, if any — e.g. \"Per Crane\", " +
                "\"Per Gang\", \"Set\", \"Box\", \"Roll\". Null if the quantity is just a flat count.",
            },
            ordered: {
              type: "boolean",
              description:
                "True if this row shows any sign the item has already been ordered — a number " +
                "written in the SHIP'D column for that row, OR the row itself is visibly " +
                "highlighted/shaded/marked in a way that sets it apart from the surrounding " +
                "unmarked rows. False if the SHIP'D column is blank and the row looks the same " +
                "as any other unmarked row.",
            },
            section: {
              type: ["string", "null"],
              description:
                "The gang/section this line falls under if visible on the page — e.g. " +
                "\"Raising Gang\", \"Bolt Up Gang\", \"Welding Gang\", \"Miscellaneous\". Null if unclear.",
            },
            page: {
              type: "integer",
              description: "Which page this item was read from — 0 for the first page provided, 1 for the second, and so on.",
            },
            bbox: {
              type: "object",
              description:
                "A bounding box around ONLY the single data row this item's quantity was " +
                "actually read from — anchor this on the row containing the written QTY number " +
                "itself, not the category header row above it, even when the description field " +
                "combines both into one name. Before answering, re-check: does this box's " +
                "vertical position line up with the same horizontal gridlines as the quantity " +
                "digit you read for this item, not the row above or below it? Span from the QTY " +
                "cell through the DESCRIPTION cell horizontally. Coordinates normalized 0-1 " +
                "relative to that page's full image width/height — (0,0) is the page's top-left " +
                "corner, (1,1) is its bottom-right corner. A little extra vertical padding " +
                "(rather than a razor-thin box) is fine and safer than cutting the row off.",
              properties: {
                x: { type: "number", description: "Left edge, 0-1." },
                y: { type: "number", description: "Top edge, 0-1." },
                width: { type: "number", description: "Width, 0-1." },
                height: { type: "number", description: "Height, 0-1." },
              },
              required: ["x", "y", "width", "height"],
            },
          },
          required: ["description", "quantity", "page", "bbox"],
        },
      },
    },
    required: ["items"],
  },
};

const SYSTEM_PROMPT = `You are reading photographed pages of a handwritten/typed job requisition
sheet used by a rigging company. The sheet has a repeating table layout —
QTY | SHIP'D | RETURN | DESCRIPTION, often two side-by-side column groups
per page — with category headers (e.g. "CHOKERS SPLICED (EACH)",
"SHACKLES") followed by specific line items underneath, some tagged with
a rate label like "8 Per Crane" instead of a flat number.

Only include a line if its QTY cell actually has a number in it (typed or
handwritten) — skip every row with a blank QTY, including category
headers on their own. Read QTY only for the quantity value; SHIP'D and
RETURN are different things and should not be confused with the
requested quantity. That said, DO check the SHIP'D column for a
separate signal: a number written in it, or the whole row being
visibly highlighted/shaded/marked compared to the unmarked rows around
it, both mean this item has already been ordered — report that in
this item's own "ordered" field.

Combine each category header with its specific line into one natural
item description, and call the tool once with every item found across
every page provided, tagging each with the page index it came from and a
bounding box for exactly where on that page it was read.

Treat the description text and the bounding box as two separate jobs:
the description is allowed to borrow words from the category header
above; the bounding box is never allowed to. For every single item,
before moving to the next one, look at the actual row the quantity
number sits in and confirm the box you're about to give lines up with
that row's own gridlines — not the header row, not the row before or
after it. A dense table like this makes it easy to drift down (or up)
a row partway through; re-anchoring on the quantity digit itself for
every item, rather than assuming the previous item's box position plus
one row, is what avoids that drift.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY is not configured for this function." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const pages = Array.isArray(body.pages) ? body.pages : [];
    if (pages.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "No pages provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One image block per page, in order — page index in the prompt/tool
    // schema lines up with the order they're sent in here.
    const imageBlocks = pages.map((p: { imageBase64: string; mediaType?: string }) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: p.mediaType || "image/jpeg",
        data: p.imageBase64,
      },
    }));

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "record_job_sheet_items" },
        messages: [
          {
            role: "user",
            content: [
              ...imageBlocks,
              {
                type: "text",
                text: `Read every page above (there are ${pages.length}) and call record_job_sheet_items once with every requested line item found across all of them.`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ ok: false, error: `Vision API error: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const toolUse = (data.content || []).find((b: { type: string }) => b.type === "tool_use");
    if (!toolUse) {
      return new Response(JSON.stringify({ ok: false, error: "No structured result returned." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = Array.isArray(toolUse.input?.items) ? toolUse.input.items : [];
    return new Response(JSON.stringify({ ok: true, items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});