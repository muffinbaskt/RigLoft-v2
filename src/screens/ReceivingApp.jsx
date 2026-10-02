import { useState, useEffect, useRef } from "react";
import {
  X,
  Archive,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  History,
  Inbox,
  Lock,
  RotateCcw,
  Search,
} from "lucide-react";
import { CATALOG_KEY, JOBS_KEY, deleteReferenceDocument, getWithRetry, saveWithRetry, uploadReceiptScan } from "../lib/api";
import { LOVE_LISTS_KEY } from "../lib/lovelists";
import {
  RECEIVING_NAME_MEMORY_KEY,
  RECEIVING_QUEUE_KEY,
  RECEIVING_UNDO_KEY,
  applyReceiptLineToJob,
  applyReceiptLineToLoveList,
  attachReceiptPhotoToJob,
  attachReceiptPhotoToLoveList,
  computeUsualVendor,
  newReceiptBatch,
  poContainsJobNumber,
} from "../lib/receiving";
import {
  findCatalogMatch,
  findScannedLineMatch,
  normalizeText,
  playSaveChime,
  selectOnFocus,
  timeStamp,
  uniqueId,
  withLearnedAlias,
} from "../lib/utils";
import { formatTaskTimestamp } from "../lib/workertasks";
import {
  downloadReceivingQueueBackupFile,
  maybeAutoBackupReceivingQueue,
  parseReceivingQueueBackup,
} from "../lib/backup";
import {
  BackupRestoreBar,
  ConfirmDelete,
  GroupPhotoStepper,
  PhotoLightbox,
  SectionHeader,
} from "../components/shared";

