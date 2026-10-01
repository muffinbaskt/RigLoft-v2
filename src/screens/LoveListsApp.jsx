import { useState, useEffect, useRef } from "react";
import {
  Archive,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  Heart,
  Home,
  Image as ImageIcon,
  Inbox,
  ListChecks,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useRemoteRefresh } from "../lib/useRemoteRefresh";
import {
  STORAGE_OPTIONS,
  uniqueId,
  selectOnFocus,
  copyToClipboard,
  timeStamp,
  playSoftTap,
  playSaveChime,
  findCatalogMatch,
  withLearnedAlias,
  parseSerials,
  lockedLoveSerials,
  newLoveListItem,
} from "../lib/utils";
import {
  LOVE_LISTS_KEY,
  LOVE_STATUSES,
  nextLoveStatus,
  prevLoveStatus,
  stepLoveItemStatus,
  walkLoveItemToStatus,
  loveStatusMeta,
  loveItemDisplayMeta,
  listDisplayLabel,
  describeListChange,
  findPossibleDuplicates,
  isStale,
  LOVE_TASK_LIST_KEY,
  newLoveTaskEntry,
  groupLoveTaskEntries,
  formatLoveTaskListText,
  DEFAULT_STALE_THRESHOLD_DAYS,
  STALE_THRESHOLDS_KEY,
  daysInCurrentStatus,
} from "../lib/lovelists";
import { convertQtyForUnit, itemReceipts, mergeLoveListItems } from "../lib/receiving";
import { threeWayMergeLoveLists } from "../lib/sync";
import { createSyncEngine, applyLoveListResolutions } from "../lib/syncEngine";
import {
  workerTaskStatusMeta,
  newWorkerTask,
  newSharedWorkerTask,
  migrateWorkerTask,
  WORKER_TASKS_KEY,
  WORKERS_KEY,
} from "../lib/workertasks";
import {
  getWithRetry,
  saveWithRetry,
  peekUpdatedAt,
  CATALOG_KEY,
  deleteReferenceDocument,
  uploadReferenceDocument,
  uploadLoveListScan,
  storagePathFromPublicUrl,
  pdfToImageFiles,
} from "../lib/api";
import { syncSmesIntoRegistry, TOOLS_KEY } from "../lib/tools";
import { downloadLoveListsBackupFile, maybeAutoBackupLoveLists } from "../lib/backup";
import {
  ConfirmDelete,
  DeepLinkQrModal,
  PhotoLightbox,
  PullFromReceivingModal,
  ReferenceDocsModal,
  Select,
  SectionHeader,
  SourceReceiptModal,
  VendorBreakdownModal,
} from "../components/shared";
import { AssignToWorkerModal, WorkerTasksSection } from "../components/WorkerTasks";

