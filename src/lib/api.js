import { supabase } from "../supabaseClient";
import { uniqueId } from "./utils";

// All direct Supabase/network I/O in one place: the generic key/value
// save-load pair every domain's storage rides on top of (with optimistic-
// concurrency conflict detection built in), file uploads/deletes to
// Storage, the suggestions/field-requests tables, and Web Push
// subscription management. Nothing here knows about jobs, Love Lists, or
// any other app-specific shape — callers pass in whatever key/payload/
// file they need persisted, and get back a plain { ok, ...} result.

export const JOBS_KEY = "warehub-jobs";
export const ACTIVE_JOB_KEY = "warehub-active-job";
export const CATALOG_KEY = "warehub-catalog";
export const RETURNS_KEY = "warehub-returns";
export const GENERAL_TODOS_KEY = "warehub-general-todos";
// Set to "true" the moment we ever successfully save real job data. Lets us
// tell "genuinely new account" apart from "storage came back empty when it
// shouldn't have" — the latter must never be treated as a fresh start.
export const INITIALIZED_KEY = "warehub-initialized";

// Saves a key, but first checks whether another tab/device has saved a
// newer version since we last knew about it. If so, this refuses to save
// (instead of silently overwriting someone else's more recent changes) and
// returns {ok:false, conflict:true} so the caller can warn the user rather
// than lose data with no trace.
export async function saveWithRetry(key, value, expectedUpdatedAt, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      if (expectedUpdatedAt) {
        const { data: current, error: checkError } = await supabase
          .from("app_storage")
          .select("updated_at")
          .eq("key", key)
          .maybeSingle();
        if (!checkError && current) {
          const currentTime = new Date(current.updated_at).getTime();
          const expectedTime = new Date(expectedUpdatedAt).getTime();
          // Only treat this as a real conflict if both timestamps parsed
          // successfully AND they represent a genuinely different moment —
          // comparing the raw strings directly was the bug here, since the
          // same instant can come back formatted differently depending on
          // whether it originated from this browser or from Postgres.
          if (!Number.isNaN(currentTime) && !Number.isNaN(expectedTime) && currentTime !== expectedTime) {
            return { ok: false, conflict: true };
          }
        }
      }
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("app_storage")
        .upsert({ key, value: JSON.parse(value), updated_at: nowIso }, { onConflict: "key" });
      if (!error) return { ok: true, updatedAt: nowIso };
      lastError = error.message;
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return { ok: false, error: lastError };
}

export async function getWithRetry(key, attempts = 6) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase
        .from("app_storage")
        .select("value, updated_at")
        .eq("key", key)
        .maybeSingle();
      if (!error) {
        return {
          ok: true,
          value: data ? JSON.stringify(data.value) : null,
          updatedAt: data ? data.updated_at : null,
        };
      }
      lastError = error.message;
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
    }
    if (i < attempts - 1) {
      const delay = 600 + i * i * 400;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return { ok: false, error: lastError };
}