// Scanning + verifying incoming shipments against what's on the receipt,
// before anything actually gets added to a job or Love List. Nothing here
// touches real inventory until a batch is explicitly approved — the whole
// point is a safe holding area to check the paper against the pallet
// first, since a wrong or duplicate scan should never silently corrupt a
// job's real numbers.
// Read-only look back at an approved (or discarded) receipt — the photo
// and every line item exactly as they ended up, with which job/list each
// one landed on. Nothing here is editable; this is purely a record.
function ReceiptHistoryDetail({ batch, jobs, lists, onBack, onViewPhoto }) {
  const targetLabelFor = (line) => {
    if (!line.targetId) return null;
    if (line.targetType === "job") {
      const j = jobs.find((x) => x.id === line.targetId);
      return j ? j.name : "a job";
    }
    const l = lists.find((x) => x.id === line.targetId);
    return l ? `${l.jobLabel}${l.subJobLabel ? ` — ${l.subJobLabel}` : ""}` : "a Love List";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
        <span
          className={`text-xs rounded-full px-2.5 py-1 border ${
            batch.status === "approved"
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
              : "bg-slate-800 text-slate-500 border-slate-700"
          }`}
        >
          {batch.status === "approved" ? "Approved" : "Discarded"}
        </span>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        {batch.label && <h2 className="text-slate-100 font-semibold text-base mb-1">{batch.label}</h2>}
        <p className="text-xs text-slate-500 mb-4">
          {formatTaskTimestamp(batch.approvedAt || batch.scannedAt)}
        </p>
        {batch.photoUrl && (
          <div className="mb-4">
            <button
              onClick={() =>
                onViewPhoto({
                  photos: [batch.photoUrl, ...(batch.extraPhotoUrls || [])]
                    .filter(Boolean)
                    .map((url) => ({ url, alt: "Receipt" })),
                  index: 0,
                })
              }
              className="w-full rounded-lg overflow-hidden border border-slate-800"
            >
              <img src={batch.photoUrl} alt="Receipt" className="w-full max-h-56 object-cover" />
            </button>
            {(batch.extraPhotoUrls || []).length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {batch.extraPhotoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      onViewPhoto({
                        photos: [batch.photoUrl, ...(batch.extraPhotoUrls || [])]
                          .filter(Boolean)
                          .map((u) => ({ url: u, alt: "Receipt" })),
                        index: i + 1,
                      })
                    }
                    className="rounded-md overflow-hidden border border-slate-800"
                  >
                    <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="text-xs font-medium text-slate-400 mb-2">
          Line items ({batch.lines.length})
        </p>
        <div className="space-y-2">
          {batch.lines.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nothing recorded on this receipt.</p>
          ) : (
            batch.lines.map((line) => (
              <div key={line.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                <p className="text-sm text-slate-100">{line.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shipped {line.shippedQty}
                  {line.backorderQty > 0 ? ` · ${line.backorderQty} backorder` : ""}
                  {line.unit && line.unit.toLowerCase() !== "each" ? ` ${line.unit}` : ""}
                </p>
                {line.targetId ? (
                  <p className="text-xs text-emerald-400 mt-1">→ {targetLabelFor(line)}</p>
                ) : (
                  <p className="text-xs text-slate-600 mt-1">Never assigned a destination</p>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export function ReceivingApp({ onGoHome, onQuickNav, isOwner }) {
  const [queue, setQueue] = useState([]);
  // Kept in sync on every single write, synchronously — this is what a
  // long bulk scan reads from before merging in each new receipt. Using
  // the `queue` state variable directly there was the actual bug: if you
  // edited something (like a label) while other files were still
  // scanning in the background, the next background scan to finish would
  // save from an old snapshot taken before your edit and silently wipe it
  // out. Reading from this ref instead means every save always builds on
  // top of whatever's genuinely most recent, no matter what else was
  // happening at the same time.
  const queueRef = useRef([]);
  const [jobs, setJobs] = useState([]);
  const [lists, setLists] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [nameMemory, setNameMemory] = useState({}); // normalized raw text -> confirmed final name
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null); // { current, total } while scanning several
  const [recheckProgress, setRecheckProgress] = useState(null); // { current, total } while re-checking pending receipts for order #s
  const [scanError, setScanError] = useState("");
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingSearch, setPendingSearch] = useState("");
  const [dismissedPageGroups, setDismissedPageGroups] = useState(new Set());
  // Persist across renders (not React state — nothing here needs to
  // trigger a re-render on its own, it just needs to remember what it
  // already decided) so a group's letter is permanent for as long as
  // that group exists, and no letter ever gets reused for a different
  // document later.
  const multiPageGroupLettersRef = useRef(null);
  const nextGroupLetterIndexRef = useRef(0);
  const [viewingGroupPhotos, setViewingGroupPhotos] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState(null); // { photos: [{url,alt}], index } | null
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmingClearDiscarded, setConfirmingClearDiscarded] = useState(false);
  const [confirmingClearAllHistory, setConfirmingClearAllHistory] = useState(false);
  const [viewingHistoryBatch, setViewingHistoryBatch] = useState(null);
  const [receivingUndoStack, setReceivingUndoStack] = useState([]);
  const fileInputRef = useRef(null);
  const [backupNotice, setBackupNotice] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restorePending, setRestorePending] = useState(null); // { receivingQueue, exportedAt }

  const load = async () => {
    try {
      const [qResult, jResult, lResult, cResult, nResult, uResult] = await Promise.all([
        getWithRetry(RECEIVING_QUEUE_KEY),
        getWithRetry(JOBS_KEY),
        getWithRetry(LOVE_LISTS_KEY),
        getWithRetry(CATALOG_KEY),
        getWithRetry(RECEIVING_NAME_MEMORY_KEY),
        getWithRetry(RECEIVING_UNDO_KEY),
      ]);
      if (qResult.ok && qResult.value) {
        const loaded = JSON.parse(qResult.value);
        setQueue(loaded);
        queueRef.current = loaded;
        maybeAutoBackupReceivingQueue(loaded);
      }
      if (jResult.ok && jResult.value) setJobs(JSON.parse(jResult.value));
      if (lResult.ok && lResult.value) setLists(JSON.parse(lResult.value));
      if (cResult.ok && cResult.value) setCatalog(JSON.parse(cResult.value));
      if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
      if (uResult.ok && uResult.value) setReceivingUndoStack(JSON.parse(uResult.value));
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    // Receiving's tied to money (vendor spend) and has no view-only mode
    // of its own — unlike Love Lists/Job Lists, anyone who reaches this
    // component at all sees and can edit everything. The landing screen
    // already hides its tile from anyone but the owner, but that's just a
    // hidden button — this screen is also reachable directly (a manager's
    // own login, the quick-nav menu, or even a crafted
    // ?section=receiving&id=... link), so the real gate has to live here,
    // not just at the one obvious door. Skipping the load itself (not
    // just hiding the render below) means a blocked visitor's browser
    // never even fetches the receiving queue.
    if (!isOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // Same fix as PullFromReceivingModal's saveQueue: local state updates
  // immediately, but the actual write to Supabase is debounced instead of
  // firing on every call. A name or quantity field calls this on every
  // keystroke — with no debounce, each keystroke fired its own
  // independent, unordered save, so a slow connection could let an
  // earlier, half-typed request land *after* the final one and silently
  // overwrite it with a mid-typing snapshot. Waiting for a pause means
  // exactly one save goes out, with the true final value.
  const queueSaveTimer = useRef(null);
  const saveQueue = (next) => {
    queueRef.current = next;
    setQueue(next);
    if (queueSaveTimer.current) clearTimeout(queueSaveTimer.current);
    queueSaveTimer.current = setTimeout(() => {
      saveWithRetry(RECEIVING_QUEUE_KEY, JSON.stringify(queueRef.current)).catch(() => {});
      maybeAutoBackupReceivingQueue(queueRef.current);
    }, 600);
  };

  const backUpQueueNow = async () => {
    const ok = await downloadReceivingQueueBackupFile(queueRef.current, { force: true });
    const n = queueRef.current.length;
    setBackupNotice(ok ? `✅ Backup saved (${n} batch${n === 1 ? "" : "es"})` : "Couldn't create the backup file");
    setTimeout(() => setBackupNotice(null), 4000);
  };
  const handleQueueRestoreFileChosen = (file) => {
    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseReceivingQueueBackup(e.target.result);
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      setRestorePending({ receivingQueue: result.receivingQueue, exportedAt: result.exportedAt });
    };
    reader.onerror = () => setRestoreError("Couldn't read that file off the device.");
    reader.readAsText(file);
  };
  const confirmQueueRestore = async () => {
    if (!restorePending) return;
    const incoming = restorePending.receivingQueue;
    setRestorePending(null);
    if (queueRef.current.length > 0) {
      await downloadReceivingQueueBackupFile(queueRef.current, {
        force: true,
        label: "receiving-queue-before-restore",
      });
    }
    saveQueue(incoming);
    setBackupNotice(`✅ Restored ${incoming.length} batch${incoming.length === 1 ? "" : "es"}`);
    setTimeout(() => setBackupNotice(null), 4000);
  };

  // Undo for Receiving's genuinely consequential actions — approve,
  // discard, deleting a history entry, and the two bulk "clear" actions
  // — since those are the ones with no other way back once they've
  // happened (unlike editing a line's quantity or destination, which you
  // can just redo by hand, so those never push an entry here). Now
  // persisted (survives closing the tab, unlike the first version of
  // this), same as Job Lists' own undo — but two different weights of
  // entry, because approve is a genuinely different kind of action than
  // the rest: it touches jobs, Love Lists, AND the catalog's vendor
  // spend history all at once, so its entry snapshots all three of
  // those plus the queue. Every other covered action only ever touches
  // the queue itself, so those entries are far cheaper — just the queue.
  // Capped at the last 3 either way, oldest dropped, no redo.
  const MAX_RECEIVING_UNDO_ENTRIES = 3;
  const persistReceivingUndo = (stack) => {
    saveWithRetry(RECEIVING_UNDO_KEY, JSON.stringify(stack)).catch(() => {});
  };
  const pushReceivingUndo = (label, { full = false } = {}) => {
    const entry = {
      id: uniqueId(),
      time: timeStamp(),
      label,
      queueSnapshot: queueRef.current,
      ...(full
        ? { full: true, jobsSnapshot: jobs, listsSnapshot: lists, catalogSnapshot: catalog }
        : {}),
    };
    setReceivingUndoStack((prev) => {
      const next = [entry, ...prev].slice(0, MAX_RECEIVING_UNDO_ENTRIES);
      persistReceivingUndo(next);
      return next;
    });
  };

  const undoLastReceivingAction = async () => {
    const [mostRecent, ...rest] = receivingUndoStack;
    if (!mostRecent) return;
    setReceivingUndoStack(rest);
    persistReceivingUndo(rest);
    saveQueue(mostRecent.queueSnapshot);
    if (mostRecent.full) {
      setJobs(mostRecent.jobsSnapshot);
      setLists(mostRecent.listsSnapshot);
      setCatalog(mostRecent.catalogSnapshot);
      await Promise.all([
        saveWithRetry(JOBS_KEY, JSON.stringify(mostRecent.jobsSnapshot)),
        saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(mostRecent.listsSnapshot)),
        saveWithRetry(CATALOG_KEY, JSON.stringify(mostRecent.catalogSnapshot)),
      ]);
    }
    playSaveChime();
  };

  // Scans exactly one file and returns the finished batch object — doesn't
  // touch the queue itself, so it can be called in a loop for multiple
  // receipts without each one stepping on the others' state updates.
  const scanOneFile = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Couldn't read that image."));
      reader.readAsDataURL(file);
    });

    let photoUrl = null;
    let photoPath = null;
    const uploadResult = await uploadReceiptScan(file);
    if (uploadResult.ok) {
      photoUrl = uploadResult.url;
      photoPath = uploadResult.path;
    }

    const res = await fetch(
      "https://vwvppivdpxjvmaazcmmg.supabase.co/functions/v1/scan-receipt",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
      }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Scan failed.");

    const lines = (data.items || []).map((it) => {
      const rawName = it.name || "";
      // Matched against the corrected name when one exists, not the raw
      // OCR text — same fix as the Archive version of this same
      // function. A name-memory correction can turn something like
      // "HOUG 12230 Cutter Annular 15/16 Hss Slugger" into "Mag Drill
      // Bit, 15/16"", and the corrected version is what actually
      // resembles the catalog entry — matching against the untouched
      // raw text meant a part with no learned alias yet would show "No
      // catalog match" even though its corrected name would clearly
      // match.
      const remembered = nameMemory[normalizeText(rawName)];
      const suggestedName = remembered || rawName;
      const match = findScannedLineMatch(rawName, suggestedName, catalog);
      // The catalog match drives storage/gang/category defaults, but
      // never the display name itself — plenty of catalog entries are
      // shared across multiple real variants (different sizes sharing
      // the same gang/storage) with no reliable flag distinguishing
      // that, so the only safe default is the raw OCR text, unless
      // this exact SKU string has already been confirmed once before.
      return {
        id: uniqueId(),
        rawName,
        name: suggestedName,
        catalogId: match ? match.id : null,
        backorderQty: Number(it.backorderQty) > 0 ? Number(it.backorderQty) : 0,
        shippedQty: Number(it.shippedQty) > 0 ? Number(it.shippedQty) : 0,
        // The receipt's own unit of measure (EACH, DZ, CS, etc.) — used
        // to convert against whatever unit an existing item is actually
        // tracked in, so "12 EA" correctly reads as "1 DZ" when that's
        // what the matching item uses.
        unit: (it.unit || "each").trim(),
        // Per-unit price, if the receipt actually printed one — used for
        // vendor spend tracking. 0 means no price data was found.
        unitPrice: Number(it.unitPrice) > 0 ? Number(it.unitPrice) : 0,
        // Copied from the batch's own header field — kept on the line so
        // the backorder-protection check has it available without
        // needing to thread the whole batch through every function that
        // touches a line.
        receiptDate: data.receiptDate || "",
        vendor: data.vendor || "",
        // Target lives on the LINE, not the whole receipt — a single PO
        // can genuinely cover materials for two different Love Lists
        // and a job all at once, so each line needs to be routable on
        // its own rather than the whole batch pointing one place.
        targetType: null,
        targetId: null,
        // Marked true once this line's actually been applied somewhere —
        // kept in the batch forever after that (never deleted), so an
        // approved receipt still has its real contents to look back at
        // in history instead of an empty shell.
        approved: false,
      };
    });

    return newReceiptBatch(photoUrl, photoPath, lines, {
      pageNumber: data.pageNumber,
      totalPages: data.totalPages,
      orderNumber: data.orderNumber,
      vendor: data.vendor,
      poNumber: data.poNumber,
      receiptDate: data.receiptDate,
      originalFileName: file.name || "",
    });
  };

  // Runs one photo at a time (not in parallel) — keeps the OCR endpoint
  // from getting hammered with a burst of simultaneous requests, and
  // means a progress count ("Scanning 2 of 5...") is actually meaningful.
  // A single receipt still auto-opens for review, same as before; several
  // at once just drop into the pending queue for you to work through
  // later — which is the point, since scanning a whole stack and setting
  // it aside is exactly the workflow this is for.
  const runScans = async (fileList) => {
    setScanning(true);
    setScanError("");
    const files = Array.from(fileList);
    const errors = [];
    // Saved the instant each one finishes, not batched up until the very
    // end — for a handful of receipts that distinction barely matters,
    // but for a big stack it's the difference between losing nothing and
    // losing everything if the tab gets backgrounded, the phone locks, or
    // anything else interrupts a run that might take several minutes.
    //
    // Each iteration reads queueRef.current fresh, right before saving —
    // not a locally-tracked variable — because a scan can take several
    // seconds, plenty of time for you to open an already-finished receipt
    // and start editing it while the rest keep scanning in the
    // background. Reading a stale snapshot here would silently overwrite
    // whatever you'd just typed the next time a background scan finished.
    let firstBatchId = null;
    for (let i = 0; i < files.length; i++) {
      setScanProgress({ current: i + 1, total: files.length });
      try {
        const batch = await scanOneFile(files[i]);
        saveQueue([batch, ...queueRef.current]);
        if (!firstBatchId) firstBatchId = batch.id;
        playSaveChime();
      } catch (err) {
        errors.push(`"${files[i].name}" — ${err.message || String(err)}`);
      }
    }
    if (files.length === 1 && firstBatchId) setActiveBatchId(firstBatchId);
    if (errors.length > 0) setScanError(errors.join(" · "));
    setScanning(false);
    setScanProgress(null);
  };

  // Re-runs OCR against photos already sitting in storage — for
  // backfilling order numbers on receipts that were scanned before this
  // extraction existed or got improved, without needing to re-photograph
  // anything. Deliberately touches ONLY orderNumber — never pageNumber,
  // totalPages, line items, or anything else already on the batch —
  // since re-detecting page info on an already-combined receipt's first
  // page (which may still visibly say "Page 1 of 2" on the paper itself)
  // could otherwise silently undo a combine that was already resolved.
  const recheckOrderNumbers = async () => {
    const targets = queueRef.current.filter(
      (b) => b.status === "pending" && b.photoUrl && !b.orderNumber
    );
    if (targets.length === 0) return;

    setRecheckProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      setRecheckProgress({ current: i + 1, total: targets.length });
      try {
        const imgRes = await fetch(targets[i].photoUrl);
        const blob = await imgRes.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () => reject(new Error("Couldn't read that photo."));
          reader.readAsDataURL(blob);
        });
        const res = await fetch(
          "https://vwvppivdpxjvmaazcmmg.supabase.co/functions/v1/scan-receipt",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mediaType: blob.type || "image/jpeg" }),
          }
        );
        const data = await res.json();
        if (data.ok && data.orderNumber) {
          const current = queueRef.current.find((b) => b.id === targets[i].id);
          if (current) {
            saveQueue(
              queueRef.current.map((b) =>
                b.id === targets[i].id ? { ...b, orderNumber: data.orderNumber } : b
              )
            );
          }
        }
      } catch {
        // Skip silently — this is a best-effort backfill, not something
        // that should interrupt the rest of the batch over one failure.
      }
    }
    setRecheckProgress(null);
  };

  const updateBatch = (updated) => {
    saveQueue(queueRef.current.map((b) => (b.id === updated.id ? updated : b)));
  };

  // Same alias-learning as Love List's scan review — linking a garbled OCR
  // string to a catalog item teaches that exact phrase for next time, so
  // future receipts from the same supplier auto-match instead of needing
  // a manual link again.
  const learnAlias = (catalogId, aliasText) => {
    if (!catalogId || !aliasText || !aliasText.trim()) return;
    setCatalog((prev) => {
      const next = withLearnedAlias(prev, catalogId, aliasText);
      if (next !== prev) saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Every approved line that's linked to a catalog item and has both a
  // vendor and a price logs a purchase record on that catalog entry —
  // this is what "Usual Vendor" gets computed from, and what the Vendor
  // breakdown button shows. Deliberately lives on the catalog item, not
  // the job/list item, since spend history is a property of the item
  // TYPE across every job over time, not any one job's specific copy.
  const recordVendorPurchases = (lines) => {
    const eligible = lines.filter((l) => l.catalogId && l.vendor && l.vendor.trim() && l.shippedQty > 0);
    if (eligible.length === 0) return;
    setCatalog((prev) => {
      const next = prev.map((c) => {
        const linesForThis = eligible.filter((l) => l.catalogId === c.id);
        if (linesForThis.length === 0) return c;
        const newRecords = linesForThis.map((l) => ({
          id: uniqueId(),
          vendor: l.vendor.trim(),
          qty: l.shippedQty,
          amount: Math.round((l.unitPrice || 0) * l.shippedQty * 100) / 100,
          date: l.receiptDate || new Date().toISOString().slice(0, 10),
        }));
        const updatedHistory = [...(c.vendorHistory || []), ...newRecords];
        return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || c.vendor };
      });
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const discardBatch = async (batch) => {
    pushReceivingUndo(`Discarded receipt: ${batch.label || batch.vendor || "receipt"}`);
    // Deliberately doesn't delete the photo file here — a discard needs
    // to stay fully reversible for at least a few actions (see the undo
    // stack above), and a deleted storage file can't come back. The
    // actual file cleanup happens in clearDiscarded below, once someone
    // explicitly empties the discarded pile for good.
    saveQueue(queueRef.current.map((b) => (b.id === batch.id ? { ...b, status: "discarded" } : b)));
    setActiveBatchId(null);
  };

  // Folds a second pending receipt into the one you're currently
  // reviewing — for when a bulk scan turned one multi-page receipt into
  // several separate entries. The absorbed batch's lines and photo(s)
  // move into the target; the absorbed batch itself is removed from the
  // queue entirely rather than left behind as an empty duplicate.
  const combineBatches = (targetId, sourceId) => {
    const target = queueRef.current.find((b) => b.id === targetId);
    const source = queueRef.current.find((b) => b.id === sourceId);
    if (!target || !source || target.id === source.id) return;

    const mergedLines = [...target.lines, ...source.lines.map((l) => ({ ...l, id: uniqueId() }))];
    const mergedExtraUrls = [
      ...(target.extraPhotoUrls || []),
      ...(source.photoUrl ? [source.photoUrl] : []),
      ...(source.extraPhotoUrls || []),
    ];
    const mergedExtraPaths = [
      ...(target.extraPhotoPaths || []),
      ...(source.photoPath ? [source.photoPath] : []),
      ...(source.extraPhotoPaths || []),
    ];
    const updatedTarget = {
      ...target,
      lines: mergedLines,
      extraPhotoUrls: mergedExtraUrls,
      extraPhotoPaths: mergedExtraPaths,
      // Cleared so this combined result stops looking like an unfinished
      // "page 1 of 2" still searching for a partner — without this, it
      // would keep matching against whatever unrelated receipt happens
      // to share the same page count, silently absorbing more into the
      // same group every time the suggestion re-evaluates.
      pageNumber: 1,
      totalPages: 1,
    };

    playSaveChime();
    saveQueue(
      queueRef.current
        .filter((b) => b.id !== sourceId)
        .map((b) => (b.id === targetId ? updatedTarget : b))
    );
  };

  // Same as above but folds several source batches into one target in a
  // single pass — used for the auto-detected "these look like pages of
  // the same document" suggestion, where combining one at a time would
  // have each call working off the same stale queue snapshot and losing
  // all but the last merge.
  const combineMultipleBatches = (targetId, sourceIds) => {
    const target = queueRef.current.find((b) => b.id === targetId);
    const sources = sourceIds.map((id) => queueRef.current.find((b) => b.id === id)).filter(Boolean);
    if (!target || sources.length === 0) return;

    let mergedLines = [...target.lines];
    let mergedExtraUrls = [...(target.extraPhotoUrls || [])];
    let mergedExtraPaths = [...(target.extraPhotoPaths || [])];
    sources.forEach((source) => {
      mergedLines = [...mergedLines, ...source.lines.map((l) => ({ ...l, id: uniqueId() }))];
      if (source.photoUrl) mergedExtraUrls.push(source.photoUrl);
      if (source.photoPath) mergedExtraPaths.push(source.photoPath);
      mergedExtraUrls = [...mergedExtraUrls, ...(source.extraPhotoUrls || [])];
      mergedExtraPaths = [...mergedExtraPaths, ...(source.extraPhotoPaths || [])];
    });
    const updatedTarget = {
      ...target,
      lines: mergedLines,
      extraPhotoUrls: mergedExtraUrls,
      extraPhotoPaths: mergedExtraPaths,
      // Same reset as the pairwise combine — a batch that's already been
      // combined shouldn't still register as an incomplete "page X of Y"
      // eligible for further auto-matching.
      pageNumber: 1,
      totalPages: 1,
    };
    const sourceIdSet = new Set(sourceIds);

    playSaveChime();
    saveQueue(
      queueRef.current
        .filter((b) => !sourceIdSet.has(b.id))
        .map((b) => (b.id === targetId ? updatedTarget : b))
    );
  };

  // Fully removes a history entry — discardBatch above already deletes
  // the photo file itself; this just clears the leftover queue record so
  // discarded (or old approved) receipts don't pile up forever.
  const deleteBatch = (id) => {
    const batch = queueRef.current.find((b) => b.id === id);
    if (batch) {
      pushReceivingUndo(`Deleted "${batch.label || batch.vendor || "receipt"}" from history`);
    }
    saveQueue(queueRef.current.filter((b) => b.id !== id));
  };
  const clearDiscarded = () => {
    // This is the actual point of no return for a discarded batch — the
    // record AND its photo file(s), since discard itself now only flips
    // status (see the comment there) to stay undo-able. That means undo
    // on this specific action can only ever bring the queue records
    // back, not any photo file that's already been deleted — the label
    // says so, rather than implying a full reversal.
    const count = queueRef.current.filter((b) => b.status === "discarded").length;
    if (count > 0) {
      pushReceivingUndo(
        `Cleared ${count} discarded receipt${count === 1 ? "" : "s"} (records only — photos already deleted can't come back)`
      );
    }
    queueRef.current
      .filter((b) => b.status === "discarded")
      .forEach((b) => {
        if (b.photoPath) deleteReferenceDocument(b.photoPath).catch(() => {});
        (b.extraPhotoPaths || []).forEach((p) => deleteReferenceDocument(p).catch(() => {}));
      });
    saveQueue(queueRef.current.filter((b) => b.status !== "discarded"));
  };
  // Wipes the whole history list, approved entries included — this only
  // ever removes Receiving's own queue record. It never touches the
  // actual storage files or the job/Love List photo attachments, since
  // an approved receipt's photo may still be legitimately living on a
  // job's Reference Documents page — deleting the underlying file here
  // would silently break that.
  const clearAllHistory = () => {
    const count = queueRef.current.filter((b) => b.status !== "pending").length;
    if (count > 0) {
      pushReceivingUndo(`Cleared ${count} receipt${count === 1 ? "" : "s"} from history`);
    }
    saveQueue(queueRef.current.filter((b) => b.status === "pending"));
  };

  // Applying an approved line to a Job — items are matched by catalogId;
  // an existing match gets the shipped amount added into an "Unassigned"
  // container (since Receiving doesn't know which gangbox/conex it'll
  // eventually land in — that's a normal follow-up sort, not a blocker
  // here), and the backorder figure is set to whatever this receipt says
  // is still outstanding. No match at all means a brand new item, using
  // the catalog entry's usual defaults if one was linked.
  const applyLineToJob = (job, line, batch) => applyReceiptLineToJob(job, line, catalog, batch);

  // Same idea for a Love List — existing item gets Have bumped (with the
  // same "catch up the received-batch history" treatment the qty box
  // already does elsewhere, so the delivery record stays honest even
  // though this arrived through Receiving instead of the usual stepper),
  // status only advances if something actually showed up.
  const applyLineToLoveList = (list, line, batch) => applyReceiptLineToLoveList(list, line, catalog, batch);

  // Only processes lines that actually have a target assigned — lines
  // still waiting on a decision stay behind in the batch untouched. That
  // means one receipt covering two Love Lists and a job can be approved
  // in pieces as each line gets sorted out, rather than all-or-nothing.
  const approveBatch = async (batch) => {
    // Only lines with a destination that haven't been processed yet —
    // the "not approved" check is what makes it safe to press Approve
    // again later on the same receipt without double-applying anything
    // already committed.
    const assignedLines = batch.lines.filter(
      (l) => l.name.trim() && l.targetType && l.targetId && !l.approved
    );
    if (assignedLines.length === 0) return;

    pushReceivingUndo(`Approved receipt: ${batch.label || batch.vendor || "receipt"}`, { full: true });

    recordVendorPurchases(assignedLines);

    const jobGroups = {};
    const listGroups = {};
    assignedLines.forEach((line) => {
      const bucket = line.targetType === "job" ? jobGroups : listGroups;
      (bucket[line.targetId] = bucket[line.targetId] || []).push(line);
    });

    if (Object.keys(jobGroups).length > 0) {
      const nextJobs = jobs.map((j) => {
        const jobLines = jobGroups[j.id];
        if (!jobLines) return j;
        let updated = j;
        jobLines.forEach((line) => {
          updated = applyLineToJob(updated, line, batch);
        });
        // One photo, attached once, regardless of how many lines from
        // this receipt ended up on this particular job.
        updated = attachReceiptPhotoToJob(updated, batch);
        return updated;
      });
      setJobs(nextJobs);
      await saveWithRetry(JOBS_KEY, JSON.stringify(nextJobs));
    }

    if (Object.keys(listGroups).length > 0) {
      const nextLists = lists.map((l) => {
        const listLines = listGroups[l.id];
        if (!listLines) return l;
        let updated = l;
        listLines.forEach((line) => {
          updated = applyLineToLoveList(updated, line, batch);
        });
        updated = attachReceiptPhotoToLoveList(updated, batch);
        return updated;
      });
      setLists(nextLists);
      await saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(nextLists));
    }

    // Remember exactly what each line ended up named, keyed to its raw
    // OCR text — this is what lets a size-specific item (a particular
    // "Beater, 4lb" SKU string, say) come back auto-filled correctly next
    // time, instead of needing the size retyped every single receipt.
    const nextMemory = { ...nameMemory };
    assignedLines.forEach((line) => {
      if (line.rawName) nextMemory[normalizeText(line.rawName)] = line.name.trim();
    });
    setNameMemory(nextMemory);
    saveWithRetry(RECEIVING_NAME_MEMORY_KEY, JSON.stringify(nextMemory)).catch(() => {});

    playSaveChime();

    // Lines stay on the batch forever, just flagged — an approved
    // receipt keeps its real contents on record instead of vanishing
    // into an empty shell once everything's been applied. The batch
    // itself only flips to "approved" once every named line is done.
    const updatedLines = batch.lines.map((l) => (assignedLines.includes(l) ? { ...l, approved: true } : l));
    const stillPending = updatedLines.some((l) => l.name.trim() && !l.approved);
    const updatedBatch = stillPending
      ? { ...batch, lines: updatedLines }
      : { ...batch, lines: updatedLines, status: "approved", approvedAt: new Date().toISOString() };
    saveQueue(queueRef.current.map((b) => (b.id === batch.id ? updatedBatch : b)));
    if (!stillPending) setActiveBatchId(null);
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Owner only</h2>
          <p className="text-sm text-slate-500 mb-5">Receiving isn't available on this account.</p>
          <button
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold rounded-md px-4 py-2 hover:bg-slate-700"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const pending = queue.filter((b) => b.status === "pending").filter((b) => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [b.label, ...b.lines.map((l) => l.name)].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  // Groups pending receipts that printed their own "Page X of Y" —
  // walked in the order they were actually scanned, not just bucketed by
  // matching totalPages. That distinction matters the moment you bulk-
  // scan two different multi-page receipts in the same run: bucketing by
  // total page count alone would lump all of both documents' pages
  // together as one ambiguous pile. Following scan order instead — "does
  // this page continue an already-open group of the same total, or does
  // it start a new one" — keeps interleaved or back-to-back documents
  // correctly separated. When an order number is available on both
  // sides, it's used as a veto — a sequence match with a clearly
  // different order number is rejected rather than joined, since that's
  // a much stronger signal than page order alone that two receipts are
  // actually unrelated.
  const rawMultiPageGroups = (() => {
    const rawPending = [...queue.filter((b) => b.status === "pending" && b.totalPages > 1)].sort(
      (a, b) => new Date(a.scannedAt) - new Date(b.scannedAt)
    );
    const norm = (s) => (s || "").trim().toLowerCase();
    const openGroups = []; // { totalPages, lastPageNumber, orderNumber, batches: [] }
    rawPending.forEach((b) => {
      const openMatch = openGroups.find((g) => {
        if (g.totalPages !== b.totalPages) return false;
        if (g.lastPageNumber !== b.pageNumber - 1) return false;
        if (g.batches.length >= g.totalPages) return false;
        // Both sides have an order number and they don't match — treat
        // as a different document even though the sequence lines up.
        if (g.orderNumber && b.orderNumber && norm(g.orderNumber) !== norm(b.orderNumber)) return false;
        return true;
      });
      if (openMatch) {
        openMatch.batches.push(b);
        openMatch.lastPageNumber = b.pageNumber;
        if (!openMatch.orderNumber && b.orderNumber) openMatch.orderNumber = b.orderNumber;
      } else {
        openGroups.push({
          totalPages: b.totalPages,
          lastPageNumber: b.pageNumber,
          orderNumber: b.orderNumber || "",
          batches: [b],
        });
      }
    });
    return openGroups.filter((g) => g.batches.length >= 2);
  })();

  // Letters are assigned once per group and never reused or reshuffled —
  // keyed off the id of whichever batch started that group, which never
  // changes for as long as the group exists. Without this, a letter was
  // really just "whichever group happens to be first in the list this
  // render" — recomputed from scratch every time anything changed, so a
  // totally different set of receipts could silently inherit "A" the
  // moment the original A group got resolved. Combining or dismissing a
  // group just means it stops appearing here on later renders; its
  // letter is never handed to anything else.
  multiPageGroupLettersRef.current = multiPageGroupLettersRef.current || {};
  rawMultiPageGroups.forEach((g) => {
    const key = g.batches[0].id;
    if (!(key in multiPageGroupLettersRef.current)) {
      multiPageGroupLettersRef.current[key] = String.fromCharCode(65 + nextGroupLetterIndexRef.current);
      nextGroupLetterIndexRef.current += 1;
    }
  });
  const multiPageGroups = rawMultiPageGroups
    .map((g) => ({ ...g, letter: multiPageGroupLettersRef.current[g.batches[0].id] }))
    .sort((a, b) => a.letter.localeCompare(b.letter));

  // Quick lookup so each pending card can show its group letter right
  // next to its own thumbnail, without every card re-deriving the whole
  // grouping computation itself.
  const batchGroupLetter = {};
  multiPageGroups.forEach((g) => {
    g.batches.forEach((b) => {
      batchGroupLetter[b.id] = g.letter;
    });
  });

  const history = queue
    .filter((b) => b.status !== "pending")
    .filter((b) => {
      const q = historySearch.trim().toLowerCase();
      if (!q) return true;
      // The placeholder promises "item, vendor, PO#, reference" — vendor,
      // poNumber, and orderNumber were missing entirely, so a search for
      // any of those silently matched nothing even though the field was
      // sitting right there on the batch.
      const haystack = [b.label, b.vendor, b.poNumber, b.orderNumber, ...b.lines.map((l) => l.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  const activeBatch = queue.find((b) => b.id === activeBatchId) || null;

  // Defined once, rendered in both return paths below — this used to
  // live only in the list-view return, which meant opening a photo while
  // reviewing a receipt set state with nowhere to actually display until
  // you left that screen.
  const photoViewerOverlay = viewingPhoto && (
    <PhotoLightbox
      photos={viewingPhoto.photos}
      index={viewingPhoto.index}
      onIndexChange={(i) => setViewingPhoto((v) => (v ? { ...v, index: i } : v))}
      onClose={() => setViewingPhoto(null)}
    />
  );

  if (viewingHistoryBatch) {
    return (
      <>
        <ReceiptHistoryDetail
          batch={viewingHistoryBatch}
          jobs={jobs}
          lists={lists}
          onBack={() => setViewingHistoryBatch(null)}
          onViewPhoto={setViewingPhoto}
        />
        {photoViewerOverlay}
      </>
    );
  }

  if (activeBatch) {
    // Left/right flips straight to the adjacent pending receipt's own
    // review page — the order it was already in on the list screen,
    // search-narrowed or not, same breadcrumb either way.
    const activeIdxInPending = pending.findIndex((b) => b.id === activeBatch.id);
    return (
      <>
        <ReceivingBatchReview
          batch={activeBatch}
          jobs={jobs}
          lists={lists}
          catalog={catalog}
          otherPendingBatches={queue.filter((b) => b.status === "pending" && b.id !== activeBatch.id)}
          onNavigateBatch={
            activeIdxInPending === -1
              ? undefined
              : (delta) => {
                  const nextIdx = activeIdxInPending + delta;
                  if (nextIdx >= 0 && nextIdx < pending.length) setActiveBatchId(pending[nextIdx].id);
                }
          }
          canNavigatePrev={activeIdxInPending > 0}
          canNavigateNext={activeIdxInPending !== -1 && activeIdxInPending < pending.length - 1}
          onUpdateBatch={updateBatch}
          onLearnAlias={learnAlias}
          onApprove={approveBatch}
          onDiscard={discardBatch}
          onCombine={combineBatches}
          onViewPhoto={setViewingPhoto}
          onBack={() => setActiveBatchId(null)}
          onQuickNav={onQuickNav}
        />
        {photoViewerOverlay}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Copy the files out into a plain array FIRST — e.target.files
          // is a live reference, and clearing the input's value right
          // after (so the same files can be picked again later) empties
          // that same list in place if we're still holding onto it
          // directly instead of a real snapshot.
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length > 0) runScans(files);
        }}
      />
      <SectionHeader
        onBack={onGoHome}
        icon={Inbox}
        iconClassName="text-amber-400"
        title="Receiving"
        maxWidthClass="max-w-2xl"
        current="receiving"
        onQuickNav={onQuickNav}
        quickNavIsOwner={isOwner}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400 disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          {scanning
            ? scanProgress
              ? `Scanning ${scanProgress.current} of ${scanProgress.total}...`
              : "Scanning..."
            : "Scan receipts"}
        </button>
      </SectionHeader>
      <main className="max-w-2xl mx-auto px-4 py-5">
        {receivingUndoStack.length > 0 && (
          <button
            onClick={undoLastReceivingAction}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 mb-4 border border-slate-800 rounded-lg bg-slate-900 hover:bg-slate-800/60 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-300 min-w-0">
              <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate">
                Undo: <span className="text-slate-400 font-normal">{receivingUndoStack[0].label}</span>
              </span>
            </span>
            <span className="text-xs text-slate-600 shrink-0">
              {receivingUndoStack.length} step{receivingUndoStack.length === 1 ? "" : "s"} available
            </span>
          </button>
        )}
        {scanError && <p className="text-sm text-red-400 mb-4">Couldn't scan that: {scanError}</p>}

        {multiPageGroups
          .filter((g) => !dismissedPageGroups.has(g.batches.map((b) => b.id).sort().join(",")))
          .map((g) => {
            const groupKey = g.batches.map((b) => b.id).sort().join(",");
            const isComplete = g.batches.length === g.totalPages;
            return (
              <div
                key={groupKey}
                className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 mb-3"
              >
                <p className="text-sm text-amber-200">
                  📎 Group {g.letter}: pages {g.batches.map((b) => b.pageNumber).join(", ")} of{" "}
                  {g.totalPages} look like the same document
                  {!isComplete && ` (still missing ${g.totalPages - g.batches.length})`}
                  {g.orderNumber && ` · Order #${g.orderNumber}`}.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() =>
                      setViewingGroupPhotos(
                        g.batches
                          .filter((b) => b.photoUrl)
                          .map((b) => ({ url: b.photoUrl, pageNumber: b.pageNumber, batchId: b.id }))
                      )
                    }
                    className="text-xs rounded-md px-3 py-1.5 border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                  >
                    👀 View pages
                  </button>
                  <button
                    onClick={() =>
                      combineMultipleBatches(g.batches[0].id, g.batches.slice(1).map((b) => b.id))
                    }
                    className="text-xs rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                  >
                    Combine {g.letter}
                  </button>
                  <button
                    onClick={() => setDismissedPageGroups((prev) => new Set(prev).add(groupKey))}
                    className="text-xs rounded-md px-3 py-1.5 border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                  >
                    Not the same receipt
                  </button>
                </div>
              </div>
            );
          })}

        <div className="mb-4">
          <BackupRestoreBar
            onBackUp={backUpQueueNow}
            backupDisabled={queue.length === 0}
            backupTitle="Saves every pending/reviewed batch in the queue to a file"
            onRestoreFileChosen={handleQueueRestoreFileChosen}
            backupNotice={backupNotice}
            restoreError={restoreError}
            onDismissRestoreError={() => setRestoreError(null)}
            restorePending={
              restorePending && {
                summary: `This file has ${restorePending.receivingQueue.length} batch${
                  restorePending.receivingQueue.length === 1 ? "" : "es"
                }${restorePending.exportedAt ? `, backed up ${new Date(restorePending.exportedAt).toLocaleString()}` : ""}.`,
                warning: `This replaces the whole queue currently in place (${queue.length} batch${
                  queue.length === 1 ? "" : "es"
                } right now). The current queue is saved to a file first, so you can undo this.`,
                onCancel: () => setRestorePending(null),
                onConfirm: confirmQueueRestore,
              }
            }
          />
        </div>

        <p className="text-xs font-medium text-slate-400 mb-2">
          Awaiting review ({pending.length})
        </p>
        {queue.filter((b) => b.status === "pending" && b.photoUrl && !b.orderNumber).length > 0 && (
          <button
            onClick={recheckOrderNumbers}
            disabled={!!recheckProgress}
            className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-2 disabled:opacity-50"
          >
            🔄{" "}
            {recheckProgress
              ? `Re-checking ${recheckProgress.current} of ${recheckProgress.total}...`
              : `Re-check pending receipts for order #s (${
                  queue.filter((b) => b.status === "pending" && b.photoUrl && !b.orderNumber).length
                } missing)`}
          </button>
        )}
        <input
          value={pendingSearch}
          onChange={(e) => setPendingSearch(e.target.value)}
          placeholder="Search pending receipts — item, label..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />
        <div className="space-y-2 mb-6">
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              {pendingSearch.trim()
                ? "Nothing matches that search."
                : "Nothing waiting on you — scan a receipt to get started."}
            </p>
          ) : (
            pending.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBatchId(b.id)}
                className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 flex items-center gap-3"
              >
                {b.photoUrl && (
                  <div className="relative shrink-0">
                    <img src={b.photoUrl} alt="" className="w-12 h-12 rounded-md object-cover border border-slate-800" />
                    {batchGroupLetter[b.id] && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center border-2 border-slate-900">
                        {batchGroupLetter[b.id]}
                      </span>
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 truncate">
                    {b.label ? b.label : `${b.lines.length} item${b.lines.length === 1 ? "" : "s"} scanned`}
                  </p>
                  {b.label && (
                    <p className="text-xs text-slate-600">
                      {b.lines.length} item{b.lines.length === 1 ? "" : "s"}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    {formatTaskTimestamp(b.scannedAt)}
                    {b.poNumber && ` · PO#${b.poNumber}`}
                    {b.totalPages > 1 && ` · Page ${b.pageNumber} of ${b.totalPages}`}
                    {b.totalPages > 1 && (b.orderNumber ? ` · Order #${b.orderNumber}` : " · no order # found")}
                  </p>
                  {b.originalFileName && (
                    <p className="text-xs text-slate-600 truncate" title={b.originalFileName}>
                      {b.originalFileName}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-left text-xs font-medium text-slate-400 flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            History ({history.length}) {showHistory ? "▲" : "▼"}
          </button>
          {showHistory && history.length > 0 && (
            <div className="flex items-center gap-3">
              {history.some((b) => b.status === "discarded") && (
                <button
                  onClick={() => setConfirmingClearDiscarded(true)}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  Clear discarded
                </button>
              )}
              <button
                onClick={() => setConfirmingClearAllHistory(true)}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                Clear all history
              </button>
            </div>
          )}
        </div>
        {showHistory && (
          <input
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Search history — item, vendor, PO#, reference..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        )}
        {showHistory && (
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                {historySearch.trim() ? "Nothing matches that search." : "Nothing yet."}
              </p>
            ) : (
              history.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setViewingHistoryBatch(b)}
                  className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3 hover:border-slate-700"
                >
                  {b.photoUrl && (
                    <img src={b.photoUrl} alt="" className="w-10 h-10 rounded-md object-cover border border-slate-800 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100 truncate">
                      {b.label ? `${b.label} · ` : ""}
                      {b.lines.length} item{b.lines.length === 1 ? "" : "s"} ·{" "}
                      <span className={b.status === "approved" ? "text-emerald-400" : "text-slate-500"}>
                        {b.status === "approved" ? "Approved" : "Discarded"}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatTaskTimestamp(b.approvedAt || b.scannedAt)}
                      {b.poNumber && ` · PO#${b.poNumber}`}
                    </p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(b);
                    }}
                    className="text-slate-600 hover:text-red-400 shrink-0 p-2.5 -mr-2 ml-1 border-l border-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </main>

      {deleteTarget && (
        <ConfirmDelete
          title="Delete this receipt record?"
          message="This just removes it from history — it doesn't touch any items that were already added anywhere. This can't be undone."
          onConfirm={() => {
            deleteBatch(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {confirmingClearDiscarded && (
        <ConfirmDelete
          title="Clear all discarded receipts?"
          message="Every discarded receipt in history will be permanently removed. Approved ones are left alone. This can't be undone."
          onConfirm={() => {
            clearDiscarded();
            setConfirmingClearDiscarded(false);
          }}
          onCancel={() => setConfirmingClearDiscarded(false)}
        />
      )}

      {confirmingClearAllHistory && (
        <ConfirmDelete
          title="Clear the entire history?"
          message="Every entry in History — approved and discarded — gets removed from this list. Nothing already added to a job or Love List is affected, and any photo already attached to a job's Reference Documents stays right where it is. This can't be undone."
          onConfirm={() => {
            clearAllHistory();
            setConfirmingClearAllHistory(false);
          }}
          onCancel={() => setConfirmingClearAllHistory(false)}
        />
      )}

      {photoViewerOverlay}

      {viewingGroupPhotos && (
        <GroupPhotoStepper photos={viewingGroupPhotos} onClose={() => setViewingGroupPhotos(null)} />
      )}

    </div>
  );
}

// The review screen for one scanned receipt — verify against the pallet,
// fix up anything OCR misread, link unmatched names to the catalog, pick
// which Job or Love List this shipment belongs to, then approve.
export function ReceivingBatchReview({ batch, jobs, lists, catalog, otherPendingBatches, onNavigateBatch, canNavigatePrev, canNavigateNext, onUpdateBatch, onLearnAlias, onApprove, onDiscard, onCombine, onViewPhoto, onBack, onQuickNav }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [relinkingLine, setRelinkingLine] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  // Up/down navigation between line items — keyboard arrows (bound to each
  // line's name field specifically, not globally, so they don't fight the
  // qty fields' own native up/down-to-increment behavior) and the on-
  // screen arrow buttons both move this same pointer.
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const lineNameRefs = useRef({});
  // Assigning a target opens the same picker whether it's for one line or
  // "everything unassigned" — this tracks which mode/line it's currently
  // working on.
  const [assigningLine, setAssigningLine] = useState(null); // a line object, or "bulk" for the shortcut
  const [assignTargetType, setAssignTargetType] = useState(null);
  const [targetSearch, setTargetSearch] = useState("");
  const [showCombinePicker, setShowCombinePicker] = useState(false);

  // Reads from batchRef, not the closed-over `batch` prop directly — this
  // is what actually fixes the "typing a character right as auto-match
  // fires deletes it" bug. Every call to updateLine used to merge its
  // change onto whatever `batch` looked like at the moment THIS specific
  // closure was created — and the debounce timer below holds onto the
  // closure from the render for the very last keystroke, which is
  // captured *before* that keystroke's own update has landed in state.
  // So when the timer fired and called updateLine to set a catalogId, it
  // was merging that onto a batch snapshot one character behind, quietly
  // reverting the last thing typed. Reading the ref instead means every
  // call — no matter which stale closure invoked it — always builds on
  // top of the truly latest known state.
  const batchRef = useRef(batch);
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);

  // Left/right flips to the previous/next pending receipt's own review
  // page — same always-on, global-listener pattern PhotoLightbox uses for
  // its own left/right photo navigation, no need to click into anything
  // first. Scoped off while a text field (a line's name, the label, a
  // search box in one of this screen's own pickers) is actually focused,
  // so normal cursor movement there isn't hijacked.
  useEffect(() => {
    if (!onNavigateBatch) return;
    const handleKey = (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" && canNavigateNext) {
        e.preventDefault();
        onNavigateBatch(1);
      } else if (e.key === "ArrowLeft" && canNavigatePrev) {
        e.preventDefault();
        onNavigateBatch(-1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onNavigateBatch, canNavigatePrev, canNavigateNext]);

  const updateLine = (lineId, changes) => {
    const currentBatch = batchRef.current;
    onUpdateBatch({
      ...currentBatch,
      lines: currentBatch.lines.map((l) => (l.id === lineId ? { ...l, ...changes } : l)),
    });
  };

  // Catalog matching waits for a pause in typing instead of re-checking on
  // every keystroke — matching off just the first letter or two almost
  // never finds the right thing, and locking onto that first guess made
  // it impossible to ever find a better one later. Each pause re-evaluates
  // fresh against the *current* full text, and only ever touches an
  // auto-found link — a deliberate pick from the catalog picker
  // (catalogLinkedManually) is never silently replaced or cleared.
  const nameDebounceTimers = useRef({});

  const handleNameChange = (lineId, newName) => {
    updateLine(lineId, { name: newName });
    if (nameDebounceTimers.current[lineId]) clearTimeout(nameDebounceTimers.current[lineId]);
    nameDebounceTimers.current[lineId] = setTimeout(() => {
      const currentBatch = batchRef.current;
      const currentLine = currentBatch && currentBatch.lines.find((l) => l.id === lineId);
      if (!currentLine || currentLine.catalogLinkedManually) return;
      const found = findCatalogMatch(currentLine.name, catalog);
      if (found && found.id !== currentLine.catalogId) {
        updateLine(lineId, { catalogId: found.id });
      } else if (!found && currentLine.catalogId) {
        updateLine(lineId, { catalogId: null });
      }
    }, 900);
  };

  const removeLine = (lineId) => {
    onUpdateBatch({ ...batch, lines: batch.lines.filter((l) => l.id !== lineId) });
  };
  const cloneLine = (lineId) => {
    const idx = batch.lines.findIndex((l) => l.id === lineId);
    if (idx === -1) return;
    const clone = { ...batch.lines[idx], id: uniqueId() };
    const nextLines = [...batch.lines.slice(0, idx + 1), clone, ...batch.lines.slice(idx + 1)];
    onUpdateBatch({ ...batch, lines: nextLines });
  };

  // Quick Transfers live in this same jobs array under the hood — they're
  // shipment manifests, not real jobs to receive inventory into, so they
  // never belong in this picker. Sealed jobs are excluded too, since
  // they're locked/read-only by design — adding new items there would
  // fight that on purpose.
  // Only still-editable lines are navigable — an approved one is locked
  // and has no name field to focus anyway.
  const activeLines = batch.lines.filter((l) => !l.approved);

  const goToLine = (idx) => {
    if (activeLines.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, activeLines.length - 1));
    setCurrentLineIdx(clamped);
    const target = lineNameRefs.current[activeLines[clamped].id];
    if (target) {
      target.focus();
      target.select();
      if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const jobOptions = jobs.filter((j) => !j.archived && !j.isQuickTransfer && !j.sealed);
  const listOptions = lists.filter((l) => !l.archived);

  // How many of this receipt's still-unassigned line names already exist
  // by name on a given job/list — the whole point is spotting "this
  // receipt is obviously for this Love List" at a glance, so an order
  // that lines up closely with something floats straight to the top.
  const unassignedNames = new Set(
    batch.lines.filter((l) => !l.targetId && l.name.trim()).map((l) => normalizeText(l.name))
  );
  const matchCountFor = (t) => {
    if (unassignedNames.size === 0) return 0;
    const targetNames = new Set((t.items || []).map((i) => normalizeText(i.name)));
    let count = 0;
    unassignedNames.forEach((n) => {
      if (targetNames.has(n)) count++;
    });
    return count;
  };

  // Suggestion only, never auto-applied — if this receipt's PO number
  // contains this job's number as a segment (or matches it outright), it
  // jumps to the top with its own badge. Stronger than item-name overlap
  // when it's available, since a PO number pointing at a specific job is
  // about as direct a signal as this can get.
  const poMatchesTarget = (t) => {
    if (!batch.poNumber) return false;
    const jobNumber = assignTargetType === "job" ? t.name : t.jobLabel;
    return poContainsJobNumber(batch.poNumber, jobNumber);
  };

  const filteredTargets = (assignTargetType === "job" ? jobOptions : listOptions)
    .filter((t) => {
      const q = targetSearch.trim().toLowerCase();
      if (!q) return true;
      if (assignTargetType === "job") return (t.name || "").toLowerCase().includes(q);
      const haystack = [t.jobLabel, t.subJobLabel, t.submittedBy, t.dateReceived]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .map((t) => ({ ...t, __matchCount: matchCountFor(t), __poMatch: poMatchesTarget(t) }))
    .sort((a, b) => {
      if (a.__poMatch !== b.__poMatch) return a.__poMatch ? -1 : 1;
      return b.__matchCount - a.__matchCount;
    });

  const targetLabelFor = (line) => {
    if (!line.targetId) return null;
    if (line.targetType === "job") {
      const j = jobs.find((x) => x.id === line.targetId);
      return j ? j.name : null;
    }
    const l = lists.find((x) => x.id === line.targetId);
    return l ? `${l.jobLabel}${l.subJobLabel ? ` — ${l.subJobLabel}` : ""}` : null;
  };

  const chooseTarget = (t) => {
    if (assigningLine === "bulk") {
      // Only fills in lines that don't already have a target — this is a
      // shortcut for the common "whole receipt goes one place" case, not
      // a bulk override of things already deliberately assigned elsewhere.
      onUpdateBatch({
        ...batch,
        lines: batch.lines.map((l) =>
          l.targetId ? l : { ...l, targetType: assignTargetType, targetId: t.id }
        ),
      });
    } else if (assigningLine) {
      updateLine(assigningLine.id, { targetType: assignTargetType, targetId: t.id });
    }
    setAssigningLine(null);
    setAssignTargetType(null);
    setTargetSearch("");
  };

  const assignedCount = batch.lines.filter((l) => l.name.trim() && l.targetId && !l.approved).length;
  const canApprove = assignedCount > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SectionHeader
        onBack={onBack}
        icon={Inbox}
        iconClassName="text-amber-400"
        title={batch.label || "Review receipt"}
        subtitle="Saves automatically"
        maxWidthClass="max-w-2xl"
        current="receiving"
        onQuickNav={onQuickNav}
        quickNavIsOwner // only ever reached once ReceivingApp has already confirmed the owner
      >
        <button
          onClick={() => setConfirmingDiscard(true)}
          className="text-xs text-slate-500 hover:text-red-400 px-2 py-2"
        >
          Discard
        </button>
      </SectionHeader>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          Every line picks its own destination — one receipt can split across several jobs and
          Love Lists. Nothing gets added anywhere until you tap Approve, and only lines with a
          destination chosen get applied.
        </p>
        {batch.photoUrl && (
          <div className="mb-4">
            <button
              onClick={() =>
                onViewPhoto({
                  photos: [batch.photoUrl, ...(batch.extraPhotoUrls || [])]
                    .filter(Boolean)
                    .map((url) => ({ url, alt: "Receipt" })),
                  index: 0,
                })
              }
              className="w-full rounded-lg overflow-hidden border border-slate-800"
            >
              <img src={batch.photoUrl} alt="Receipt" className="w-full max-h-48 object-cover" />
            </button>
            {(batch.extraPhotoUrls || []).length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {batch.extraPhotoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      onViewPhoto({
                        photos: [batch.photoUrl, ...(batch.extraPhotoUrls || [])]
                          .filter(Boolean)
                          .map((u) => ({ url: u, alt: "Receipt" })),
                        index: i + 1,
                      })
                    }
                    className="rounded-md overflow-hidden border border-slate-800"
                  >
                    <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(batch.poNumber || batch.originalFileName) && (
          <p className="text-xs text-slate-500 text-center mb-4">
            {batch.poNumber && <>PO#{batch.poNumber}</>}
            {batch.poNumber && batch.originalFileName && " · "}
            {batch.originalFileName && (
              <span title="Original uploaded file name">{batch.originalFileName}</span>
            )}
          </p>
        )}

        <button
          onClick={() => setShowCombinePicker(true)}
          className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-4"
        >
          📎 Combine with another pending receipt — for multi-page scans that landed separately
        </button>

        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Name this receipt (optional)
        </label>
        <input
          value={batch.label || ""}
          onChange={(e) => onUpdateBatch({ ...batch, label: e.target.value })}
          placeholder="e.g. Pallet 2, Beater Pallet..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />

        <button
          onClick={() => setAssigningLine("bulk")}
          className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-4"
        >
          Assign everything still unassigned to one job or Love List →
        </button>

        <p className="text-xs font-medium text-slate-400 mb-2">
          Line items ({batch.lines.length}) — {assignedCount} assigned
        </p>
        <div className="space-y-2 mb-6">
          {batch.lines.map((line) => {
            const match = line.catalogId ? catalog.find((c) => c.id === line.catalogId) : null;
            const targetLabel = targetLabelFor(line);
            if (line.approved) {
              // Already applied somewhere — locked so it can never be
              // re-approved (which would double-apply its quantity), but
              // still visible so the receipt's full contents stay on
              // record rather than looking like they disappeared.
              return (
                <div
                  key={line.id}
                  className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 truncate">{line.name}</p>
                    <p className="text-xs text-slate-500">
                      Shipped {line.shippedQty}
                      {line.backorderQty > 0 ? ` · ${line.backorderQty} backorder` : ""}
                    </p>
                  </div>
                  <span className="text-[10px] rounded-full px-2 py-0.5 border shrink-0 bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                    ✓ Added to {targetLabel || "target"}
                  </span>
                </div>
              );
            }
            const activeIdx = activeLines.findIndex((l) => l.id === line.id);
            return (
              <div
                key={line.id}
                className={`border rounded-lg p-2.5 bg-slate-900/60 ${
                  activeIdx === currentLineIdx ? "border-amber-500/60" : "border-slate-800"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    ref={(el) => (lineNameRefs.current[line.id] = el)}
                    value={line.name}
                    onChange={(e) => handleNameChange(line.id, e.target.value)}
                    onFocus={() => setCurrentLineIdx(activeIdx)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        goToLine(activeIdx + 1);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        goToLine(activeIdx - 1);
                      }
                    }}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                  />
                  <button
                    onClick={() => cloneLine(line.id)}
                    title="Clone this line"
                    className="text-slate-500 hover:text-amber-400 shrink-0 p-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-slate-500 hover:text-red-400 shrink-0 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Shipped</label>
                    <input
                      type="number"
                      min="0"
                      onFocus={selectOnFocus}
                      onClick={selectOnFocus}
                      value={line.shippedQty}
                      onChange={(e) => updateLine(line.id, { shippedQty: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Backorder</label>
                    <input
                      type="number"
                      min="0"
                      onFocus={selectOnFocus}
                      onClick={selectOnFocus}
                      value={line.backorderQty}
                      onChange={(e) => updateLine(line.id, { backorderQty: Number(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-red-500/60"
                    />
                  </div>
                </div>
                {match ? (
                  <button
                    onClick={() => {
                      setRelinkingLine(line);
                      setCatalogSearch("");
                    }}
                    className="text-[11px] text-emerald-400 hover:underline decoration-dotted block mb-1"
                  >
                    🔗 linked to "{match.name}" · Change
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRelinkingLine(line);
                      setCatalogSearch("");
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 hover:underline decoration-dotted block mb-1"
                  >
                    No catalog match — 🔍 link manually
                  </button>
                )}
                <button
                  onClick={() => {
                    setAssigningLine(line);
                    setAssignTargetType(line.targetType || null);
                    setTargetSearch("");
                  }}
                  className={`text-[11px] hover:underline decoration-dotted block ${
                    targetLabel ? "text-sky-400" : "text-amber-400"
                  }`}
                >
                  {targetLabel ? `→ ${targetLabel} · Change` : "Not assigned yet — 📍 pick a destination"}
                </button>
              </div>
            );
          })}
        </div>
      </main>

      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setConfirmingApprove(true)}
            disabled={!canApprove}
            className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Approve {assignedCount} assigned item{assignedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      {confirmingDiscard && (
        <ConfirmDelete
          title="Discard this receipt?"
          message="This scan and everything on it will be discarded — nothing gets added anywhere. This can't be undone."
          onConfirm={() => onDiscard(batch)}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}

      {confirmingApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">Approve assigned items?</h3>
            <p className="text-slate-400 text-sm mb-5">
              {assignedCount} item(s) will be added to whatever job or Love List each one is
              assigned to. Anything still unassigned stays in the queue for later. Review
              carefully — this writes real inventory changes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingApprove(false)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmingApprove(false);
                  onApprove(batch);
                }}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {relinkingLine && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                Link "{relinkingLine.name}" to...
              </h3>
              <button
                onClick={() => {
                  setRelinkingLine(null);
                  setCatalogSearch("");
                }}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <input
                autoFocus
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {relinkingLine.catalogId && (
                <button
                  onClick={() => {
                    // Unlinking only clears the catalog link — the name
                    // you've typed (or that's already been auto-filled
                    // from a remembered match) stays exactly as-is, same
                    // as linking never touches it either. Reverting to
                    // raw OCR text here would throw away real work.
                    updateLine(relinkingLine.id, { catalogId: null, catalogLinkedManually: false });
                    setRelinkingLine(null);
                    setCatalogSearch("");
                  }}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-red-800/40 text-red-400 hover:bg-red-500/10 mb-2"
                >
                  Unlink from catalog
                </button>
              )}
              {catalog
                .filter((c) => c.name.toLowerCase().includes(catalogSearch.trim().toLowerCase()))
                .slice(0, 50)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      // Linking sets which catalog entry this is (for
                      // storage/gang defaults) but deliberately leaves the
                      // name field alone — plenty of catalog entries cover
                      // several real variants that just happen to share
                      // the same storage/gang, so the specific wording on
                      // this line (the size, the spec) is exactly what
                      // shouldn't get collapsed away automatically.
                      updateLine(relinkingLine.id, { catalogId: c.id, catalogLinkedManually: true });
                      onLearnAlias && onLearnAlias(c.id, relinkingLine.rawName);
                      setRelinkingLine(null);
                      setCatalogSearch("");
                    }}
                    className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-800 hover:border-slate-700 mb-1.5"
                  >
                    <p className="text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.storage}
                      {c.needsTransfer ? " · 🚚 needs transfer" : ""}
                    </p>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {assigningLine && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                {assigningLine === "bulk" ? "Assign unassigned lines to..." : `Send "${assigningLine.name}" to...`}
              </h3>
              <button
                onClick={() => {
                  setAssigningLine(null);
                  setAssignTargetType(null);
                  setTargetSearch("");
                }}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setAssignTargetType("job");
                    setTargetSearch("");
                  }}
                  className={`flex-1 text-sm rounded-md py-2 border ${
                    assignTargetType === "job"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  Job
                </button>
                <button
                  onClick={() => {
                    setAssignTargetType("love_list");
                    setTargetSearch("");
                  }}
                  className={`flex-1 text-sm rounded-md py-2 border ${
                    assignTargetType === "love_list"
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  Love List
                </button>
              </div>
              {assignTargetType && (
                <input
                  autoFocus
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  placeholder={
                    assignTargetType === "job" ? "Search jobs..." : "Search by nickname, submitter, or date..."
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-1 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
              )}
            </div>
            {assignTargetType && (
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {filteredTargets.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">No matches.</p>
                ) : (
                  filteredTargets.map((t) => {
                    const isPerfect = t.__matchCount > 0 && t.__matchCount === unassignedNames.size;
                    return (
                      <button
                        key={t.id}
                        onClick={() => chooseTarget(t)}
                        className={`w-full text-left text-sm rounded-md px-2.5 py-1.5 hover:bg-slate-800 mb-1 ${
                          t.__poMatch
                            ? "border border-amber-500/50 bg-amber-500/10"
                            : isPerfect
                            ? "border border-emerald-500/40 bg-emerald-500/10"
                            : t.__matchCount > 0
                            ? "border border-sky-500/30"
                            : ""
                        } text-slate-300`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{assignTargetType === "job" ? t.name : (
                            <>
                              {t.jobLabel}
                              {t.subJobLabel ? ` — ${t.subJobLabel}` : ""}
                            </>
                          )}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {t.__poMatch && (
                              <span className="text-[10px] rounded-full px-1.5 py-0.5 border bg-amber-500/15 text-amber-300 border-amber-500/40">
                                🎯 PO#{batch.poNumber}
                              </span>
                            )}
                            {t.__matchCount > 0 && (
                              <span
                                className={`text-[10px] rounded-full px-1.5 py-0.5 border ${
                                  isPerfect
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                                    : "bg-sky-500/15 text-sky-300 border-sky-500/40"
                                }`}
                              >
                                {isPerfect ? "✓ Perfect match" : `${t.__matchCount} matching`}
                              </span>
                            )}
                          </span>
                        </div>
                        {assignTargetType === "love_list" && (
                          // Most Love Lists share the same jobLabel — this
                          // line is what actually tells identical-looking
                          // options apart.
                          <p className="text-xs opacity-70">
                            {[
                              t.submittedBy && `Submitted by ${t.submittedBy}`,
                              t.dateReceived,
                              `${(t.items || []).length} item${(t.items || []).length === 1 ? "" : "s"}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showCombinePicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm">Combine with...</h3>
              <button onClick={() => setShowCombinePicker(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {otherPendingBatches.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  No other pending receipts to combine with.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {otherPendingBatches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onCombine(batch.id, b.id);
                        setShowCombinePicker(false);
                      }}
                      className="w-full text-left flex items-center gap-3 bg-slate-800/40 border border-slate-800 rounded-lg p-2.5 hover:border-slate-700"
                    >
                      {b.photoUrl && (
                        <img src={b.photoUrl} alt="" className="w-10 h-10 rounded-md object-cover border border-slate-800 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100 truncate">
                          {b.label ? b.label : `${b.lines.length} item${b.lines.length === 1 ? "" : "s"} scanned`}
                        </p>
                        <p className="text-xs text-slate-500">{formatTaskTimestamp(b.scannedAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeLines.length > 1 && (
        <div className="fixed bottom-4 right-4 z-30 flex flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-lg overflow-hidden">
          <button
            onClick={() => goToLine(currentLineIdx - 1)}
            disabled={currentLineIdx <= 0}
            title="Previous line item (↑)"
            className="p-2.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent border-b border-slate-700"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => goToLine(currentLineIdx + 1)}
            disabled={currentLineIdx >= activeLines.length - 1}
            title="Next line item (↓)"
            className="p-2.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {onNavigateBatch && (canNavigatePrev || canNavigateNext) && (
        <div className="fixed bottom-4 left-4 z-30 flex rounded-lg border border-slate-700 bg-slate-800 shadow-lg overflow-hidden">
          <button
            onClick={() => onNavigateBatch(-1)}
            disabled={!canNavigatePrev}
            title="Previous pending receipt (←)"
            className="p-2.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent border-r border-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigateBatch(1)}
            disabled={!canNavigateNext}
            title="Next pending receipt (→)"
            className="p-2.5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