export function LoveListItemEntry({ catalog, allLists = [], currentListId, onLearnAlias, onAdd }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [qtyUnit, setQtyUnit] = useState("");
  const [storage, setStorage] = useState("");
  const [storageDetail, setStorageDetail] = useState("");
  const [manualCatalogId, setManualCatalogId] = useState(null);
  const [storageTouched, setStorageTouched] = useState(false);
  const [needsOrdering, setNeedsOrdering] = useState(true);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  const autoMatch = name.trim() ? findCatalogMatch(name.trim(), catalog) : null;
  const linkedCatalogItem = manualCatalogId
    ? catalog.find((c) => c.id === manualCatalogId) || null
    : autoMatch;
  const duplicates = name.trim()
    ? findPossibleDuplicates(name.trim(), linkedCatalogItem?.id || null, catalog, allLists, {
        excludeListId: currentListId,
      })
    : [];

  // Auto-fill storage from the catalog link, but only while the user
  // hasn't manually touched the storage field themselves.
  useEffect(() => {
    if (linkedCatalogItem && !storageTouched) {
      setStorage(linkedCatalogItem.storage || "");
      setStorageDetail(linkedCatalogItem.storageDetail || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCatalogItem?.id]);

  const reset = () => {
    setName("");
    setQty("");
    setQtyUnit("");
    setStorage("");
    setStorageDetail("");
    setManualCatalogId(null);
    setStorageTouched(false);
    setNeedsOrdering(true);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd(
      newLoveListItem(name.trim(), qty.trim() === "" ? 1 : Number(qty) || 1, {
        qtyUnit: qtyUnit.trim(),
        catalogId: linkedCatalogItem ? linkedCatalogItem.id : null,
        storage,
        storageDetail,
        needsTransfer: linkedCatalogItem ? !!linkedCatalogItem.needsTransfer : false,
        needsOrdering,
        // No frozen duplicate snapshot here anymore — the item card
        // already runs a live duplicate check on every render, which
        // stays accurate even after the other item gets deleted. A
        // point-in-time snapshot here would just go stale the same way
        // the old one did.
      })
    );
    reset();
  };

  return (
    <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="col-span-2 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
        />
        <input
          type="number"
          onFocus={selectOnFocus}
          onClick={selectOnFocus}
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qty"
          className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 text-center focus:outline-none focus:ring-2 focus:ring-rose-500/60"
        />
      </div>
      <input
        value={qtyUnit}
        onChange={(e) => setQtyUnit(e.target.value)}
        placeholder="each (default), case, box, custom..."
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
      />
      {linkedCatalogItem ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="text-emerald-400 flex items-center gap-1 min-w-0 truncate">
            🔗 Linked to catalog: {linkedCatalogItem.name}
            {linkedCatalogItem.needsTransfer && " · 🚚 needs transfer"}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowCatalogPicker(true)}
              className="text-slate-400 hover:text-slate-200"
            >
              Change
            </button>
            <button
              onClick={() => setManualCatalogId("__none__")}
              className="text-slate-500 hover:text-red-400"
            >
              Unlink
            </button>
          </div>
        </div>
      ) : (
        name.trim() && (
          <button
            onClick={() => setShowCatalogPicker(true)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            No catalog match found — 🔍 search manually
          </button>
        )
      )}
      {duplicates.length > 0 && (
        <div className="border border-amber-600/40 bg-amber-500/10 rounded-md p-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-300">
            ⚠ Already requested — check before adding another
          </p>
          {duplicates.map(({ list, item }) => (
            <p key={item.id} className="text-xs text-amber-200/80">
              "{item.name}" for {list.jobLabel} on {list.dateReceived} —{" "}
              {loveItemDisplayMeta(item).label}
            </p>
          ))}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Does this need to be ordered?
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setNeedsOrdering(true)}
            className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
              needsOrdering
                ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            Needs ordering
          </button>
          <button
            onClick={() => setNeedsOrdering(false)}
            className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
              !needsOrdering
                ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            📦 In inventory
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={storage}
          onChange={(v) => {
            setStorage(v);
            setStorageTouched(true);
          }}
          options={["", ...STORAGE_OPTIONS]}
          labels={{ "": "Storage (optional)" }}
        />
        {storage === "Other" && (
          <input
            value={storageDetail}
            onChange={(e) => setStorageDetail(e.target.value)}
            placeholder="Specify location..."
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
          />
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className="w-full text-sm rounded-md py-2 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
      >
        + Add item
      </button>

      {showCatalogPicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm">Link to catalog item</h3>
              <button
                onClick={() => setShowCatalogPicker(false)}
                className="text-slate-400 hover:text-slate-200"
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {catalog
                .filter((c) => c.name.toLowerCase().includes(catalogSearch.trim().toLowerCase()))
                .slice(0, 50)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setManualCatalogId(c.id);
                      setStorage(c.storage || "");
                      setStorageDetail(c.storage === "Other" ? c.storageDetail || "" : "");
                      setStorageTouched(false);
                      onLearnAlias && onLearnAlias(c.id, name);
                      setShowCatalogPicker(false);
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
              {catalog.filter((c) =>
                c.name.toLowerCase().includes(catalogSearch.trim().toLowerCase())
              ).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">No matches.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoveListScanModal({ catalog, onLearnAlias, onSave, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState("details"); // "details" | "scanning" | "review" | "error"
  const [jobLabel, setJobLabel] = useState("");
  const [subJobLabel, setSubJobLabel] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [dateReceived, setDateReceived] = useState(todayStr);
  const [scanError, setScanError] = useState("");
  const [reviewItems, setReviewItems] = useState([]);
  const [relinkingReviewItem, setRelinkingReviewItem] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [scanImageUrl, setScanImageUrl] = useState(null);
  // Anything scanned after the first page — kept as supporting reference
  // photos on the saved list, same as manually-attached ones.
  const [extraScanImageUrls, setExtraScanImageUrls] = useState([]);
  const [viewingIndex, setViewingIndex] = useState(null);
  const fileInputRef = useRef(null);
  const anotherPageInputRef = useRef(null);

  const runScan = async (file, { append = false } = {}) => {
    setStep("scanning");
    setScanError("");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Couldn't read that image."));
        reader.readAsDataURL(file);
      });

      // Upload the original photo alongside the OCR call — if this
      // specific part fails, that's not worth blocking the actual scan
      // result over, so it fails silently and just leaves the list
      // without a saved photo. The first page becomes the primary scan
      // photo; anything scanned after that stacks up as extra reference
      // photos instead.
      uploadLoveListScan(file).then((res) => {
        if (!res.ok) return;
        if (append) {
          setExtraScanImageUrls((prev) => [...prev, res.url]);
        } else {
          setScanImageUrl(res.url);
        }
      });

      const res = await fetch(
        "https://vwvppivdpxjvmaazcmmg.supabase.co/functions/v1/scan-love-list",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Scan failed.");

      const items = (data.items || []).map((it) => {
        const match = findCatalogMatch(it.name || "", catalog);
        const unit = (it.unit || "each").trim();
        return {
          id: uniqueId(),
          name: it.name || "",
          qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
          // Blank means "each" (the normal case) — only actually shown
          // when it's something worth calling out, like Dozen or Case.
          qtyUnit: unit.toLowerCase() !== "each" ? unit : "",
          catalogId: match ? match.id : null,
          storage: match ? match.storage : "",
          storageDetail: match && match.storage === "Other" ? match.storageDetail || "" : "",
          needsTransfer: match ? !!match.needsTransfer : false,
        };
      });
      setReviewItems((prev) => (append ? [...prev, ...items] : items));
      setStep("review");
    } catch (err) {
      setScanError(err.message || String(err));
      setStep("error");
    }
  };

  const updateReviewItem = (id, changes) => {
    setReviewItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  };

  // Same debounced re-matching as Receiving's line review — waits for a
  // pause in typing instead of only ever checking once, at the moment of
  // the original scan. Without this, correcting a garbled OCR name here
  // never had any chance of picking up a catalog link, even if the
  // corrected text would now match something. Uses the functional
  // setState form throughout, so unlike the receiving version this
  // doesn't need a ref workaround — `prev` is always genuinely current
  // no matter when the timer fires.
  const nameDebounceTimers = useRef({});
  const handleReviewNameChange = (id, newName) => {
    updateReviewItem(id, { name: newName });
    if (nameDebounceTimers.current[id]) clearTimeout(nameDebounceTimers.current[id]);
    nameDebounceTimers.current[id] = setTimeout(() => {
      setReviewItems((prev) =>
        prev.map((i) => {
          if (i.id !== id || i.catalogLinkedManually) return i;
          const found = findCatalogMatch(i.name, catalog);
          if (found && found.id !== i.catalogId) return { ...i, catalogId: found.id };
          if (!found && i.catalogId) return { ...i, catalogId: null };
          return i;
        })
      );
    }, 900);
  };

  const removeReviewItem = (id) => {
    setReviewItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Same "duplicate the row right below itself" pattern as the Job List
  // import — handy when a receipt lists the same item at two different
  // sizes/counts and retyping it isn't worth the trouble.
  const cloneReviewItem = (id) => {
    setReviewItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: uniqueId() };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
  };

  const confirmSave = () => {
    const finalItems = reviewItems
      .filter((i) => i.name.trim())
      .map((i) =>
        newLoveListItem(i.name.trim(), i.qty, {
          catalogId: i.catalogId,
          storage: i.storage,
          storageDetail: i.storageDetail,
          needsTransfer: i.needsTransfer,
          qtyUnit: i.qtyUnit,
        })
      );
    onSave({
      jobLabel: jobLabel.trim(),
      subJobLabel: subJobLabel.trim(),
      submittedBy: submittedBy.trim(),
      dateReceived,
      items: finalItems,
      scanImageUrl,
      extraScanImageUrls,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-rose-400" />
            Scan a Love List
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "details" && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Job # / name
                </label>
                <input
                  autoFocus
                  value={jobLabel}
                  onChange={(e) => setJobLabel(e.target.value)}
                  placeholder="e.g. 3052"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Submitted by
                </label>
                <input
                  value={submittedBy}
                  onChange={(e) => setSubmittedBy(e.target.value)}
                  placeholder="optional"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Sub-job / nickname (optional)
              </label>
              <input
                value={subJobLabel}
                onChange={(e) => setSubJobLabel(e.target.value)}
                placeholder="e.g. Support Building"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Date received
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDateReceived(todayStr)}
                  className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                    dateReceived === todayStr
                      ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                      : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  Today
                </button>
                <input
                  type="date"
                  value={dateReceived}
                  onChange={(e) => setDateReceived(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files[0] && runScan(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!jobLabel.trim()}
              className="w-full flex items-center justify-center gap-2 text-sm rounded-md py-3 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
            >
              <Camera className="w-4 h-4" />
              Take or choose a photo
            </button>
            {!jobLabel.trim() && (
              <p className="text-xs text-slate-600 text-center mt-2">
                Enter a job first, then scan.
              </p>
            )}
          </div>
        )}

        {step === "scanning" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">Reading the list...</p>
          </div>
        )}

        {step === "error" && (
          <div className="flex-1 px-5 py-8 text-center">
            <p className="text-sm text-red-400 mb-4">{scanError}</p>
            <button
              onClick={() => setStep("details")}
              className="text-sm rounded-md py-2 px-4 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-slate-500 mb-3">
                Check every line before saving — nothing's committed yet.
              </p>
              {scanImageUrl && (
                <div className="mb-4">
                  <button
                    onClick={() => setViewingIndex(0)}
                    className="w-full rounded-lg overflow-hidden border border-slate-800"
                  >
                    <img src={scanImageUrl} alt="Scanned Love List" className="w-full max-h-48 object-cover" />
                  </button>
                  {extraScanImageUrls.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                      {extraScanImageUrls.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setViewingIndex(i + 1)}
                          className="rounded-md overflow-hidden border border-slate-800"
                        >
                          <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {reviewItems.map((item) => (
                  <div key={item.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                    <div className="flex items-center gap-2 mb-1.5">
                      <input
                        value={item.name}
                        onChange={(e) => handleReviewNameChange(item.id, e.target.value)}
                        className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                      />
                      <input
                        type="number"
                        onFocus={selectOnFocus}
                        onClick={selectOnFocus}
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateReviewItem(item.id, { qty: Number(e.target.value) || 1 })}
                        className="w-14 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                      />
                      <input
                        value={item.qtyUnit || ""}
                        onChange={(e) => updateReviewItem(item.id, { qtyUnit: e.target.value })}
                        placeholder="each"
                        title="Unit — Dozen, Case, Box, etc. Leave blank for each."
                        className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-1.5 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                      />
                      <button
                        onClick={() => cloneReviewItem(item.id)}
                        title="Clone this item"
                        className="text-slate-500 hover:text-amber-400 shrink-0 p-1"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeReviewItem(item.id)}
                        className="text-slate-600 hover:text-red-400 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {item.catalogId ? (
                      <button
                        onClick={() => setRelinkingReviewItem(item)}
                        className="text-xs text-emerald-400 hover:underline decoration-dotted"
                      >
                        🔗 {catalog.find((c) => c.id === item.catalogId)?.name} · Change
                      </button>
                    ) : (
                      <button
                        onClick={() => setRelinkingReviewItem(item)}
                        className="text-xs text-slate-500 hover:text-slate-300 hover:underline decoration-dotted"
                      >
                        No catalog match — 🔍 search manually
                      </button>
                    )}
                  </div>
                ))}
                {reviewItems.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-6">
                    Nothing left to add — every line was removed.
                  </p>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-800 shrink-0 space-y-2">
              <input
                ref={anotherPageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files[0] && runScan(e.target.files[0], { append: true })}
              />
              <button
                onClick={() => anotherPageInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Camera className="w-4 h-4" />
                Scan another page
              </button>
              <button
                onClick={confirmSave}
                disabled={reviewItems.length === 0}
                className="w-full text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
              >
                Save Love List ({reviewItems.length} item{reviewItems.length === 1 ? "" : "s"})
              </button>
            </div>
          </>
        )}
      </div>

      {relinkingReviewItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                Link "{relinkingReviewItem.name}" to...
              </h3>
              <button
                onClick={() => {
                  setRelinkingReviewItem(null);
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {relinkingReviewItem.catalogId && (
                <button
                  onClick={() => {
                    updateReviewItem(relinkingReviewItem.id, {
                      catalogId: null,
                      needsTransfer: false,
                      catalogLinkedManually: false,
                    });
                    setRelinkingReviewItem(null);
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
                      updateReviewItem(relinkingReviewItem.id, {
                        catalogId: c.id,
                        storage: c.storage,
                        storageDetail: c.storage === "Other" ? c.storageDetail || "" : "",
                        needsTransfer: !!c.needsTransfer,
                        catalogLinkedManually: true,
                      });
                      onLearnAlias && onLearnAlias(c.id, relinkingReviewItem.name);
                      setRelinkingReviewItem(null);
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

      {viewingIndex !== null && (
        <PhotoLightbox
          photos={[scanImageUrl, ...extraScanImageUrls].filter(Boolean).map((url) => ({
            url,
            alt: "Scanned Love List",
          }))}
          index={viewingIndex}
          onIndexChange={setViewingIndex}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </div>
  );
}

export function LoveListAddForm({ catalog, allLists, onLearnAlias, onSave, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [jobLabel, setJobLabel] = useState("");
  const [subJobLabel, setSubJobLabel] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [dateReceived, setDateReceived] = useState(todayStr);
  const [items, setItems] = useState([]);
  // Generated up front, before the list itself actually exists yet, so
  // any pages attached during creation can still upload to a real path
  // (same "job-documents" bucket, same id-based folder Reference
  // Documents uses after the fact) instead of needing some separate
  // "staging area" scheme.
  const [listId] = useState(() => uniqueId());
  const [referenceDocuments, setReferenceDocuments] = useState([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsUploadError, setDocsUploadError] = useState(null);
  const [pdfQueue, setPdfQueue] = useState([]);
  const pdfPrompt = pdfQueue[0] || null;
  const docsPhotoInputRef = useRef(null);
  const docsFileInputRef = useRef(null);

  const canSave = jobLabel.trim() && items.length > 0;

  const addDoc = (result) => {
    setReferenceDocuments((prev) => [
      ...prev,
      {
        id: uniqueId(),
        name: result.name,
        url: result.url,
        path: result.path,
        type: result.type || "",
        uploadedAt: timeStamp(),
      },
    ]);
  };

  const doUploadDoc = async (file) => {
    const result = await uploadReferenceDocument(listId, file);
    if (!result.ok) {
      setDocsUploadError((prev) => (prev ? `${prev} · ${result.error}` : result.error || "Upload failed"));
      return;
    }
    addDoc(result);
  };

  // Same split as Reference Documents itself: images upload right away,
  // PDFs each get their own convert-vs-keep decision, since that choice
  // genuinely depends on what a given PDF actually is.
  const handleDocsFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const pdfs = files.filter((f) => f.type === "application/pdf");
    const others = files.filter((f) => f.type !== "application/pdf");
    if (others.length > 0) {
      setDocsUploadError(null);
      setDocsUploading(true);
      for (const file of others) {
        await doUploadDoc(file);
      }
      setDocsUploading(false);
    }
    if (pdfs.length > 0) setPdfQueue((prev) => [...prev, ...pdfs]);
  };

  const keepDocPdfAsIs = async () => {
    if (!pdfPrompt) return;
    setPdfQueue((prev) => prev.slice(1));
    setDocsUploadError(null);
    setDocsUploading(true);
    await doUploadDoc(pdfPrompt);
    setDocsUploading(false);
  };

  const convertDocPdfToPhotos = async () => {
    if (!pdfPrompt) return;
    const file = pdfPrompt;
    setPdfQueue((prev) => prev.slice(1));
    setDocsUploadError(null);
    setDocsUploading(true);
    try {
      const imageFiles = await pdfToImageFiles(file);
      for (const imgFile of imageFiles) {
        const result = await uploadReferenceDocument(listId, imgFile);
        if (result.ok) addDoc(result);
      }
    } catch (err) {
      setDocsUploadError("Couldn't convert that PDF — " + (err && err.message ? err.message : String(err)));
    }
    setDocsUploading(false);
  };

  const removeDoc = async (doc) => {
    setReferenceDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    if (doc.path) await deleteReferenceDocument(doc.path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">New Love List</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Job # / name
              </label>
              <input
                autoFocus
                value={jobLabel}
                onChange={(e) => setJobLabel(e.target.value)}
                placeholder="e.g. 3052"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Submitted by
              </label>
              <input
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder="optional"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Sub-job / nickname (optional)
            </label>
            <input
              value={subJobLabel}
              onChange={(e) => setSubJobLabel(e.target.value)}
              placeholder="e.g. Support Building"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <p className="text-xs text-slate-600 mt-1">
              Still groups under {jobLabel.trim() || "the job number"} — this just tells the
              list apart from others on the same job.
            </p>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Date received
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDateReceived(todayStr)}
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  dateReceived === todayStr
                    ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                Today
              </button>
              <input
                type="date"
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Reference documents (optional)
            </label>
            <p className="text-xs text-slate-600 mb-2">
              Attach the original sheet(s) this list came from now, or add them later from the
              list's own Reference documents panel.
            </p>
            {referenceDocuments.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {referenceDocuments.map((doc) => {
                  const isPhoto = (doc.type || "").startsWith("image/");
                  return (
                    <div key={doc.id} className="relative group">
                      {isPhoto ? (
                        <div className="aspect-square rounded-md overflow-hidden border border-slate-800">
                          <img src={doc.url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-square rounded-md border border-slate-800 flex items-center justify-center bg-slate-800/40">
                          <FileText className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                      <button
                        onClick={() => removeDoc(doc)}
                        className="absolute top-1 right-1 bg-slate-950/80 text-slate-300 hover:text-red-400 rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {docsUploadError && (
              <p className="text-xs text-red-400 mb-2">Couldn't upload: {docsUploadError}</p>
            )}
            <div className="flex gap-2">
              <input
                ref={docsPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleDocsFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => docsPhotoInputRef.current && docsPhotoInputRef.current.click()}
                disabled={docsUploading}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs rounded-md py-2 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                {docsUploading ? "Uploading..." : "Take a photo"}
              </button>
              <input
                ref={docsFileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={handleDocsFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => docsFileInputRef.current && docsFileInputRef.current.click()}
                disabled={docsUploading}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs rounded-md py-2 bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {docsUploading ? "Uploading..." : "Upload a file"}
              </button>
            </div>
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Items</label>
          <div className="mb-3">
            <LoveListItemEntry
              catalog={catalog}
              allLists={allLists}
              currentListId={null}
              onLearnAlias={onLearnAlias}
              onAdd={(item) => setItems((prev) => [...prev, item])}
            />
          </div>

          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 bg-slate-800/40 border border-slate-800 rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100">
                      {it.name} <span className="text-slate-500">x{it.qty}{it.qtyUnit ? ` ${it.qtyUnit}` : ""}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {[
                        it.catalogId && "🔗 linked",
                        it.storage,
                        it.needsTransfer && "🚚 transfer",
                        it.serials.length > 0 && `SME# ${it.serials.join(", ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== it.id))}
                    className="text-slate-600 hover:text-red-400 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={() =>
              onSave({
                id: listId,
                jobLabel: jobLabel.trim(),
                subJobLabel: subJobLabel.trim(),
                submittedBy: submittedBy.trim(),
                dateReceived,
                items,
                referenceDocuments,
              })
            }
            disabled={!canSave}
            className="w-full text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
          >
            Save Love List
          </button>
        </div>
      </div>

      {pdfPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">
              That's a PDF{pdfQueue.length > 1 ? ` (1 of ${pdfQueue.length})` : ""}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              A phone's "scan to PDF" is usually just a photo wrapped in a PDF — converting
              keeps it easy to zoom into and cuts the file size, with one photo per page. If
              this is a real multi-page document, keeping it as a PDF makes more sense.
              {pdfQueue.length > 1 && " You'll get this same choice for each PDF you picked."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={convertDocPdfToPhotos}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Convert to photo(s)
              </button>
              <button
                onClick={keepDocPdfAsIs}
                className="w-full text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Keep as PDF
              </button>
              <button
                onClick={() => setPdfQueue((prev) => prev.slice(1))}
                className="w-full text-xs text-slate-500 hover:text-slate-300"
              >
                Skip this one
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoveListPhotosModal({ list, isEditor, onAddPhoto, onRemovePhoto, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [viewingIndex, setViewingIndex] = useState(null);
  const fileInputRef = useRef(null);

  // The original scan (if this list came from the scan feature) shown
  // alongside anything manually uploaded — one gallery, same treatment.
  const allPhotos = [
    ...(list.scanImageUrl ? [{ url: list.scanImageUrl, isScan: true }] : []),
    ...(list.referenceImages || []).map((url) => ({ url, isScan: false })),
  ];

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const res = await uploadLoveListScan(file);
      if (res.ok) {
        onAddPhoto(res.url);
      } else {
        setUploadError(res.error || "Upload failed.");
      }
    } catch (err) {
      setUploadError(err.message || String(err));
    }
    setUploading(false);
  };

  if (viewingIndex !== null) {
    return (
      <PhotoLightbox
        photos={allPhotos.map((p) => ({ url: p.url, alt: "Reference photo" }))}
        index={viewingIndex}
        onIndexChange={setViewingIndex}
        onClose={() => setViewingIndex(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            Photos
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {allPhotos.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No photos attached to this list yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {allPhotos.map((photo, idx) => (
                <div key={idx} className="relative group">
                  <button
                    onClick={() => setViewingIndex(idx)}
                    className="block w-full aspect-square rounded-lg overflow-hidden border border-slate-800"
                  >
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  </button>
                  {photo.isScan && (
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-medium tracking-wide uppercase bg-slate-950/80 text-slate-300 rounded-full px-1.5 py-0.5">
                      Original scan
                    </span>
                  )}
                  {isEditor && (
                    <button
                      onClick={() =>
                        photo.isScan ? onRemovePhoto(null, true) : onRemovePhoto(photo.url, false)
                      }
                      className="absolute top-1.5 right-1.5 bg-slate-950/80 text-slate-300 hover:text-red-400 rounded-full p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {uploadError && <p className="text-xs text-red-400 mt-3">{uploadError}</p>}
        </div>
        {isEditor && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-60"
            >
              <Camera className="w-4 h-4" />
              {uploading ? "Uploading..." : "Add a photo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Same idea as the Job List version, but for a Love List's flat Have/Need
// numbers instead of a container list.
export function MergeLoveListItemModal({ item, items, onConfirm, onClose }) {
  const [search, setSearch] = useState("");
  if (!item) return null;
  const sourceHave = item.qtyHave || 0;
  // An item that came in entirely backordered (0 on hand) still has
  // something worth merging over — the backorder note itself — even
  // though there's no physical quantity to move. See mergeLoveListItems.
  const hasBackorderToCarry = (item.backorderQty || 0) > 0;
  const q = search.trim().toLowerCase();
  const candidates = items.filter((i) => i.id !== item.id && (!q || i.name.toLowerCase().includes(q)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-slate-100 font-semibold text-sm truncate">Merge "{item.name}" into...</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pt-4 shrink-0">
          <p className="text-xs text-slate-500 mb-3">
            Has {sourceHave} on hand{hasBackorderToCarry ? ` and ${item.backorderQty} on backorder` : ""}.
            Whatever's needed to fill the target moves over — anything left stays here
            {hasBackorderToCarry ? ", and the backorder note carries over too" : ""}.
          </p>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {candidates.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">No matches.</p>
          ) : (
            candidates.map((c) => {
              const cHave = c.qtyHave || 0;
              const cNeeded = c.qty || 0;
              const remaining = Math.max(0, cNeeded - cHave);
              const sourceHaveInTargetUnits = convertQtyForUnit(sourceHave, item.qtyUnit, c.qtyUnit);
              const willMoveInTargetUnits = Math.min(sourceHaveInTargetUnits, remaining);
              const willMoveInSourceUnits = convertQtyForUnit(willMoveInTargetUnits, c.qtyUnit, item.qtyUnit);
              const unitsDiffer = (item.qtyUnit || "each") !== (c.qtyUnit || "each");
              // Same as the Job List version — a pure backorder-carry merge
              // moves no physical quantity, so the target being full
              // already doesn't block it.
              const canMerge = willMoveInTargetUnits > 0 || hasBackorderToCarry;
              return (
                <button
                  key={c.id}
                  onClick={() => onConfirm(c.id)}
                  disabled={!canMerge}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-800 hover:border-slate-700 mb-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <p className="text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    Have {cHave} of {cNeeded}
                    {willMoveInTargetUnits > 0
                      ? ` — will take ${willMoveInTargetUnits}${unitsDiffer ? ` ${c.qtyUnit || "each"}` : ""}, leaving ${
                          sourceHave - willMoveInSourceUnits
                        } here`
                      : hasBackorderToCarry
                      ? " — nothing to move, but will carry the backorder note over"
                      : " — already full, nothing to move"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// A clean, printer-friendly version of a Love List's items — the actual
// point of this whole feature: someone hands over a handwritten, hard-
// to-read list, it gets scanned and turned into real tracked items, and
// this is what turns that back into something legible to carry around
// and physically check off. Uses the standard "print just this one
// element" technique — everything else on the page is hidden for print,
// only this area shows.
export function PrintableLoveListModal({ list, onClose }) {
  const items = [...(list.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4 py-8 print:static print:block print:bg-white print:p-0">
      <style>{`
        @media print {
          /* visibility:hidden alone doesn't collapse layout height, so
             the rest of the app — potentially a long page behind this
             modal — was still silently contributing its full height to
             the document, and the browser paginated for that entire
             height even though nothing on those extra pages was
             visible. Collapsing height on every hidden element (and
             explicitly restoring it just for the print area) is what
             actually stops it from thinking there's more content than
             there is. */
          body * {
            visibility: hidden;
            height: 0 !important;
            overflow: hidden !important;
          }
          #love-list-print-area, #love-list-print-area * {
            visibility: visible;
            height: auto !important;
            overflow: visible !important;
          }
          #love-list-print-area {
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
        <div id="love-list-print-area" className="p-6 overflow-y-auto print:overflow-visible">
          <h2 className="text-xl font-bold mb-1">{listDisplayLabel(list)}</h2>
          <p className="text-sm text-slate-600 mb-5">
            {[list.dateReceived, list.submittedBy].filter(Boolean).join(" · ") || "\u00A0"}
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No items on this list yet.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 pr-2">Item</th>
                  <th className="text-left py-2 pr-2">Qty</th>
                  <th className="text-left py-2 pr-2">Storage</th>
                  <th className="text-left py-2 w-10">✓</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-300">
                    <td className="py-2 pr-2 align-top">{item.name}</td>
                    <td className="py-2 pr-2 align-top whitespace-nowrap">
                      {item.qty}
                      {item.qtyUnit ? ` ${item.qtyUnit}` : ""}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {item.storage || ""}
                      {item.storageDetail ? ` (${item.storageDetail})` : ""}
                    </td>
                    <td className="py-2 align-top">
                      <span className="inline-block w-4 h-4 border border-slate-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoveListDetailPage({ list, catalog, allLists = [], isEditor, isOwner, workers = [], workerTasks = [], staleThresholds = DEFAULT_STALE_THRESHOLD_DAYS, onAssignToWorker, onUnassignWorkerTask, onUpdateList, onDeleteList, onLearnAlias, onSyncToolsFromItem, onAddToLoveTaskList, onUndoLastAction, onBack, onQuickNav, locked = false, initialItemSearch = "" }) {
  const undoStack = list.undoStack || [];
  const [undoOpen, setUndoOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [showPullFromReceiving, setShowPullFromReceiving] = useState(false);
  const [mergingItem, setMergingItem] = useState(null);
  const [viewingVendorFor, setViewingVendorFor] = useState(null);
  // Layered on top of catalog for vendor-history changes made from
  // inside this modal — the catalog prop itself only refreshes on
  // reload, so without this, closing and reopening the same item's
  // Vendor breakdown would show the pre-clear entries again.
  const [vendorHistoryOverrides, setVendorHistoryOverrides] = useState({});
  const applyVendorOverride = (catalogId, changes) =>
    setVendorHistoryOverrides((prev) => ({ ...prev, [catalogId]: changes }));
  const [viewingReceiptFor, setViewingReceiptFor] = useState(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const [deleteListConfirm, setDeleteListConfirm] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [referenceDocsOpen, setReferenceDocsOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [statusPicking, setStatusPicking] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null); // single item, or "bulk"
  const [editingSmeFor, setEditingSmeFor] = useState(null); // item, while editing its SME#s
  const [clearBatchesTarget, setClearBatchesTarget] = useState(null); // item, while confirming a batch history reset
  const [relinkingItem, setRelinkingItem] = useState(null); // item, while relinking its catalog match
  const [renamingItem, setRenamingItem] = useState(null); // item, while renaming it
  const [renameDraft, setRenameDraft] = useState("");
  const [editingNoteFor, setEditingNoteFor] = useState(null); // item, while editing its note
  const [noteDraft, setNoteDraft] = useState("");
  const [editingOrderedQtyFor, setEditingOrderedQtyFor] = useState(null); // item, while editing qtyOrdered
  const [orderedQtyDraft, setOrderedQtyDraft] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [smeDraft, setSmeDraft] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null = off, or a LOVE_STATUSES key
  const [itemSearch, setItemSearch] = useState(initialItemSearch);
  const [importedOnlyFilter, setImportedOnlyFilter] = useState(false);

  const archiveItem = (id) => {
    onUpdateList({
      ...list,
      items: list.items.map((i) => (i.id === id ? { ...i, archived: true } : i)),
    });
  };

  const unarchiveItem = (id) => {
    onUpdateList({
      ...list,
      items: list.items.map((i) => (i.id === id ? { ...i, archived: false } : i)),
    });
  };

  const archiveAllSent = () => {
    onUpdateList({
      ...list,
      items: list.items.map((i) => (i.status === "sent" && !i.archived ? { ...i, archived: true } : i)),
    });
  };

  const visibleItems = list.items
    .filter((i) => showArchived || !i.archived)
    .filter((i) => !statusFilter || i.status === statusFilter)
    .filter((i) => !importedOnlyFilter || i.importedViaReceiving)
    .filter((i) => !itemSearch.trim() || i.name.toLowerCase().includes(itemSearch.trim().toLowerCase()));
  const archivedCount = list.items.filter((i) => i.archived).length;
  // Archive only makes sense for items that are genuinely, fully done —
  // a partial send still has a remainder outstanding, so it stays out of
  // this count regardless of what's shown on the transfer list.
  const sentUnarchivedItems = list.items.filter((i) => i.status === "sent" && !i.archived);
  const sentUnarchivedCount = sentUnarchivedItems.length;
  const [showTransferList, setShowTransferList] = useState(false);
  const [transferCopied, setTransferCopied] = useState(false);

  // What actually shows on the transfer list: only SME-tracked items still
  // sitting at Staged, not ones already marked Sent — the paperwork needs
  // to exist while something's staged and about to physically go, not
  // after the fact once it's already gone. An item drops off here the
  // moment it's marked Sent (matching a physical load that already left,
  // which no longer needs a "getting ready to ship" list). Includes
  // partial-staging snapshots — each showing the quantity and SME#s that
  // were actually present at the moment that portion was staged, not
  // whatever the item's current values happen to be now.
  const transferListEntries = list.items
    .filter((i) => !i.archived && i.needsTransfer && i.status === "staged")
    .flatMap((i) => {
      const batches = (i.stagedBatches || []).filter(
        (b) => b.stagedQty > 0 || (b.serials || []).length > 0
      );
      return batches.map((batch, idx) => ({
        item: i,
        qty: batch.stagedQty,
        qtyUnit: i.qtyUnit,
        serials: batch.serials || [],
        date: batch.timestamp.slice(0, 10),
        // Only the most recent staging batch is treated as "caught up" —
        // every earlier one was a partial staging snapshot superseded by
        // a later one.
        partial: idx < batches.length - 1,
      }));
    });
  const transferListCount = transferListEntries.length;

  // Grouped by date, newest first — a "what went out on this day" view,
  // separate from the flat item-by-item list.
  const transferDates = [...new Set(transferListEntries.map((e) => e.date))].sort((a, b) =>
    b.localeCompare(a)
  );
  const formatTransferDate = (dateStr) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const transferListText = transferDates
    .map((date) => {
      const lines = transferListEntries
        .filter((e) => e.date === date)
        .map(({ item, qty, qtyUnit, serials, partial }) => {
          const base = `${item.name} x${qty}${qtyUnit ? ` ${qtyUnit}` : ""}`;
          const withSme = serials.length > 0 ? `${base} — SME# ${serials.join(", ")}` : base;
          return partial ? `${withSme} (partial)` : withSme;
        });
      return `Staged on ${formatTransferDate(date)}:\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const copyTransferList = async () => {
    const ok = await copyToClipboard(`Transfer list — ${list.jobLabel}\n\n${transferListText}`);
    if (ok) {
      setTransferCopied(true);
      setTimeout(() => setTransferCopied(false), 1500);
    }
  };

  const saveSme = () => {
    if (!editingSmeFor) return;
    const enteredNew = parseSerials(smeDraft);
    playSaveChime();
    let finalSerials = [];
    onUpdateList({
      ...list,
      items: list.items.map((i) => {
        if (i.id !== editingSmeFor.id) return i;
        // Locked (already-shipped/staged/received) numbers are never
        // touched by this box — only combine them with whatever's newly
        // typed in, so there's no risk of accidentally dropping a
        // historical SME# just by editing the field.
        const locked = lockedLoveSerials(i);
        const newlyEntered = enteredNew.filter((s) => !locked.includes(s));
        const newSerials = [...new Set([...locked, ...newlyEntered])];
        finalSerials = newSerials;

        const prevCount = (i.serials || []).length;
        const newCount = newSerials.length;
        const currentHave = i.qtyHave || 0;

        let qtyHave = currentHave;
        if (newCount > prevCount) {
          // Got more SME#s than before — bring Have up to at least match,
          // the SME count sets the floor rather than needing a separate
          // manual bump.
          qtyHave = Math.max(currentHave, newCount);
        } else if (newCount < prevCount) {
          // Fewer SME#s than before — drop Have by exactly the removed
          // count, preserving any untracked (no-SME#) quantity already
          // sitting on top of what was tracked.
          const untracked = Math.max(0, currentHave - prevCount);
          qtyHave = newCount + untracked;
        }
        // Belt-and-suspenders: Have should never sit below the tracked
        // count, even for older items saved before this synced them.
        qtyHave = Math.max(qtyHave, newCount);

        return { ...i, serials: newSerials, qtyHave };
      }),
    });
    // Syncs the item's full current SME# set, not just what was newly
    // typed — harmless for numbers already known to the registry (the
    // sync is a no-op if nothing actually changed), and makes sure
    // nothing that predates this sync existing gets left out.
    if (onSyncToolsFromItem && finalSerials.length > 0) {
      onSyncToolsFromItem(finalSerials, editingSmeFor.name, list.jobLabel);
    }
    setEditingSmeFor(null);
  };

  const clearBatches = (item) => {
    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === item.id ? { ...i, sentBatches: [], receivedBatches: [], stagedBatches: [] } : i
      ),
    });
    setClearBatchesTarget(null);
  };

  const saveRename = () => {
    if (!renamingItem || !renameDraft.trim()) return;
    playSaveChime();
    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === renamingItem.id ? { ...i, name: renameDraft.trim() } : i
      ),
    });
    setRenamingItem(null);
  };

  const saveNickname = () => {
    playSaveChime();
    onUpdateList({ ...list, subJobLabel: nicknameDraft.trim() });
    setEditingNickname(false);
  };

  const saveOrderedQty = () => {
    if (!editingOrderedQtyFor) return;
    // Only floors at 0 — ordering more than what was requested genuinely
    // happens (supplier minimums, rounding up to a case/box size), so this
    // deliberately does NOT cap at the requested qty the way it used to.
    const clamped = Math.max(0, Number(orderedQtyDraft) || 0);
    playSaveChime();
    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === editingOrderedQtyFor.id ? { ...i, qtyOrdered: clamped } : i
      ),
    });
    setEditingOrderedQtyFor(null);
  };

  const saveNote = () => {
    if (!editingNoteFor) return;
    playSaveChime();
    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === editingNoteFor.id ? { ...i, notes: noteDraft.trim() } : i
      ),
    });
    setEditingNoteFor(null);
  };

  // Inline replacement for the old qty-edit modal — same rules (SME# count
  // is a floor on Have, and bumping Have retroactively still catches up
  // receivedBatches even if status has already moved past Received), just
  // committed directly as you type instead of needing a separate window.
  const updateItemQtyField = (item, field, rawValue) => {
    const num = rawValue.trim() === "" ? 0 : Math.max(0, Number(rawValue) || 0);
    onUpdateList({
      ...list,
      items: list.items.map((i) => {
        if (i.id !== item.id) return i;
        if (field === "qty") {
          return { ...i, qty: Math.max(1, num) };
        }
        // field === "qtyHave"
        const smeCount = (i.serials || []).length;
        const haveNum = Math.max(num, smeCount);
        const updated = { ...i, qtyHave: haveNum };
        const priorReceivedBatches = i.receivedBatches || [];
        const priorReceivedQty = priorReceivedBatches.reduce((sum, b) => sum + b.receivedQty, 0);
        if (haveNum > priorReceivedQty) {
          const priorSerials = new Set(priorReceivedBatches.flatMap((b) => b.serials || []));
          const deltaQty = haveNum - priorReceivedQty;
          const deltaSerials = (i.serials || []).filter((s) => !priorSerials.has(s));
          updated.receivedBatches = [
            ...priorReceivedBatches,
            { receivedQty: deltaQty, serials: deltaSerials, timestamp: new Date().toISOString() },
          ];
        }
        return updated;
      }),
    });
  };

  const updateItemQtyUnit = (item, rawValue) => {
    onUpdateList({
      ...list,
      items: list.items.map((i) => (i.id === item.id ? { ...i, qtyUnit: rawValue } : i)),
    });
  };

  const confirmAssign = (workerIds) => {
    if (!assigningItem || !onAssignToWorker) return;
    playSaveChime();

    if (assigningItem === "bulk") {
      const targetItems = list.items.filter((i) => selectedIds.has(i.id));
      const updatedItems = list.items.map((i) => {
        const target = targetItems.find((t) => t.id === i.id);
        if (!target) return i;
        const itemLabel = `${target.name} ${target.qtyHave ?? 0}/${target.qty}${target.qtyUnit ? ` ${target.qtyUnit}` : ""}`;
        if (workerIds.length === 0) {
          // Nobody picked — goes to Open Tasks instead of the assignment
          // just silently not happening, but only if this item doesn't
          // already have a task riding on it.
          if ((target.assignedTaskIds || []).length > 0) return i;
          const taskId = onAssignToWorker(null, itemLabel, list.jobLabel, {
            type: "love_list_item",
            itemId: target.id,
            listId: list.id,
          });
          return taskId ? { ...i, assignedTaskIds: [...(i.assignedTaskIds || []), taskId] } : i;
        }
        const existingWorkerIds = (target.assignedTaskIds || [])
          .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
          .filter(Boolean);
        const newTaskIds = workerIds
          .filter((wid) => !existingWorkerIds.includes(wid)) // already assigned — don't duplicate
          .map((wid) => {
            const worker = workers.find((w) => w.id === wid);
            if (!worker) return null;
            return onAssignToWorker(worker, itemLabel, list.jobLabel, {
              type: "love_list_item",
              itemId: target.id,
              listId: list.id,
            });
          })
          .filter(Boolean);
        return { ...i, assignedTaskIds: [...(i.assignedTaskIds || []), ...newTaskIds] };
      });
      onUpdateList({ ...list, items: updatedItems });
      setAssigningItem(null);
      setSelectMode(false);
      setSelectedIds(new Set());
      return;
    }

    // Single item — diff against what's currently assigned so unchecking
    // someone actually removes them instead of just leaving stale tasks.
    const target = assigningItem;
    const currentTaskIds = target.assignedTaskIds || [];

    // Nothing picked, and nothing riding on this item yet — goes to Open
    // Tasks instead of the assignment just silently not happening.
    if (workerIds.length === 0 && currentTaskIds.length === 0) {
      const taskId = onAssignToWorker(
        null,
        `${target.name} ${target.qtyHave ?? 0}/${target.qty}${target.qtyUnit ? ` ${target.qtyUnit}` : ""}`,
        list.jobLabel,
        { type: "love_list_item", itemId: target.id, listId: list.id }
      );
      if (taskId) {
        onUpdateList({
          ...list,
          items: list.items.map((i) => (i.id === target.id ? { ...i, assignedTaskIds: [taskId] } : i)),
        });
      }
      setAssigningItem(null);
      return;
    }

    const currentWorkerIds = currentTaskIds
      .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
      .filter(Boolean);

    const addedWorkerIds = workerIds.filter((wid) => !currentWorkerIds.includes(wid));
    // Only sweeps up tasks that had an actual person on them — an already-
    // open task (nobody assigned) was never represented by a checkbox
    // here, so it shouldn't read as "someone got deselected" and get
    // deleted just because this save left the worker list unchanged.
    const removedTaskIds = currentTaskIds.filter((tid) => {
      const t = workerTasks.find((task) => task.id === tid);
      return t && t.workerId && !workerIds.includes(t.workerId);
    });

    const newTaskIds = addedWorkerIds
      .map((wid) => {
        const worker = workers.find((w) => w.id === wid);
        if (!worker) return null;
        return onAssignToWorker(
          worker,
          `${target.name} ${target.qtyHave ?? 0}/${target.qty}${target.qtyUnit ? ` ${target.qtyUnit}` : ""}`,
          list.jobLabel,
          { type: "love_list_item", itemId: target.id, listId: list.id }
        );
      })
      .filter(Boolean);

    if (onUnassignWorkerTask) removedTaskIds.forEach((tid) => onUnassignWorkerTask(tid));

    const finalTaskIds = [
      ...currentTaskIds.filter((tid) => !removedTaskIds.includes(tid)),
      ...newTaskIds,
    ];

    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === target.id ? { ...i, assignedTaskIds: finalTaskIds } : i
      ),
    });
    setAssigningItem(null);
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkMarkOrdered = () => {
    const today = new Date().toISOString().slice(0, 10);
    playSaveChime();
    onUpdateList({
      ...list,
      items: list.items.map((i) => {
        // Items pulled from inventory never actually pass through
        // "Ordered" — skip them rather than giving them a fake order date.
        if (!selectedIds.has(i.id) || i.needsOrdering === false) return i;
        return {
          ...i,
          status: "ordered",
          statusDates: { ...i.statusDates, ordered: i.statusDates.ordered || today },
        };
      }),
    });
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const addSelectedToTaskList = () => {
    if (!onAddToLoveTaskList) return;
    const selectedItems = list.items.filter((i) => selectedIds.has(i.id));
    onAddToLoveTaskList(selectedItems);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const relinkCatalog = (catalogItem) => {
    if (!relinkingItem) return;
    playSaveChime();
    if (catalogItem) onLearnAlias && onLearnAlias(catalogItem.id, relinkingItem.name);
    onUpdateList({
      ...list,
      items: list.items.map((i) =>
        i.id === relinkingItem.id
          ? {
              ...i,
              catalogId: catalogItem ? catalogItem.id : null,
              storage: catalogItem ? catalogItem.storage || "" : i.storage,
              storageDetail: catalogItem
                ? catalogItem.storage === "Other"
                  ? catalogItem.storageDetail || ""
                  : ""
                : i.storageDetail,
              needsTransfer: catalogItem ? !!catalogItem.needsTransfer : i.needsTransfer,
            }
          : i
      ),
    });
    setRelinkingItem(null);
    setCatalogSearch("");
  };

  // stepLoveItemStatus/walkLoveItemToStatus live in lib/lovelists.js (pure,
  // independently unit-tested) — these are just the thin, app-wired
  // callers.
  const advanceStatus = (itemId, direction) => {
    if (!isEditor) return;
    playSoftTap();
    onUpdateList({
      ...list,
      items: list.items.map((i) => (i.id === itemId ? stepLoveItemStatus(i, direction) : i)),
    });
  };

  const bulkChangeStatus = (targetKey) => {
    if (!isEditor) return;
    onUpdateList({
      ...list,
      items: list.items.map((i) => (selectedIds.has(i.id) ? walkLoveItemToStatus(i, targetKey) : i)),
    });
    playSoftTap();
    setStatusPicking(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const addItem = (item) => {
    playSaveChime();
    onUpdateList({ ...list, items: [...list.items, item] });
    setAddingItem(false);
  };

  const deleteItem = (id) => {
    onUpdateList({ ...list, items: list.items.filter((i) => i.id !== id) });
    setDeleteItemTarget(null);
  };

  const counts = LOVE_STATUSES.reduce((acc, s) => {
    acc[s.key] = list.items.filter((i) => i.status === s.key && !i.archived).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SectionHeader
        onBack={onBack}
        locked={locked}
        maxWidthClass="max-w-2xl"
        current="love"
        onQuickNav={onQuickNav}
        quickNavIsOwner={isOwner}
        titleSlot={
          <div className="min-w-0">
            {isEditor ? (
              <button
                onClick={() => {
                  setEditingNickname(true);
                  setNicknameDraft(list.subJobLabel || "");
                }}
                className="font-semibold text-slate-100 truncate flex items-center gap-1.5 hover:underline decoration-dotted text-left"
              >
                <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                {listDisplayLabel(list)}
                {list.archived && (
                  <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-500 rounded-full px-1.5 py-0.5 shrink-0">
                    Archived
                  </span>
                )}
              </button>
            ) : (
              <p className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                {listDisplayLabel(list)}
                {list.archived && (
                  <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-500 rounded-full px-1.5 py-0.5 shrink-0">
                    Archived
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-slate-500 truncate">
              {list.dateReceived}
              {list.submittedBy ? ` · ${list.submittedBy}` : ""}
            </p>
          </div>
        }
      >
        <button
          onClick={() => setShowPhotosModal(true)}
          title="Photos"
          className="text-slate-400 hover:text-slate-200 p-2 shrink-0 relative"
        >
          <ImageIcon className="w-4 h-4" />
          {(list.scanImageUrl || (list.referenceImages || []).length > 0) && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-400" />
          )}
        </button>
        <button
          onClick={() => setShowPrintModal(true)}
          title="Print a clean list to work from"
          className="text-slate-400 hover:text-slate-200 p-2 shrink-0"
        >
          <Printer className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowQrModal(true)}
          title="QR code for this list (e.g. to put on a pallet)"
          className="text-slate-400 hover:text-slate-200 p-2 shrink-0"
        >
          <QrCode className="w-4 h-4" />
        </button>
        <button
          onClick={() => setReferenceDocsOpen(true)}
          title="Reference documents"
          className="text-slate-400 hover:text-slate-200 p-2 shrink-0 relative"
        >
          <FileText className="w-4 h-4" />
          {(list.referenceDocuments || []).length > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-400" />
          )}
        </button>
        {isEditor && (
          <button
            onClick={() => onUpdateList({ ...list, archived: !list.archived })}
            title={list.archived ? "Unarchive (show in main list)" : "Archive (hide from main list)"}
            className="text-slate-500 hover:text-slate-300 p-2 shrink-0"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => setDeleteListConfirm(true)}
            className="text-slate-500 hover:text-red-400 p-2 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </SectionHeader>

      {showPhotosModal && (
        <LoveListPhotosModal
          list={list}
          isEditor={isEditor}
          onAddPhoto={(url) =>
            onUpdateList({ ...list, referenceImages: [...(list.referenceImages || []), url] })
          }
          onRemovePhoto={async (url, isScan) => {
            // Storage deletion first, then the UI update — same pattern as
            // Job Lists' reference docs, and fires regardless of whether
            // the delete call succeeds so a network hiccup never leaves
            // someone stuck unable to remove a photo from the list.
            const path = storagePathFromPublicUrl(isScan ? list.scanImageUrl : url);
            if (path) await deleteReferenceDocument(path);
            if (isScan) {
              onUpdateList({ ...list, scanImageUrl: null });
            } else {
              onUpdateList({
                ...list,
                referenceImages: (list.referenceImages || []).filter((u) => u !== url),
              });
            }
          }}
          onClose={() => setShowPhotosModal(false)}
        />
      )}

      {showPrintModal && <PrintableLoveListModal list={list} onClose={() => setShowPrintModal(false)} />}

      {showQrModal && (
        <DeepLinkQrModal
          section="love"
          id={list.id}
          heading="QR code for this pallet"
          title={listDisplayLabel(list)}
          subtitle={[list.dateReceived, list.submittedBy].filter(Boolean).join(" · ")}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {referenceDocsOpen && (
        <ReferenceDocsModal
          entity={list}
          entityLabel="this Love List"
          isEditor={isEditor}
          onUpdateEntity={onUpdateList}
          onClose={() => setReferenceDocsOpen(false)}
        />
      )}

      <main className="max-w-2xl mx-auto px-4 py-5">
        {isEditor &&
          (addingItem ? (
            <div className="mb-4">
              <LoveListItemEntry
                catalog={catalog}
                allLists={allLists}
                currentListId={list.id}
                onLearnAlias={onLearnAlias}
                onAdd={addItem}
              />
              <button
                onClick={() => setAddingItem(false)}
                className="w-full text-xs text-slate-500 hover:text-slate-300 mt-2"
              >
                Done adding items
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingItem(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 mb-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
              Add item
            </button>
          ))}
        {isEditor && (
          <button
            onClick={() => setShowPullFromReceiving(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs rounded-md py-2 mb-4 text-slate-500 hover:text-slate-300"
          >
            <Inbox className="w-3.5 h-3.5" />
            Pull from Receiving
          </button>
        )}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Search items on this list..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {LOVE_STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter((prev) => (prev === s.key ? null : s.key))}
              className={`text-xs rounded-full px-2.5 py-1 border transition-all ${s.color} ${
                statusFilter && statusFilter !== s.key
                  ? "opacity-40"
                  : statusFilter === s.key
                  ? "ring-2 ring-offset-1 ring-offset-slate-950 ring-white/60"
                  : ""
              }`}
            >
              {counts[s.key]} {s.label}
            </button>
          ))}
          {isEditor && (
            <button
              onClick={() => setImportedOnlyFilter((v) => !v)}
              className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border transition-all ${
                importedOnlyFilter
                  ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Inbox className="w-3 h-3" />
              Imported only
            </button>
          )}
        </div>
        {(statusFilter || importedOnlyFilter) && (
          <button
            onClick={() => {
              setStatusFilter(null);
              setImportedOnlyFilter(false);
            }}
            className="text-xs text-slate-500 hover:text-slate-300 mb-4 -mt-2 block"
          >
            Clear filter
          </button>
        )}

        {isEditor && visibleItems.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectMode((v) => !v);
                  setSelectedIds(new Set());
                }}
                className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-2.5 py-1.5"
              >
                {selectMode ? "Cancel select" : "Select items"}
              </button>
              {selectMode && (
                <button
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.size === visibleItems.length
                        ? new Set()
                        : new Set(visibleItems.map((i) => i.id))
                    )
                  }
                  className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-2.5 py-1.5"
                >
                  {selectedIds.size === visibleItems.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {selectMode && selectedIds.size > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={bulkMarkOrdered}
                  className="text-xs flex items-center gap-1 bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-amber-400"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Mark as Ordered
                </button>
                <button
                  onClick={() => setStatusPicking(true)}
                  className="text-xs flex items-center gap-1 bg-sky-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-sky-400"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Change status...
                </button>
                <button
                  onClick={() => setAssigningItem("bulk")}
                  className="text-xs flex items-center gap-1 bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-amber-400"
                >
                  <Users className="w-3.5 h-3.5" />
                  Assign {selectedIds.size} selected
                </button>
                {onAddToLoveTaskList && (
                  <button
                    onClick={addSelectedToTaskList}
                    className="text-xs flex items-center gap-1 bg-rose-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-rose-400"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Add {selectedIds.size} to Task List
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(transferListCount > 0 || sentUnarchivedCount > 0 || archivedCount > 0) && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {transferListCount > 0 && (
              <button
                onClick={() => setShowTransferList(true)}
                className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-2.5 py-1.5"
              >
                <Truck className="w-3.5 h-3.5" />
                Generate transfer list ({transferListCount})
              </button>
            )}
            {isEditor && sentUnarchivedCount > 0 && (
              <button
                onClick={archiveAllSent}
                className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-2.5 py-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive {sentUnarchivedCount} sent item{sentUnarchivedCount === 1 ? "" : "s"}
              </button>
            )}
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                {showArchived ? "Hide" : "Show"} {archivedCount} archived
              </button>
            )}
          </div>
        )}
        {transferListCount === 0 && sentUnarchivedCount === 0 && archivedCount > 0 && isEditor && (
          <div className="mb-4">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              {showArchived ? "Hide" : "Show"} {archivedCount} archived
            </button>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {visibleItems.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              {itemSearch.trim()
                ? `Nothing matching "${itemSearch.trim()}" on this list.`
                : statusFilter
                ? `Nothing at "${loveStatusMeta(statusFilter).label}" right now.`
                : "No items on this list."}
            </p>
          )}
          {visibleItems.map((item) => {
            const meta = loveItemDisplayMeta(item);
            const liveDuplicates = findPossibleDuplicates(item.name, item.catalogId, catalog, allLists, {
              excludeListId: list.id,
              excludeItemId: item.id,
            });
            const linkedCatalogItem = item.catalogId
              ? catalog.find((c) => c.id === item.catalogId) || null
              : null;
            const subline = [
              item.storage === "Other" && item.storageDetail ? item.storageDetail : item.storage,
              item.needsTransfer && "🚚 transfer",
              item.needsOrdering === false && "📦 in inventory",
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={item.id}
                onClick={() => selectMode && toggleSelected(item.id)}
                className={`border rounded-lg p-3 bg-slate-900 flex gap-2.5 ${
                  selectMode ? "cursor-pointer" : ""
                } ${
                  selectMode && selectedIds.has(item.id)
                    ? "border-amber-500/60 bg-amber-500/5"
                    : item.importedViaReceiving
                    ? "border-sky-500/50 bg-sky-500/5"
                    : "border-slate-800"
                }`}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-1 rounded accent-amber-500 shrink-0 pointer-events-none"
                  />
                )}
                <div className={`flex-1 min-w-0 ${selectMode ? "pointer-events-none" : ""}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    {isEditor ? (
                      <>
                        <p className="text-sm truncate">
                          <button
                            onClick={() => {
                              setRenamingItem(item);
                              setRenameDraft(item.name);
                            }}
                            className="text-slate-100 hover:underline decoration-dotted"
                          >
                            {item.name}
                          </button>
                        </p>
                        <div
                          className="flex items-center gap-1 mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            key={`have-${item.id}-${item.qtyHave}`}
                            type="number"
                            onFocus={selectOnFocus}
                            onClick={selectOnFocus}
                            min="0"
                            defaultValue={item.qtyHave ?? 0}
                            onBlur={(e) => updateItemQtyField(item, "qtyHave", e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                            className="w-11 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-rose-500/60"
                          />
                          <span className="text-slate-600 text-xs shrink-0">/</span>
                          <input
                            key={`need-${item.id}-${item.qty}`}
                            type="number"
                            onFocus={selectOnFocus}
                            onClick={selectOnFocus}
                            min="1"
                            defaultValue={item.qty}
                            onBlur={(e) => updateItemQtyField(item, "qty", e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                            className="w-11 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-rose-500/60"
                          />
                          <input
                            value={item.qtyUnit || ""}
                            onChange={(e) => updateItemQtyUnit(item, e.target.value)}
                            placeholder="unit"
                            className="w-16 min-w-0 bg-slate-800 border border-slate-700 text-slate-500 text-xs rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-rose-500/60"
                          />
                          {item.backorderQty > 0 && (
                            <span className="text-[10px] rounded-full px-1.5 py-0.5 border bg-red-500/15 text-red-300 border-red-500/40 shrink-0">
                              {item.backorderQty} backorder
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-slate-100 truncate">
                        {item.name}{" "}
                        <span className="text-slate-500">
                          {item.qtyHave ?? 0}/{item.qty}{item.qtyUnit ? ` ${item.qtyUnit}` : ""}
                        </span>
                        {item.backorderQty > 0 && (
                          <span className="ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 border bg-red-500/15 text-red-300 border-red-500/40">
                            {item.backorderQty} backorder
                          </span>
                        )}
                      </p>
                    )}
                    {subline && <p className="text-xs text-slate-500 truncate">{subline}</p>}
                    <p className="text-xs text-slate-600">
                      {item.catalogId
                        ? `🔗 ${catalog.find((c) => c.id === item.catalogId)?.name || "Linked catalog item"}`
                        : "Not linked to catalog"}
                    </p>
                  </div>
                  {isEditor && (
                    <button
                      onClick={() => setDeleteItemTarget(item)}
                      className="text-slate-600 hover:text-red-400 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {item.importedViaReceiving && isEditor && (
                  <span className="inline-flex items-center gap-1.5 text-xs rounded-full pl-2.5 pr-1.5 py-1 border border-sky-500/40 bg-sky-500/10 text-sky-300 mb-2">
                    <Inbox className="w-3 h-3" />
                    Imported
                    <button
                      onClick={() => setMergingItem(item)}
                      className="text-sky-200 hover:text-white underline decoration-dotted"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() =>
                        onUpdateList({
                          ...list,
                          items: list.items.map((i) =>
                            i.id === item.id ? { ...i, importedViaReceiving: false } : i
                          ),
                        })
                      }
                      className="text-sky-500 hover:text-sky-300"
                      title="This is genuinely a new item — stop highlighting it"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {item.catalogId && (
                  <button
                    onClick={() => setViewingVendorFor(item.catalogId)}
                    className="text-xs rounded-full px-2 py-0.5 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 mb-2 inline-flex items-center gap-1"
                  >
                    🏷️ Vendor
                  </button>
                )}
                {itemReceipts(item).length > 0 && (
                  <button
                    onClick={() => setViewingReceiptFor(itemReceipts(item))}
                    className="text-xs rounded-full px-2 py-0.5 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 mb-2 inline-flex items-center gap-1"
                  >
                    🧾 {itemReceipts(item).length > 1 ? `Receipts (${itemReceipts(item).length})` : "Receipt"}
                  </button>
                )}
                {isEditor ? (
                  <button
                    onClick={() => setRelinkingItem(item)}
                    className="text-xs mb-2 block"
                  >
                    {linkedCatalogItem ? (
                      <span className="text-emerald-400">🔗 {linkedCatalogItem.name}</span>
                    ) : (
                      <span className="text-slate-600 hover:text-slate-400">
                        + Link to catalog item
                      </span>
                    )}
                  </button>
                ) : (
                  linkedCatalogItem && (
                    <p className="text-xs text-emerald-400 mb-2">🔗 {linkedCatalogItem.name}</p>
                  )
                )}
                {liveDuplicates.length > 0 && (
                  <p className="text-xs text-amber-400 mb-2">
                    ⚠ Also currently pending on: {liveDuplicates.map((d) => d.list.jobLabel).join(", ")}
                  </p>
                )}
                {isStale(item, staleThresholds) && (
                  <p className="text-xs text-amber-400 mb-2">
                    ⚠ {daysInCurrentStatus(item)} day{daysInCurrentStatus(item) === 1 ? "" : "s"}{" "}
                    with no movement
                  </p>
                )}
                {item.receivedBatches && item.receivedBatches.some((b) => b.receivedQty > 0 || (b.serials || []).length > 0) && (
                  <div className="mb-2 space-y-1">
                    {item.receivedBatches
                      .filter((b) => b.receivedQty > 0 || (b.serials || []).length > 0)
                      .map((batch, idx) => (
                      <div key={idx}>
                        <span className="inline-block text-xs rounded-full px-2.5 py-1 border border-slate-700 bg-slate-800/60 text-slate-500">
                          🔒 Received {batch.receivedQty}
                          {item.qtyUnit ? ` ${item.qtyUnit}` : ""} on{" "}
                          {new Date(batch.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {batch.serials && batch.serials.length > 0 && (
                            <span className="font-mono"> · SME# {batch.serials.join(", ")}</span>
                          )}
                        </span>
                      </div>
                    ))}
                    {(() => {
                      const receivedSum = item.receivedBatches.reduce(
                        (sum, b) => sum + b.receivedQty,
                        0
                      );
                      return receivedSum < item.qty ? (
                        <p className="text-xs text-amber-400 mt-1">
                          {item.qty - receivedSum} more still on order — update the "Have" qty
                          once it arrives to record it as its own delivery.
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                {item.stagedBatches && item.stagedBatches.some((b) => b.stagedQty > 0 || (b.serials || []).length > 0) && (
                  <div className="mb-2 space-y-1">
                    {item.stagedBatches
                      .filter((b) => b.stagedQty > 0 || (b.serials || []).length > 0)
                      .map((batch, idx) => (
                      <div key={idx}>
                        <span className="inline-block text-xs rounded-full px-2.5 py-1 border border-slate-700 bg-slate-800/60 text-slate-500">
                          🔒 Staged {batch.stagedQty}
                          {item.qtyUnit ? ` ${item.qtyUnit}` : ""} on{" "}
                          {new Date(batch.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {batch.serials && batch.serials.length > 0 && (
                            <span className="font-mono"> · SME# {batch.serials.join(", ")}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {item.sentBatches && item.sentBatches.some((b) => b.sentQty > 0 || (b.serials || []).length > 0) && (
                  <div className="mb-2 space-y-1">
                    {item.sentBatches
                      .filter((b) => b.sentQty > 0 || (b.serials || []).length > 0)
                      .map((batch, idx) => (
                      <div key={idx}>
                        <span className="inline-block text-xs rounded-full px-2.5 py-1 border border-slate-700 bg-slate-800/60 text-slate-500">
                          🔒 Sent {batch.sentQty}
                          {item.qtyUnit ? ` ${item.qtyUnit}` : ""} on{" "}
                          {new Date(batch.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {batch.serials && batch.serials.length > 0 && (
                            <span className="font-mono"> · SME# {batch.serials.join(", ")}</span>
                          )}
                        </span>
                      </div>
                    ))}
                    {item.status !== "sent" && (
                      <p className="text-xs text-amber-400 mt-1">
                        {item.qty - item.sentBatches.reduce((sum, b) => sum + b.sentQty, 0)} still
                        needed — use the status below for the remainder.
                      </p>
                    )}
                  </div>
                )}
                {isEditor &&
                  (((item.receivedBatches || []).length > 0) ||
                    ((item.stagedBatches || []).length > 0) ||
                    ((item.sentBatches || []).length > 0)) && (
                    <button
                      onClick={() => setClearBatchesTarget(item)}
                      className="text-xs text-slate-600 hover:text-red-400 mb-2 block"
                    >
                      Clear delivery history
                    </button>
                  )}
                {isEditor && item.status === "requested" && (
                  <button
                    onClick={() =>
                      onUpdateList({
                        ...list,
                        items: list.items.map((i) =>
                          i.id === item.id ? { ...i, needsOrdering: !i.needsOrdering } : i
                        ),
                      })
                    }
                    className="text-xs mb-2 block text-slate-500 hover:text-slate-300"
                  >
                    {item.needsOrdering ? "Needs ordering — tap to mark in inventory" : "📦 In inventory — tap to mark needs ordering"}
                  </button>
                )}
                {(() => {
                  const assignedTaskIds = item.assignedTaskIds || [];
                  const assignedTasks = assignedTaskIds
                    .map((tid) => workerTasks.find((t) => t.id === tid))
                    .filter(Boolean);
                  return (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {assignedTasks.map((task) => {
                        const taskMeta = workerTaskStatusMeta(task.status);
                        return (
                          <button
                            key={task.id}
                            onClick={() => isEditor && setAssigningItem(item)}
                            disabled={!isEditor}
                            className={`text-xs rounded-full px-2 py-0.5 border inline-block ${taskMeta.color}`}
                          >
                            👤 {task.workerName} · {taskMeta.label}
                          </button>
                        );
                      })}
                      {isEditor && (
                        <button
                          onClick={() => setAssigningItem(item)}
                          className="text-xs rounded-full px-2 py-0.5 border border-slate-700 text-slate-600 hover:text-slate-400"
                        >
                          {assignedTasks.length > 0 ? "+ Add worker" : "+ Assign to worker"}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {item.status !== "requested" &&
                  (isEditor ? (
                    <button
                      onClick={() => {
                        setEditingOrderedQtyFor(item);
                        setOrderedQtyDraft(String(item.qtyOrdered ?? item.qty));
                      }}
                      className="text-xs mb-2 block text-left"
                    >
                      {item.qtyOrdered != null && item.qtyOrdered < item.qty ? (
                        <span className="text-amber-300">
                          📦 Ordered {item.qtyOrdered} of {item.qty} (partial)
                        </span>
                      ) : item.qtyOrdered != null && item.qtyOrdered > item.qty ? (
                        <span className="text-sky-300">
                          📦 Ordered {item.qtyOrdered} of {item.qty} (+{item.qtyOrdered - item.qty} extra)
                        </span>
                      ) : (
                        <span className="text-slate-600 hover:text-slate-400">
                          📦 Ordered {item.qtyOrdered ?? item.qty} of {item.qty}
                        </span>
                      )}
                    </button>
                  ) : (
                    item.qtyOrdered != null &&
                    item.qtyOrdered !== item.qty &&
                    (item.qtyOrdered < item.qty ? (
                      <p className="text-xs text-amber-300 mb-2">
                        📦 Ordered {item.qtyOrdered} of {item.qty} (partial)
                      </p>
                    ) : (
                      <p className="text-xs text-sky-300 mb-2">
                        📦 Ordered {item.qtyOrdered} of {item.qty} (+{item.qtyOrdered - item.qty} extra)
                      </p>
                    ))
                  ))}
                {isEditor ? (
                  <button
                    onClick={() => {
                      setEditingNoteFor(item);
                      setNoteDraft(item.notes || "");
                    }}
                    className="text-xs mb-2 block text-left"
                  >
                    {item.notes ? (
                      <span className="text-slate-400 italic">📝 {item.notes}</span>
                    ) : (
                      <span className="text-slate-600 hover:text-slate-400">+ Add note</span>
                    )}
                  </button>
                ) : (
                  item.notes && (
                    <p className="text-xs text-slate-400 italic mb-2">📝 {item.notes}</p>
                  )
                )}
                {isEditor ? (
                  <button
                    onClick={() => {
                      setEditingSmeFor(item);
                      const locked = lockedLoveSerials(item);
                      setSmeDraft(
                        (item.serials || []).filter((s) => !locked.includes(s)).join(", ")
                      );
                    }}
                    className="text-xs mb-2 block"
                  >
                    {item.serials && item.serials.length > 0 ? (
                      <span className="text-fuchsia-300 font-mono">
                        SME# {item.serials.join(", ")}
                      </span>
                    ) : (
                      <span className="text-slate-600 hover:text-slate-400">+ Add SME #</span>
                    )}
                  </button>
                ) : (
                  item.serials &&
                  item.serials.length > 0 && (
                    <p className="text-xs text-fuchsia-300 font-mono mb-2">
                      SME# {item.serials.join(", ")}
                    </p>
                  )
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => advanceStatus(item.id, "back")}
                    disabled={!isEditor || !prevLoveStatus(item)}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-500 p-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className={`flex-1 text-center text-xs font-medium rounded-full px-2.5 py-1.5 border ${meta.color}`}>
                    {meta.label}
                    {item.statusDates[item.status] && ` · ${item.statusDates[item.status]}`}
                  </span>
                  <button
                    onClick={() => advanceStatus(item.id, "forward")}
                    disabled={!isEditor || !nextLoveStatus(item)}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-500 p-1"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isEditor && item.archived ? (
                  <button
                    onClick={() => unarchiveItem(item.id)}
                    className="text-xs text-slate-500 hover:text-slate-300 mt-2 flex items-center gap-1"
                  >
                    <Archive className="w-3 h-3" />
                    Archived — tap to restore
                  </button>
                ) : (
                  isEditor &&
                  item.status === "sent" && (
                    <button
                      onClick={() => archiveItem(item.id)}
                      className="text-xs text-slate-500 hover:text-slate-300 mt-2 flex items-center gap-1"
                    >
                      <Archive className="w-3 h-3" />
                      Archive
                    </button>
                  )
                )}
                </div>
              </div>
            );
          })}
        </div>

        {isEditor && undoStack.length > 0 && (
          <div className="mt-6 border border-slate-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setUndoOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/60 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-slate-300 min-w-0">
                <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate">
                  Undo: <span className="text-slate-400 font-normal">{undoStack[0].label}</span>
                </span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-600">
                  {undoStack.length} step{undoStack.length === 1 ? "" : "s"} available
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-500 transition-transform ${undoOpen ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {undoOpen && (
              <div className="divide-y divide-slate-800/80">
                {undoStack.map((entry, i) => (
                  <div key={entry.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-slate-600 shrink-0 w-28">{entry.time}</span>
                    <span className="text-sm text-slate-300 flex-1 min-w-0 truncate">
                      {entry.label}
                    </span>
                    {i === 0 ? (
                      <button
                        onClick={onUndoLastAction}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0 px-2 py-1"
                      >
                        Undo
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600 shrink-0 px-2 py-1">
                        after {i} more undo{i === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isEditor && (
          <p className="text-xs text-slate-600 text-center mb-2">
            View only — sign in to make changes.
          </p>
        )}
      </main>

      {deleteItemTarget && (
        <ConfirmDelete
          title="Remove this item?"
          message={`"${deleteItemTarget.name}" will be removed from this list.`}
          onConfirm={() => deleteItem(deleteItemTarget.id)}
          onCancel={() => setDeleteItemTarget(null)}
        />
      )}
      {clearBatchesTarget && (
        <ConfirmDelete
          title="Clear delivery history?"
          message={`Every locked Received, Staged, and Sent record for "${clearBatchesTarget.name}" will be permanently wiped. This is meant as a reset for test/mistaken entries — it can't be undone.`}
          onConfirm={() => clearBatches(clearBatchesTarget)}
          onCancel={() => setClearBatchesTarget(null)}
        />
      )}
      {deleteListConfirm && (
        <ConfirmDelete
          title="Delete this whole Love List?"
          message={`The list for "${list.jobLabel}" and all its items will be permanently removed.`}
          onConfirm={() => onDeleteList(list.id)}
          onCancel={() => setDeleteListConfirm(false)}
        />
      )}

      {statusPicking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setStatusPicking(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-100 font-semibold mb-1">
              Set status for {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Each item moves there the same way the arrows do — an item that's short of its
              full qty may not be able to reach Sent yet, and in-stock items skip Ordered.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {LOVE_STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => bulkChangeStatus(s.key)}
                  className={`text-xs rounded-full px-3 py-1.5 border ${s.color} hover:brightness-125`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStatusPicking(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showTransferList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-slate-100 font-semibold text-base flex items-center gap-2">
                  <Truck className="w-4 h-4 text-purple-400" />
                  Transfer list
                </h3>
                <p className="text-xs text-slate-500">
                  {list.jobLabel} · {transferListCount} item{transferListCount === 1 ? "" : "s"}{" "}
                  flagged for transfer
                </p>
              </div>
              <button
                onClick={() => setShowTransferList(false)}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {transferDates.map((date) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">
                    Staged on {formatTransferDate(date)}
                  </p>
                  <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
                    {transferListEntries
                      .filter((e) => e.date === date)
                      .map(({ item, qty, qtyUnit, serials, partial }, idx) => (
                        <div key={`${item.id}-${idx}`} className="px-3 py-2 bg-slate-800/40">
                          <p className="text-sm text-slate-100">
                            {item.name}{" "}
                            <span className="text-slate-500">
                              x{qty}{qtyUnit ? ` ${qtyUnit}` : ""}
                            </span>
                            {partial && (
                              <span className="text-[10px] font-medium tracking-wide uppercase bg-orange-500/15 border border-orange-500/40 text-orange-300 rounded-full px-1.5 py-0.5 ml-1.5">
                                Partial
                              </span>
                            )}
                          </p>
                          {serials.length > 0 && (
                            <p className="text-xs text-fuchsia-300 font-mono">
                              SME# {serials.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <button
                onClick={copyTransferList}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Copy className="w-3.5 h-3.5" />
                {transferCopied ? "Copied!" : "Copy list"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningItem && (
        <AssignToWorkerModal
          workers={workers}
          itemLabel={
            assigningItem === "bulk"
              ? `${selectedIds.size} selected item${selectedIds.size === 1 ? "" : "s"}`
              : `${assigningItem.name} ${assigningItem.qtyHave ?? 0}/${assigningItem.qty}${assigningItem.qtyUnit ? ` ${assigningItem.qtyUnit}` : ""}`
          }
          initiallySelectedWorkerIds={
            assigningItem === "bulk"
              ? []
              : (assigningItem.assignedTaskIds || [])
                  .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
                  .filter(Boolean)
          }
          onConfirm={confirmAssign}
          onCancel={() => setAssigningItem(null)}
        />
      )}

      {renamingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-3">Rename item</h3>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setRenamingItem(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveRename}
                disabled={!renameDraft.trim()}
                className="flex-1 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNickname && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">Sub-job / nickname</h3>
            <p className="text-xs text-slate-500 mb-3">
              Still groups under {list.jobLabel} — this just tells the list apart from others on
              the same job. Leave blank to clear it.
            </p>
            <input
              autoFocus
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNickname()}
              placeholder="e.g. Support Building"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingNickname(false)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveNickname}
                className="flex-1 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingOrderedQtyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">
              Qty ordered for "{editingOrderedQtyFor.name}"
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Defaults to the full {editingOrderedQtyFor.qty} requested — lower this if the
              supplier order only covered part of it, or raise it if you ordered more (supplier
              minimums, rounding up to a case size, etc).
            </p>
            <input
              type="number"
              autoFocus
              min="0"
              value={orderedQtyDraft}
              onChange={(e) => setOrderedQtyDraft(e.target.value)}
              onFocus={selectOnFocus}
              onClick={selectOnFocus}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingOrderedQtyFor(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveOrderedQty}
                className="flex-1 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNoteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-3">Note for "{editingNoteFor.name}"</h3>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Any extra context worth remembering..."
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500/60 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingNoteFor(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveNote}
                className="flex-1 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSmeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">SME # for "{editingSmeFor.name}"</h3>
            {lockedLoveSerials(editingSmeFor).length > 0 && (
              <p className="text-xs text-slate-500 mb-3">
                Already recorded (locked, can't be edited here):{" "}
                <span className="font-mono text-slate-400">
                  {lockedLoveSerials(editingSmeFor).join(", ")}
                </span>
              </p>
            )}
            <p className="text-xs text-slate-500 mb-3">
              {lockedLoveSerials(editingSmeFor).length > 0
                ? "Add ones you have in hand but haven't recorded yet — separate multiple with commas."
                : "Now that you actually have it in hand — separate multiple numbers with commas."}{" "}
              Qty have updates automatically to match.
            </p>
            <input
              autoFocus
              value={smeDraft}
              onChange={(e) => setSmeDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveSme()}
              placeholder="e.g. 12345, 12346"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingSmeFor(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={saveSme}
                className="flex-1 text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {relinkingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                Link "{relinkingItem.name}" to...
              </h3>
              <button
                onClick={() => {
                  setRelinkingItem(null);
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {relinkingItem.catalogId && (
                <button
                  onClick={() => relinkCatalog(null)}
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
                    onClick={() => relinkCatalog(c)}
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

      {showPullFromReceiving && (
        <PullFromReceivingModal
          targetType="love_list"
          targetLabel={list.jobLabel}
          target={list}
          onApplyToTarget={onUpdateList}
          onClose={() => setShowPullFromReceiving(false)}
        />
      )}

      {mergingItem && (
        <MergeLoveListItemModal
          item={mergingItem}
          items={list.items || []}
          onConfirm={(targetId) => {
            onUpdateList({ ...list, items: mergeLoveListItems(list.items, mergingItem.id, targetId) });
            playSaveChime();
            setMergingItem(null);
          }}
          onClose={() => setMergingItem(null)}
        />
      )}

      {viewingVendorFor &&
        (() => {
          const item = catalog.find((c) => c.id === viewingVendorFor);
          const merged = item && vendorHistoryOverrides[item.id] ? { ...item, ...vendorHistoryOverrides[item.id] } : item;
          return merged ? (
            <VendorBreakdownModal
              catalogItem={merged}
              onClose={() => setViewingVendorFor(null)}
              onChange={applyVendorOverride}
            />
          ) : null;
        })()}

      {viewingReceiptFor && (
        <SourceReceiptModal receipts={viewingReceiptFor} onClose={() => setViewingReceiptFor(null)} />
      )}
    </div>
  );
}

export function StaleThresholdsModal({ thresholds, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...thresholds });
  const editableStatuses = LOVE_STATUSES.filter((s) => s.key !== "sent");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Needs Attention timing
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-500 mb-4">
            How many days an item can sit in each stage before it gets flagged as needing
            attention. "Sent to job" is the finish line, so it never goes stale.
          </p>
          <div className="space-y-3">
            {editableStatuses.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className={`text-xs rounded-full px-2.5 py-1 border ${s.color}`}>
                  {s.label}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    onFocus={selectOnFocus}
                    onClick={selectOnFocus}
                    min="1"
                    value={draft[s.key] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [s.key]: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="off"
                    className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                  />
                  <span className="text-xs text-slate-500">days</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-4">
            Leave a field blank to turn off alerts for that stage entirely.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={() => onSave(draft)}
            className="w-full text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// Aggregates every item requested/needed for one job number across every
// Love List tied to it — a job routinely spans several lists (different
// dates, sub-jobs sent separately), and there was previously no way to see
// everything asked for without opening each one in turn. Clicking an item
// jumps straight to the specific list it's actually on (via onOpenItem),
// which also prefills that list's own search so the item's easy to spot
// amongst everything else there. Intentionally doesn't filter out archived
// lists/items — the whole point here is completeness, not a working list.
export function LoveListJobOverviewPage({ jobLabel, lists, onOpenItem, onBack, onQuickNav }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);

  const jobLists = lists.filter((l) => l.jobLabel === jobLabel);

  const rows = jobLists
    .flatMap((list) => (list.items || []).map((item) => ({ item, list })))
    .filter(({ item }) => !statusFilter || item.status === statusFilter)
    .filter(
      ({ item }) => !search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase())
    )
    .sort((a, b) => a.item.name.localeCompare(b.item.name));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SectionHeader
        onBack={onBack}
        icon={Briefcase}
        title={jobLabel}
        subtitle={`${rows.length} item${rows.length === 1 ? "" : "s"} across ${jobLists.length} list${
          jobLists.length === 1 ? "" : "s"
        }`}
        maxWidthClass="max-w-2xl"
        current="love"
        onQuickNav={onQuickNav}
      />
      <main className="max-w-2xl mx-auto px-4 py-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items on this job..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
        />
        <div className="flex flex-wrap gap-1.5 mb-4">
          {LOVE_STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter((prev) => (prev === s.key ? null : s.key))}
              className={`text-xs rounded-full px-2.5 py-1 border transition-all ${s.color} ${
                statusFilter && statusFilter !== s.key
                  ? "opacity-40"
                  : statusFilter === s.key
                  ? "ring-2 ring-offset-1 ring-offset-slate-950 ring-white/60"
                  : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">
            {search.trim()
              ? `Nothing matches "${search.trim()}".`
              : "No items on any list for this job yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(({ item, list }) => {
              const meta = loveItemDisplayMeta(item);
              return (
                <button
                  key={`${list.id}-${item.id}`}
                  onClick={() => onOpenItem(list, item)}
                  className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${item.archived ? "text-slate-500 line-through" : "text-slate-100"}`}>
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {item.qty ?? "—"}
                      {item.qtyUnit ? ` ${item.qtyUnit}` : ""} · on {listDisplayLabel(list)}
                      {list.archived ? " (archived list)" : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] rounded-full px-2 py-1 border shrink-0 ${meta.color}`}>
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export function LoveListsDashboard({ lists, isEditor, isOwner, staleThresholds = DEFAULT_STALE_THRESHOLD_DAYS, onSaveThresholds, onOpenList, onAddList, onScanList, onOpenWorkerTasks, onOpenTaskList, taskListCount = 0, onBulkArchiveLists, onRestoreBackup, restoreError, restoreSuccessCount, onGoHome, onQuickNav, onViewJobOverview }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active"); // "active" | "ready"
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null = off, or a LOVE_STATUSES key
  const [selectMode, setSelectMode] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState({});
  const [confirmingBulkArchive, setConfirmingBulkArchive] = useState(false);
  const restoreFileInputRef = useRef(null);

  const searchLower = search.trim().toLowerCase();
  // Search intentionally bypasses the archive filter — looking something
  // up is a deliberate action, so it should still find it even if the
  // list it's on has been archived.
  const searchResults = searchLower
    ? lists.flatMap((l) =>
        l.items
          .filter((i) => i.name.toLowerCase().includes(searchLower))
          .map((i) => ({ list: l, item: i }))
      )
    : [];

  const visibleLists = lists.filter((l) => showArchivedLists || !l.archived);
  const archivedListCount = lists.filter((l) => l.archived).length;

  // Works like search — a flat, job-grouped view of every item at the
  // selected status across every list, overriding the normal tabs while
  // active.
  const statusFilterResults = statusFilter
    ? visibleLists.flatMap((l) =>
        l.items
          .filter((i) => i.status === statusFilter)
          .map((i) => ({ list: l, item: i }))
      )
    : [];

  const jobGroups = [...new Map(visibleLists.map((l) => [l.jobLabel, l.jobLabel])).entries()]
    .map(([label]) => label)
    .sort((a, b) => a.localeCompare(b));

  // "Ready to send" means the whole quantity is sitting staged, waiting to
  // go out — not an item that's already partially shipped and is only
  // parked at "staged" because it's short of the rest. That's a different
  // situation (waiting on more stock to arrive, not waiting to be sent)
  // and showing it here would say something that was never true.
  const readyToSend = visibleLists.flatMap((l) =>
    l.items
      .filter(
        (i) =>
          i.status === "staged" &&
          (i.sentBatches || []).reduce((sum, b) => sum + (b.sentQty || 0), 0) === 0
      )
      .map((i) => ({ list: l, item: i }))
  );
  const readyByJob = [...new Map(readyToSend.map((r) => [r.list.jobLabel, r.list.jobLabel])).keys()].sort(
    (a, b) => a.localeCompare(b)
  );

  const staleItems = visibleLists.flatMap((l) =>
    l.items.filter((i) => isStale(i, staleThresholds)).map((i) => ({ list: l, item: i }))
  );
  const staleByJob = [...new Map(staleItems.map((r) => [r.list.jobLabel, r.list.jobLabel])).keys()].sort(
    (a, b) => a.localeCompare(b)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SectionHeader
        onBack={onGoHome}
        backIcon={Home}
        icon={Heart}
        iconClassName="text-rose-400"
        title="Love Lists"
        badge={
          !isEditor && (
            <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-400 rounded-full px-2 py-0.5">
              View only
            </span>
          )
        }
        maxWidthClass="max-w-2xl"
        current="love"
        onQuickNav={onQuickNav}
        quickNavIsOwner={isOwner}
        extra={
          <>
            {restoreError && (
              <div className="max-w-2xl mx-auto px-4 pb-2">
                <p className="text-xs text-red-400">{restoreError}</p>
              </div>
            )}
            {restoreSuccessCount !== null && restoreSuccessCount !== undefined && (
              <div className="max-w-2xl mx-auto px-4 pb-2">
                <p className="text-xs text-emerald-400">
                  ✓ Restored {restoreSuccessCount} list{restoreSuccessCount === 1 ? "" : "s"} from backup.
                </p>
              </div>
            )}
            <div className="max-w-2xl mx-auto px-4 pb-3">
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search an item — find out where it goes..."
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/60"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LOVE_STATUSES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStatusFilter((prev) => (prev === s.key ? null : s.key))}
                    className={`text-xs rounded-full px-2.5 py-1 border transition-all ${s.color} ${
                      statusFilter && statusFilter !== s.key
                        ? "opacity-40"
                        : statusFilter === s.key
                        ? "ring-2 ring-offset-1 ring-offset-slate-950 ring-white/60"
                        : ""
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        }
      >
        {isEditor && (
          <>
            <button
              onClick={onOpenTaskList}
              title="Task list"
              className="relative flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <ClipboardList className="w-4 h-4" />
              {taskListCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-slate-950 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {taskListCount > 9 ? "9+" : taskListCount}
                </span>
              )}
            </button>
            <button
              onClick={onOpenWorkerTasks}
              title="Workers"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowThresholdSettings(true)}
              title="Needs Attention timing"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onScanList}
              title="Scan a list"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <ScanLine className="w-4 h-4" />
            </button>
            {onRestoreBackup && (
              <>
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) onRestoreBackup(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => restoreFileInputRef.current && restoreFileInputRef.current.click()}
                  title="Restore Love Lists from backup file"
                  className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onAddList}
              className="flex items-center gap-1.5 bg-rose-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-rose-400"
            >
              <Plus className="w-4 h-4" />
              New list
            </button>
          </>
        )}
      </SectionHeader>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {searchLower ? (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
            </p>
            {searchResults.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing matching "{search}" on any active list.
              </p>
            ) : (
              <div className="space-y-5">
                {[...new Map(searchResults.map((r) => [r.list.jobLabel, r.list.jobLabel])).keys()]
                  .sort((a, b) => a.localeCompare(b))
                  .map((jobLabel) => (
                    <div key={jobLabel}>
                      <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                      <div className="space-y-2">
                        {searchResults
                          .filter((r) => r.list.jobLabel === jobLabel)
                          .map(({ list, item }) => {
                            const meta = loveItemDisplayMeta(item);
                            return (
                              <button
                                key={item.id}
                                onClick={() => onOpenList(list)}
                                className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm text-slate-100">
                                    {item.name}{" "}
                                    <span className="text-slate-500">
                                      {item.qtyHave ?? 0}/{item.qty}{item.qtyUnit ? ` ${item.qtyUnit}` : ""}
                                    </span>
                                  </p>
                                  <span className={`text-xs rounded-full px-2 py-0.5 border shrink-0 ${meta.color}`}>
                                    {meta.label}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {list.subJobLabel && `${list.subJobLabel} · `}received{" "}
                                  {list.dateReceived}
                                </p>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : statusFilter ? (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              {statusFilterResults.length} item{statusFilterResults.length === 1 ? "" : "s"}{" "}
              {loveStatusMeta(statusFilter).label}
            </p>
            {statusFilterResults.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing currently {loveStatusMeta(statusFilter).label}.
              </p>
            ) : (
              <div className="space-y-5">
                {[...new Map(statusFilterResults.map((r) => [r.list.jobLabel, r.list.jobLabel])).keys()]
                  .sort((a, b) => a.localeCompare(b))
                  .map((jobLabel) => (
                    <div key={jobLabel}>
                      <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                      <div className="space-y-2">
                        {statusFilterResults
                          .filter((r) => r.list.jobLabel === jobLabel)
                          .map(({ list, item }) => (
                            <button
                              key={item.id}
                              onClick={() => onOpenList(list)}
                              className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700"
                            >
                              <p className="text-sm text-slate-100">
                                {item.name}{" "}
                                <span className="text-slate-500">
                                  {item.qtyHave ?? 0}/{item.qty}{item.qtyUnit ? ` ${item.qtyUnit}` : ""}
                                </span>
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                {list.subJobLabel && `${list.subJobLabel} · `}received{" "}
                                {list.dateReceived}
                              </p>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setTab("active")}
                className={`flex-1 text-sm rounded-md py-2 border ${
                  tab === "active"
                    ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                All lists
              </button>
              <button
                onClick={() => setTab("ready")}
                className={`flex-1 text-sm rounded-md py-2 border relative ${
                  tab === "ready"
                    ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                Ready to send
                {readyToSend.length > 0 && (
                  <span className="ml-1.5 bg-emerald-500 text-slate-950 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {readyToSend.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab("stale")}
                className={`flex-1 text-sm rounded-md py-2 border relative ${
                  tab === "stale"
                    ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                Needs attention
                {staleItems.length > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {staleItems.length}
                  </span>
                )}
              </button>
            </div>

            {tab === "active" ? (
              jobGroups.length === 0 ? (
                archivedListCount > 0 ? (
                  // Every list that exists happens to be archived — the
                  // normal "Show archived" toggle only renders in the
                  // non-empty branch below, so without this the person
                  // would see "No Love Lists yet" while real, saved lists
                  // sit one tap away, hidden behind a toggle they never
                  // get shown.
                  <div className="text-center py-10">
                    <p className="text-sm text-slate-500 mb-3">
                      Every Love List right now is archived — nothing active to show here.
                    </p>
                    <button
                      onClick={() => setShowArchivedLists(true)}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 justify-center mx-auto border border-slate-700 rounded-md px-3 py-1.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Show {archivedListCount} archived list{archivedListCount === 1 ? "" : "s"}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-sm text-slate-500">
                      {isEditor
                        ? 'No Love Lists yet — tap "New list" to log one in.'
                        : "No Love Lists yet."}
                    </p>
                    {isEditor && onRestoreBackup && (
                      <button
                        onClick={() => restoreFileInputRef.current && restoreFileInputRef.current.click()}
                        className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2 mt-2"
                      >
                        Restore from backup file
                      </button>
                    )}
                  </div>
                )
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    {archivedListCount > 0 ? (
                      <button
                        onClick={() => setShowArchivedLists((v) => !v)}
                        className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {showArchivedLists ? "Hide" : "Show"} {archivedListCount} archived list
                        {archivedListCount === 1 ? "" : "s"}
                      </button>
                    ) : (
                      <span />
                    )}
                    {isEditor && visibleLists.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectMode((v) => !v);
                          setSelectedListIds({});
                        }}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        {selectMode ? "Cancel" : "Select"}
                      </button>
                    )}
                  </div>
                  {selectMode && (
                    <div className="flex items-center justify-between gap-2 -mt-3 text-xs">
                      <button
                        onClick={() =>
                          setSelectedListIds(
                            visibleLists.every((l) => selectedListIds[l.id])
                              ? {}
                              : Object.fromEntries(visibleLists.map((l) => [l.id, true]))
                          )
                        }
                        className="text-slate-400 hover:text-slate-200"
                      >
                        {visibleLists.every((l) => selectedListIds[l.id])
                          ? "Deselect all"
                          : `Select all (${visibleLists.length})`}
                      </button>
                      <button
                        onClick={() => setConfirmingBulkArchive(true)}
                        disabled={Object.values(selectedListIds).filter(Boolean).length === 0}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive {Object.values(selectedListIds).filter(Boolean).length} selected
                      </button>
                    </div>
                  )}
                  {jobGroups.map((jobLabel) => (
                    <div key={jobLabel}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="font-semibold text-slate-100">{jobLabel}</p>
                        {onViewJobOverview && (
                          <button
                            onClick={() => onViewJobOverview(jobLabel)}
                            className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 shrink-0"
                          >
                            View all items →
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {visibleLists
                          .filter((l) => l.jobLabel === jobLabel)
                          .sort((a, b) => b.dateReceived.localeCompare(a.dateReceived))
                          .map((list) => {
                            // "In Stock" items are still status "received"
                            // underneath (see loveItemDisplayMeta) — group
                            // them into their own pill here too, rather
                            // than silently lumping them in with items that
                            // were actually ordered and received.
                            const receivedIdx = LOVE_STATUSES.findIndex((s) => s.key === "received");
                            const countBuckets = [
                              ...LOVE_STATUSES.slice(0, receivedIdx + 1),
                              { key: "inStock", label: "In Stock", color: loveStatusMeta("received").color },
                              ...LOVE_STATUSES.slice(receivedIdx + 1),
                            ];
                            const counts = countBuckets
                              .map((s) => ({
                                ...s,
                                n: list.items.filter((i) =>
                                  s.key === "inStock"
                                    ? i.status === "received" && i.needsOrdering === false
                                    : s.key === "received"
                                    ? i.status === "received" && i.needsOrdering !== false
                                    : i.status === s.key
                                ).length,
                              }))
                              .filter((s) => s.n > 0);
                            return (
                              <button
                                key={list.id}
                                onClick={() =>
                                  selectMode
                                    ? setSelectedListIds((prev) => ({ ...prev, [list.id]: !prev[list.id] }))
                                    : onOpenList(list)
                                }
                                className={`w-full text-left bg-slate-900 border rounded-lg p-3 hover:border-slate-700 flex items-start gap-3 ${
                                  selectMode && selectedListIds[list.id]
                                    ? "border-amber-500/60 bg-amber-500/5"
                                    : "border-slate-800"
                                }`}
                              >
                                {selectMode && (
                                  <div
                                    className={`w-5 h-5 mt-0.5 rounded border shrink-0 flex items-center justify-center ${
                                      selectedListIds[list.id]
                                        ? "bg-amber-500 border-amber-500"
                                        : "border-slate-600"
                                    }`}
                                  >
                                    {selectedListIds[list.id] && (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                                    )}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <p className="text-sm text-slate-100 flex items-center gap-1.5">
                                      {list.subJobLabel || `${list.items.length} item${list.items.length === 1 ? "" : "s"}`}
                                      {list.archived && (
                                        <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-500 rounded-full px-1.5 py-0.5">
                                          Archived
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-500">{list.dateReceived}</p>
                                  </div>
                                  {list.subJobLabel && (
                                    <p className="text-xs text-slate-500 mb-1.5">
                                      {list.items.length} item{list.items.length === 1 ? "" : "s"}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-1.5">
                                    {counts.map((s) => (
                                      <span
                                        key={s.key}
                                        className={`text-[10px] rounded-full px-2 py-0.5 border ${s.color}`}
                                      >
                                        {s.n} {s.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === "ready" ? (
              readyByJob.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  Nothing's staged and ready to go out right now.
                </p>
              ) : (
                <div className="space-y-5">
                  {readyByJob.map((jobLabel) => (
                    <div key={jobLabel}>
                      <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                      <div className="space-y-2">
                        {readyToSend
                          .filter((r) => r.list.jobLabel === jobLabel)
                          .map(({ list, item }) => (
                            <button
                              key={item.id}
                              onClick={() => onOpenList(list)}
                              className="w-full text-left bg-slate-900 border border-sky-500/30 rounded-lg p-3 hover:border-sky-500/50"
                            >
                              <p className="text-sm text-slate-100">
                                {item.name} <span className="text-slate-500">{item.qtyHave ?? 0}/{item.qty}{item.qtyUnit ? ` ${item.qtyUnit}` : ""}</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Staged {item.statusDates.staged}
                              </p>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : staleByJob.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing's stuck — everything's moving.
              </p>
            ) : (
              <div className="space-y-5">
                {staleByJob.map((jobLabel) => (
                  <div key={jobLabel}>
                    <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                    <div className="space-y-2">
                      {staleItems
                        .filter((r) => r.list.jobLabel === jobLabel)
                        .map(({ list, item }) => {
                          const meta = loveItemDisplayMeta(item);
                          const days = daysInCurrentStatus(item);
                          return (
                            <button
                              key={item.id}
                              onClick={() => onOpenList(list)}
                              className="w-full text-left bg-slate-900 border border-amber-500/30 rounded-lg p-3 hover:border-amber-500/50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-slate-100">
                                  {item.name} <span className="text-slate-500">{item.qtyHave ?? 0}/{item.qty}{item.qtyUnit ? ` ${item.qtyUnit}` : ""}</span>
                                </p>
                                <span className={`text-xs rounded-full px-2 py-0.5 border shrink-0 ${meta.color}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-xs text-amber-400 mt-1">
                                ⚠ {days} day{days === 1 ? "" : "s"} with no movement
                              </p>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showThresholdSettings && (
        <StaleThresholdsModal
          thresholds={staleThresholds}
          onSave={(updated) => {
            onSaveThresholds(updated);
            setShowThresholdSettings(false);
          }}
          onClose={() => setShowThresholdSettings(false)}
        />
      )}

      {confirmingBulkArchive && (
        <ConfirmDelete
          title={`Archive ${Object.values(selectedListIds).filter(Boolean).length} list${
            Object.values(selectedListIds).filter(Boolean).length === 1 ? "" : "s"
          }?`}
          message="Archived lists drop out of Ready to Send and Needs Attention, and off the main list — nothing on them gets deleted, and you can unarchive any of them again later."
          confirmLabel="Archive"
          onConfirm={() => {
            onBulkArchiveLists(Object.keys(selectedListIds).filter((id) => selectedListIds[id]));
            setConfirmingBulkArchive(false);
            setSelectMode(false);
            setSelectedListIds({});
          }}
          onCancel={() => setConfirmingBulkArchive(false)}
        />
      )}
    </div>
  );
}



// A running pull/hand-off list built by bulk-selecting items across one or
// more Love Lists over time and dropping them here — see newLoveTaskEntry
// in lib/lovelists.js for why most of an entry (name, job) is a fixed
// snapshot, not a live-synced second copy of the item. The quantity is the
// one exception: it's resolved live against the source item every render
// (qty minus whatever's already on hand), so the number here always
// reflects what's actually still needed right now, not what was needed
// the moment it got added — someone else marking part of it received
// updates this list too, with no extra step. Falls back to the original
// snapshot qty if the source list or item is gone (deleted, merged away),
// so a stale entry never shows a wrong "0" just because it can't be found.
export function LoveTaskListModal({ entries, lists, isEditor, onToggleDone, onRemove, onClearDone, onClearAll, onClose }) {
  const [copied, setCopied] = useState(false);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const liveEntries = entries.map((e) => {
    const sourceItem = lists
      .find((l) => l.id === e.sourceListId)
      ?.items.find((i) => i.id === e.sourceItemId);
    if (!sourceItem) return e;
    // Live-syncs the requested amount only (in case it's edited after being
    // added here) — deliberately doesn't subtract qtyHave. This list's job
    // is "go physically grab this and bring it to the job," and qtyHave
    // reaching the full qty just means it's been logged as received/in
    // stock, not that anyone's actually carried it over yet. An "In Stock"
    // item in particular jumps straight to fully-received the moment it's
    // marked, which used to zero this out immediately — showing "need x0"
    // for an item nobody's grabbed yet.
    return { ...e, qty: sourceItem.qty ?? e.qty };
  });
  const groups = groupLoveTaskEntries(liveEntries);
  const doneCount = entries.filter((e) => e.done).length;

  const copyList = async () => {
    const ok = await copyToClipboard(formatLoveTaskListText(liveEntries));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-slate-100 overflow-y-auto">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
            <p className="font-semibold text-slate-100 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-rose-400" />
              Task List
            </p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={copyList}
              className="text-xs flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 hover:bg-slate-700"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            Nothing here yet — select items on a Love List and add them to the Task List.
          </p>
        ) : (
          <>
            {isEditor && (
              <div className="flex items-center gap-3 mb-4">
                {doneCount > 0 && (
                  <button onClick={onClearDone} className="text-xs text-slate-400 hover:text-slate-200">
                    Clear {doneCount} done
                  </button>
                )}
                <button
                  onClick={() => setConfirmingClearAll(true)}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  Clear all
                </button>
              </div>
            )}
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.key}>
                  <p className="font-semibold text-slate-100 mb-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-2.5 border rounded-md px-3 py-2 ${
                          entry.done ? "border-slate-800 bg-slate-900/40" : "border-slate-800 bg-slate-900"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={entry.done}
                          disabled={!isEditor}
                          onChange={() => onToggleDone(entry.id)}
                          className="w-4 h-4 rounded accent-rose-500 shrink-0"
                        />
                        <p
                          className={`flex-1 min-w-0 text-sm truncate ${
                            entry.done ? "text-slate-500 line-through" : "text-slate-100"
                          }`}
                        >
                          {entry.itemName}
                          {entry.qty !== 1 && ` x${entry.qty}`}
                        </p>
                        {isEditor && (
                          <button
                            onClick={() => onRemove(entry.id)}
                            className="text-slate-600 hover:text-red-400 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {confirmingClearAll && (
        <ConfirmDelete
          title="Clear the whole Task List?"
          message={`This removes all ${entries.length} item${entries.length === 1 ? "" : "s"} on it. It doesn't affect the actual Love Lists items they came from.`}
          confirmLabel="Clear all"
          onConfirm={() => {
            onClearAll();
            setConfirmingClearAll(false);
          }}
          onCancel={() => setConfirmingClearAll(false)}
        />
      )}
    </div>
  );
}

export function LoveListsApp({ isEditor, isOwner, onGoHome, initialListId = null, onDeepLinkConsumed, onQuickNav }) {
  const [lists, setLists] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerTasks, setWorkerTasks] = useState([]);
  const [staleThresholds, setStaleThresholds] = useState(DEFAULT_STALE_THRESHOLD_DAYS);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Seeded from a deep link (e.g. a pallet's QR code) when present. Lists
  // haven't loaded yet at this point, so activeList below just stays null
  // — behind the loading spinner — until loadAll finds a match. Reports
  // back to the parent (once, after this seed has already been captured
  // above) so a later, unrelated remount of this screen starts at the
  // dashboard instead of forcing the same list open again.
  const [activeListId, setActiveListId] = useState(initialListId);
  // The "every item for this job number, regardless of which Love List
  // it's actually on" view — a job label, not a list id, since the whole
  // point is aggregating across potentially several lists for one job.
  const [viewingJobLabel, setViewingJobLabel] = useState(null);
  // Prefilled into the destination list's own item search once an item's
  // "open the list it's actually on" link is followed, so it's easy to
  // immediately spot amongst everything else on that list.
  const [jobOverviewReturnSearch, setJobOverviewReturnSearch] = useState("");
  useEffect(() => {
    if (initialListId != null) onDeepLinkConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Fixed for the life of this screen (unlike initialListId/pendingDeepLinkId
  // upstream, which get cleared right after mount so a later, normal
  // re-entry into Love Lists doesn't keep reopening the same list). A
  // pallet's QR code is meant to be a dead end for anyone not logged in —
  // see what job it's for, nothing else — so an anonymous viewer who
  // arrived this way gets the list locked to just that one screen, no
  // back button into the dashboard/rest of the app. A logged-in owner or
  // manager scanning their own code keeps full navigation.
  const [openedViaDeepLink] = useState(initialListId != null);
  const lockedToDeepLink = openedViaDeepLink && !isEditor;
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showWorkerTasks, setShowWorkerTasks] = useState(false);
  const [tools, setTools] = useState([]);
  const toolsRef = useRef([]);
  const [loveTaskList, setLoveTaskList] = useState([]);
  const [showLoveTaskList, setShowLoveTaskList] = useState(false);
  // Saving works like Job Lists: every save says "I last saw the server at
  // time T", the server refuses if it has since changed, and the two
  // versions are merged item by item instead of one overwriting the other;
  // only a real collision asks a person. All of that lives in syncEngine
  // (tested on its own with simulated devices) — this screen just feeds it
  // edits. listsRef always holds the latest lists, since state alone lags
  // behind rapid edits.
  const listsRef = useRef([]);
  const loveEngineRef = useRef(null);
  const [loveMerge, setLoveMerge] = useState(null); // { lists, conflicts, theirsUpdatedAt, error? }
  const [loveMergeSubmitting, setLoveMergeSubmitting] = useState(false);
  const [remoteNotice, setRemoteNotice] = useState(null);
  const remoteNoticeTimer = useRef(null);

  // The one load that's allowed to block the whole screen: if this
  // specifically fails (a flaky connection is the common case in the
  // field), we must NOT let the app quietly start from an empty list —
  // any edit after that would flush the empty state back and genuinely
  // erase every real Love List. Mirrors the same guard Job Lists already
  // has for jobs/catalog. Everything else loaded below (catalog, workers,
  // tasks, tools, thresholds) stays lower-stakes/soft-fail, same as before.
  const loadAll = async () => {
    setLoading(true);
    setLoadFailed(false);
    let loadedLists = [];
    try {
      const result = await getWithRetry(LOVE_LISTS_KEY);
      if (!result.ok) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      if (result.value) loadedLists = JSON.parse(result.value);
      listsRef.current = loadedLists;
      loveEngineRef.current.seed(loadedLists, result.updatedAt);
      setLists(loadedLists);
    } catch {
      // corrupted stored data (not a read failure) — safe to start empty
    }
    try {
      const catalogResult = await getWithRetry(CATALOG_KEY);
      if (catalogResult.ok && catalogResult.value) setCatalog(JSON.parse(catalogResult.value));
    } catch {
      // catalog linking just won't be available this session
    }
    try {
      const workersResult = await getWithRetry(WORKERS_KEY);
      if (workersResult.ok && workersResult.value) setWorkers(JSON.parse(workersResult.value));
    } catch {}
    try {
      const tasksResult = await getWithRetry(WORKER_TASKS_KEY);
      if (tasksResult.ok && tasksResult.value) setWorkerTasks(JSON.parse(tasksResult.value).map(migrateWorkerTask));
    } catch {}
    try {
      const toolsResult = await getWithRetry(TOOLS_KEY);
      if (toolsResult.ok && toolsResult.value) {
        const loadedTools = JSON.parse(toolsResult.value);
        setTools(loadedTools);
        toolsRef.current = loadedTools;
      }
    } catch {
      // Tools registry sync just won't be available this session
    }
    try {
      const thresholdsResult = await getWithRetry(STALE_THRESHOLDS_KEY);
      if (thresholdsResult.ok && thresholdsResult.value) {
        setStaleThresholds({ ...DEFAULT_STALE_THRESHOLD_DAYS, ...JSON.parse(thresholdsResult.value) });
      }
    } catch {
      // custom thresholds just won't be available this session — defaults still work fine
    }
    try {
      const taskListResult = await getWithRetry(LOVE_TASK_LIST_KEY);
      if (taskListResult.ok && taskListResult.value) setLoveTaskList(JSON.parse(taskListResult.value));
    } catch {
      // just starts empty — nothing else depends on this loading successfully
    }
    setLoading(false);
    if (isEditor) maybeAutoBackupLoveLists(loadedLists);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveStaleThresholds = (updated) => {
    if (!isEditor) return;
    setStaleThresholds(updated);
    saveWithRetry(STALE_THRESHOLDS_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const updateLoveTaskList = (updater) => {
    if (!isEditor) return;
    setLoveTaskList((prev) => {
      const next = updater(prev);
      saveWithRetry(LOVE_TASK_LIST_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const addToLoveTaskList = (list, addedItems) => {
    if (!isEditor || addedItems.length === 0) return;
    playSaveChime();
    updateLoveTaskList((prev) => [...prev, ...addedItems.map((i) => newLoveTaskEntry(list, i))]);
  };
  const toggleLoveTaskDone = (id) => {
    updateLoveTaskList((prev) => prev.map((e) => (e.id === id ? { ...e, done: !e.done } : e)));
  };
  const removeLoveTaskEntry = (id) => {
    updateLoveTaskList((prev) => prev.filter((e) => e.id !== id));
  };
  const clearDoneLoveTasks = () => {
    updateLoveTaskList((prev) => prev.filter((e) => !e.done));
  };
  const clearAllLoveTasks = () => {
    updateLoveTaskList(() => []);
  };

  // Assigning an item creates a real task, not just a label — it shows up
  // in Worker Tasks and counts toward that person's completion rate.
  // A null worker (nobody picked in the assign modal) still creates a
  // task — a shared/open one, capacity 1, nobody on it yet — so it lands
  // in Open Tasks for anyone to pick up instead of the assignment just
  // silently not happening.
  const assignItemToWorker = (worker, itemLabel, jobLabel, source) => {
    if (!isEditor) return null;
    const task = worker
      ? newWorkerTask(worker.id, worker.name, itemLabel, jobLabel, source)
      : newSharedWorkerTask({ title: itemLabel, jobLabel, capacity: 1, assignedWorkers: [], source });
    setWorkerTasks((prev) => {
      const next = [...prev, task];
      saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return task.id;
  };

  const unassignWorkerTask = (taskId) => {
    if (!isEditor) return;
    setWorkerTasks((prev) => {
      const next = prev.filter((t) => t.id !== taskId);
      saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Same as the Job Lists side — Worker Tasks manages its own independent
  // copy of this data while open, so refresh here too once it closes.
  const reloadWorkerData = async () => {
    try {
      const workersResult = await getWithRetry(WORKERS_KEY);
      if (workersResult.ok && workersResult.value) setWorkers(JSON.parse(workersResult.value));
    } catch {}
    try {
      const tasksResult = await getWithRetry(WORKER_TASKS_KEY);
      if (tasksResult.ok && tasksResult.value) setWorkerTasks(JSON.parse(tasksResult.value).map(migrateWorkerTask));
    } catch {}
  };

  const showLoveNotice = (message) => {
    setRemoteNotice(message);
    if (remoteNoticeTimer.current) clearTimeout(remoteNoticeTimer.current);
    remoteNoticeTimer.current = setTimeout(() => setRemoteNotice(null), 4000);
  };

  if (!loveEngineRef.current) {
    loveEngineRef.current = createSyncEngine({
      read: () => getWithRetry(LOVE_LISTS_KEY),
      write: (json, expectedUpdatedAt) => saveWithRetry(LOVE_LISTS_KEY, json, expectedUpdatedAt),
      peek: async () => {
        const probe = await peekUpdatedAt([LOVE_LISTS_KEY]);
        return { ok: probe.ok, updatedAt: probe.ok ? probe.map[LOVE_LISTS_KEY] || null : null };
      },
      merge: (base, mine, theirs) => {
        const result = threeWayMergeLoveLists(base, mine, theirs);
        return {
          lists: result.lists,
          conflicts: [
            ...result.itemConflicts.map((c) => ({ ...c, kind: "item" })),
            ...result.listConflicts,
          ],
        };
      },
      applyResolutions: applyLoveListResolutions,
      getLocal: () => listsRef.current,
      setLocal: (next) => {
        listsRef.current = next;
        setLists(next);
      },
      onPrompt: setLoveMerge,
      onNotice: showLoveNotice,
      onSubmitting: setLoveMergeSubmitting,
    });
  }

  const updateLists = (updater) => {
    if (!isEditor || loadFailed) return;
    const next = updater(listsRef.current);
    listsRef.current = next;
    setLists(next);
    maybeAutoBackupLoveLists(next);
    loveEngineRef.current.edited();
  };

  const checkLoveListsForRemoteChanges = async () => {
    if (loading || loadFailed || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    await loveEngineRef.current.checkRemote();
  };

  useRemoteRefresh(checkLoveListsForRemoteChanges, { intervalMs: 30000 });

  // Job Lists already has an "Import all data (restore backup)" path —
  // Love Lists never got the equivalent, which is exactly the gap that
  // left no in-app way to restore one of downloadLoveListsBackupFile's
  // own auto-backup files after a wipe. Deliberately does NOT use
  // window.confirm — that's a native browser dialog, and installed/
  // kiosk-style app windows can swallow it silently (no dialog ever
  // appears, confirm() just returns falsy), which looks exactly like
  // "I picked the file and nothing happened." An in-app modal, styled
  // like everything else here, can't have that failure mode — and a
  // real success message afterward means "did it work" is never a
  // guessing game either.
  const [restoreError, setRestoreError] = useState(null);
  const [restorePending, setRestorePending] = useState(null); // { loveLists, exportedAt } — parsed, awaiting confirm
  const [restoreSuccessCount, setRestoreSuccessCount] = useState(null);

  const handleRestoreFileChosen = (file) => {
    if (!isEditor) return;
    setRestoreError(null);
    setRestoreSuccessCount(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.loveLists)) {
          setRestoreError(
            'That file doesn\'t look like a Riggy Love Lists backup — make sure it\'s a "riggy-love-lists-...json" file, not a different export.'
          );
          return;
        }
        setRestorePending({ loveLists: parsed.loveLists, exportedAt: parsed.exportedAt || null });
      } catch {
        setRestoreError("Couldn't read that file — make sure it's an unmodified Riggy backup.");
      }
    };
    reader.onerror = () => setRestoreError("Couldn't read that file off the device.");
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    if (!restorePending) return;
    const count = restorePending.loveLists.length;
    updateLists(() => restorePending.loveLists);
    setRestorePending(null);
    setRestoreSuccessCount(count);
  };

  // Every manual catalog link is a real signal: "when someone writes this
  // phrase, they mean this item." Remembering it means next time OCR or
  // auto-match sees the same inconsistent phrasing, it can suggest the
  // right item with real confidence instead of guessing from scratch.
  const learnCatalogAlias = (catalogId, aliasText) => {
    if (!isEditor || !catalogId || !aliasText || !aliasText.trim()) return;
    setCatalog((prev) => {
      const next = withLearnedAlias(prev, catalogId, aliasText);
      if (next !== prev) saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Fourth and last of the Tools registry's auto-link points — same
  // sync as Job Lists' items/Import and Returns, just reached through
  // Love Lists' own separate copy of the data instead of sharing state
  // with the Job Lists side of the app. context is "job" here (an item
  // on a Love List is understood to be sitting on that list's job),
  // named for the list's own job label since a Love List doesn't carry
  // a real jobId the way Job Lists' jobs do.
  const syncToolsFromLoveListItem = (smeNumbers, itemName, jobLabel) => {
    if (!isEditor || !smeNumbers || smeNumbers.length === 0) return;
    const next = syncSmesIntoRegistry(toolsRef.current, smeNumbers, itemName, {
      type: "job",
      jobId: null,
      jobName: jobLabel,
    });
    if (next !== toolsRef.current) {
      toolsRef.current = next;
      setTools(next);
      saveWithRetry(TOOLS_KEY, JSON.stringify(next)).catch(() => {});
    }
  };

  const activeList = lists.find((l) => l.id === activeListId) || null;

  const handleSaveNewList = ({
    id,
    jobLabel,
    subJobLabel,
    submittedBy,
    dateReceived,
    items,
    scanImageUrl,
    extraScanImageUrls,
    referenceDocuments,
  }) => {
    if (!isEditor) return;
    const list = {
      id: id || uniqueId(),
      jobLabel,
      subJobLabel: subJobLabel || "",
      submittedBy,
      dateReceived,
      items,
      scanImageUrl: scanImageUrl || null,
      // Only the first scanned page gets to be "the" scan photo — any
      // additional pages scanned into the same list land here instead,
      // shown alongside any manually-attached reference photos.
      referenceImages: extraScanImageUrls || [],
      // Separate from referenceImages above — these are proper Reference
      // Documents (name, type, upload timestamp), attachable at creation
      // time via the same picker the Reference Documents panel uses
      // after the fact, not just the scan flow's own pages.
      referenceDocuments: referenceDocuments || [],
      createdAt: timeStamp(),
      archived: false,
    };
    playSaveChime();
    updateLists((prev) => [...prev, list]);
    setShowAddForm(false);
    setShowScanModal(false);
  };

  // Accepts either a plain updated-list object (existing, still used
  // everywhere else in Love Lists) or an updater function (needed by
  // ReferenceDocsModal — shared with Job Lists, where onUpdateJob is
  // function-style). The function form resolves against the list as it
  // truly is inside setLists's own updater, not the `list` prop a modal
  // last saw — same fix Job Lists already has for a rapid multi-file
  // upload, where a second upload's stale closure could otherwise
  // silently overwrite the first one's just-added document.
  // Same idea as Job Lists' applyJobUpdate/undoStack: every edit snapshots
  // the list first (minus its own undoStack, so undo entries don't nest),
  // keeping the last MAX_LIST_UNDO_ENTRIES. Love Lists has no activityLog
  // to borrow a label from like jobs do, so describeListChange diffs the
  // before/after to produce one instead.
  const MAX_LIST_UNDO_ENTRIES = 3;
  const applyListUpdate = (list, nextList) => {
    if (nextList === list) return nextList;
    const { undoStack: _priorUndoStack, ...snapshot } = list;
    const entry = { id: uniqueId(), time: timeStamp(), label: describeListChange(list, nextList), snapshot };
    return {
      ...nextList,
      undoStack: [entry, ...(list.undoStack || [])].slice(0, MAX_LIST_UNDO_ENTRIES),
    };
  };

  const handleUpdateList = (updatedOrUpdater) => {
    if (!isEditor) return;
    updateLists((prev) =>
      prev.map((l) => {
        if (typeof updatedOrUpdater === "function") {
          return l.id === activeListId ? applyListUpdate(l, updatedOrUpdater(l)) : l;
        }
        return l.id === updatedOrUpdater.id ? applyListUpdate(l, updatedOrUpdater) : l;
      })
    );
  };

  // Bypasses applyListUpdate above on purpose — restoring a snapshot isn't
  // itself a new action to record, it's un-recording the most recent one.
  const undoLastListAction = (listId) => {
    updateLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        const stack = l.undoStack || [];
        if (stack.length === 0) return l;
        const [mostRecent, ...rest] = stack;
        return { ...mostRecent.snapshot, undoStack: rest };
      })
    );
  };

  // One write instead of N individual ones — matters here specifically
  // since this is meant for clearing out a pile of accumulated
  // "Needs Attention"/no-longer-relevant lists in one go, not archiving
  // a single list at a time. Coerces both sides to strings before
  // comparing — list.id is a number (uniqueId() returns one), but the
  // ids arriving here came through an object's keys at some point
  // (Object.keys/Object.fromEntries, used to track which checkboxes are
  // selected), and object keys are always strings even when built from
  // numbers. Comparing a Set of strings against a raw number id would
  // silently match nothing at all — string vs number is never `===`.
  const handleBulkArchiveLists = (ids) => {
    if (!isEditor || !ids || ids.length === 0) return;
    const idSet = new Set(ids.map(String));
    updateLists((prev) =>
      prev.map((l) => (idSet.has(String(l.id)) ? { ...l, archived: true } : l))
    );
  };

  const handleDeleteList = (id) => {
    if (!isOwner) return;
    // Sweep every photo attached to this list out of storage before the
    // list record itself goes away — otherwise the files just sit there
    // forever, invisible in the app but still counting against storage.
    const target = lists.find((l) => l.id === id);
    if (target) {
      const urls = [
        ...(target.scanImageUrl ? [target.scanImageUrl] : []),
        ...(target.referenceImages || []),
      ];
      urls.forEach((url) => {
        const path = storagePathFromPublicUrl(url);
        if (path) deleteReferenceDocument(path);
      });
    }
    updateLists((prev) => prev.filter((l) => l.id !== id));
    setActiveListId(null);
  };

  const describeLoveItem = (item) =>
    `${item.qty ?? "—"}${item.qtyUnit ? ` ${item.qtyUnit}` : ""} · ${loveStatusMeta(item.status).label}${
      item.archived ? " · archived" : ""
    }${item.notes ? ` · "${item.notes}"` : ""}`;
  const describeLoveConflict = (c, side) => {
    const v = c[side];
    const who = side === "mine" ? "you" : "elsewhere";
    if (c.kind === "item") return v === null ? `Deleted (by ${who})` : describeLoveItem(v);
    if (c.subtype === "deletion") {
      return v === null ? `Deleted (by ${who})` : `Keep this list${side === "mine" ? " (with your changes)" : ""}`;
    }
    return (c.keys || [])
      .map((k) => `${k}: ${v[k] === undefined || v[k] === "" ? "(empty)" : JSON.stringify(v[k])}`)
      .join(" · ");
  };
  const describeLoveConflictTitle = (c) => {
    if (c.kind === "item") return `${c.listName} — ${(c.mine || c.theirs || c.base)?.name || "item"}`;
    if (c.subtype === "deletion") return `List: ${listDisplayLabel(c.mine || c.theirs || c.base)}`;
    return `List: ${c.listName}`;
  };

  const loveMergeModal = loveMerge && (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-amber-600/50 rounded-lg w-full max-w-lg max-h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-slate-100 font-semibold mb-1">A few things changed on both sides</h3>
          <p className="text-xs text-slate-400">
            Someone changed these Love Lists on another device while you were editing. Everything
            else merged automatically. Only these {loveMerge.conflicts.length} need a decision:
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loveMerge.conflicts.map((c, idx) => (
            <div key={idx} className="border border-slate-800 rounded-md p-3">
              <p className="text-sm text-slate-100 font-semibold mb-2">{describeLoveConflictTitle(c)}</p>
              <div className="space-y-1.5">
                {["mine", "theirs"].map((side) => (
                  <label key={side} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      checked={c.resolution === side}
                      onChange={() =>
                        setLoveMerge((prev) => ({
                          ...prev,
                          conflicts: prev.conflicts.map((x, i) => (i === idx ? { ...x, resolution: side } : x)),
                        }))
                      }
                      className="mt-0.5 accent-amber-500"
                    />
                    <span className="text-slate-300">
                      <span className={`${side === "mine" ? "text-amber-400" : "text-sky-400"} font-medium`}>
                        {side === "mine" ? "Your version: " : "Their version: "}
                      </span>
                      {describeLoveConflict(c, side)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          {loveMerge.error && <p className="text-xs text-red-400 mb-2">{loveMerge.error}</p>}
          <button
            onClick={() => loveEngineRef.current.submitResolutions(loveMerge.conflicts)}
            disabled={loveMergeSubmitting}
            className="w-full flex items-center justify-center gap-2 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loveMergeSubmitting && (
              <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            )}
            {loveMergeSubmitting ? "Saving..." : "Apply and sync"}
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
            <X className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Couldn't load your Love Lists</h2>
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

  if (activeList) {
    return (
      <>
      {remoteNotice && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-3 py-2 shadow-lg">
          🔄 {remoteNotice}
        </div>
      )}
      {loveMergeModal}
      <LoveListDetailPage
        list={activeList}
        catalog={catalog}
        allLists={lists}
        isEditor={isEditor}
        isOwner={isOwner}
        workers={workers}
        workerTasks={workerTasks}
        staleThresholds={staleThresholds}
        onAssignToWorker={assignItemToWorker}
        onUnassignWorkerTask={unassignWorkerTask}
        onUpdateList={handleUpdateList}
        onDeleteList={handleDeleteList}
        onLearnAlias={learnCatalogAlias}
        onSyncToolsFromItem={syncToolsFromLoveListItem}
        onAddToLoveTaskList={(addedItems) => addToLoveTaskList(activeList, addedItems)}
        onUndoLastAction={() => undoLastListAction(activeList.id)}
        onBack={() => setActiveListId(null)}
        onQuickNav={onQuickNav}
        locked={lockedToDeepLink}
        initialItemSearch={jobOverviewReturnSearch}
      />
      </>
    );
  }

  if (viewingJobLabel) {
    return (
      <LoveListJobOverviewPage
        jobLabel={viewingJobLabel}
        lists={lists}
        onBack={() => setViewingJobLabel(null)}
        onOpenItem={(list, item) => {
          setJobOverviewReturnSearch(item.name);
          setActiveListId(list.id);
          setViewingJobLabel(null);
        }}
        onQuickNav={onQuickNav}
      />
    );
  }

  return (
    <>
      {remoteNotice && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-3 py-2 shadow-lg">
          🔄 {remoteNotice}
        </div>
      )}
      {loveMergeModal}
      <LoveListsDashboard
        lists={lists}
        isEditor={isEditor}
        isOwner={isOwner}
        staleThresholds={staleThresholds}
        onSaveThresholds={saveStaleThresholds}
        onOpenList={(l) => setActiveListId(l.id)}
        onAddList={() => setShowAddForm(true)}
        onScanList={() => setShowScanModal(true)}
        onOpenWorkerTasks={() => setShowWorkerTasks(true)}
        onOpenTaskList={() => setShowLoveTaskList(true)}
        taskListCount={loveTaskList.filter((e) => !e.done).length}
        onBulkArchiveLists={handleBulkArchiveLists}
        onRestoreBackup={handleRestoreFileChosen}
        restoreError={restoreError}
        restoreSuccessCount={restoreSuccessCount}
        onGoHome={onGoHome}
        onQuickNav={onQuickNav}
        onViewJobOverview={setViewingJobLabel}
      />
      {showAddForm && isEditor && (
        <LoveListAddForm catalog={catalog} allLists={lists} onLearnAlias={learnCatalogAlias} onSave={handleSaveNewList} onCancel={() => setShowAddForm(false)} />
      )}
      {showScanModal && isEditor && (
        <LoveListScanModal
          catalog={catalog}
          onLearnAlias={learnCatalogAlias}
          onSave={handleSaveNewList}
          onCancel={() => setShowScanModal(false)}
        />
      )}
      {showWorkerTasks && isEditor && (
        <WorkerTasksSection
          onClose={() => {
            setShowWorkerTasks(false);
            reloadWorkerData();
          }}
        />
      )}
      {showLoveTaskList && (
        <LoveTaskListModal
          entries={loveTaskList}
          lists={lists}
          isEditor={isEditor}
          onToggleDone={toggleLoveTaskDone}
          onRemove={removeLoveTaskEntry}
          onClearDone={clearDoneLoveTasks}
          onClearAll={clearAllLoveTasks}
          onClose={() => setShowLoveTaskList(false)}
        />
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
              This file has {restorePending.loveLists.length} list
              {restorePending.loveLists.length === 1 ? "" : "s"}
              {restorePending.exportedAt
                ? `, backed up ${new Date(restorePending.exportedAt).toLocaleString()}`
                : ""}
              .
            </p>
            <p className="text-sm text-slate-400 mb-4">
              This replaces everything currently saved ({lists.length} list{lists.length === 1 ? "" : "s"}{" "}
              right now).
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
    </>
  );
}
