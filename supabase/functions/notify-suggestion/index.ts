// Supabase Edge Function — triggered by a Database Webhook every time a
// new row is inserted into the "suggestions" table. Sends a real push
// notification to every device that's turned notifications on.
//
// Deploy with: supabase functions deploy notify-suggestion
// Then set the secret once with:
//   supabase secrets set VAPID_PRIVATE_KEY=your-private-key-here
// And wire up the Database Webhook in Supabase's dashboard (Database →
// Webhooks) to call this function on INSERT to the "suggestions" table.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY =
  "BAFxZKXXoeA1H9n7wwwCWR8GU2zyMy4n_YqrLAXXK7qLs8Rs2STK6BlRqOu4syVIm-avrtkCTO2sjTfzLJxjrMc";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

webpush.setVapidDetails(
  "mailto:notifications@riggy.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function describeSuggestion(payload, suggestionType) {
  switch (suggestionType) {
    case "new_item":
      return `New item suggested: ${payload.name}`;
    case "complete_todo":
      return `To Do marked done: ${payload.todoText}`;
    case "add_todo":
      return `New To Do suggested: ${payload.text}`;
    case "edit_item":
    default:
      return `Change suggested to: ${payload.itemName}`;
  }
}

function describeFieldRequest(record) {
  const where = record.job_or_location ? `${record.job_or_location} — ` : "";
  const preview = (record.text || "").slice(0, 80);
  return `${where}${preview}`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const record = body.record;
    if (!record) {
      return new Response(JSON.stringify({ ok: false, error: "No record in webhook payload" }), {
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*");

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });
    }

    const notificationPayload = JSON.stringify({
      title: body.table === "field_requests" ? "Riggy — new suggestion" : "Riggy",
      body:
        body.table === "field_requests"
          ? describeFieldRequest(record)
          : describeSuggestion(record.payload, record.suggestion_type),
      url: "/",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload
        )
      )
    );

    // Clean up subscriptions that are no longer valid (expired, unsubscribed
    // on that device, etc.) so future sends don't keep failing on them.
    const deadEndpoints = subscriptions
      .filter((sub, i) => {
        const r = results[i];
        return (
          r.status === "rejected" &&
          (r.reason?.statusCode === 404 || r.reason?.statusCode === 410)
        );
      })
      .map((sub) => sub.endpoint);

    if (deadEndpoints.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ ok: true, sent, total: subscriptions.length }), {
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
