import { normalizeText } from "./utils";

// Pure Love List domain logic — status progression, stale/duplicate
// detection, and display-label formatting. Nothing here touches React;
// every function just takes an item/list (or a few) and returns a plain
// value.

export const LOVE_STATUSES = [
  { key: "requested", label: "Requested", color: "bg-slate-700 text-slate-200 border-slate-600" },
  { key: "ordered", label: "Ordered", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { key: "received", label: "Received", color: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  { key: "staged", label: "Staged to send", color: "bg-violet-500/15 text-violet-300 border-violet-500/40" },
  { key: "sent", label: "Sent to job", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
];
// Items pulled from inventory never actually get an "Ordered" step — real
// purchases do. Skipping straight from Requested to Received for an
// inventory item would leave a fake "Ordered" date sitting in the history
// forever, which is exactly the misleading-later-record problem this
// exists to avoid.
export const nextLoveStatus = (item) => {
  const idx = LOVE_STATUSES.findIndex((s) => s.key === item.status);
  let next = idx + 1;
  if (LOVE_STATUSES[next]?.key === "ordered" && item.needsOrdering === false) next += 1;
  return next >= 0 && next < LOVE_STATUSES.length ? LOVE_STATUSES[next].key : null;
};
export const prevLoveStatus = (item) => {
  const idx = LOVE_STATUSES.findIndex((s) => s.key === item.status);
  let prev = idx - 1;
  if (LOVE_STATUSES[prev]?.key === "ordered" && item.needsOrdering === false) prev -= 1;
  return prev >= 0 ? LOVE_STATUSES[prev].key : null;
};
export const loveStatusMeta = (key) => LOVE_STATUSES.find((s) => s.key === key) || LOVE_STATUSES[0];

// The plain status label ("Staged to send") is only accurate when the
// whole quantity is in that state together. Once some of it has actually
// shipped (locked into sentBatches) but the item's still short of the
// full order — blocked from flipping all the way to "Sent" — showing
// "Staged to send" for the remainder is misleading: that missing balance
// was never staged, it was never even received. This swaps the label to
// something that tells the truth about what's actually outstanding.
export function loveItemDisplayMeta(item) {
  const base = loveStatusMeta(item.status);
  const totalSent = (item.sentBatches || []).reduce((sum, b) => sum + (b.sentQty || 0), 0);
  if (item.status !== "sent" && totalSent > 0) {
    return { ...base, label: `Partially Sent (${totalSent}/${item.qty})` };
  }
  return base;
}
// Shows the sub-job/nickname alongside the job number when set, without
// changing what the dashboard actually groups by — grouping always stays
// on the plain job number so multiple nicknamed lists on the same job
// still land together.
export const listDisplayLabel = (list) =>
  list.subJobLabel ? `${list.jobLabel} — ${list.subJobLabel}` : list.jobLabel;

// Default days an item can sit in a given status before it counts as
// stuck and worth flagging — the actual fix for "we lose track of what's
// been sitting around too long." Ordered gets a longer leash since that
// delay is usually out of our hands; Requested and Staged are the two
// spots where something sitting still usually means it just got missed.
// User-adjustable from Love Lists settings — this is just the fallback.
export const DEFAULT_STALE_THRESHOLD_DAYS = { requested: 3, ordered: 7, received: 7, staged: 3, sent: null };
export const STALE_THRESHOLDS_KEY = "warehub-stale-thresholds";

export function daysInCurrentStatus(item) {
  const since = item.statusDates && item.statusDates[item.status];
  if (!since) return 0;
  const ms = Date.now() - new Date(since + "T00:00:00").getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function isStale(item, thresholds = DEFAULT_STALE_THRESHOLD_DAYS) {
  if (item.archived) return false;
  const threshold = thresholds[item.status];
  if (threshold == null) return false;
  return daysInCurrentStatus(item) >= threshold;
}

// Finds other still-pending items (not yet sent, not archived) across every
// Love List with a matching name — the actual fix for the "job never got
// told this was already coming, so they re-requested it" problem.
export function findPossibleDuplicates(name, catalogId, catalog = [], allLists = [], { excludeListId, excludeItemId } = {}) {
  const normName = normalizeText(name).replace(/\s+/g, "");
  const catalogEntry = catalogId ? catalog.find((c) => c.id === catalogId) : null;
  // Catalog-ID matching is reliable duplicate detection — it catches the
  // "field wrote the same item five different inconsistent ways" case
  // that name matching alone misses. But it's skipped for entries flagged
  // as covering several real variants (e.g. a generic "Reamer" spanning
  // multiple sizes), since a shared link there doesn't mean the same
  // physical item — those fall back to name matching only.
  const useCatalogMatch = !!catalogEntry && !catalogEntry.multiSize;
  if (!normName && !useCatalogMatch) return [];
  const matches = [];
  allLists.forEach((l) => {
    l.items.forEach((i) => {
      if (i.id === excludeItemId) return;
      if (i.archived) return;
      if (i.status === "sent") return;
      if (useCatalogMatch && i.catalogId === catalogId) {
        matches.push({ list: l, item: i });
        return;
      }
      if (!normName) return;
      const normOther = normalizeText(i.name).replace(/\s+/g, "");
      if (normOther === normName) matches.push({ list: l, item: i });
    });
  });
  return matches;
}
