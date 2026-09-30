import { useState, useEffect } from "react";
import { ChevronLeft, AlertTriangle, X } from "lucide-react";
import { getWithRetry, saveWithRetry, JOBS_KEY } from "../lib/api";
import { LOVE_LISTS_KEY } from "../lib/lovelists";
import { ConfirmDelete } from "../components/shared";

// One place to see everything currently on backorder, across every job
// and every Love List at once, sorted by how long it's been waiting.
// Read-only — this is a look-back view, not another place to edit
// inventory; go to the actual job or Love List for that.
export function BackorderDashboard({ onGoHome }) {
  const [jobs, setJobs] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(false);
  const [clearTarget, setClearTarget] = useState(null); // a single row, while confirming
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [jResult, lResult] = await Promise.all([
          getWithRetry(JOBS_KEY),
          getWithRetry(LOVE_LISTS_KEY),
        ]);
        if (jResult.ok && jResult.value) setJobs(JSON.parse(jResult.value));
        if (lResult.ok && lResult.value) setLists(JSON.parse(lResult.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Zeroes out backorderQty (and its date) on the actual underlying job
  // or Love List item — this is a real write, not just hiding the row,
  // since these entries can genuinely be wrong (like ones generated
  // before the out-of-order-scan fix) and need to actually go away.
  const clearOne = (row) => {
    if (row.targetType === "job") {
      const nextJobs = jobs.map((j) => {
        if (j.id !== row.jobId) return j;
        return {
          ...j,
          items: j.items.map((i) =>
            i.id === row.itemId ? { ...i, backorderQty: 0, backorderReceiptDate: null } : i
          ),
        };
      });
      setJobs(nextJobs);
      saveWithRetry(JOBS_KEY, JSON.stringify(nextJobs)).catch(() => {});
    } else {
      const nextLists = lists.map((l) => {
        if (l.id !== row.listId) return l;
        return {
          ...l,
          items: l.items.map((i) =>
            i.id === row.itemId ? { ...i, backorderQty: 0, backorderReceiptDate: null } : i
          ),
        };
      });
      setLists(nextLists);
      saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(nextLists)).catch(() => {});
    }
  };

  // Clears every row currently matching the search — this is what makes
  // "clear all the 3052 ones" a single action: search "3052", then wipe
  // everything that's actually showing, rather than tapping each one.
  const clearAllShown = (rowsToClear) => {
    const jobItemIds = {}; // jobId -> Set of itemIds to clear
    const listItemIds = {}; // listId -> Set of itemIds to clear
    rowsToClear.forEach((r) => {
      if (r.targetType === "job") {
        (jobItemIds[r.jobId] = jobItemIds[r.jobId] || new Set()).add(r.itemId);
      } else {
        (listItemIds[r.listId] = listItemIds[r.listId] || new Set()).add(r.itemId);
      }
    });
    if (Object.keys(jobItemIds).length > 0) {
      const nextJobs = jobs.map((j) => {
        const ids = jobItemIds[j.id];
        if (!ids) return j;
        return {
          ...j,
          items: j.items.map((i) =>
            ids.has(i.id) ? { ...i, backorderQty: 0, backorderReceiptDate: null } : i
          ),
        };
      });
      setJobs(nextJobs);
      saveWithRetry(JOBS_KEY, JSON.stringify(nextJobs)).catch(() => {});
    }
    if (Object.keys(listItemIds).length > 0) {
      const nextLists = lists.map((l) => {
        const ids = listItemIds[l.id];
        if (!ids) return l;
        return {
          ...l,
          items: l.items.map((i) =>
            ids.has(i.id) ? { ...i, backorderQty: 0, backorderReceiptDate: null } : i
          ),
        };
      });
      setLists(nextLists);
      saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(nextLists)).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  // One flat list, pulled from every job and every Love List at once —
  // the whole point is not having to check each one individually.
  const rows = [];
  jobs
    .filter((j) => !j.archived && !j.isQuickTransfer)
    .forEach((j) => {
      (j.items || []).forEach((i) => {
        if (i.backorderQty > 0) {
          rows.push({
            targetType: "job",
            jobId: j.id,
            itemId: i.id,
            targetName: j.name,
            itemName: i.name,
            qty: i.backorderQty,
            unit: i.qtyUnit || "",
            date: i.backorderReceiptDate || null,
          });
        }
      });
    });
  lists
    .filter((l) => !l.archived)
    .forEach((l) => {
      (l.items || []).forEach((i) => {
        if (i.backorderQty > 0) {
          rows.push({
            targetType: "love_list",
            listId: l.id,
            itemId: i.id,
            targetName: `${l.jobLabel}${l.subJobLabel ? ` — ${l.subJobLabel}` : ""}`,
            itemName: i.name,
            qty: i.backorderQty,
            unit: i.qtyUnit || "",
            date: i.backorderReceiptDate || null,
          });
        }
      });
    });

  const filtered = rows
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${r.targetName} ${r.itemName}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Undated rows (older items that predate backorder-date tracking)
      // sort to the bottom either way, rather than being scattered
      // through the middle by string comparison.
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return sortNewestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });

  const daysAgo = (dateStr) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr + "T00:00:00").getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
        <p className="font-semibold flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Backorders ({filtered.length})
        </p>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex gap-2 mb-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item or job/list name..."
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <button
            onClick={() => setSortNewestFirst((v) => !v)}
            className="text-xs rounded-md px-3 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 whitespace-nowrap"
          >
            {sortNewestFirst ? "Newest first" : "Oldest first"}
          </button>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() => setConfirmingClearAll(true)}
            className="text-xs text-slate-500 hover:text-red-400 mb-4 block"
          >
            Clear all {filtered.length} shown
          </button>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            {rows.length === 0
              ? "Nothing on backorder anywhere right now."
              : "Nothing matches that search."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r, idx) => {
              const age = daysAgo(r.date);
              return (
                <div key={idx} className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-100 truncate">{r.itemName}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-red-300">
                        {r.qty}
                        {r.unit ? ` ${r.unit}` : ""}
                      </span>
                      <button
                        onClick={() => setClearTarget(r)}
                        title="Clear this backorder"
                        className="text-slate-600 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.targetType === "job" ? "Job" : "Love List"} · {r.targetName}
                    {age !== null && (
                      <>
                        {" · "}
                        <span className={age > 21 ? "text-amber-400" : ""}>
                          {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {clearTarget && (
          <ConfirmDelete
            title="Clear this backorder?"
            message={`"${clearTarget.itemName}" (${clearTarget.qty}${
              clearTarget.unit ? ` ${clearTarget.unit}` : ""
            }) will be zeroed out on ${clearTarget.targetName}. This doesn't touch how much you actually have on hand — only the outstanding-backorder number. This can't be undone.`}
            onConfirm={() => {
              clearOne(clearTarget);
              setClearTarget(null);
            }}
            onCancel={() => setClearTarget(null)}
          />
        )}

        {confirmingClearAll && (
          <ConfirmDelete
            title={`Clear all ${filtered.length} shown?`}
            message="Every backorder entry currently matching your search gets zeroed out. This doesn't touch how much you actually have on hand — only the outstanding-backorder number. This can't be undone."
            onConfirm={() => {
              clearAllShown(filtered);
              setConfirmingClearAll(false);
            }}
            onCancel={() => setConfirmingClearAll(false)}
          />
        )}
      </main>
    </div>
  );
}
