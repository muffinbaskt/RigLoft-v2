// Supabase Edge Function: scan-receipt
//
// Reads a photo of a receipt/packing slip and extracts each line item's
// name, backorder quantity, and shipped quantity. Mirrors the existing
// scan-love-list function's shape (same request/response pattern), so the
// frontend calling code stays consistent between the two.
//
// Deploy with:
//   supabase functions deploy scan-receipt
//
// Requires the same ANTHROPIC_API_KEY secret already set for
// scan-love-list — no new secret needed if that one's already configured.
// Check with: supabase secrets list

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
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ ok: false, error: "No image provided." }), {
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

    const prompt = `You are looking at a photo of a receipt, invoice, or packing slip.

First, look for a page indicator somewhere on the document, often printed as "Page X of Y", "Page #", or similar (usually near the header, sometimes in a small table with "Page #" as a label). If you find one, extract:
- "pageNumber": the current page number (e.g. 1)
- "totalPages": the total number of pages (e.g. 3)
If there's no page indicator at all, set both to 1.

Also look carefully at the document's header area for a shipment-specific order number — this is used only to double-check that two separately-scanned pages really are the same physical document, so it matters that this is the number specific to THIS delivery, not a broader reference. Vendors label this many different ways: "Order #", "Order Number", "Invoice #", "Sales Order #", "Ord #", "Confirmation #", or similar. If you see BOTH a PO number (a customer's own purchase order reference, often labeled "PO #" or "Customer PO" — this can repeat across many different unrelated deliveries for the same job) AND a separate vendor order/invoice number, prefer the vendor's own order/invoice number, since that one is unique to this specific shipment. Only fall back to the PO number if that's the only identifying number present at all. Copy whatever number you use exactly as printed, including dashes and letters. Set "orderNumber" to an empty string "" only if you've genuinely checked the header area and there is no such field printed anywhere — don't default to blank just because the label doesn't exactly match one of the examples above; look for anything that functions as an order/shipment identifier.

Separately, also extract these three header fields if present (empty string "" for any that aren't):
- "vendor": the supplying company's name — usually the logo or letterhead at the top of the document, NOT the "Bill To" or "Ship To" customer.
- "vendorAddress": the supplying company's mailing address, if printed near their name/logo — as a single string, however it's laid out. Empty string if not present.
- "poNumber": the PO number specifically, labeled "PO #", "P.O. Number", "Customer PO", or similar — this is different from orderNumber above, which is the vendor's own order/invoice number. A PO number often has a structured format like "1112-3052-2", where a middle segment may be a job or project number — extract the whole string exactly as printed, don't try to parse it apart yourself.
- "receiptDate": the date this specific document was generated — usually labeled "Order Date", "Date Printed", "Ship Date", or similar (prefer a date associated with when the order was placed or the document created, not an unrelated date elsewhere on the page). Format as YYYY-MM-DD if you can determine the actual date; otherwise leave as an empty string.

Extract every line item on it. For each line, return:
- "name": the item's description exactly as printed
- "backorderQty": the backorder / still-outstanding quantity for that line (0 if none, or if there's no backorder column at all)
- "shippedQty": the quantity actually shipped / received on this delivery (0 if you can't tell)
- "unit": the unit of measure for that line, exactly as printed (often labeled "UM", "Qty UM", or "U/M") — e.g. "EACH", "DZ", "CS", "BX", "FT". If there's no unit column at all, use "EACH".
- "unitPrice": the per-unit price for that line, often labeled "Net Price", "Unit Price", or similar (a plain number, no currency symbol — e.g. 12.52). Use 0 if there's no price column at all or it's genuinely illegible.

Some receipts label these columns differently (e.g. "B/O", "Ord Qty", "Ship Qty", "Qty Shipped") — use your best judgment to map them to backorderQty and shippedQty. If a line only has a single quantity column with no backorder/shipped distinction, treat that number as shippedQty and set backorderQty to 0.

Finally, also produce "fullText" — a plain-text transcription of everything readable on the document: every line item, every header field, notes, addresses, terms, anything printed anywhere on it. This doesn't need to be structured or formatted, just a complete text dump good enough that someone could search it later and find this document by any word that appears on it.

Respond with ONLY a JSON object in this exact shape, no other text, no markdown fences:
{"pageNumber":1,"totalPages":1,"orderNumber":"","vendor":"","vendorAddress":"","poNumber":"","receiptDate":"","fullText":"","items":[{"name":"...","backorderQty":0,"shippedQty":0,"unit":"EACH","unitPrice":0}]}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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
      return new Response(
        JSON.stringify({ ok: false, error: `Vision API error: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const rawText = textBlock ? textBlock.text : "";

    // Strip markdown fences if the model added them despite instructions,
    // then parse — same defensive pattern used elsewhere in this app for
    // any model output that's supposed to be pure JSON.
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Couldn't parse the receipt — try a clearer photo." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return new Response(
      JSON.stringify({
        ok: true,
        items,
        pageNumber: Number(parsed.pageNumber) > 0 ? Number(parsed.pageNumber) : 1,
        totalPages: Number(parsed.totalPages) > 0 ? Number(parsed.totalPages) : 1,
        orderNumber: typeof parsed.orderNumber === "string" ? parsed.orderNumber : "",
        vendor: typeof parsed.vendor === "string" ? parsed.vendor : "",
        poNumber: typeof parsed.poNumber === "string" ? parsed.poNumber : "",
        receiptDate: typeof parsed.receiptDate === "string" ? parsed.receiptDate : "",
        fullText: typeof parsed.fullText === "string" ? parsed.fullText : "",
        vendorAddress: typeof parsed.vendorAddress === "string" ? parsed.vendorAddress : "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