// Anyone (including viewers with no login) can submit a suggestion — this
// hits its own database table with its own permission rules, separate from
// the main app_storage table, so it never conflicts with view-only access.
export async function submitSuggestion({ jobId, itemId, type, payload, note, submittedBy }) {
  try {
    const { error } = await supabase.from("suggestions").insert({
      job_id: String(jobId),
      item_id: itemId ? String(itemId) : null,
      suggestion_type: type,
      payload,
      note: note || null,
      submitted_by: submittedBy || null,
    });
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function submitFieldRequest(text, reportedBy) {
  try {
    const { error } = await supabase.from("field_requests").insert({
      text,
      reported_by: reportedBy || null,
    });
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function fetchFieldRequests() {
  try {
    const { data, error } = await supabase
      .from("field_requests")
      .select("*")
      .order("created_at", { ascending: false });
    return { ok: !error, requests: data || [], error: error ? error.message : null };
  } catch (err) {
    return { ok: false, requests: [], error: err && err.message ? err.message : String(err) };
  }
}

export async function updateFieldRequestStatus(id, status) {
  try {
    const { error } = await supabase.from("field_requests").update({ status }).eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function deleteFieldRequest(id) {
  try {
    const { error } = await supabase.from("field_requests").delete().eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Only works for the logged-in owner — RLS blocks anyone else from seeing
// what's been submitted. Every row here is effectively "pending" since
// resolved ones get deleted rather than just marked, keeping the inbox
// clean without needing a separate history view.
export async function fetchPendingSuggestions() {
  try {
    const { data, error } = await supabase
      .from("suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, suggestions: data || [] };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function fetchResolvedSuggestions() {
  try {
    const { data, error } = await supabase
      .from("suggestions")
      .select("*")
      .in("status", ["approved", "denied"])
      .order("resolved_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, suggestions: data || [] };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Downscales an oversized photo before it goes to Supabase Storage — the
// goal is trimming the huge dimensions modern phone cameras produce
// (often 3000-4000px wide) down to something reasonable, while keeping
// quality high enough that fine print on a receipt or packing list stays
// perfectly legible. Non-image files (PDFs, etc.) and anything already
// under the cap pass through untouched — nothing to gain by re-encoding
// those.
export function resizeImageForUpload(file, { maxWidth = 2000, quality = 0.92 } = {}) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      if (scale >= 1) {
        resolve(file); // already small enough
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // encoding failed — fall back to the original
            return;
          }
          resolve(
            new File([blob], file.name || "photo.jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
          );
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // couldn't decode — upload the original rather than fail
    };
    img.src = objectUrl;
  });
}

// Storage paths aren't kept alongside every reference to an image (older
// records only ever stored the public URL) — deriving the path back out
// of that URL lets deletion work retroactively for everything already
// uploaded, not just new files going forward.
export function storagePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = "/object/public/job-documents/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return url.slice(idx + marker.length);
  }
}

// pdf.js loaded on demand from a CDN, only when someone actually picks a
// PDF to convert — no reason to make everyone's bundle bigger for a
// feature most uploads never touch.
let pdfjsLibPromise = null;
export function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs"
    ).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjsLibPromise;
}

// A phone's "scan to PDF" feature is really just a photo wrapped in a PDF
// container — this unwraps it, rendering each page back out as its own
// JPEG so it can go through the same resize/compress pipeline as any
// other photo instead of storing the PDF wrapper (and its larger file
// size) as-is.
export async function pdfToImageFiles(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const baseName = (file.name || "scan").replace(/\.pdf$/i, "");
  const files = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Scale 2 renders at roughly double the PDF's native point size —
    // plenty sharp for a scanned document without going overboard, since
    // resizeImageForUpload will cap the final dimensions anyway.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (blob) {
      const pageSuffix = pdf.numPages > 1 ? `-p${pageNum}` : "";
      files.push(new File([blob], `${baseName}${pageSuffix}.jpg`, { type: "image/jpeg" }));
    }
  }
  return files;
}

export async function uploadReferenceDocument(jobId, file) {
  try {
    const uploadFile = await resizeImageForUpload(file);
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${jobId}/${uniqueId()}-${safeName}`;
    const { error } = await supabase.storage.from("job-documents").upload(path, uploadFile);
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("job-documents").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path, name: uploadFile.name, type: uploadFile.type };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Same bucket, same pattern, just its own path prefix so the original
// photo of a scanned Love List can be pulled back up later for reference.
export async function uploadLoveListScan(file) {
  try {
    const uploadFile = await resizeImageForUpload(file);
    const safeName = (uploadFile.name || "scan.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `love-list-scans/${uniqueId()}-${safeName}`;
    const { error } = await supabase.storage.from("job-documents").upload(path, uploadFile);
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("job-documents").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Optional "proof of done" photo a worker can attach when they complete a
// task — same bucket, its own path prefix. Uploaded from the kiosk, which
// runs signed-out, so this specifically needs its own storage policy
// allowing anon uploads under this prefix (see the app's setup notes).
export async function uploadWorkerTaskPhoto(file) {
  try {
    const uploadFile = await resizeImageForUpload(file);
    const safeName = (uploadFile.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `worker-task-photos/${uniqueId()}-${safeName}`;
    const { error } = await supabase.storage.from("job-documents").upload(path, uploadFile);
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("job-documents").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Keeps the original receipt photo attached to its queue entry — same
// bucket, its own path prefix, so it can be pulled back up during review
// or later if a shipment ever needs double-checking against the paper.
export async function uploadReceiptScan(file) {
  try {
    const uploadFile = await resizeImageForUpload(file);
    const safeName = (uploadFile.name || "receipt.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `receipt-scans/${uniqueId()}-${safeName}`;
    const { error } = await supabase.storage.from("job-documents").upload(path, uploadFile);
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("job-documents").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function deleteReferenceDocument(path) {
  try {
    const { error } = await supabase.storage.from("job-documents").remove([path]);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function updateSuggestionRow(id, fields) {
  try {
    const { error } = await supabase.from("suggestions").update(fields).eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function deleteSuggestionRow(id) {
  try {
    const { error } = await supabase.from("suggestions").delete().eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Public VAPID key — safe to be visible in client code, this is how the
// browser verifies push messages actually came from your server, not a
// secret in the traditional sense. The matching private key lives only in
// the Supabase Edge Function that sends notifications.
export const VAPID_PUBLIC_KEY =
  "BAFxZKXXoeA1H9n7wwwCWR8GU2zyMy4n_YqrLAXXK7qLs8Rs2STK6BlRqOu4syVIm-avrtkCTO2sjTfzLJxjrMc";

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getNotificationStatus() {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    return existing ? "subscribed" : "not-subscribed";
  } catch {
    return "not-subscribed";
  }
}

export async function enablePushNotifications() {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, error: "Push notifications aren't supported in this browser." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission was not granted." };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

export async function disablePushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}
