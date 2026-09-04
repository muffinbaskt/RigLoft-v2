import { uniqueId, timeStamp, normalizeText, totalHave, emptyItem, newLoveListItem } from "./utils";

// Shared business logic for applying a scanned/approved receipt line to a
// Job or Love List item — used by the standalone Receiving screen, by
// pulling a receipt directly from inside a Job or Love List, and by the
// Receipt Archive's "Send to Receiving" path. Same rules everywhere, no
// matter which screen someone approves from.

export const RECEIVING_QUEUE_KEY = "warehub-receiving-queue";
// Separate from the queue above — this is for receipts you just want on
// record and searchable, without ever pulling items out of them into a
// job or Love List. Nothing here ever touches inventory.
export const RECEIPT_ARCHIVE_KEY = "warehub-receipt-archive";
// Remembers the exact confirmed name for a specific raw OCR string, once
// you've typed and linked it — separate from catalog matching itself.
// This is what lets a size-specific line ("...4LB SLEDGE...") auto-fill
// correctly next time without ever guessing at a size from the text.
export const RECEIVING_NAME_MEMORY_KEY = "warehub-receiving-name-memory";

// Shared apply-logic for a single receipt line, used both by the
// standalone Receiving screen and by pulling a receipt directly from
// inside a Job or Love List — same rules, same code, no matter which
// screen someone approves from.

// Same red/yellow/green rule the item edit form already uses — Receiving
// bypasses that form entirely when it patches quantities directly, so
// without this, the stored status field goes stale even though the
// numbers underneath it are correct (the edit form recomputes status live
// for display, which is why it can show "Complete" while the actual
// saved card still shows red).
export function computeJobItemStatus(qtyHave, qtyNeeded) {
  if (qtyHave >= (Number(qtyNeeded) || 0)) return "green";
  if (qtyHave > 0) return "yellow";
  return "red";
}

// Same idea for the separate "Ordered / Not received / Partially
// received" pill — a merge changes quantity on both the item you're
// folding away and the one it's going into, so both need this
// recalculated, not just the status dot.
export function computeJobItemReceived(qtyHave, qtyNeeded) {
  if (qtyHave <= 0) return "no";
  if (qtyHave >= (Number(qtyNeeded) || 0)) return "yes";
  return "partial";
}

// Converts a quantity between units when applying it to an item measured
// differently — the only conversion this attempts is each↔dozen, since
// that's the one pairing where the math is unambiguous (12 of one always
// equals 1 of the other). Anything else (boxes, cases, unlabeled units)
// is left untouched rather than guessing, since a wrong guess there would
// silently corrupt real quantities.
// Checks whether a job/reference number appears anywhere in a PO
// string — either as the whole thing, or as one dash/space-separated
// segment within it (PO numbers often look like "1112-3052-2", where the
// middle segment is the actual job number). Used only to suggest a
// likely job match, never to auto-assign anything on its own.
// Whichever vendor has delivered the highest cumulative QUANTITY of an
// item — not dollar amount — becomes its "usual vendor," computed fresh
// from the purchase history every time it's needed rather than stored as
// a separate manually-maintained field that could drift out of date.
export function computeUsualVendor(vendorHistory) {
  if (!vendorHistory || vendorHistory.length === 0) return null;
  const totals = {};
  vendorHistory.forEach((r) => {
    if (!r.vendor) return;
    totals[r.vendor] = (totals[r.vendor] || 0) + (r.qty || 0);
  });
  let best = null;
  let bestQty = 0;
  Object.entries(totals).forEach(([vendor, qty]) => {
    if (qty > bestQty) {
      best = vendor;
      bestQty = qty;
    }
  });
  return best;
}

export function poContainsJobNumber(poNumber, jobNumber) {
  if (!poNumber || !jobNumber) return false;
  const normJob = jobNumber.trim().toLowerCase();
  if (!normJob) return false;
  const whole = poNumber.trim().toLowerCase();
  if (whole === normJob) return true;
  const segments = poNumber.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return segments.some((seg) => seg.toLowerCase() === normJob);
}

