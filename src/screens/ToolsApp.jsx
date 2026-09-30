import { useState, useEffect, useRef } from "react";
import {
  X,
  Archive,
  Camera,
  ChevronLeft,
  Download,
  History,
  ListChecks,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { CATALOG_KEY, JOBS_KEY, deleteReferenceDocument, extractPdfRows, getWithRetry, saveWithRetry, uploadReferenceDocument } from "../lib/api";
import {
  TOOLS_KEY,
  TOOL_STATUSES,
  applyToolMerge,
  applyToolsBackfill,
  attachSerialNumbers,
  awaitingSmeNamesMatch,
  findBackfillCandidates,
  isToolCandidate,
  logToolEvent,
  parseSmeItemSerialCsv,
  parseSmeItemSerialTable,
  parseSmeSerialLines,
  toolStatusLabel,
} from "../lib/tools";
import { uniqueId } from "../lib/utils";
import { formatTaskTimestamp } from "../lib/workertasks";
import { AddToolModal, ConfirmDelete, ZoomableImage } from "../components/shared";

// Tools registry, phase 1: a permanent record per physical tool (keyed
// by SME#), separate from any one job's item list, so "have I seen this
// number before, and where's it been" is a search instead of a dig
// through old receipt photos. Manual add/browse/search/history only in
// this phase — auto-linking SME#s typed elsewhere in the app, and
// backfilling tools already sitting on current jobs, are later phases.
export function ToolsApp({ onGoHome, isOwner }) {
  const [tools, setTools] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addingTool, setAddingTool] = useState(false);
  const [viewingToolId, setViewingToolId] = useState(null);
  const [managingTransferTags, setManagingTransferTags] = useState(false);
  const [importingSerials, setImportingSerials] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const toolsRef = useRef([]);

  useEffect(() => {
    // Same reasoning as Receiving/Receipt Archive: no view-only mode of
    // its own, and the landing screen hiding its tile is just a hidden
    // button, not real protection — this screen is also reachable via a
    // manager's own login or a crafted ?section=tools&id=... link.
    if (!isOwner) return;
    (async () => {
      try {
        const [toolsResult, catalogResult] = await Promise.all([
          getWithRetry(TOOLS_KEY),
          getWithRetry(CATALOG_KEY),
        ]);
        if (toolsResult.ok && toolsResult.value) {
          const loaded = JSON.parse(toolsResult.value);
          setTools(loaded);
          toolsRef.current = loaded;
        }
        if (catalogResult.ok && catalogResult.value) setCatalog(JSON.parse(catalogResult.value));
      } catch {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const saveTools = (next) => {
    toolsRef.current = next;
    setTools(next);
    saveWithRetry(TOOLS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const toggleCatalogToolExclusion = (catalogId) => {
    setCatalog((prev) => {
      const next = prev.map((c) =>
        c.id === catalogId ? { ...c, excludeFromTools: !c.excludeFromTools } : c
      );
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const updateTool = (id, updater) => {
    saveTools(toolsRef.current.map((t) => (t.id === id ? updater(t) : t)));
  };

  const deleteTool = (id) => {
    saveTools(toolsRef.current.filter((t) => t.id !== id));
  };

  const searchLower = search.trim().toLowerCase();
  const filtered = tools
    .filter((t) => statusFilter === "all" || t.status === statusFilter)
    .filter(
      (t) =>
        !searchLower ||
        (t.sme || "").toLowerCase().includes(searchLower) ||
        (t.name || "").toLowerCase().includes(searchLower) ||
        (t.currentJobName || "").toLowerCase().includes(searchLower)
    )
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const viewingTool = tools.find((t) => t.id === viewingToolId) || null;

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Owner only</h2>
          <p className="text-sm text-slate-500 mb-5">Tools isn't available on this account.</p>
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
        <div className="w-6 h-6 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (viewingTool) {
    return (
      <ToolDetailPage
        tool={viewingTool}
        allTools={tools}
        onUpdate={(updater) => updateTool(viewingTool.id, updater)}
        onMerge={(sourceId, targetId) => {
          saveTools(applyToolMerge(toolsRef.current, sourceId, targetId));
          setViewingToolId(targetId);
        }}
        onDelete={() => {
          deleteTool(viewingTool.id);
          setViewingToolId(null);
        }}
        onBack={() => setViewingToolId(null)}
        onGoHome={onGoHome}
      />
    );
  }

  if (managingTransferTags) {
    return (
      <TransferTagsManagerPage
        catalog={catalog}
        onToggleExclude={toggleCatalogToolExclusion}
        onBack={() => setManagingTransferTags(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between flex-wrap gap-y-3 sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-slate-100 flex items-center gap-2">
              <Wrench className="w-4.5 h-4.5 text-slate-400" />
              Tools
            </h1>
            <p className="text-xs text-slate-500">SME# registry — search by number, name, or job</p>
          </div>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setImportingSerials(true)}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Upload className="w-4 h-4" />
            Import serial #s
          </button>
          <button
            onClick={() => setManagingTransferTags(true)}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <ListChecks className="w-4 h-4" />
            Transfer-tagged items
          </button>
          <button
            onClick={() => setBackfilling(true)}
            className="flex items-center gap-1.5 text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="w-4 h-4" />
            Backfill from jobs
          </button>
          <button
            onClick={() => setAddingTool(true)}
            className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
          >
            <Plus className="w-4 h-4" />
            Add tool
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SME #, item name, or job..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />

        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={`text-xs rounded-full px-3 py-1.5 border whitespace-nowrap ${
              statusFilter === "all"
                ? "bg-slate-700 border-slate-500 text-slate-100"
                : "border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({tools.length})
          </button>
          {Object.entries(TOOL_STATUSES).map(([key, meta]) => {
            const count = tools.filter((t) => t.status === key).length;
            if (count === 0 && statusFilter !== key) return null;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`text-xs rounded-full px-3 py-1.5 border whitespace-nowrap ${
                  statusFilter === key
                    ? meta.color
                    : "border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">
            {tools.length === 0
              ? "No tools in the registry yet — tap \"Add tool\" to start tracking one."
              : `Nothing matches "${search}".`}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setViewingToolId(tool.id)}
                className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 truncate">
                    {tool.name || "Unnamed tool"}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    {tool.sme ? `SME# ${tool.sme}` : "No SME# yet"}
                    {tool.currentJobName && tool.status !== "staged" && tool.status !== "on_job"
                      ? ` · ${tool.currentJobName}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`text-[10px] rounded-full px-2 py-1 border shrink-0 ${TOOL_STATUSES[tool.status]?.color || ""}`}
                >
                  {toolStatusLabel(tool)}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {addingTool && (
        <AddToolModal
          onSave={(newTools) => {
            saveTools([...newTools, ...toolsRef.current]);
            setAddingTool(false);
            // No single detail page to jump to anymore now that this can
            // create several tools at once — back to the list, where
            // everything just added shows up at the top (sorted newest
            // first) so they're easy to spot and open individually.
          }}
          onClose={() => setAddingTool(false)}
        />
      )}

      {importingSerials && (
        <ImportSerialNumbersModal
          tools={tools}
          onSave={(updatedTools) => {
            saveTools(updatedTools);
            setImportingSerials(false);
          }}
          onClose={() => setImportingSerials(false)}
        />
      )}

      {backfilling && (
        <ToolsBackfillModal
          tools={tools}
          catalog={catalog}
          onSave={(updatedTools) => {
            saveTools(updatedTools);
            setBackfilling(false);
          }}
          onClose={() => setBackfilling(false)}
        />
      )}
    </div>
  );
}

// Phase 3 — scans every job at once (per Bryan's call: one pass from
// here rather than a button on each individual job page) for SME#s that
// are already sitting on job items from before the registry existed.
// Loads jobs fresh on open rather than keeping them in ToolsApp's own
// state permanently — this modal is the only place in the Tools section
// that ever needs the full job list, and jobs can be a large blob not
// worth carrying around the rest of the time. Candidates come from
// findBackfillCandidates (read-only) and nothing is written to the
// registry until Bryan reviews the list and confirms — same
// review-before-commit shape as ImportSerialNumbersModal.
function ToolsBackfillModal({ tools, catalog, onSave, onClose }) {
  const [step, setStep] = useState("loading"); // "loading" | "review" | "error"
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const jobsResult = await getWithRetry(JOBS_KEY);
        const jobs = jobsResult.ok && jobsResult.value ? JSON.parse(jobsResult.value) : [];
        const found = findBackfillCandidates(jobs, catalog, tools).map((c) => ({
          ...c,
          id: uniqueId(),
        }));
        setCandidates(found);
        setStep("review");
      } catch (err) {
        setError(err && err.message ? err.message : String(err));
        setStep("error");
      }
    })();
    // Only needs to run once, on open — catalog/tools are a snapshot
    // taken at the moment Bryan opened this, same as everywhere else in
    // the app a review list is built from a point-in-time read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeCandidate = (id) => setCandidates((prev) => prev.filter((c) => c.id !== id));

  const byJob = candidates.reduce((acc, c) => {
    (acc[c.jobName] = acc[c.jobName] || []).push(c);
    return acc;
  }, {});

  const handleConfirm = () => {
    const updated = applyToolsBackfill(tools, candidates);
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-lg max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Backfill from jobs</h2>
            <p className="text-xs text-slate-500">SME#s already on jobs, never synced to the registry</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">Scanning every job...</p>
          </div>
        )}

        {step === "error" && (
          <div className="flex-1 overflow-y-auto px-5 py-8 text-center">
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="text-sm rounded-md px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-slate-500 mb-3">
                {candidates.length === 0
                  ? "Nothing found — every tool-tagged SME# already on a job is already in the registry."
                  : `${candidates.length} SME# ${candidates.length === 1 ? "isn't" : "aren't"} in the registry yet, found across ${Object.keys(byJob).length} job${Object.keys(byJob).length === 1 ? "" : "s"}.`}
              </p>
              {Object.entries(byJob).map(([jobName, rows]) => (
                <div key={jobName} className="mb-4">
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">{jobName}</p>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className="border border-slate-800 rounded-lg p-2.5 bg-slate-800/40 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-slate-300 truncate">
                            SME# {row.sme}
                            <span className="text-slate-500 font-sans"> · {row.itemName || "Unnamed item"}</span>
                          </p>
                          <span
                            className={`inline-block mt-1 text-[10px] rounded-full px-2 py-0.5 border ${TOOL_STATUSES[row.status]?.color || ""}`}
                          >
                            will be added as: {toolStatusLabel({ status: row.status, currentJobName: row.jobName })}
                          </span>
                        </div>
                        <button
                          onClick={() => removeCandidate(row.id)}
                          className="text-slate-500 hover:text-red-400 p-1 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <button
                onClick={handleConfirm}
                disabled={candidates.length === 0}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
              >
                Add {candidates.length} tool{candidates.length === 1 ? "" : "s"} to the registry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Handles both real shapes a receipt actually shows up in — 5 of the
// same die grinder on one receipt, or a mixed batch of 10+ different
// tools on one receipt — without making either case mean re-uploading
// the same photo over and over. The receipt (if any) is uploaded once,
// up front, shared by everything this batch creates; the rows below it
// are where each actual item/quantity/SME# gets entered, as many as the
// receipt actually has.
// Lets Bryan review every catalog item currently carrying the Transfer
// tag and decide, per item, whether it should actually be recognized as
// a Tools candidate — the exceptions (angle wings, weld lead, air arcs,
// per his own examples) that need real transfer tracking but are never
// individually engraved with an SME#, so treating them as a tool
// candidate on every incoming receipt would just be noise. Toggling
// here never touches the item's actual Transfer tag — that keeps
// working for transfer tracking exactly as it always has — this only
// controls whether isToolCandidate() picks it up.
function TransferTagsManagerPage({ catalog, onToggleExclude, onBack }) {
  const [search, setSearch] = useState("");
  const transferTagged = catalog
    .filter((c) => c.needsTransfer)
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-100 truncate">Transfer-tagged items</h1>
            <p className="text-xs text-slate-500">Decide which ones actually get tracked as Tools</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          Every catalog item below is tagged Transfer, so all of them show up on a normal transfer
          list — that never changes here. This only controls whether an item gets recognized as a
          tool candidate when sending items over from a scanned receipt (for things like angle
          wings or weld lead that need transfer tracking but are never individually engraved).
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Transfer-tagged items..."
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />
        {transferTagged.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">
            {catalog.some((c) => c.needsTransfer)
              ? `Nothing matches "${search}".`
              : "No catalog items are tagged Transfer yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {transferTagged.map((c) => (
              <div
                key={c.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <p className="text-sm text-slate-100 min-w-0 truncate">{c.name}</p>
                <button
                  onClick={() => onToggleExclude(c.id)}
                  className={`text-xs rounded-full px-3 py-1.5 border shrink-0 ${
                    c.excludeFromTools
                      ? "border-slate-700 text-slate-500 hover:text-slate-300"
                      : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  }`}
                >
                  {c.excludeFromTools ? "Excluded from Tools" : "Tracked as a Tool"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// PDF-only for now (the reliable, text-extraction path — see
// extractPdfLines) since that's the format actually being handed over;
// CSV/Excel would work just as well through the same parseSmeSerialLines
// logic if that ever comes up instead. Supports picking several files
// at once ("I have quite a few of these") — every row across every file
// lands in one combined review list rather than needing to repeat this
// per file.
function ImportSerialNumbersModal({ tools, onSave, onClose }) {
  const [step, setStep] = useState("upload"); // "upload" | "processing" | "review" | "error"
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const fileInputRef = useRef(null);

  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setStep("processing");
    setError("");
    try {
      const allRows = [];
      for (const file of files) {
        const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
        if (isCsv) {
          const text = await file.text();
          allRows.push(...parseSmeItemSerialCsv(text));
        } else {
          const pdfRows = await extractPdfRows(file);
          allRows.push(...parseSmeItemSerialTable(pdfRows));
        }
      }
      if (allRows.length === 0) {
        throw new Error(
          "Couldn't find any SME#/Serial# pairs in that file — a PDF may be a scanned image rather than real text, or a CSV's header row doesn't have recognizable SME/Item/Serial column names."
        );
      }
      setRows(
        allRows.map((r) => ({
          id: uniqueId(),
          sme: r.sme,
          serial: r.serial,
          nameGuess: r.nameGuess,
        }))
      );
      setStep("review");
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
      setStep("error");
    }
  };

  const updateRow = (id, changes) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  };
  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Previews exactly what handleConfirm/attachSerialNumbers will actually
  // do — including the same one-to-one, first-come claim on an
  // awaiting-SME# tool by name — so this screen doesn't tell someone "will
  // create" for a row that's really about to fill in the receiving record
  // they already have sitting there.
  const rowPreviews = (() => {
    const claimed = new Set();
    return rows.map((row) => {
      const sme = (row.sme || "").trim();
      const existing = tools.find((t) => t.sme === sme);
      if (existing) return { row, kind: "existing", match: existing };
      const rowName = (row.name || row.nameGuess || "").trim();
      const awaitingMatch = rowName
        ? tools.find(
            (t) =>
              t.status === "awaiting_sme" &&
              !t.sme &&
              !claimed.has(t.id) &&
              awaitingSmeNamesMatch(t.name || "", rowName)
          )
        : null;
      if (awaitingMatch) {
        claimed.add(awaitingMatch.id);
        return { row, kind: "awaiting_match", match: awaitingMatch };
      }
      return { row, kind: "new" };
    });
  })();
  const newCount = rowPreviews.filter((p) => p.kind === "new").length;

  const handleConfirm = () => {
    const updated = attachSerialNumbers(tools, rows);
    onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-lg max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Import serial numbers</h2>
            <p className="text-xs text-slate-500">PDF or CSV — reads real text, no OCR guessing on the numbers</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "upload" && (
          <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center justify-center text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.csv,text/csv"
              multiple
              onChange={handleFilesChosen}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 mb-4 max-w-xs">
              PDF or CSV, mixed together is fine — pick as many of these files as you've got at
              once, and every row lands in one review list before anything's saved. A CSV
              exported straight from Google Sheets (File → Download → CSV) reads its Item column
              exactly, no guessing needed there.
            </p>
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="text-sm rounded-md px-4 py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              Choose file(s)
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-400">Reading...</p>
          </div>
        )}

        {step === "error" && (
          <div className="flex-1 overflow-y-auto px-5 py-8 text-center">
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={() => setStep("upload")}
              className="text-sm rounded-md px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-slate-500 mb-3">
                {rows.length} row{rows.length === 1 ? "" : "s"} found
                {newCount > 0 &&
                  ` — ${newCount} SME# ${newCount === 1 ? "isn't" : "aren't"} in the registry yet and will be added as new tools`}
              </p>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">Nothing left to import.</p>
              ) : (
                <div className="space-y-2">
                  {rowPreviews.map(({ row, kind, match }) => {
                    return (
                      <div key={row.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-800/40">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono text-slate-400 shrink-0">
                            SME# {row.sme}
                          </span>
                          <span className="text-slate-600 shrink-0">→</span>
                          <input
                            value={row.serial}
                            onChange={(e) => updateRow(row.id, { serial: e.target.value })}
                            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-xs font-mono rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                          />
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-slate-500 hover:text-red-400 p-1 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {kind === "existing" ? (
                          <p className="text-[11px] text-emerald-400">
                            🔗 {match.name || "Unnamed tool"} — {toolStatusLabel(match)}
                          </p>
                        ) : kind === "awaiting_match" ? (
                          <p className="text-[11px] text-emerald-400">
                            🔗 Matched by name to "{match.name}" — Awaiting SME# (from receiving)
                          </p>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-amber-400 shrink-0">No existing tool — will create:</span>
                            <input
                              value={row.nameGuess}
                              onChange={(e) => updateRow(row.id, { nameGuess: e.target.value })}
                              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <button
                onClick={handleConfirm}
                disabled={rows.length === 0}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
              >
                Attach {rows.length} serial number{rows.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolDetailPage({ tool, allTools = [], onUpdate, onMerge, onDelete, onBack, onGoHome }) {
  const [editingSme, setEditingSme] = useState(false);
  const [smeText, setSmeText] = useState(tool.sme || "");
  const [editingSerial, setEditingSerial] = useState(false);
  const [serialText, setSerialText] = useState(tool.serialNumber || "");
  const [nameText, setNameText] = useState(tool.name || "");
  const [jobText, setJobText] = useState(tool.currentJobName || "");
  const [notesText, setNotesText] = useState(tool.notes || "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const [mergeCandidate, setMergeCandidate] = useState(null); // other tool record already holding this SME#
  const fileInputRef = useRef(null);

  const saveSme = () => {
    const trimmed = smeText.trim();
    // Before committing a real change, check whether that SME# already
    // belongs to a different record — typing a number in doesn't mean
    // this is a brand-new tool if the registry already knows this
    // number from somewhere else (see mergeToolRecords). Only the
    // duplicate check blocks the save; anything else goes through as
    // before.
    if (trimmed && trimmed !== (tool.sme || "")) {
      const duplicate = allTools.find((t) => t.id !== tool.id && t.sme === trimmed);
      if (duplicate) {
        setMergeCandidate(duplicate);
        return;
      }
    }
    onUpdate((t) => {
      const wasAwaiting = !t.sme;
      const updated = { ...t, sme: trimmed || null };
      if (trimmed && wasAwaiting) {
        return {
          ...logToolEvent(updated, "sme_assigned", `SME# ${trimmed} assigned`),
          status: t.status === "awaiting_sme" ? "needs_engraving" : t.status,
        };
      }
      return updated;
    });
    setEditingSme(false);
  };

  const confirmMerge = () => {
    if (!mergeCandidate || !onMerge) return;
    onMerge(tool.id, mergeCandidate.id);
    setMergeCandidate(null);
    setEditingSme(false);
  };

  const saveSerial = () => {
    const trimmed = serialText.trim();
    onUpdate((t) => {
      if (t.serialNumber === (trimmed || null)) return t;
      return logToolEvent(
        { ...t, serialNumber: trimmed || null },
        "serial_attached",
        trimmed ? `Serial# ${trimmed} attached` : "Serial# removed"
      );
    });
    setEditingSerial(false);
  };

  const saveName = () => {
    if (!nameText.trim()) {
      setNameText(tool.name || "");
      return;
    }
    onUpdate((t) => ({ ...t, name: nameText.trim() }));
  };

  const saveNotes = () => {
    onUpdate((t) => ({ ...t, notes: notesText }));
  };

  const changeStatus = (newStatus) => {
    if (newStatus === tool.status) return;
    onUpdate((t) =>
      logToolEvent(
        { ...t, status: newStatus },
        "status_change",
        `Status changed to "${TOOL_STATUSES[newStatus]?.label || newStatus}"`
      )
    );
  };

  const moveToJob = () => {
    const trimmed = jobText.trim();
    onUpdate((t) => {
      const updated = { ...t, currentJobName: trimmed || null, status: trimmed ? "on_job" : t.status };
      return logToolEvent(
        updated,
        "moved",
        trimmed ? `Moved to "${trimmed}"` : "Removed from job (no job set)"
      );
    });
  };

  const handleReceiptChosen = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploadingReceipt(true);
    try {
      const result = await uploadReferenceDocument(tool.id, file);
      if (!result.ok) {
        setUploadError(result.error || "Upload failed");
      } else {
        onUpdate((t) =>
          logToolEvent(
            { ...t, receiptPath: result.path, receiptUrl: result.url },
            "receipt_attached",
            "Receipt photo attached"
          )
        );
      }
    } catch (err) {
      setUploadError(err && err.message ? err.message : String(err));
    }
    setUploadingReceipt(false);
  };

  const removeReceipt = async () => {
    if (tool.receiptPath) await deleteReferenceDocument(tool.receiptPath).catch(() => {});
    onUpdate((t) => logToolEvent({ ...t, receiptPath: null, receiptUrl: null }, "receipt_removed", "Receipt photo removed"));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-slate-100 truncate">{tool.name || "Unnamed tool"}</h1>
        </div>
        <button onClick={() => setConfirmingDelete(true)} className="text-slate-500 hover:text-red-400 shrink-0">
          <Trash2 className="w-4.5 h-4.5" />
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Item name</label>
          <input
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={saveName}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">SME #</label>
          {editingSme ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={smeText}
                onChange={(e) => setSmeText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveSme()}
                placeholder="e.g. 4821"
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                onClick={saveSme}
                className="text-sm rounded-md px-3 py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setSmeText(tool.sme || "");
                setEditingSme(true);
              }}
              className="text-sm font-mono text-slate-100 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 hover:border-slate-600 w-full text-left"
            >
              {tool.sme || <span className="text-amber-400 font-sans">Tap to enter SME# once it comes back</span>}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Serial # (manufacturer's own, separate from SME#)
          </label>
          {editingSerial ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={serialText}
                onChange={(e) => setSerialText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveSerial()}
                placeholder="e.g. 527668"
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                onClick={saveSerial}
                className="text-sm rounded-md px-3 py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setSerialText(tool.serialNumber || "");
                setEditingSerial(true);
              }}
              className="text-sm font-mono text-slate-100 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 hover:border-slate-600 w-full text-left"
            >
              {tool.serialNumber || <span className="text-slate-500 font-sans">Tap to add a serial number</span>}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TOOL_STATUSES).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => changeStatus(key)}
                className={`text-xs rounded-full px-3 py-1.5 border ${
                  tool.status === key ? meta.color : "border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Current job</label>
          <div className="flex gap-2">
            <input
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && moveToJob()}
              placeholder="Job name/number"
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={moveToJob}
              disabled={jobText.trim() === (tool.currentJobName || "")}
              className="text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Update
            </button>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Logs a "moved" entry below — this is a plain text field for now, not linked live to the
            actual job yet.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Original receipt</label>
          {tool.receiptUrl ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewingReceipt(true)}
                className="w-16 h-16 rounded-md overflow-hidden border border-slate-700 shrink-0"
              >
                <img src={tool.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
              </button>
              <button onClick={removeReceipt} className="text-xs text-slate-500 hover:text-red-400">
                Remove
              </button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleReceiptChosen}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={uploadingReceipt}
                className="text-sm flex items-center gap-1.5 rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {uploadingReceipt ? "Uploading..." : "Attach receipt photo"}
              </button>
              {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
            </>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onBlur={saveNotes}
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            History
          </label>
          <div className="space-y-2">
            {(tool.history || [])
              .slice()
              .reverse()
              .map((entry) => (
                <div key={entry.id} className="text-xs bg-slate-900 border border-slate-800 rounded-md px-3 py-2">
                  <p className="text-slate-300">{entry.note}</p>
                  <p className="text-slate-600 mt-0.5">{formatTaskTimestamp(entry.time)}</p>
                </div>
              ))}
          </div>
        </div>
      </main>

      {viewingReceipt && tool.receiptUrl && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
          onClick={() => setViewingReceipt(false)}
        >
          <button
            onClick={() => setViewingReceipt(false)}
            className="absolute top-4 right-4 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <ZoomableImage src={tool.receiptUrl} alt="Receipt" />
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDelete
          title="Delete this tool record?"
          message={`"${tool.name || "This tool"}"${tool.sme ? ` (SME# ${tool.sme})` : ""} and its whole history will be removed from the registry. This can't be undone.`}
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {mergeCandidate && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4"
          onClick={() => setMergeCandidate(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-slate-100 font-semibold text-base mb-2">Merge with existing tool?</h2>
            <p className="text-sm text-slate-400 mb-1">
              SME# {smeText.trim()} is already registered as{" "}
              <span className="text-slate-200">{mergeCandidate.name || "Unnamed tool"}</span> —{" "}
              {toolStatusLabel(mergeCandidate)}.
            </p>
            <p className="text-sm text-slate-400 mb-4">
              Merging keeps that record{tool.receiptPath ? ", carries this one's receipt over to it," : ""} and
              removes this duplicate entry. Its history is kept, not lost.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMergeCandidate(null)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmMerge}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
