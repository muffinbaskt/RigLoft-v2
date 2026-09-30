import { useState, useEffect, useRef } from "react";
import {
  X,
  Archive,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Printer,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { CATALOG_KEY, getWithRetry, saveWithRetry, deleteReferenceDocument, uploadReceiptScan } from "../lib/api";
import { downloadArchiveBackupFile, maybeAutoBackupArchive, parseArchiveBackup } from "../lib/backup";
import {
  RECEIPT_ARCHIVE_KEY,
  RECEIVING_NAME_MEMORY_KEY,
  RECEIVING_QUEUE_KEY,
  computeUsualVendor,
  newReceiptBatch,
} from "../lib/receiving";
import { TOOLS_KEY, isToolCandidate } from "../lib/tools";
import {
  findCatalogMatch,
  findScannedLineMatch,
  normalizeText,
  playSaveChime,
  uniqueId,
  withLearnedAlias,
} from "../lib/utils";
import { formatTaskTimestamp } from "../lib/workertasks";
import { AddToolModal, ConfirmDelete, SectionHeader, ZoomableImage } from "../components/shared";

// A simple, searchable photo log for receipts you just want on record —
// no line items, no target, no approval step. Scan it, and it's saved;
// the only thing you can do afterward is search and look back at it.
// A clean, printer-friendly rendering of a single archived receipt —
// vendor info and the original photo (if one was captured) on page 1
// by themselves, so printing just the first page (or stopping there)
// gets exactly the receipt and nothing else, with the recognized line
// items broken out onto the page(s) after — for handing to a
// bookkeeper or filing on paper. Same "print just this one element"
// technique as PrintableLoveListModal: everything else on the page is
// hidden for print, only the print area shows.
// The printable guts of a single archived receipt — vendor info + photo
// on their own page, item breakdown on the page(s) after. Shared by both
// the single-receipt print modal and the bulk "print several at once"
// one below, so the two stay visually identical. `isLast` suppresses the
// trailing page break after this receipt's content, since only receipts
// followed by another one in the same print job need one.
function PrintableReceiptContent({ entry, isLast }) {
  const items = entry.items || [];
  const total = items.reduce(
    (sum, it) => sum + (Number(it.unitPrice) || 0) * (Number(it.shippedQty) || 0),
    0
  );
  return (
    <div style={!isLast ? { pageBreakAfter: "always", breakAfter: "page" } : undefined}>
      <div
        style={
          items.length > 0
            ? { pageBreakAfter: "always", breakAfter: "page" }
            : undefined
        }
      >
        <h2 className="text-xl font-bold mb-1">{entry.vendor || "Unknown vendor"}</h2>
        {entry.vendorAddress && (
          <p className="text-sm text-slate-600 mb-1">{entry.vendorAddress}</p>
        )}
        <p className="text-sm text-slate-600 mb-5">
          {[
            entry.receiptDate && `Date: ${entry.receiptDate}`,
            entry.poNumber && `PO: ${entry.poNumber}`,
          ]
            .filter(Boolean)
            .join(" · ") || "\u00A0"}
        </p>

        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt="Receipt"
            className="w-full max-h-[500px] object-contain border border-slate-300 rounded print:max-h-[8.5in] print:border-0"
          />
        ) : (
          <p className="text-sm text-slate-500">No photo was captured for this receipt.</p>
        )}
      </div>

      {items.length > 0 && (
        <div>
          <h3 className="text-base font-bold mb-3">Item breakdown</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className="text-left py-2 pr-2">Item</th>
                <th className="text-right py-2 pr-2 whitespace-nowrap">Qty</th>
                <th className="text-right py-2 pr-2 whitespace-nowrap">Unit price</th>
                <th className="text-right py-2 whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const lineTotal = (Number(it.unitPrice) || 0) * (Number(it.shippedQty) || 0);
                return (
                  <tr key={it.id} className="border-b border-slate-300">
                    <td className="py-2 pr-2 align-top">
                      {it.name}
                      {it.backorderQty > 0 && (
                        <span className="text-slate-500"> ({it.backorderQty} backorder)</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top text-right whitespace-nowrap">
                      {it.shippedQty || 0}
                      {it.unit && it.unit.toLowerCase() !== "each" ? ` ${it.unit}` : ""}
                    </td>
                    <td className="py-2 pr-2 align-top text-right whitespace-nowrap">
                      {it.unitPrice > 0 ? `$${Number(it.unitPrice).toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 align-top text-right whitespace-nowrap">
                      {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {total > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right font-semibold">
                    Total
                  </td>
                  <td className="pt-3 text-right font-semibold whitespace-nowrap">
                    ${total.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>

          <p className="text-xs text-slate-400 mt-6">
            Archived {formatTaskTimestamp(entry.archivedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

function PrintableReceiptModal({ entry, onClose }) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center px-4 py-8 print:static print:block print:bg-white print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            height: 0 !important;
            overflow: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible;
            height: auto !important;
            overflow: visible !important;
          }
          #receipt-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 0.5in;
          }
        }
      `}</style>
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-lg max-h-full flex flex-col print:static print:block print:max-w-none print:rounded-none print:max-h-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 print:hidden">
          <h3 className="font-semibold text-base">Print preview</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-sm rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div id="receipt-print-area" className="p-6 overflow-y-auto print:overflow-visible">
          <PrintableReceiptContent entry={entry} isLast />
        </div>
      </div>
    </div>
  );
}

// Same print mechanics as the single-receipt version, but walks a whole
// list of archive entries in one pass — for printing a stack of receipts
// together (end-of-month paperwork, handing several off at once) instead
// of one at a time. Each receipt still gets its own photo page followed
// by its own item-breakdown page(s); a page break is inserted between
// receipts too, so nothing from one bleeds onto the next.
function PrintableReceiptsModal({ entries, onClose }) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center px-4 py-8 print:static print:block print:bg-white print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            height: 0 !important;
            overflow: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible;
            height: auto !important;
            overflow: visible !important;
          }
          #receipt-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 0.5in;
          }
        }
      `}</style>
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-lg max-h-full flex flex-col print:static print:block print:max-w-none print:rounded-none print:max-h-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 print:hidden">
          <h3 className="font-semibold text-base">
            Print preview — {entries.length} receipt{entries.length === 1 ? "" : "s"}
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-sm rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div id="receipt-print-area" className="p-6 overflow-y-auto print:overflow-visible">
          {entries.map((entry, i) => (
            <PrintableReceiptContent key={entry.id} entry={entry} isLast={i === entries.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReceiptArchive({ onGoHome, onQuickNav, isOwner }) {
  const [entries, setEntries] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [nameMemory, setNameMemory] = useState({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanError, setScanError] = useState("");
  const [search, setSearch] = useState("");
  const [viewingEntry, setViewingEntry] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [confirmingSendToReceiving, setConfirmingSendToReceiving] = useState(null);
  const [sendingToReceiving, setSendingToReceiving] = useState(false);
  const [relinkingLine, setRelinkingLine] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [printingEntry, setPrintingEntry] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState({});
  const [printingSelection, setPrintingSelection] = useState(false);
  const [confirmingSendToTools, setConfirmingSendToTools] = useState(null);
  const [tools, setTools] = useState([]);
  const entriesRef = useRef([]);
  const catalogRef = useRef([]);
  const toolsRef = useRef([]);
  const fileInputRef = useRef(null);
  const nameDebounceTimers = useRef({});

  // Load failure must never look like "nothing archived yet": the next scan
  // or edit would save that empty list over every real receipt. Same guard
  // Job Lists and Love Lists have — nothing is written until a load succeeds.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadFailedRef = useRef(false);
  const [restoreError, setRestoreError] = useState(null);
  const [restorePending, setRestorePending] = useState(null); // { entries, exportedAt }
  const [backupNotice, setBackupNotice] = useState(null);
  const backupNoticeTimer = useRef(null);
  const restoreInputRef = useRef(null);

  const loadAll = async () => {
    setLoading(true);
    setLoadFailed(false);
    loadFailedRef.current = false;
    try {
      const [eResult, cResult, nResult, tResult] = await Promise.all([
        getWithRetry(RECEIPT_ARCHIVE_KEY),
        getWithRetry(CATALOG_KEY),
        getWithRetry(RECEIVING_NAME_MEMORY_KEY),
        getWithRetry(TOOLS_KEY),
      ]);
      if (!eResult.ok) {
        loadFailedRef.current = true;
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      if (eResult.value) {
        const loaded = JSON.parse(eResult.value);
        setEntries(loaded);
        entriesRef.current = loaded;
        maybeAutoBackupArchive(loaded);
      }
      if (cResult.ok && cResult.value) {
        const loadedCatalog = JSON.parse(cResult.value);
        setCatalog(loadedCatalog);
        catalogRef.current = loadedCatalog;
      }
      if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
      if (tResult.ok && tResult.value) {
        const loadedTools = JSON.parse(tResult.value);
        setTools(loadedTools);
        toolsRef.current = loadedTools;
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    // Same reasoning as Receiving: no view-only mode here at all, so the
    // real gate has to live in this component, not just at the landing
    // screen's tile (which only hides a button) — this screen is also
    // reachable via a manager's own login, the quick-nav menu, or a
    // crafted ?section=archive&id=... link. Skipping the load itself
    // means a blocked visitor's browser never fetches the archive.
    if (!isOwner) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const saveEntries = (next) => {
    if (loadFailedRef.current) return;
    entriesRef.current = next;
    setEntries(next);
    saveWithRetry(RECEIPT_ARCHIVE_KEY, JSON.stringify(next)).catch(() => {});
    maybeAutoBackupArchive(next);
  };

  const showBackupNotice = (message) => {
    setBackupNotice(message);
    if (backupNoticeTimer.current) clearTimeout(backupNoticeTimer.current);
    backupNoticeTimer.current = setTimeout(() => setBackupNotice(null), 4000);
  };

  const backUpNow = async () => {
    const ok = await downloadArchiveBackupFile(entriesRef.current, { force: true });
    const n = entriesRef.current.length;
    showBackupNotice(ok ? `✅ Backup saved (${n} receipt${n === 1 ? "" : "s"})` : "Couldn't create the backup file");
  };

  const handleRestoreFileChosen = (file) => {
    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseArchiveBackup(e.target.result);
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      setRestorePending({ entries: result.entries, exportedAt: result.exportedAt });
    };
    reader.onerror = () => setRestoreError("Couldn't read that file off the device.");
    reader.readAsText(file);
  };

  // Restoring replaces the whole archive, so the current one is saved to a
  // file first — a restore can then always be undone.
  const confirmRestore = async () => {
    if (!restorePending) return;
    const incoming = restorePending.entries;
    setRestorePending(null);
    if (entriesRef.current.length > 0) {
      await downloadArchiveBackupFile(entriesRef.current, { force: true, label: "receipt-archive-before-restore" });
    }
    saveEntries(incoming);
    showBackupNotice(`✅ Restored ${incoming.length} receipt${incoming.length === 1 ? "" : "s"}`);
  };

  const saveTools = (next) => {
    toolsRef.current = next;
    setTools(next);
    saveWithRetry(TOOLS_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Same fix as the bulk-scan queue bug from earlier — reads and writes
  // always go through catalogRef, kept synchronously current, rather
  // than the `catalog` state variable directly. Without this, a rapid
  // bulk scan calling this repeatedly could have each call working off
  // a catalog snapshot from before the previous call's update landed,
  // silently overwriting it.
  const saveCatalog = (next) => {
    catalogRef.current = next;
    setCatalog(next);
    saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Vendor spend is a catalog-level concern, not a job/list one — so an
  // archived receipt can still feed it, even though (unlike Receiving)
  // nothing here ever gets applied to any job or Love List's inventory.
  // Takes lines that already know which catalog entry they're linked to
  // (resolved once at scan time, or updated later by hand) rather than
  // re-matching by name itself — that way a manual link made after the
  // fact can trigger the exact same logging a scan-time match would have.
  const recordVendorPurchasesForLines = (lines, vendor, receiptDate) => {
    if (!vendor || !vendor.trim()) return { summary: [], recordIdByLine: {} };
    const eligible = (lines || []).filter((l) => l.catalogId && l.shippedQty > 0);
    if (eligible.length === 0) return { summary: [], recordIdByLine: {} };

    // Computed synchronously against catalogRef (always current, unlike
    // the `catalog` state variable during a rapid bulk scan) rather than
    // mutating `summary` inside a setState updater and returning it
    // right after — that relied on React having already run the updater
    // by then, which isn't guaranteed, so the summary used to show
    // "Vendor spend logged" on the receipt could come back empty even
    // when the catalog itself eventually got updated correctly.
    const summary = [];
    // Which specific record each line created — this is what lets a
    // later correction find and retract exactly that one record instead
    // of only ever being able to add more.
    const recordIdByLine = {};
    const nextCatalog = catalogRef.current.map((c) => {
      const linesForThis = eligible.filter((l) => l.catalogId === c.id);
      if (linesForThis.length === 0) return c;
      const newRecords = linesForThis.map((l) => {
        const rec = {
          id: uniqueId(),
          vendor: vendor.trim(),
          qty: l.shippedQty,
          amount: Math.round((l.unitPrice || 0) * l.shippedQty * 100) / 100,
          date: receiptDate || new Date().toISOString().slice(0, 10),
        };
        recordIdByLine[l.id] = rec.id;
        return rec;
      });
      summary.push({
        catalogName: c.name,
        qty: linesForThis.reduce((s, l) => s + l.shippedQty, 0),
        amount: newRecords.reduce((s, r) => s + r.amount, 0),
      });
      const updatedHistory = [...(c.vendorHistory || []), ...newRecords];
      return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || c.vendor };
    });
    saveCatalog(nextCatalog);
    return { summary, recordIdByLine };
  };

  // Removes one specific vendor-history record by id, wherever it lives
  // in the catalog — used when a line's link changes (a name correction
  // re-matching it, or a manual relink) so the OLD record actually goes
  // away instead of just sitting there forever alongside the new one.
  const removeVendorRecord = (recordId) => {
    if (!recordId) return;
    const nextCatalog = catalogRef.current.map((c) => {
      if (!(c.vendorHistory || []).some((r) => r.id === recordId)) return c;
      const updatedHistory = c.vendorHistory.filter((r) => r.id !== recordId);
      return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || "" };
    });
    saveCatalog(nextCatalog);
  };

  // Rebuilds the receipt's displayed "Vendor spend logged" summary from
  // scratch, based purely on whatever vendorRecordId each current line
  // actually points to — rather than incrementally mutating a running
  // total, which is exactly what let stale entries accumulate before.
  // This is always correct by construction: if a line no longer points
  // to a record, it can't contribute to the summary, full stop.
  const recomputeVendorSummaryForEntry = (entryId) => {
    const entry = entriesRef.current.find((e) => e.id === entryId);
    if (!entry) return;
    const grouped = {};
    entry.items.forEach((l) => {
      if (!l.vendorRecordId) return;
      const c = catalogRef.current.find((cat) =>
        (cat.vendorHistory || []).some((r) => r.id === l.vendorRecordId)
      );
      const rec = c && c.vendorHistory.find((r) => r.id === l.vendorRecordId);
      if (!c || !rec) return;
      if (!grouped[c.id]) grouped[c.id] = { catalogName: c.name, qty: 0, amount: 0 };
      grouped[c.id].qty += rec.qty || 0;
      grouped[c.id].amount += rec.amount || 0;
    });
    const nextEntries = entriesRef.current.map((e) =>
      e.id === entryId ? { ...e, vendorSummary: Object.values(grouped) } : e
    );
    saveEntries(nextEntries);
    setViewingEntry((prev) => (prev && prev.id === entryId ? nextEntries.find((e) => e.id === entryId) : prev));
  };

  // The single entry point for "this line's link just changed" — always
  // retracts whatever the line previously logged (if anything) before
  // logging anything new, so correcting a name or relinking a line
  // replaces its contribution instead of adding to it.
  const syncVendorSpendForLine = (entry, line, newCatalogId) => {
    if (line.vendorRecordId) removeVendorRecord(line.vendorRecordId);
    let newRecordId = null;
    if (newCatalogId && line.shippedQty > 0 && entry.vendor) {
      const { recordIdByLine } = recordVendorPurchasesForLines(
        [{ ...line, catalogId: newCatalogId }],
        entry.vendor,
        entry.receiptDate
      );
      newRecordId = recordIdByLine[line.id] || null;
    }
    updateArchiveLine(entry.id, line.id, { vendorRecordId: newRecordId });
    recomputeVendorSummaryForEntry(entry.id);
  };

  // Same alias-learning as Receiving — linking a garbled OCR string to a
  // catalog item teaches that exact phrase for next time, so future
  // receipts (here or in Receiving) from the same supplier auto-match
  // instead of needing a manual link again.
  const learnAlias = (catalogId, aliasText) => {
    if (!catalogId || !aliasText || !aliasText.trim()) return;
    const next = withLearnedAlias(catalogRef.current, catalogId, aliasText);
    if (next !== catalogRef.current) saveCatalog(next);
  };

  const scanOneToArchive = async (file) => {
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

    const res = await fetch("https://vwvppivdpxjvmaazcmmg.supabase.co/functions/v1/scan-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Scan failed.");

    // Fetched fresh from storage right here, rather than trusting
    // catalogRef — this is the one match attempt that's genuinely hard
    // to retry (everything after it, the debounced re-check on typing or
    // a manual Sync, naturally happens later and picks up whatever's
    // current by then). A stale in-memory snapshot at exactly this
    // moment — another tab editing the catalog at the same time, say —
    // could otherwise mean a real catalog entry gets missed on the one
    // attempt that's supposed to just work automatically.
    let matchCatalog = catalogRef.current;
    const freshCatalogResult = await getWithRetry(CATALOG_KEY);
    if (freshCatalogResult.ok && freshCatalogResult.value) {
      try {
        matchCatalog = JSON.parse(freshCatalogResult.value);
        catalogRef.current = matchCatalog;
        setCatalog(matchCatalog);
      } catch {}
    }

    // Same line shape as Receiving — a raw OCR name that never changes,
    // an editable working name that starts as either a remembered
    // correction or the raw text (never auto-renamed to a bare catalog
    // name, for the same multi-size-variant reasons Receiving avoids it),
    // and a catalogId from an initial name match if one's found. Reads
    // catalogRef, not the `catalog` state variable — this is the exact
    // same fix as recordVendorPurchasesForLines and learnAlias, and it
    // was the actual missing piece: this specific line is what decides
    // catalogId in the first place, so any staleness here meant an item
    // could come up "No catalog match" even though the entry genuinely
    // already existed, and — since a manual link starts fresh from
    // whatever's current — re-linking by hand always "fixed" it.
    const items = (data.items || []).map((it) => {
      const rawName = it.name || "";
      // Matched against the corrected name when one exists, not the raw
      // OCR text — a name-memory correction can turn something like
      // "HOUG 12230 Cutter Annular 15/16 Hss Slugger" into "Mag Drill
      // Bit, 15/16"", and the corrected version is what actually
      // resembles the catalog entry. Matching against the untouched raw
      // text meant a part that had never been manually linked before
      // (and so had no learned alias to fall back on) would show "No
      // catalog match" even though its corrected name would clearly
      // match — exactly why editing the name and triggering a re-check
      // always "fixed" it.
      const remembered = nameMemory[normalizeText(rawName)];
      const effectiveName = remembered || rawName;
      const match = findScannedLineMatch(rawName, effectiveName, matchCatalog);
      return {
        id: uniqueId(),
        rawName,
        name: effectiveName,
        catalogId: match ? match.id : null,
        // Set once the vendor-spend record for this line actually gets
        // created below — this is what lets a later correction find and
        // retract exactly that record instead of only ever adding more.
        vendorRecordId: null,
        backorderQty: Number(it.backorderQty) > 0 ? Number(it.backorderQty) : 0,
        shippedQty: Number(it.shippedQty) > 0 ? Number(it.shippedQty) : 0,
        unit: (it.unit || "each").trim(),
        unitPrice: Number(it.unitPrice) > 0 ? Number(it.unitPrice) : 0,
      };
    });

    // Catalog vendor-spend logging happens right here at scan time —
    // it's a side effect on the catalog only, completely separate from
    // the archive entry itself; editing an item's link later on can
    // trigger this same logging retroactively too.
    const { summary: vendorSummary, recordIdByLine } = recordVendorPurchasesForLines(
      items,
      data.vendor,
      data.receiptDate
    );
    const itemsWithRecordIds = items.map((it) =>
      recordIdByLine[it.id] ? { ...it, vendorRecordId: recordIdByLine[it.id] } : it
    );

    return {
      id: uniqueId(),
      photoUrl,
      photoPath,
      fullText: data.fullText || "",
      vendor: data.vendor || "",
      vendorAddress: data.vendorAddress || "",
      poNumber: data.poNumber || "",
      receiptDate: data.receiptDate || "",
      // Editable — a garbled OCR name and its catalog link can both be
      // corrected from the detail view, same as Receiving.
      items: itemsWithRecordIds,
      archivedAt: new Date().toISOString(),
      vendorSummary,
    };
  };

  const runArchiveScans = async (fileList) => {
    setScanning(true);
    setScanError("");
    const files = Array.from(fileList);
    const errors = [];
    for (let i = 0; i < files.length; i++) {
      setScanProgress({ current: i + 1, total: files.length });
      try {
        const entry = await scanOneToArchive(files[i]);
        saveEntries([entry, ...entriesRef.current]);
        playSaveChime();
      } catch (err) {
        errors.push(`"${files[i].name}" — ${err.message || String(err)}`);
      }
    }
    if (errors.length > 0) setScanError(errors.join(" · "));
    setScanning(false);
    setScanProgress(null);
  };

  const deleteEntry = (entry) => {
    if (entry.photoPath) deleteReferenceDocument(entry.photoPath).catch(() => {});
    saveEntries(entriesRef.current.filter((e) => e.id !== entry.id));
  };

  // Converts an archived receipt into a real pending batch in Receiving,
  // so its items can actually be assigned to a job or Love List — the
  // same photo and line data, just handed to the workflow that has an
  // approval step. Any vendor spend already logged while this sat in the
  // Archive gets retracted first, since Receiving's own approval will
  // log it properly once each item is actually applied somewhere —
  // letting both stand would double-count anything already linked here.
  const sendToReceiving = async (entry) => {
    entry.items.forEach((it) => {
      if (it.vendorRecordId) removeVendorRecord(it.vendorRecordId);
    });

    const lines = entry.items.map((it) => ({
      id: uniqueId(),
      rawName: it.rawName,
      name: it.name,
      catalogId: it.catalogId,
      catalogLinkedManually: !!it.catalogLinkedManually,
      targetType: null,
      targetId: null,
      approved: false,
      unit: it.unit,
      unitPrice: it.unitPrice,
      receiptDate: entry.receiptDate,
      vendor: entry.vendor,
      backorderQty: it.backorderQty,
      shippedQty: it.shippedQty,
    }));

    const newBatch = newReceiptBatch(entry.photoUrl, entry.photoPath, lines, {
      vendor: entry.vendor,
      poNumber: entry.poNumber,
      receiptDate: entry.receiptDate,
    });
    newBatch.label = entry.vendor ? `${entry.vendor} (from Archive)` : "";

    const queueResult = await getWithRetry(RECEIVING_QUEUE_KEY);
    const queue = queueResult.ok && queueResult.value ? JSON.parse(queueResult.value) : [];
    await saveWithRetry(RECEIVING_QUEUE_KEY, JSON.stringify([newBatch, ...queue]));

    // The archive entry stays fully intact — same photo, full text,
    // still searchable — this is purely a label so it's not confusing
    // to later find the same receipt sitting in two places at once.
    const nextEntries = entriesRef.current.map((e) =>
      e.id === entry.id
        ? { ...e, sentToReceiving: true, items: e.items.map((it) => ({ ...it, vendorRecordId: null })) }
        : e
    );
    saveEntries(nextEntries);
    setViewingEntry((prev) => (prev && prev.id === entry.id ? nextEntries.find((e) => e.id === entry.id) : prev));
  };

  // Deletes every archive entry currently matching the search, photos
  // included — this is what makes "delete all" scoped to what you're
  // actually looking at rather than always wiping the entire archive.
  const deleteAllShown = (entriesToDelete) => {
    entriesToDelete.forEach((e) => {
      if (e.photoPath) deleteReferenceDocument(e.photoPath).catch(() => {});
    });
    const idsToDelete = new Set(entriesToDelete.map((e) => e.id));
    saveEntries(entriesRef.current.filter((e) => !idsToDelete.has(e.id)));
  };

  // Applies a change to one line on one archived entry, keeping the
  // persisted entries list and whatever's currently open in the detail
  // view in sync with each other.
  const updateArchiveLine = (entryId, lineId, changes) => {
    const nextEntries = entriesRef.current.map((e) => {
      if (e.id !== entryId) return e;
      return { ...e, items: e.items.map((l) => (l.id === lineId ? { ...l, ...changes } : l)) };
    });
    saveEntries(nextEntries);
    setViewingEntry((prev) => (prev && prev.id === entryId ? nextEntries.find((e) => e.id === entryId) : prev));
  };

  // Same debounced re-matching as Receiving and the Love List scan
  // review — waits for a pause in typing, always re-checks against the
  // current full text, and never overrides a link you picked manually.
  // Once it settles, the confirmed name is remembered against this
  // line's original raw text, same as approving a line in Receiving does.
  const handleLineNameChange = (entryId, lineId, newName) => {
    updateArchiveLine(entryId, lineId, { name: newName });
    const timerKey = `${entryId}:${lineId}`;
    if (nameDebounceTimers.current[timerKey]) clearTimeout(nameDebounceTimers.current[timerKey]);
    nameDebounceTimers.current[timerKey] = setTimeout(() => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      const line = entry && entry.items.find((l) => l.id === lineId);
      if (!line) return;
      if (!line.catalogLinkedManually) {
        const found = findCatalogMatch(line.name, catalogRef.current);
        if (found && found.id !== line.catalogId) {
          updateArchiveLine(entryId, lineId, { catalogId: found.id });
          syncVendorSpendForLine(entry, line, found.id);
        } else if (!found && line.catalogId) {
          updateArchiveLine(entryId, lineId, { catalogId: null });
          syncVendorSpendForLine(entry, line, null);
        }
      }
      if (line.rawName) {
        const nextMemory = { ...nameMemory, [normalizeText(line.rawName)]: line.name.trim() };
        setNameMemory(nextMemory);
        saveWithRetry(RECEIVING_NAME_MEMORY_KEY, JSON.stringify(nextMemory)).catch(() => {});
      }
    }, 900);
  };

  // Linking (or unlinking) is the deliberate action that teaches the
  // catalog alias and remembers the name. Vendor-spend syncing is shared
  // with the debounced auto-match above via syncVendorSpendForLine — a
  // line getting (re)linked should always retract whatever it previously
  // logged before logging anything new, whichever of the two actions did
  // the linking.
  const handleLineLink = (entry, line, catalogItem) => {
    const catalogId = catalogItem ? catalogItem.id : null;
    updateArchiveLine(entry.id, line.id, { catalogId, catalogLinkedManually: !!catalogItem });
    if (catalogItem) learnAlias(catalogItem.id, line.rawName);
    syncVendorSpendForLine(entry, line, catalogId);
    if (line.rawName) {
      const finalName = line.name.trim();
      const nextMemory = { ...nameMemory, [normalizeText(line.rawName)]: finalName };
      setNameMemory(nextMemory);
      saveWithRetry(RECEIVING_NAME_MEMORY_KEY, JSON.stringify(nextMemory)).catch(() => {});
    }
    setRelinkingLine(null);
    setCatalogSearch("");
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Owner only</h2>
          <p className="text-sm text-slate-500 mb-5">Receipt Archive isn't available on this account.</p>
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
    if (loadFailed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
            <X className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Couldn't load your Receipt Archive</h2>
          <p className="text-sm text-slate-500 mb-5">
            To protect what's already saved, nothing will be changed or saved until this loads
            successfully. This is usually a temporary connection issue.
          </p>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-4 py-2 hover:bg-amber-400"
          >
            Try again
          </button>
          <button
            onClick={onGoHome}
            className="block mx-auto mt-3 text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    // Item names are searched separately from the raw OCR text — a
    // corrected or custom name (like a nickname typed in after linking)
    // may never appear anywhere in the original document's text at all,
    // so fullText alone would never find it.
    const itemNames = (e.items || []).flatMap((it) => [it.name, it.rawName]);
    return [e.fullText, e.vendor, e.poNumber, ...itemNames]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length > 0) runArchiveScans(files);
        }}
      />
      <SectionHeader
        onBack={onGoHome}
        icon={BookOpen}
        iconClassName="text-amber-400"
        title="Receipt Archive"
        maxWidthClass="max-w-2xl"
        current="archive"
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
              ? `${scanProgress.current}/${scanProgress.total}...`
              : "Scanning..."
            : "Scan"}
        </button>
      </SectionHeader>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          A searchable photo log — nothing here creates or updates any items on a job or Love
          List. Items that match your catalog by name still log vendor spend and cost history,
          same as an approved receipt would.
        </p>

        {scanError && <p className="text-sm text-red-400 mb-4">Couldn't scan that: {scanError}</p>}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item names, vendor, or anything printed on a receipt..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />
        <div className="flex items-center gap-3 mb-4">
          {filtered.length > 0 && (
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds({});
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          {filtered.length > 0 && (
            <button
              onClick={() => setConfirmingDeleteAll(true)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Delete all {filtered.length} shown
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={backUpNow}
              disabled={entries.length === 0}
              title="Saves a file with every receipt's text, line items, and photo links (not the photos themselves)"
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
            >
              Back up
            </button>
            <button
              onClick={() => restoreInputRef.current?.click()}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
            >
              Restore
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                e.target.value = "";
                if (file) handleRestoreFileChosen(file);
              }}
            />
          </div>
        </div>
        {backupNotice && <p className="text-xs text-emerald-400 mb-3">{backupNotice}</p>}
        {restoreError && (
          <p className="text-xs text-red-400 mb-3">
            {restoreError}{" "}
            <button onClick={() => setRestoreError(null)} className="underline text-red-300">
              Dismiss
            </button>
          </p>
        )}
        {restorePending && (
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4"
            onClick={() => setRestorePending(null)}
          >
            <div
              className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-slate-100 font-semibold text-base mb-2">Restore from backup?</h2>
              <p className="text-sm text-slate-400 mb-1">
                This file has {restorePending.entries.length} receipt
                {restorePending.entries.length === 1 ? "" : "s"}
                {restorePending.exportedAt
                  ? `, backed up ${new Date(restorePending.exportedAt).toLocaleString()}`
                  : ""}
                .
              </p>
              <p className="text-sm text-slate-400 mb-4">
                This replaces everything currently in the archive ({entries.length} receipt
                {entries.length === 1 ? "" : "s"} right now). Your current archive is saved to a
                file first, so you can undo this. Photos aren't part of the backup — they stay
                wherever they're stored.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestorePending(null)}
                  className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRestore}
                  className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        )}
        {selectMode && (
          <div className="flex items-center justify-between mb-3 text-xs">
            <button
              onClick={() =>
                setSelectedIds(
                  filtered.every((e) => selectedIds[e.id])
                    ? {}
                    : Object.fromEntries(filtered.map((e) => [e.id, true]))
                )
              }
              className="text-slate-400 hover:text-slate-200"
            >
              {filtered.every((e) => selectedIds[e.id]) ? "Deselect all" : `Select all (${filtered.length})`}
            </button>
            <button
              onClick={() => setPrintingSelection(true)}
              disabled={Object.values(selectedIds).filter(Boolean).length === 0}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              Print {Object.values(selectedIds).filter(Boolean).length} selected
            </button>
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            {entries.length === 0
              ? "Nothing archived yet — tap Scan to get started."
              : "Nothing matches that search."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() =>
                  selectMode
                    ? setSelectedIds((prev) => ({ ...prev, [e.id]: !prev[e.id] }))
                    : setViewingEntry(e)
                }
                className={`w-full text-left bg-slate-900 border rounded-lg p-3 flex items-center gap-3 hover:border-slate-700 ${
                  selectMode && selectedIds[e.id] ? "border-amber-500/60 bg-amber-500/5" : "border-slate-800"
                }`}
              >
                {selectMode && (
                  <div
                    className={`w-5 h-5 rounded border shrink-0 flex items-center justify-center ${
                      selectedIds[e.id] ? "bg-amber-500 border-amber-500" : "border-slate-600"
                    }`}
                  >
                    {selectedIds[e.id] && <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />}
                  </div>
                )}
                {e.photoUrl && (
                  <img src={e.photoUrl} alt="" className="w-12 h-12 rounded-md object-cover border border-slate-800 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100 truncate">{e.vendor || "Unknown vendor"}</p>
                  <p className="text-xs text-slate-500">
                    {[e.poNumber && `PO#${e.poNumber}`, e.receiptDate, formatTaskTimestamp(e.archivedAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {!selectMode && (
                  <span
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setDeleteTarget(e);
                    }}
                    className="text-slate-600 hover:text-red-400 shrink-0 p-2.5 -mr-2 ml-1 border-l border-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {viewingEntry && (
        <div className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 overflow-y-auto">
          <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
            <button
              onClick={() => setViewingEntry(null)}
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPrintingEntry(viewingEntry)}
                className="text-slate-400 hover:text-slate-200"
                title="Print this receipt"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={() => setDeleteTarget(viewingEntry)} className="text-slate-500 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </header>
          {(() => {
            // Steps through whatever's currently filtered (respects an
            // active search), so this stays in sync with the list you
            // actually came from instead of always cycling the full
            // archive.
            const idx = filtered.findIndex((e) => e.id === viewingEntry.id);
            const prevEntry = idx > 0 ? filtered[idx - 1] : null;
            const nextEntry = idx !== -1 && idx < filtered.length - 1 ? filtered[idx + 1] : null;
            if (idx === -1 || (!prevEntry && !nextEntry)) return null;
            return (
              <div className="border-b border-slate-800 px-4 py-2 flex items-center justify-between bg-slate-950/60">
                <button
                  onClick={() => prevEntry && setViewingEntry(prevEntry)}
                  disabled={!prevEntry}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-xs text-slate-600">
                  {idx + 1} of {filtered.length}
                </span>
                <button
                  onClick={() => nextEntry && setViewingEntry(nextEntry)}
                  disabled={!nextEntry}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
          <main className="max-w-2xl mx-auto px-4 py-5">
            <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60 mb-4">
              <p className="text-sm font-semibold text-slate-100">
                {viewingEntry.vendor || "Unknown vendor"}
              </p>
              {viewingEntry.vendorAddress && (
                <p className="text-xs text-slate-500 mt-0.5">{viewingEntry.vendorAddress}</p>
              )}
              <p className="text-xs text-slate-500 mt-1.5">
                {[
                  viewingEntry.receiptDate && `Date: ${viewingEntry.receiptDate}`,
                  viewingEntry.poNumber && `PO: ${viewingEntry.poNumber}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No date or PO number found"}
              </p>
              {viewingEntry.sentToReceiving && (
                <p className="text-xs text-sky-400 mt-1.5">📥 Already sent to Receiving</p>
              )}
              {viewingEntry.sentToTools && (
                <p className="text-xs text-violet-400 mt-1.5">🔧 Already sent to Tools</p>
              )}
            </div>

            <button
              onClick={() => setConfirmingSendToReceiving(viewingEntry)}
              className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-2"
            >
              📥{" "}
              {viewingEntry.sentToReceiving
                ? "Send to Receiving again (creates another pending receipt)"
                : "Send to Receiving — assign these items to a job or Love List"}
            </button>

            {(() => {
              // The actual "recognize a tool" logic: an item only counts
              // as a tool candidate if it's linked to a catalog entry
              // AND that entry is tagged Transfer — the same heuristic
              // (Transfer tag + catalog link) used to reason about which
              // items genuinely need SME# tracking, rather than treating
              // every single line on a receipt (shop rags, consumables,
              // generic hardware) as if it needs its own tool record.
              //
              // Reads each line's own catalogId — same as the "🔗 linked
              // to X" / "No catalog match" text shown on that exact line
              // below — rather than independently re-guessing a name
              // match. Re-deriving its own guess meant this could still
              // "see" a match by name even after manually unlinking that
              // exact line, disagreeing with what the line itself says.
              const toolCandidates = (viewingEntry.items || []).filter((it) => {
                const match = it.catalogId ? catalog.find((c) => c.id === it.catalogId) : null;
                return isToolCandidate(match);
              });
              if (toolCandidates.length === 0) return null;
              return (
                <button
                  onClick={() => setConfirmingSendToTools({ ...viewingEntry, toolCandidates })}
                  className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-4"
                >
                  <Wrench className="w-3.5 h-3.5 inline mr-1.5" />
                  {viewingEntry.sentToTools
                    ? `Send to Tools again — ${toolCandidates.length} item${toolCandidates.length === 1 ? "" : "s"} look${toolCandidates.length === 1 ? "s" : ""} like tools`
                    : `Send to Tools — ${toolCandidates.length} item${toolCandidates.length === 1 ? "" : "s"} on this receipt look${toolCandidates.length === 1 ? "s" : ""} like tools`}
                </button>
              );
            })()}

            {viewingEntry.photoUrl && (
              <button
                onClick={() => setViewingPhoto(viewingEntry.photoUrl)}
                className="w-full mb-4 rounded-lg overflow-hidden border border-slate-800"
              >
                <img src={viewingEntry.photoUrl} alt="Receipt" className="w-full max-h-56 object-cover" />
              </button>
            )}

            {viewingEntry.vendorSummary && viewingEntry.vendorSummary.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-400 mb-1.5">🏷️ Vendor spend logged</p>
                <div className="space-y-1.5">
                  {viewingEntry.vendorSummary.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm border border-slate-800 rounded-md px-3 py-2 bg-slate-900/60"
                    >
                      <span className="text-slate-200">
                        {s.catalogName} <span className="text-slate-500">× {s.qty}</span>
                      </span>
                      <span className="text-emerald-400 font-semibold">
                        {s.amount > 0 ? `$${s.amount.toFixed(2)}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Item name and catalog link are both editable — everything
                else (qty, price, target) stays read-only, since there's
                still no assigning these to a job/list, unlike Receiving. */}
            {viewingEntry.items && viewingEntry.items.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-400 mb-1.5">
                  Line items ({viewingEntry.items.length})
                </p>
                <div className="space-y-1.5">
                  {viewingEntry.items.map((it) => {
                    const match = it.catalogId ? catalog.find((c) => c.id === it.catalogId) : null;
                    return (
                      <div key={it.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                        <input
                          value={it.name}
                          onChange={(e) => handleLineNameChange(viewingEntry.id, it.id, e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 mb-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                        />
                        <p className="text-xs text-slate-500 mb-1">
                          {[
                            it.shippedQty > 0 && `Shipped ${it.shippedQty}${it.unit && it.unit.toLowerCase() !== "each" ? ` ${it.unit}` : ""}`,
                            it.backorderQty > 0 && `${it.backorderQty} backorder`,
                            it.unitPrice > 0 && `$${it.unitPrice.toFixed(2)} each`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No quantity or price recognized"}
                        </p>
                        {match ? (
                          <button
                            onClick={() => {
                              setRelinkingLine(it);
                              setCatalogSearch("");
                            }}
                            className="text-[11px] text-emerald-400 hover:underline decoration-dotted"
                          >
                            🔗 linked to "{match.name}" · Change
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setRelinkingLine(it);
                              setCatalogSearch("");
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-300 hover:underline decoration-dotted"
                          >
                            No catalog match — 🔍 link manually
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <details className="text-xs">
              <summary className="text-slate-500 hover:text-slate-300 cursor-pointer select-none">
                Show full recognized text
              </summary>
              <p className="text-sm text-slate-300 whitespace-pre-wrap border border-slate-800 rounded-lg p-3 bg-slate-900/60 mt-2">
                {viewingEntry.fullText || "Nothing came through legibly on this scan."}
              </p>
            </details>
          </main>
        </div>
      )}

      {relinkingLine && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-8">
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
                  onClick={() => handleLineLink(viewingEntry, relinkingLine, null)}
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
                    onClick={() => handleLineLink(viewingEntry, relinkingLine, c)}
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

      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
          onClick={() => setViewingPhoto(null)}
        >
          <button
            onClick={() => setViewingPhoto(null)}
            className="absolute top-4 right-4 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <ZoomableImage key={viewingPhoto} src={viewingPhoto} alt="Receipt" />
        </div>
      )}

      {deleteTarget && (
        <ConfirmDelete
          title="Delete this archived receipt?"
          message="The photo and recognized text are both permanently removed. This can't be undone."
          onConfirm={() => {
            deleteEntry(deleteTarget);
            setDeleteTarget(null);
            setViewingEntry(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {confirmingDeleteAll && (
        <ConfirmDelete
          title={`Delete all ${filtered.length} shown?`}
          message="Every archived receipt currently matching your search — photos and recognized text both — gets permanently deleted. This can't be undone."
          onConfirm={() => {
            deleteAllShown(filtered);
            setConfirmingDeleteAll(false);
          }}
          onCancel={() => setConfirmingDeleteAll(false)}
        />
      )}

      {confirmingSendToReceiving && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          onClick={() => setConfirmingSendToReceiving(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-100 font-semibold mb-1.5">Send to Receiving?</h3>
            <p className="text-slate-400 text-sm mb-5">
              {confirmingSendToReceiving.sentToReceiving
                ? "This creates ANOTHER pending receipt in Receiving with the same photo and items — you already sent this one once. Only do this if the first one was approved, discarded, or otherwise didn't cover everything."
                : "Creates a new pending receipt in Receiving with the same photo and line items, so they can be assigned to a job or Love List. This entry stays right here too — nothing is removed from the Archive. If any items already logged vendor spend while sitting here, that gets retracted first, since Receiving's own approval will log it properly once each item is actually applied somewhere."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingSendToReceiving(null)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSendingToReceiving(true);
                  await sendToReceiving(confirmingSendToReceiving);
                  setSendingToReceiving(false);
                  setConfirmingSendToReceiving(null);
                }}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {sendingToReceiving && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin shrink-0" />
            <p className="text-sm text-slate-300">Sending to Receiving...</p>
          </div>
        </div>
      )}

      {confirmingSendToTools && (
        <AddToolModal
          title={`Send to Tools — ${confirmingSendToTools.vendor || "receipt"}`}
          initialRows={confirmingSendToTools.toolCandidates.map((it) => ({
            id: uniqueId(),
            name: it.name,
            qty: String(Math.max(1, Number(it.shippedQty) || 1)),
            smeText: "",
          }))}
          existingReceipt={
            confirmingSendToTools.photoUrl
              ? { path: confirmingSendToTools.photoPath, url: confirmingSendToTools.photoUrl }
              : null
          }
          onSave={(newTools) => {
            saveTools([...newTools, ...toolsRef.current]);
            saveEntries(
              entriesRef.current.map((e) =>
                e.id === confirmingSendToTools.id ? { ...e, sentToTools: true } : e
              )
            );
            setConfirmingSendToTools(null);
          }}
          onClose={() => setConfirmingSendToTools(null)}
        />
      )}

      {printingEntry && (
        <PrintableReceiptModal entry={printingEntry} onClose={() => setPrintingEntry(null)} />
      )}

      {printingSelection && (
        <PrintableReceiptsModal
          entries={filtered.filter((e) => selectedIds[e.id])}
          onClose={() => setPrintingSelection(false)}
        />
      )}
    </div>
  );
}
