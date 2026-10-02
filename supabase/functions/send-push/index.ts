// Supabase Edge Function: send-push
//
// A plain, directly-callable push send — {title, body} in, a notification
// out to every subscribed device. notify-suggestion already has this exact
// logic, but wired specifically to a Database Webhook's payload shape
// (table/record) for the suggestions/field_requests tables. This is the
// same underlying send, extracted so any client-triggered event (Worker
// Tasks activity, to start) can fire a real push with a one-line fetch,
// without needing a dedicated table + webhook set up for every new kind
// of event.
//
// Deploy with: supabase functions deploy send-push
// Uses the same VAPID_PRIVATE_KEY secret already set for notify-suggestion
// — nothing new to configure.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY =
  "BAFxZKXXoeA1H9n7wwwCWR8GU2zyMy4n_YqrLAXXK7qLs8Rs2STK6BlRqOu4syVIm-avrtkCTO2sjTfzLJxjrMc";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

webpush.setVapidDetails(
  "mailto:notifications@riggy.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, body, url } = await req.json();
    if (!body) {
      return new Response(JSON.stringify({ ok: false, error: "No body provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notificationPayload = JSON.stringify({
      title: title || "Riggy",
      body,
      url: url || "/",
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        )
      )
    );

    // Same cleanup as notify-suggestion — a subscription that's gone stale
    // (unsubscribed on that device, expired) just keeps failing forever
    // otherwise.
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