export function convertQtyForUnit(qty, fromUnit, toUnit) {
  const norm = (u) => (u || "each").trim().toLowerCase();
  const from = norm(fromUnit);
  const to = norm(toUnit);
  if (from === to) return qty;
  const isDozen = (u) => ["doz", "dozen", "dz"].includes(u);
  const isEach = (u) => ["each", "ea", "ea.", "pc", "pcs", "pr", "pr.", "pair", "pairs"].includes(u);
  if (isEach(from) && isDozen(to)) return qty / 12;
  if (isDozen(from) && isEach(to)) return qty * 12;
  return qty;
}

// Attaches every page of a receipt to a Job's Reference Documents once any
// of its lines actually get applied there — checked by storage path so a
// receipt spanning multiple approve passes (or multiple lines landing on
// the same job) only ever gets attached once per page, not duplicated.
export function attachReceiptPhotoToJob(job, batch) {
  const pages = [
    ...(batch.photoUrl && batch.photoPath ? [{ url: batch.photoUrl, path: batch.photoPath }] : []),
    ...(batch.extraPhotoUrls || []).map((url, i) => ({ url, path: (batch.extraPhotoPaths || [])[i] })),
  ].filter((p) => p.url && p.path);
  if (pages.length === 0) return job;

  const existingPaths = new Set((job.referenceDocuments || []).map((d) => d.path));
  const newPages = pages.filter((p) => !existingPaths.has(p.path));
  if (newPages.length === 0) return job;

  const baseName = batch.label ? `${batch.label} (receipt)` : "Receipt";
  return {
    ...job,
    referenceDocuments: [
      ...(job.referenceDocuments || []),
      ...newPages.map((p, i) => ({
        id: uniqueId(),
        name: newPages.length > 1 ? `${baseName} — page ${i + 1}` : baseName,
        url: p.url,
        path: p.path,
        type: "image/jpeg",
        uploadedAt: timeStamp(),
      })),
    ],
    activityLog: [
      {
        id: uniqueId(),
        time: timeStamp(),
        message:
          newPages.length > 1
            ? `Attached ${newPages.length} receipt photos from Receiving`
            : "Attached a receipt photo from Receiving",
      },
      ...(job.activityLog || []),
    ].slice(0, 50),
  };
}

// Same idea for a Love List's photos — those are just a flat array of
// URLs rather than document objects, so the duplicate check is simpler.
export function attachReceiptPhotoToLoveList(list, batch) {
  const urls = [batch.photoUrl, ...(batch.extraPhotoUrls || [])].filter(Boolean);
  if (urls.length === 0) return list;
  const existing = new Set(list.referenceImages || []);
  const newUrls = urls.filter((u) => !existing.has(u));
  if (newUrls.length === 0) return list;
  return { ...list, referenceImages: [...(list.referenceImages || []), ...newUrls] };
}

// A self-contained snapshot of whichever receipt most recently touched
// this item — photo included — rather than a reference to the batch
// itself. Receiving history and archive entries can both be deleted or
// cleared independently, so a live lookup could easily end up pointing
// at nothing; this survives that by carrying everything a read-only
// "Receipt" view actually needs.
export function buildSourceReceiptSnapshot(batch) {
  if (!batch) return null;
  return {
    photoUrl: batch.photoUrl || null,
    photoPath: batch.photoPath || null,
    extraPhotoUrls: batch.extraPhotoUrls || [],
    label: batch.label || "",
    vendor: batch.vendor || "",
    receiptDate: batch.receiptDate || "",
    poNumber: batch.poNumber || "",
  };
}

export function applyReceiptLineToJob(job, line, catalog, batch) {
  const match = line.catalogId ? catalog.find((c) => c.id === line.catalogId) : null;
  const items = job.items || [];
  // Matching by name, not catalogId — several real, differently-sized
  // items can share one generic catalog entry on purpose (a "Bridge
  // Clamp" catalog link covering a 4" and a 6" clamp, say), so matching
  // on catalogId alone would silently merge two unrelated items' numbers
  // together. The catalog link only ever supplies defaults for a brand
  // new item below, never decides what counts as "the same item."
  const normLineName = normalizeText(line.name);
  const idx = items.findIndex((i) => normalizeText(i.name) === normLineName);

  if (idx !== -1) {
    const existing = items[idx];
    // Convert to whatever unit the existing item is actually tracked in
    // — a receipt saying "12 EA" against an item tracked in dozens means
    // 1 dozen showed up, not 12.
    const shippedConverted = convertQtyForUnit(line.shippedQty, line.unit, existing.qtyUnit);
    const backorderConverted = convertQtyForUnit(line.backorderQty, line.unit, existing.qtyUnit);
    const containers = [...(existing.containers || [])];
    const unassignedIdx = containers.findIndex((c) => c.name === "Unassigned");
    if (shippedConverted > 0) {
      if (unassignedIdx !== -1) {
        containers[unassignedIdx] = {
          ...containers[unassignedIdx],
          qty: containers[unassignedIdx].qty + shippedConverted,
        };
      } else {
        containers.push({ name: "Unassigned", qty: shippedConverted });
      }
    }
    // Backorder is a snapshot ("as of this receipt, X still outstanding"),
    // not a cumulative fact like shipped quantity — so if receipts get
    // processed out of chronological order (scanning a big backlog
    // newest-first, say), an older receipt's already-stale backorder
    // number could otherwise overwrite one a newer receipt already
    // resolved. Only apply it when we can't tell either date, or when
    // this receipt is genuinely as new or newer than whatever last set it.
    const canCompareDates = line.receiptDate && existing.backorderReceiptDate;
    const shouldUpdateBackorder = !canCompareDates || line.receiptDate >= existing.backorderReceiptDate;
    const finalBackorderQty = shouldUpdateBackorder ? backorderConverted : existing.backorderQty;
    const finalBackorderDate = shouldUpdateBackorder
      ? line.receiptDate || existing.backorderReceiptDate
      : existing.backorderReceiptDate;
    const updated = {
      ...existing,
      containers,
      qtyHave: totalHave(containers),
      status: computeJobItemStatus(totalHave(containers), existing.qtyNeeded),
      ordered: true,
      received: finalBackorderQty > 0 ? "partial" : "yes",
      backorderQty: finalBackorderQty,
      backorderReceiptDate: finalBackorderDate,
      // Same sync as the Love List version — if this line was linked to a
      // catalog entry but the existing item wasn't, the vendor purchase
      // record just logged there would have nothing on this item pointing
      // back to find it.
      catalogId: line.catalogId || existing.catalogId,
      sourceReceipt: buildSourceReceiptSnapshot(batch) || existing.sourceReceipt,
    };
    const nextItems = [...items];
    nextItems[idx] = updated;
    return { ...job, items: nextItems };
  }

  const fresh = {
    ...emptyItem(match ? match.storage : "Unassigned"),
    id: uniqueId(),
    name: line.name,
    qtyNeeded: String(line.shippedQty + line.backorderQty || 1),
    qtyUnit: line.unit && line.unit.toLowerCase() !== "each" ? line.unit : "",
    catalogId: line.catalogId,
    gang: match ? match.gang : "Unassigned",
    storageDetail: match ? match.storageDetail || "" : "",
    category: match ? match.category || "" : "",
    needsTransfer: match ? !!match.needsTransfer : false,
    containers: line.shippedQty > 0 ? [{ name: "Unassigned", qty: line.shippedQty }] : [],
    qtyHave: line.shippedQty,
    status: computeJobItemStatus(line.shippedQty, line.shippedQty + line.backorderQty || 1),
    ordered: true,
    received: line.backorderQty > 0 ? "partial" : line.shippedQty > 0 ? "yes" : "no",
    backorderQty: line.backorderQty,
    backorderReceiptDate: line.receiptDate || null,
    // Flags this as a fresh item Receiving created rather than matched —
    // lets the item card highlight it and offer a merge, since a brand
    // new name might really just be an existing item under slightly
    // different wording (a size variant, a typo) rather than genuinely
    // new stock.
    importedViaReceiving: true,
    sourceReceipt: buildSourceReceiptSnapshot(batch),
  };
  return { ...job, items: [...items, fresh] };
}

export function applyReceiptLineToLoveList(list, line, catalog, batch) {
  const match = line.catalogId ? catalog.find((c) => c.id === line.catalogId) : null;
  const items = list.items || [];
  // Same fix as the Job version — match by name, not catalog link, since
  // several differently-sized items can share one generic catalog entry.
  const normLineName = normalizeText(line.name);
  const idx = items.findIndex((i) => normalizeText(i.name) === normLineName);

  if (idx !== -1) {
    const existing = items[idx];
    // Same each↔dozen conversion as the Job version — convert into
    // whatever unit the existing item is actually tracked in.
    const shippedConverted = convertQtyForUnit(line.shippedQty, line.unit, existing.qtyUnit);
    const backorderConverted = convertQtyForUnit(line.backorderQty, line.unit, existing.qtyUnit);
    const currentHave = existing.qtyHave || 0;
    const newHave = currentHave + shippedConverted;
    let receivedBatches = existing.receivedBatches || [];
    if (shippedConverted > 0) {
      receivedBatches = [
        ...receivedBatches,
        { receivedQty: shippedConverted, serials: [], timestamp: new Date().toISOString() },
      ];
    }
    const statusOrder = ["requested", "ordered", "received", "staged", "sent"];
    const shouldAdvance = shippedConverted > 0 && statusOrder.indexOf(existing.status) < statusOrder.indexOf("received");
    // Same backorder-staleness protection as the Job version — see that
    // one for the full explanation.
    const canCompareDates = line.receiptDate && existing.backorderReceiptDate;
    const shouldUpdateBackorder = !canCompareDates || line.receiptDate >= existing.backorderReceiptDate;
    const updated = {
      ...existing,
      qtyHave: newHave,
      receivedBatches,
      backorderQty: shouldUpdateBackorder ? backorderConverted : existing.backorderQty,
      backorderReceiptDate: shouldUpdateBackorder
        ? line.receiptDate || existing.backorderReceiptDate
        : existing.backorderReceiptDate,
      status: shouldAdvance ? "received" : existing.status,
      statusDates: shouldAdvance
        ? { ...existing.statusDates, received: new Date().toISOString().slice(0, 10) }
        : existing.statusDates,
      // If this receipt's line was linked to a catalog entry but the
      // existing item wasn't (or pointed somewhere stale), sync it here —
      // otherwise the vendor purchase record just written to that catalog
      // entry would have nothing on this item pointing back to find it,
      // even though the history itself is correctly logged.
      catalogId: line.catalogId || existing.catalogId,
      sourceReceipt: buildSourceReceiptSnapshot(batch) || existing.sourceReceipt,
    };
    const nextItems = [...items];
    nextItems[idx] = updated;
    return { ...list, items: nextItems };
  }

  const fresh = newLoveListItem(line.name, line.shippedQty + line.backorderQty || 1, {
    catalogId: line.catalogId,
    storage: match ? match.storage : "",
    storageDetail: match ? match.storageDetail || "" : "",
    needsTransfer: match ? !!match.needsTransfer : false,
    backorderQty: line.backorderQty,
    backorderReceiptDate: line.receiptDate || null,
    qtyUnit: line.unit && line.unit.toLowerCase() !== "each" ? line.unit : "",
  });
  fresh.qtyHave = line.shippedQty;
  // Same flag as the Job version — a new item Receiving created rather
  // than matched, so it can be highlighted and offered a merge.
  fresh.importedViaReceiving = true;
  fresh.sourceReceipt = buildSourceReceiptSnapshot(batch);
  if (line.shippedQty > 0) {
    fresh.status = "received";
    fresh.statusDates.received = new Date().toISOString().slice(0, 10);
    fresh.receivedBatches = [
      { receivedQty: line.shippedQty, serials: [], timestamp: new Date().toISOString() },
    ];
  }
  return { ...list, items: [...items, fresh] };
}
