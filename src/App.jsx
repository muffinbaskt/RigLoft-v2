import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  Package,
  Plus,
  X,
  Trash2,
  Pencil,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  History,
  Filter,
  Briefcase,
  Truck,
  Copy,
  Search,
  Download,
  ArrowUpDown,
  MoreVertical,
  Upload,
  BookOpen,
  Archive,
  CheckSquare,
  Printer,
  Layers,
  LogOut,
} from "lucide-react";

const STORAGE_OPTIONS = [
  "Red conex",
  "Inside",
  "Outside",
  "Covered",
  "Conex row",
  "Other",
  "Unassigned",
];
const DEFAULT_CONTAINER_OPTIONS = ["Gangbox 12345", "Printshack 67891", "Pallet", "Conex 20-01"];
const GANG_OPTIONS = ["Raising", "Bolt-up", "Plumb up", "Welding", "Safety", "Misc", "Unassigned"];
const STATUS_OPTIONS = [
  { value: "green", label: "Complete" },
  { value: "yellow", label: "Partial" },
  { value: "red", label: "None" },
];

const STATUS_DOT = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};

const GANG_COLOR = {
  Raising: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Bolt-up": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Plumb up": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Welding: "bg-red-500/15 text-red-300 border-red-500/30",
  Safety: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Misc: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  Unassigned: "bg-amber-500/10 text-amber-400 border-amber-600/40 border-dashed",
};

const JOB_COLORS = [
  { value: null, label: "None", dot: "bg-slate-600" },
  { value: "red", label: "Red", dot: "bg-red-500" },
  { value: "orange", label: "Orange", dot: "bg-orange-500" },
  { value: "amber", label: "Amber", dot: "bg-amber-500" },
  { value: "green", label: "Green", dot: "bg-emerald-500" },
  { value: "teal", label: "Teal", dot: "bg-teal-500" },
  { value: "blue", label: "Blue", dot: "bg-blue-500" },
  { value: "purple", label: "Purple", dot: "bg-purple-500" },
  { value: "pink", label: "Pink", dot: "bg-pink-500" },
];

const JOB_COLOR_BORDER = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  amber: "border-l-amber-500",
  green: "border-l-emerald-500",
  teal: "border-l-teal-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
  pink: "border-l-pink-500",
};

function timeStamp() {
  return new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function seedJob() {
  return {
    id: 1,
    name: "Sample Job",
    createdAt: timeStamp(),
    parentId: null,
    color: null,
    items: [
      {
        id: 1,
        name: "3/4in A325 Bolts",
        qtyNeeded: 400,
        qtyHave: 400,
        ordered: true,
        received: true,
        storage: "Red conex",
        containers: [{ name: "Conex 20-01", qty: 400 }],
        status: "green",
        gang: "Bolt-up",
        serials: [],
        needsTransfer: false,
        notes: "",
      },
      {
        id: 2,
        name: "Column Base Plates",
        qtyNeeded: 12,
        qtyHave: 5,
        ordered: true,
        received: false,
        storage: "Outside",
        containers: [{ name: "Gangbox 12345", qty: 5 }],
        status: "yellow",
        gang: "Raising",
        serials: [],
        needsTransfer: false,
        notes: "Check with foreman before pulling remaining 7.",
      },
      {
        id: 3,
        name: "7018 Welding Rod",
        qtyNeeded: 40,
        qtyHave: 0,
        ordered: false,
        received: false,
        storage: "Covered",
        containers: [],
        status: "red",
        gang: "Welding",
        serials: [],
        needsTransfer: false,
        notes: "",
      },
    ],
    containerOptions: DEFAULT_CONTAINER_OPTIONS,
    activityLog: [{ id: 1, time: timeStamp(), message: "Job created with 3 sample items." }],
  };
}

function newJob(name, parentId = null, color = null) {
  return {
    id: Date.now(),
    name,
    createdAt: timeStamp(),
    parentId,
    color,
    items: [],
    containerOptions: [],
    activityLog: [{ id: Date.now(), time: timeStamp(), message: `Job "${name}" created.` }],
  };
}

function diffItems(before, after) {
  const changes = [];
  if (before.name !== after.name) changes.push(`name → "${after.name}"`);
  if (Number(before.qtyNeeded) !== Number(after.qtyNeeded))
    changes.push(`qty needed → ${after.qtyNeeded}`);
  if ((before.qtyUnit || "") !== (after.qtyUnit || ""))
    changes.push(`unit → ${after.qtyUnit || "each"}`);
  if (Number(before.qtyHave) !== Number(after.qtyHave))
    changes.push(`qty have → ${after.qtyHave}`);
  if (before.ordered !== after.ordered) changes.push(`ordered → ${after.ordered ? "yes" : "no"}`);
  if (before.received !== after.received)
    changes.push(`received → ${after.received ? "yes" : "no"}`);
  if (before.storage !== after.storage) changes.push(`storage → ${after.storage}`);
  if ((before.storageDetail || "") !== (after.storageDetail || ""))
    changes.push(`storage detail → ${after.storageDetail || "(cleared)"}`);
  const beforeContainers = JSON.stringify(before.containers || []);
  const afterContainers = JSON.stringify(after.containers || []);
  if (beforeContainers !== afterContainers) {
    const summary = (after.containers || []).map((c) => `${c.name}: ${c.qty}`).join(", ");
    changes.push(`containers → ${summary || "(none)"}`);
  }
  if (before.status !== after.status) {
    const label = STATUS_OPTIONS.find((s) => s.value === after.status)?.label;
    changes.push(`status → ${label}`);
  }
  if (before.gang !== after.gang) changes.push(`gang → ${after.gang}`);
  if (before.needsTransfer !== after.needsTransfer)
    changes.push(`needs transfer → ${after.needsTransfer ? "yes" : "no"}`);
  const beforeSerials = (before.serials || []).join(", ");
  const afterSerials = (after.serials || []).join(", ");
  if (beforeSerials !== afterSerials)
    changes.push(`SME # → ${afterSerials || "(none)"}`);
  if ((before.notes || "") !== (after.notes || ""))
    changes.push(`notes → ${after.notes ? `"${after.notes}"` : "(cleared)"}`);
  return changes;
}

function parseSerials(text) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyItem(defaultStorage) {
  return {
    id: null,
    name: "",
    qtyNeeded: "",
    qtyUnit: "",
    qtyHave: 0,
    ordered: false,
    received: false,
    storage: defaultStorage,
    storageDetail: "",
    containers: [], // [{ name, qty }] — qtyHave is always the sum of these
    status: "red",
    gang: GANG_OPTIONS[0],
    serials: [],
    needsTransfer: false,
    notes: "",
  };
}

function totalHave(containers) {
  return (containers || []).reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
}

// Converts an old single-container item into the new breakdown-list shape.
// Safe to call on already-migrated items (returns them unchanged).
function migrateItemContainers(item) {
  if (Array.isArray(item.containers)) return item;
  const containers =
    item.container && Number(item.qtyHave) > 0
      ? [{ name: item.container, qty: Number(item.qtyHave) }]
      : [];
  return { ...item, containers, qtyHave: totalHave(containers) };
}

function singularize(word) {
  if (word.length <= 3) return word;
  // wrenches -> wrench, boxes -> box, classes -> class
  if (/(ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  // shackles -> shackle, chokers -> choker, tips -> tip
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function normalizeText(str) {
  const cleaned = str
    .trim()
    .toLowerCase()
    .replace(/(\d)\s*"/g, "$1in") // 3/4" -> 3/4in
    .replace(/(\d)\s*'/g, "$1ft") // 16' -> 16ft
    .replace(/(\d)\s*(inches|inch)\b/g, "$1in") // 3/4 inches -> 3/4in
    .replace(/(\d)\s*(feet|foot)\b/g, "$1ft") // 16 feet -> 16ft
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").map(singularize).join(" ");
}

function tokenSet(str) {
  return new Set(normalizeText(str).split(" ").filter(Boolean));
}

function findCatalogMatch(name, catalog) {
  const normName = normalizeText(name);
  if (!normName) return null;
  // Exact normalized match first
  let match = catalog.find((c) => normalizeText(c.name) === normName);
  if (match) return match;
  // Space-insensitive match: catches "Tagline" vs "Tag line" style differences
  const squashName = normName.replace(/\s+/g, "");
  match = catalog.find((c) => normalizeText(c.name).replace(/\s+/g, "") === squashName);
  if (match) return match;
  // Loose fallback: one name contains the other
  const candidates = catalog.filter((c) => {
    const cn = normalizeText(c.name);
    return cn.length > 2 && (normName.includes(cn) || cn.includes(normName));
  });
  if (candidates.length > 0) {
    // Prefer the closest length match (most specific)
    candidates.sort(
      (a, b) => Math.abs(a.name.length - name.length) - Math.abs(b.name.length - name.length)
    );
    return candidates[0];
  }
  // Token-overlap fallback: catches reordered words and extra descriptive
  // words on either side (e.g. "EZ 60 TC gun" vs "TC-60 (EZ 60)")
  const nameTokens = tokenSet(name);
  const tokenCandidates = catalog
    .map((c) => {
      const catTokens = tokenSet(c.name);
      let intersection = 0;
      for (const t of nameTokens) {
        if (catTokens.has(t)) intersection++;
      }
      const ratio = intersection / Math.min(nameTokens.size, catTokens.size || 1);
      return { c, intersection, ratio };
    })
    .filter((r) => r.intersection >= 2 && r.ratio >= 0.6)
    .sort((a, b) => b.ratio - a.ratio || b.intersection - a.intersection);
  return tokenCandidates.length > 0 ? tokenCandidates[0].c : null;
}

function parseImportText(text, catalog) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split("|").map((p) => p.trim());
      const namePart = parts[0] || "";
      const qtyPart = parts[1] || "";
      const orderedRaw = (parts[2] || "").toLowerCase();
      const ordered = ["yes", "y", "true"].includes(orderedRaw);
      const containerPart = parts[3] || "";

      const qtyMatch = qtyPart.match(/(\d+)\s*(.*)/);
      const qtyParsed = qtyMatch ? parseInt(qtyMatch[1], 10) : NaN;
      const qtyNeeded = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 1;
      const qtyUnit = qtyMatch ? qtyMatch[2].trim() : "";
      const qtyDefaulted = !qtyPart || !Number.isFinite(qtyParsed);
      const match = findCatalogMatch(namePart, catalog);
      return {
        lineId: idx,
        rawLine: line,
        name: namePart,
        qtyNeeded,
        qtyUnit,
        qtyDefaulted,
        matched: !!match,
        gang: match ? match.gang : "Unassigned",
        storage: match ? match.storage : "Unassigned",
        container: containerPart,
        needsTransfer: match ? !!match.needsTransfer : false,
        ordered,
      };
    });
}

function findOptionMatch(value, options) {
  if (!value) return null;
  const norm = normalizeText(value);
  return options.find((opt) => normalizeText(opt) === norm) || null;
}

function parseCatalogBulkText(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split("|").map((p) => p.trim());
      const name = parts[0] || "";
      const gangRaw = parts[1] || "";
      const storageRaw = parts[2] || "";
      const transferRaw = (parts[3] || "").toLowerCase();
      const needsTransfer = ["yes", "y", "true"].includes(transferRaw);

      const gangMatch = findOptionMatch(gangRaw, GANG_OPTIONS);
      const storageMatch = findOptionMatch(storageRaw, STORAGE_OPTIONS);

      return {
        lineId: idx,
        name,
        gang: gangMatch || GANG_OPTIONS[0],
        gangMatched: !!gangMatch || !gangRaw,
        storage: storageMatch || STORAGE_OPTIONS[0],
        storageMatched: !!storageMatch || !storageRaw,
        needsTransfer,
      };
    })
    .filter((row) => row.name);
}

function Select({ value, onChange, options, labels }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labels && labels[opt] !== undefined ? labels[opt] : opt}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

function StatusDot({ status, size = "md" }) {
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  return <span className={`inline-block rounded-full ${dim} ${STATUS_DOT[status]}`} />;
}

function AddContainer({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap"
      >
        <Plus className="w-3 h-3" />
        Add container
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setValue("");
          }
        }}
        placeholder="e.g. Conex 20-01"
        className="w-36 bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
      />
      <button
        type="button"
        onClick={submit}
        className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2 py-1.5 hover:bg-amber-400"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setValue("");
        }}
        className="text-slate-500 hover:text-slate-300 p-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ItemForm({ initial, containerOptions, onAddContainer, onSave, onCancel, existingItems = [] }) {
  const [item, setItem] = useState(
    migrateItemContainers({
      serials: [],
      needsTransfer: false,
      notes: "",
      storageDetail: "",
      qtyUnit: "",
      containers: [],
      ...initial,
    })
  );
  const [serialsText, setSerialsText] = useState((initial.serials || []).join(", "));
  const set = (field) => (val) => setItem((prev) => ({ ...prev, [field]: val }));

  const handleSerialsChange = (text) => {
    setSerialsText(text);
    const count = parseSerials(text).length;
    setItem((prev) => {
      const currentHave = totalHave(prev.containers);
      if (count <= currentHave) return prev;
      // Bump the first container's qty (or create one) so the have-count
      // still makes sense; if there are no containers yet, there's nowhere
      // sensible to put the extra count, so just leave it for the user to
      // sort out via the container rows below.
      if (prev.containers.length === 0) return prev;
      const updated = [...prev.containers];
      updated[0] = { ...updated[0], qty: updated[0].qty + (count - currentHave) };
      return { ...prev, containers: updated };
    });
  };

  const addContainerRow = () => {
    const used = new Set(item.containers.map((c) => c.name));
    const nextAvailable = [...containerOptions].sort((a, b) => a.localeCompare(b)).find(
      (name) => !used.has(name)
    );
    setItem((prev) => ({
      ...prev,
      containers: [...prev.containers, { name: nextAvailable || "", qty: 0 }],
    }));
  };

  const updateContainerRow = (index, field, value) => {
    setItem((prev) => {
      const updated = [...prev.containers];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, containers: updated };
    });
  };

  const removeContainerRow = (index) => {
    setItem((prev) => ({
      ...prev,
      containers: prev.containers.filter((_, i) => i !== index),
    }));
  };

  const currentTotalHave = totalHave(item.containers);

  const canSave = item.name.trim().length > 0 && String(item.qtyNeeded).trim().length > 0;

  const duplicateItem = item.name.trim()
    ? existingItems.find((i) => {
        if (i.id === item.id) return false;
        const normName = normalizeText(item.name).replace(/\s+/g, "");
        const normOther = normalizeText(i.name).replace(/\s+/g, "");
        return normName === normOther;
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">
            {initial.id ? "Edit item" : "Add item"}
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Item name</label>
            <input
              value={item.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. 3/4in A325 bolts"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
            {duplicateItem && (
              <p className="text-xs text-amber-400 mt-1.5">
                ⚠ Similar item already in this job: "{duplicateItem.name}" (have{" "}
                {duplicateItem.qtyHave} of {duplicateItem.qtyNeeded}, {duplicateItem.gang}).
                Consider editing that one instead of adding a duplicate.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Qty needed</label>
              <input
                type="number"
                min="0"
                value={item.qtyNeeded}
                onChange={(e) => set("qtyNeeded")(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Unit</label>
              <input
                value={item.qtyUnit}
                onChange={(e) => set("qtyUnit")(e.target.value)}
                placeholder="each (default), case, box, roll..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Qty have</label>
              <div className="w-full bg-slate-800/50 border border-slate-700 text-slate-300 text-sm rounded-md px-3 py-2">
                {currentTotalHave}
                <span className="text-slate-600 text-xs ml-1">(from containers below)</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Gang</label>
              <Select value={item.gang} onChange={set("gang")} options={GANG_OPTIONS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Ordered?</label>
              <div className="flex gap-2">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => set("ordered")(opt.v)}
                    className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                      item.ordered === opt.v
                        ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Received?</label>
              <div className="flex gap-2">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => set("received")(opt.v)}
                    className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                      item.received === opt.v
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Storage location</label>
            <Select value={item.storage} onChange={set("storage")} options={STORAGE_OPTIONS} />
            {item.storage === "Other" && (
              <input
                value={item.storageDetail}
                onChange={(e) => set("storageDetail")(e.target.value)}
                placeholder="Specify location..."
                className="w-full mt-2 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-400">
                Containers ({currentTotalHave} of {Number(item.qtyNeeded) || 0} placed)
              </label>
              <AddContainer
                onAdd={(name) => {
                  onAddContainer(name);
                  setItem((prev) => ({
                    ...prev,
                    containers: [...prev.containers, { name, qty: 0 }],
                  }));
                }}
              />
            </div>
            {item.containers.length === 0 ? (
              <p className="text-xs text-slate-600 mb-2">
                Not placed in any container yet.
              </p>
            ) : (
              <div className="space-y-2 mb-2">
                {item.containers.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={c.name}
                        onChange={(val) => updateContainerRow(idx, "name", val)}
                        options={[...containerOptions].sort((a, b) => a.localeCompare(b))}
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={c.qty}
                      onChange={(e) =>
                        updateContainerRow(idx, "qty", Number(e.target.value) || 0)
                      }
                      className="w-20 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                    />
                    <button
                      onClick={() => removeContainerRow(idx)}
                      className="text-slate-500 hover:text-red-400 p-1.5 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={addContainerRow}
              disabled={containerOptions.length === 0}
              className="text-xs text-amber-400 hover:text-amber-300 disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              + Add another container
            </button>
            <p className="text-xs text-slate-600 mt-2">
              Split across as many containers as this item is actually sitting in — qty have
              updates automatically as the total.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Status in job</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set("status")(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2 border transition-colors ${
                    item.status === opt.value
                      ? "border-slate-500 bg-slate-800 text-slate-100"
                      : "border-slate-700 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <StatusDot status={opt.value} size="sm" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">SME #</label>
            <input
              value={serialsText}
              onChange={(e) => handleSerialsChange(e.target.value)}
              placeholder="e.g. 12345, 12346, 12347"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
            <p className="text-xs text-slate-600 mt-1">
              Separate multiple SME #s with commas. Qty have auto-bumps to match the count
              (never lowers it — add extra manually for tools without an SME #).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Needs transfer when job ships?
            </label>
            <div className="flex gap-2">
              {[
                { v: true, label: "Yes" },
                { v: false, label: "No" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => set("needsTransfer")(opt.v)}
                  className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                    item.needsTransfer === opt.v
                      ? "bg-purple-500/15 border-purple-500/50 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
            <textarea
              value={item.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Special instructions, damage notes, etc."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canSave) return;
              const finalQtyNeeded = Number(item.qtyNeeded);
              const finalSerials = parseSerials(serialsText);
              const cleanContainers = item.containers
                .filter((c) => c.name)
                .map((c) => ({ name: c.name, qty: Number(c.qty) || 0 }));
              const finalQtyHave = totalHave(cleanContainers);

              onSave({
                ...item,
                qtyNeeded: finalQtyNeeded,
                qtyHave: finalQtyHave,
                containers: cleanContainers,
                serials: finalSerials,
              });
            }}
            disabled={!canSave}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500"
          >
            Save item
          </button>
        </div>
      </div>
    </div>
  );
}

function SerialsModal({ itemName, serials, onClose }) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? serials.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()))
    : serials;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 className="text-slate-100 font-semibold text-base truncate">{itemName}</h2>
            <p className="text-xs text-slate-500">
              {serials.length} SME #{serials.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {serials.length > 8 && (
          <div className="px-5 pt-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SME #..."
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No SME #s match "{query}".</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((sn, idx) => (
                <span
                  key={`${sn}-${idx}`}
                  className="text-xs rounded-md px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 font-mono"
                >
                  {sn}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TransferListModal({ jobName, items, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const transferItems = items.filter((i) => i.needsTransfer);

  const asText = transferItems
    .map((i) => {
      const sme = i.serials && i.serials.length > 0 ? ` — SME #: ${i.serials.join(", ")}` : "";
      return `${i.name} (qty ${i.qtyHave}/${i.qtyNeeded})${sme}`;
    })
    .join("\n");

  const copyList = async () => {
    const ok = await copyToClipboard(`Transfer list — ${jobName}\n\n${asText}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyFailed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-400" />
              Transfer list
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {jobName} · {transferItems.length} item{transferItems.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {transferItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              No items are marked to transfer yet. Mark items with "Needs transfer" in the item
              form.
            </p>
          ) : (
            <div className="space-y-3">
              {transferItems.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-800 rounded-lg p-3 bg-slate-800/40"
                >
                  <p className="font-semibold text-slate-100">{item.name}</p>
                  <p className="text-xs text-slate-500 mb-1.5">
                    Qty {item.qtyHave} of {item.qtyNeeded} · {item.gang}
                    {(item.containers || []).length > 0
                      ? ` · ${item.containers.map((c) => `${c.name}: ${c.qty}`).join(", ")}`
                      : ""}
                  </p>
                  {item.serials && item.serials.length > 0 && (
                    <p className="text-xs text-fuchsia-300 font-mono break-words">
                      SME #: {item.serials.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {transferItems.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800">
            <button
              onClick={copyList}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "Copy list"}
            </button>
            {copyFailed && (
              <div className="mt-3">
                <p className="text-xs text-amber-400 mb-1.5">
                  Couldn't copy automatically — tap the text below, select all, and copy manually.
                </p>
                <textarea
                  readOnly
                  value={`Transfer list — ${jobName}\n\n${asText}`}
                  onFocus={(e) => e.target.select()}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-2 font-mono resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Tries the modern Clipboard API first, then falls back to the older
// execCommand technique, since the Clipboard API can silently fail in
// sandboxed iframe contexts (like this artifact) without any error.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function ExportModal({ jobName, items, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const columns = [
    "Name",
    "Qty needed",
    "Unit",
    "Qty have",
    "Ordered",
    "Received",
    "Storage",
    "Container",
    "Gang",
    "Status",
    "SME #",
    "Needs transfer",
    "Notes",
  ];

  const rows = items.map((i) => [
    i.name,
    i.qtyNeeded,
    i.qtyUnit || "each",
    i.qtyHave,
    i.ordered ? "Yes" : "No",
    i.received ? "Yes" : "No",
    i.storage === "Other" && i.storageDetail ? `Other (${i.storageDetail})` : i.storage,
    (i.containers || []).map((c) => `${c.name}: ${c.qty}`).join("; "),
    i.gang,
    STATUS_OPTIONS.find((s) => s.value === i.status)?.label || i.status,
    (i.serials || []).join("; "),
    i.needsTransfer ? "Yes" : "No",
    i.notes || "",
  ]);

  const asText = [columns.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
  const asCsv = [columns, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

  const copyList = async () => {
    const ok = await copyToClipboard(asText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyFailed(true);
    }
  };

  const downloadCsv = () => {
    try {
      const blob = new Blob([asCsv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = jobName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      link.download = `${safeName || "job"}-items.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // download unavailable in this environment
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-400" />
              Export items
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {jobName} · {items.length} item{items.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              This job doesn't have any items yet.
            </p>
          ) : (
            <div className="space-y-2 text-xs text-slate-400">
              <p>
                Includes every item's quantities, storage, container, gang, status, SME #s,
                transfer flag, and notes.
              </p>
              <div className="border border-slate-800 rounded-md divide-y divide-slate-800 mt-3">
                {items.map((i) => (
                  <div key={i.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200 truncate">{i.name}</span>
                    <span className="text-slate-500 shrink-0">
                      {i.qtyHave}/{i.qtyNeeded}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <div className="flex gap-3">
              <button
                onClick={copyList}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy as text"}
              </button>
              <button
                onClick={downloadCsv}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
            {copyFailed && (
              <div className="mt-3">
                <p className="text-xs text-amber-400 mb-1.5">
                  Couldn't copy automatically — tap the text below, select all, and copy manually.
                </p>
                <textarea
                  readOnly
                  value={asText}
                  onFocus={(e) => e.target.select()}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-2 font-mono resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyCatalogItem() {
  return {
    id: null,
    name: "",
    gang: GANG_OPTIONS[0],
    storage: STORAGE_OPTIONS[0],
    needsTransfer: false,
  };
}

function CatalogItemForm({ initial, onSave, onCancel }) {
  const [item, setItem] = useState({ needsTransfer: false, ...initial });
  const set = (field) => (val) => setItem((prev) => ({ ...prev, [field]: val }));
  const canSave = item.name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">
            {initial.id ? "Edit catalog item" : "Add catalog item"}
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Item name</label>
            <input
              value={item.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Come along 3-ton"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Default gang</label>
            <Select value={item.gang} onChange={set("gang")} options={GANG_OPTIONS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Default storage location
            </label>
            <Select value={item.storage} onChange={set("storage")} options={STORAGE_OPTIONS} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Always needs transfer when job ships?
            </label>
            <div className="flex gap-2">
              {[
                { v: true, label: "Yes" },
                { v: false, label: "No" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => set("needsTransfer")(opt.v)}
                  className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                    item.needsTransfer === opt.v
                      ? "bg-purple-500/15 border-purple-500/50 text-purple-300"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Items matched to this catalog entry during import will be pre-flagged for
              transfer automatically.
            </p>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave({ ...item, id: item.id || Date.now() })}
            disabled={!canSave}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogExportModal({ catalog, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Matches the bulk-add paste format exactly, so this can be pasted
  // straight back into "Bulk add" as an instant restore.
  const asBulkText = catalog
    .map((c) => `${c.name} | ${c.gang} | ${c.storage} | ${c.needsTransfer ? "yes" : "no"}`)
    .join("\n");

  const asCsv = [
    ["Name", "Gang", "Storage", "Needs Transfer"],
    ...catalog.map((c) => [c.name, c.gang, c.storage, c.needsTransfer ? "Yes" : "No"]),
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const copyList = async () => {
    const ok = await copyToClipboard(asBulkText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setCopyFailed(true);
    }
  };

  const downloadCsv = () => {
    try {
      const blob = new Blob([asCsv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "warehub-catalog.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // download unavailable in this environment
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-400" />
              Export catalog
            </h2>
            <p className="text-xs text-slate-500">
              {catalog.length} item{catalog.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {catalog.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Your catalog is empty — nothing to export yet.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                "Copy as text" saves it in the same format the catalog's Bulk add uses, so you
                can paste it right back in to restore everything instantly.
              </p>
              <div className="border border-slate-800 rounded-md divide-y divide-slate-800">
                {catalog.map((c) => (
                  <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200 truncate">{c.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {c.gang} · {c.storage}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {catalog.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <div className="flex gap-3">
              <button
                onClick={copyList}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy as text"}
              </button>
              <button
                onClick={downloadCsv}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>
            {copyFailed && (
              <div className="mt-3">
                <p className="text-xs text-amber-400 mb-1.5">
                  Couldn't copy automatically — tap the text below, select all, and copy manually.
                </p>
                <textarea
                  readOnly
                  value={asBulkText}
                  onFocus={(e) => e.target.select()}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-2 font-mono resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogBulkAddModal({ onImport, onCancel }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);

  const handleParse = () => {
    setPreview(parseCatalogBulkText(text));
  };

  const handleImport = () => {
    const items = preview.map((p, idx) => ({
      id: Date.now() + idx,
      name: p.name,
      gang: p.gang,
      storage: p.storage,
      needsTransfer: p.needsTransfer,
    }));
    onImport(items);
  };

  const fullyMatchedCount = preview
    ? preview.filter((p) => p.gangMatched && p.storageMatched).length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Bulk add catalog items</h2>
            <p className="text-xs text-slate-500">One item per line</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!preview ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "Come along 3-ton | Raising | Red conex\n3/4in A325 bolts | Bolt-up | Conex row | yes\n7018 welding rod | Welders | Covered"
                }
                rows={10}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 font-mono resize-none"
              />
              <p className="text-xs text-slate-600 mt-2">
                Format: name | gang | storage location | needs transfer (yes/no). All but name
                are optional — just paste names if that's all you have, and set the rest later.
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Gangs: {GANG_OPTIONS.join(", ")}
                <br />
                Storage: {STORAGE_OPTIONS.join(", ")}
              </p>
            </>
          ) : preview.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing to import — check that each line starts with an item name.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">
                {fullyMatchedCount} of {preview.length} matched a known gang and storage exactly.
                Unmatched ones default to {GANG_OPTIONS[0]} / {STORAGE_OPTIONS[0]} — easy to fix
                later by editing the catalog entry.
              </p>
              {preview.map((p) => (
                <div
                  key={p.lineId}
                  className={`border rounded-md p-3 ${
                    p.gangMatched && p.storageMatched
                      ? "border-slate-800"
                      : "border-amber-700/50 bg-amber-900/10"
                  }`}
                >
                  <p className="text-sm text-slate-100 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {p.gang}
                    {!p.gangMatched && " (defaulted)"} · {p.storage}
                    {!p.storageMatched && " (defaulted)"}
                    {p.needsTransfer ? " · 🚚 transfer" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          {!preview ? (
            <>
              <button
                onClick={onCancel}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim()}
                className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
              >
                Preview
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPreview(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Back
              </button>
              {preview.length > 0 && (
                <button
                  onClick={handleImport}
                  className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                >
                  Add {preview.length} item{preview.length === 1 ? "" : "s"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CatalogModal({ catalog, onSave, onBulkSave, onDelete, onClose }) {
  const [editing, setEditing] = useState(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (editing) {
    return (
      <CatalogItemForm
        initial={editing}
        onSave={(item) => {
          onSave(item);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (bulkAdding) {
    return (
      <CatalogBulkAddModal
        onImport={(items) => {
          onBulkSave(items);
          setBulkAdding(false);
        }}
        onCancel={() => setBulkAdding(false)}
      />
    );
  }

  if (exportOpen) {
    return <CatalogExportModal catalog={catalog} onClose={() => setExportOpen(false)} />;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Item catalog</h2>
              <p className="text-xs text-slate-500">
                Shared across all jobs · {catalog.length} item{catalog.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExportOpen(true)}
                title="Export catalog"
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {catalog.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                No catalog items yet. Add the materials you commonly order, along with their
                usual gang and storage, so future imports can auto-fill them.
              </p>
            ) : (
              <div className="space-y-2">
                {catalog.map((c) => (
                  <div
                    key={c.id}
                    className="border border-slate-800 rounded-md p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-100 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.gang} · {c.storage}
                        {c.needsTransfer ? " · 🚚 transfer" : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-slate-500 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
            <button
              onClick={() => setBulkAdding(true)}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Upload className="w-4 h-4" />
              Bulk add
            </button>
            <button
              onClick={() => setEditing(emptyCatalogItem())}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              Add item
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDelete
          title="Remove catalog item?"
          message={`"${deleteTarget.name}" will be removed from your catalog. Items already added to jobs are unaffected.`}
          onConfirm={() => {
            onDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function ContainerDetailModal({
  containerName,
  items,
  onClose,
  onPull,
  onBack,
}) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState({});
  const [qtyOverrides, setQtyOverrides] = useState({});
  const [pickSearch, setPickSearch] = useState("");

  const inContainerFor = (name) =>
    items
      .map((i) => ({
        item: i,
        entry: (i.containers || []).find((c) => c.name === name),
      }))
      .filter((x) => x.entry);
  const inContainer = inContainerFor(containerName);
  const notInContainer = items
    .filter((i) => !(i.containers || []).some((c) => c.name === containerName))
    .filter((i) => i.name.toLowerCase().includes(pickSearch.trim().toLowerCase()));

  const toggleSelect = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setQty = (id, value) => {
    setQtyOverrides((prev) => ({ ...prev, [id]: value }));
  };

  const selectedIds = Object.keys(selected)
    .filter((id) => selected[id])
    .map((id) => Number(id));

  const confirmPull = () => {
    const qtyMap = {};
    selectedIds.forEach((id) => {
      const item = items.find((i) => i.id === id);
      const override = qtyOverrides[id];
      const remaining = Math.max(0, item.qtyNeeded - item.qtyHave);
      qtyMap[id] = override !== undefined && override !== "" ? Number(override) : remaining;
    });
    onPull(qtyMap);
    setSelected({});
    setQtyOverrides({});
    setPicking(false);
  };

  if (picking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Pull items</h2>
              <p className="text-xs text-slate-500">Into "{containerName}"</p>
            </div>
            <button onClick={() => setPicking(false)} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 pt-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Qty defaults to what's still unplaced — edit it for a partial pull.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {notInContainer.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                {pickSearch
                  ? `No items match "${pickSearch}".`
                  : "Every item in this job is already in this container."}
              </p>
            ) : (
              <div className="space-y-2">
                {notInContainer.map((item) => {
                  const remaining = Math.max(0, item.qtyNeeded - item.qtyHave);
                  const elsewhere = (item.containers || [])
                    .map((c) => `${c.name}: ${c.qty}`)
                    .join(", ");
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border border-slate-800 rounded-md p-3 hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[item.id]}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded accent-amber-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-100 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          Have {item.qtyHave} of {item.qtyNeeded}
                          {item.qtyUnit ? ` ${item.qtyUnit}` : ""} · {item.gang}
                          {elsewhere ? ` · already in: ${elsewhere}` : ""}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={qtyOverrides[item.id] ?? remaining}
                        onChange={(e) => setQty(item.id, e.target.value)}
                        onFocus={() => {
                          if (!selected[item.id]) toggleSelect(item.id);
                        }}
                        className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
            <button
              onClick={() => setPicking(false)}
              className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={confirmPull}
              disabled={selectedIds.length === 0}
              className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
            >
              Pull {selectedIds.length} item{selectedIds.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-slate-100 font-semibold text-base truncate">{containerName}</h2>
              <p className="text-xs text-slate-500">
                {inContainer.length} item{inContainer.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {inContainer.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing pulled into this container yet.
            </p>
          ) : (
            <div className="space-y-2">
              {inContainer.map(({ item, entry }) => (
                <div key={item.id} className="border border-slate-800 rounded-md p-3">
                  <p className="text-sm text-slate-100 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {entry.qty} here (of {item.qtyNeeded} total needed, {item.qtyHave} have
                    overall)
                    {item.qtyUnit ? ` ${item.qtyUnit}` : ""} · {item.gang}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={() => setPicking(true)}
            className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            <Plus className="w-4 h-4" />
            Pull items into this container
          </button>
        </div>
      </div>
    </div>
  );
}

function ContainersModal({
  containerOptions,
  items,
  onClose,
  onAdd,
  onRename,
  onDelete,
  onPull,
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openContainer, setOpenContainer] = useState(null);

  const countFor = (name) =>
    items.filter((i) => (i.containers || []).some((c) => c.name === name)).length;

  const submitAdd = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAdd(trimmed);
      setNewName("");
      setAdding(false);
    }
  };

  const submitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renaming) {
      onRename(renaming, trimmed);
    }
    setRenaming(null);
  };

  if (openContainer) {
    return (
      <ContainerDetailModal
        containerName={openContainer}
        items={items}
        onClose={onClose}
        onBack={() => setOpenContainer(null)}
        onPull={(qtyMap) => onPull(openContainer, qtyMap)}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Containers</h2>
              <p className="text-xs text-slate-500">
                {containerOptions.length} container{containerOptions.length === 1 ? "" : "s"}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {containerOptions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                No containers yet. Add one below — gangboxes, conexes, pallets, whatever you use.
              </p>
            ) : (
              <div className="space-y-2">
                {[...containerOptions].sort((a, b) => a.localeCompare(b)).map((name) =>
                  renaming === name ? (
                    <div
                      key={name}
                      className="border border-amber-600/50 rounded-md p-3 flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitRename()}
                        className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                      />
                      <button
                        onClick={submitRename}
                        className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRenaming(null)}
                        className="text-slate-500 hover:text-slate-300 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={name}
                      onClick={() => setOpenContainer(name)}
                      className="border border-slate-800 rounded-md p-3 flex items-center justify-between gap-2 cursor-pointer hover:border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100 truncate">{name}</p>
                        <p className="text-xs text-slate-500">
                          {countFor(name)} item{countFor(name) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(name);
                            setRenameValue(name);
                          }}
                          className="text-slate-500 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(name);
                          }}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            {adding ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAdd()}
                  placeholder="e.g. Gangbox 12345"
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
                <button
                  onClick={submitAdd}
                  className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-3.5 py-2"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                  className="text-slate-500 hover:text-slate-300 p-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                Add container
              </button>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDelete
          title="Remove container?"
          message={`"${deleteTarget}" will be removed. Items currently in it are unassigned, not deleted.`}
          onConfirm={() => {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPickListHtml(jobName, groups, sortedGroupKeys, groupOption) {
  const rowsHtml = sortedGroupKeys
    .map((groupKey) => {
      const groupHeader =
        groupOption !== "none"
          ? `<h2>${escapeHtml(groupKey)}</h2>`
          : "";
      const rows = groups[groupKey]
        .map((item) => {
          const containersText = (item.containers || [])
            .map((c) => `${c.name}: ${c.qty}`)
            .join(", ");
          return `
            <tr>
              <td><div class="checkbox"></div></td>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.qtyNeeded)}${item.qtyUnit ? " " + escapeHtml(item.qtyUnit) : ""}</td>
              <td>${escapeHtml(
                item.storage === "Other" && item.storageDetail ? item.storageDetail : item.storage
              )}</td>
              <td>${escapeHtml(containersText || "—")}</td>
            </tr>`;
        })
        .join("");
      return `
        <div class="group">
          ${groupHeader}
          <table>
            <thead>
              <tr><th class="cb-col"></th><th>Item</th><th class="qty-col">Qty</th><th class="side-col">Storage</th><th class="side-col">Container</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    })
    .join("");

  const totalItems = Object.values(groups).reduce((sum, g) => sum + g.length, 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Pick List - ${escapeHtml(jobName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #000; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px 0; }
  .meta { font-size: 12px; color: #555; margin-bottom: 20px; }
  .group { margin-bottom: 20px; page-break-inside: avoid; }
  h2 { font-size: 15px; border-bottom: 1px solid #000; padding-bottom: 4px; margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px; text-align: left; }
  thead tr { border-bottom: 1.5px solid #000; }
  tbody tr { border-top: 1px solid #ccc; }
  .cb-col { width: 36px; }
  .qty-col { width: 70px; }
  .side-col { width: 110px; }
  .checkbox { width: 16px; height: 16px; border: 1.5px solid #000; }
  @media print {
    body { padding: 0.4in; }
  }
</style>
</head>
<body>
  <h1>Pick List — ${escapeHtml(jobName)}</h1>
  <p class="meta">Generated ${escapeHtml(new Date().toLocaleString())} · ${totalItems} item${
    totalItems === 1 ? "" : "s"
  }</p>
  ${rowsHtml}
</body>
</html>`;
}

function PickListModal({ jobName, items, onClose }) {
  const [groupOption, setGroupOption] = useState("gang");

  const groups =
    groupOption === "container"
      ? items.reduce((acc, item) => {
          if (!item.containers || item.containers.length === 0) {
            const key = "Not yet placed in a container";
            (acc[key] = acc[key] || []).push(item);
          } else {
            item.containers.forEach((c) => {
              (acc[c.name] = acc[c.name] || []).push({ ...item, qtyNeeded: c.qty });
            });
          }
          return acc;
        }, {})
      : items.reduce((acc, item) => {
          const key =
            groupOption === "gang"
              ? item.gang
              : groupOption === "storage"
              ? item.storage === "Other" && item.storageDetail
                ? item.storageDetail
                : item.storage
              : "All items";
          (acc[key] = acc[key] || []).push(item);
          return acc;
        }, {});

  const sortedGroupKeys = Object.keys(groups).sort();

  const handleDownload = () => {
    try {
      const html = buildPickListHtml(jobName, groups, sortedGroupKeys, groupOption);
      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = jobName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      link.download = `${safeName || "job"}-pick-list.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // download unavailable in this environment
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Printer className="w-4 h-4 text-slate-400" />
              Print pick list
            </h2>
            <p className="text-xs text-slate-500">
              {jobName} · {items.length} item{items.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Group by</label>
          <select
            value={groupOption}
            onChange={(e) => setGroupOption(e.target.value)}
            className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          >
            <option value="gang">Gang</option>
            <option value="storage">Storage location</option>
            <option value="container">Container</option>
            <option value="none">Don't group</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              This job doesn't have any items yet.
            </p>
          ) : (
            <ol className="text-xs text-slate-500 space-y-1.5 list-decimal list-inside">
              <li>Downloads a formatted pick list as a file (no popup needed)</li>
              <li>Open the downloaded file — it'll open right in your browser</li>
              <li>
                Print it with Ctrl+P (Windows) or Cmd+P (Mac) — "Save as PDF" works there too
              </li>
            </ol>
          )}
        </div>

        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              <Download className="w-4 h-4" />
              Download pick list
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportModal({ catalog, existingItems = [], onImport, onClose, onOpenCatalog }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);

  const handleParse = () => {
    const parsed = parseImportText(text, catalog);
    const withDupes = parsed.map((p) => {
      const dup = existingItems.find((i) => {
        const normName = normalizeText(p.name).replace(/\s+/g, "");
        const normOther = normalizeText(i.name).replace(/\s+/g, "");
        return normName === normOther;
      });
      return { ...p, duplicateOf: dup || null };
    });
    setPreview(withDupes);
  };

  const toggleOrdered = (lineId) => {
    setPreview((prev) =>
      prev.map((p) => (p.lineId === lineId ? { ...p, ordered: !p.ordered } : p))
    );
  };

  const removeRow = (lineId) => {
    setPreview((prev) => prev.filter((p) => p.lineId !== lineId));
  };

  const updateQty = (lineId, value) => {
    setPreview((prev) =>
      prev.map((p) =>
        p.lineId === lineId ? { ...p, qtyNeeded: value, qtyDefaulted: false } : p
      )
    );
  };

  const updateUnit = (lineId, value) => {
    setPreview((prev) =>
      prev.map((p) => (p.lineId === lineId ? { ...p, qtyUnit: value } : p))
    );
  };

  const updateContainer = (lineId, value) => {
    setPreview((prev) =>
      prev.map((p) => (p.lineId === lineId ? { ...p, container: value } : p))
    );
  };

  const cloneRow = (lineId) => {
    setPreview((prev) => {
      const idx = prev.findIndex((p) => p.lineId === lineId);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], lineId: Date.now() + Math.random() };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
  };

  const updateName = (lineId, newName) => {
    setPreview((prev) =>
      prev.map((p) => {
        if (p.lineId !== lineId) return p;
        const match = findCatalogMatch(newName, catalog);
        const dup = existingItems.find((i) => {
          const normName = normalizeText(newName).replace(/\s+/g, "");
          const normOther = normalizeText(i.name).replace(/\s+/g, "");
          return normName === normOther;
        });
        return {
          ...p,
          name: newName,
          matched: !!match,
          gang: match ? match.gang : "Unassigned",
          storage: match ? match.storage : "Unassigned",
          needsTransfer: match ? !!match.needsTransfer : false,
          duplicateOf: dup || null,
        };
      })
    );
  };

  const handleImport = () => {
    onImport(preview);
    onClose();
  };

  const matchedCount = preview ? preview.filter((p) => p.matched).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Import items</h2>
            <p className="text-xs text-slate-500">One item per line: name | quantity</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!preview ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "Come along 3-ton | 4 | yes | Conex 20-04\n3/4in A325 bolts | 500\nGrinder disc 9in | 4 box | yes | Gangbox 19268"
                }
                rows={8}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 font-mono resize-none"
              />
              <p className="text-xs text-slate-600 mt-2">
                Paste one item per line as "name | quantity | ordered (yes/no, optional) |
                container (optional)". Add a unit after the number if it's not single items —
                e.g. "4 box" — and it'll carry through. A container name that doesn't exist yet
                gets created automatically. Items matching your catalog auto-fill gang and
                storage. Everything's editable on the next screen.
              </p>
              <button
                onClick={onOpenCatalog}
                className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 mt-2"
              >
                {catalog.length === 0 ? "Set up your catalog first →" : "Manage catalog →"}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2">
                {matchedCount} of {preview.length} matched your catalog. Tap a name, QTY, or
                unit to fix it, check Ordered for anything that's been ordered, clone a row to
                add something the scan missed, or remove a row if it shouldn't be imported.
                Unmatched items still get added — they land in "Unassigned" so you can sort them
                afterward.
              </p>
              {preview.map((p) => (
                <div
                  key={p.lineId}
                  className={`border rounded-md p-3 ${
                    p.duplicateOf
                      ? "border-red-700/50 bg-red-900/10"
                      : p.matched
                      ? "border-slate-800"
                      : "border-amber-700/50 bg-amber-900/10"
                  }`}
                >
                  <input
                    value={p.name}
                    onChange={(e) => updateName(p.lineId, e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-100 focus:outline-none focus:bg-slate-800 rounded px-1 -mx-1 py-0.5"
                  />
                  {p.duplicateOf && (
                    <p className="text-xs text-red-400 mt-1">
                      ⚠ Already in this job: "{p.duplicateOf.name}" (have{" "}
                      {p.duplicateOf.qtyHave} of {p.duplicateOf.qtyNeeded})
                    </p>
                  )}
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    <label className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">QTY</span>
                      <input
                        type="number"
                        min="1"
                        value={p.qtyNeeded}
                        onChange={(e) => updateQty(p.lineId, e.target.value)}
                        className="w-14 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
                      />
                    </label>
                    <input
                      value={p.qtyUnit}
                      onChange={(e) => updateUnit(p.lineId, e.target.value)}
                      placeholder="each"
                      className="w-20 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
                    />
                    <input
                      value={p.container}
                      onChange={(e) => updateContainer(p.lineId, e.target.value)}
                      placeholder="container (optional)"
                      className="w-36 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
                    />
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      <button
                        onClick={() => cloneRow(p.lineId)}
                        title="Clone this row"
                        className="flex items-center justify-center w-9 h-9 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeRow(p.lineId)}
                        title="Remove from import"
                        className="flex items-center justify-center w-9 h-9 rounded-md bg-red-500/10 border border-red-700/40 text-red-400 hover:bg-red-500/20 hover:text-red-300 shrink-0"
                      >
                        <X className="w-5 h-5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-xs text-slate-500">
                      {p.matched
                        ? `${p.gang} · ${p.storage}${p.needsTransfer ? " · 🚚 transfer" : ""}`
                        : "No catalog match — will be added as Unassigned"}
                    </p>
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 shrink-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={p.ordered}
                        onChange={() => toggleOrdered(p.lineId)}
                        className="w-3.5 h-3.5 rounded accent-amber-500"
                      />
                      Ordered
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          {!preview ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim()}
                className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
              >
                Preview import
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPreview(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={preview.length === 0}
                className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
              >
                {preview.length === 0
                  ? "Nothing to import"
                  : `Import ${preview.length} item${preview.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, selectMode, selected, onToggleSelect, onEdit, onDelete, onViewSerials }) {
  const handleCardClick = () => {
    if (selectMode) onToggleSelect(item.id);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-slate-900 rounded-lg p-4 transition-colors border ${
        selectMode ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-amber-500/70 bg-amber-500/5"
          : item.gang === "Unassigned" || item.storage === "Unassigned"
          ? "border-amber-700/50 hover:border-amber-600/60"
          : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {selectMode && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 w-4 h-4 rounded accent-amber-500 shrink-0"
            />
          )}
          <div className="mt-1">
            <StatusDot status={item.status} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 truncate">{item.name}</p>
            <p className="text-sm text-slate-500">
              Have {item.qtyHave} of {item.qtyNeeded}
              {item.qtyUnit ? ` ${item.qtyUnit}` : ""} needed
            </p>
            <div className="mt-1.5 h-1.5 w-full max-w-[160px] rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  item.qtyHave >= item.qtyNeeded
                    ? "bg-emerald-500"
                    : item.qtyHave > 0
                    ? "bg-amber-400"
                    : "bg-red-500"
                }`}
                style={{
                  width: `${
                    item.qtyNeeded > 0 ? Math.min(100, (item.qtyHave / item.qtyNeeded) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
        {!selectMode && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              className="text-slate-500 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className={`text-xs rounded-full px-2.5 py-1 border ${GANG_COLOR[item.gang]}`}>
          {item.gang}
        </span>
        <span className="text-xs rounded-full px-2.5 py-1 border border-slate-700 text-slate-400">
          {item.storage === "Other" && item.storageDetail ? item.storageDetail : item.storage}
        </span>
        {(item.containers || []).map((c, idx) => (
          <span
            key={idx}
            className="text-xs rounded-full px-2.5 py-1 border border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
          >
            📦 {c.name}: {c.qty}
          </span>
        ))}
        <span
          className={`text-xs rounded-full px-2.5 py-1 border flex items-center gap-1 ${
            item.ordered
              ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
              : "border-slate-700 text-slate-500"
          }`}
        >
          {item.ordered && <CheckCircle2 className="w-3 h-3" />}
          {item.ordered ? "Ordered" : "Not ordered"}
        </span>
        <span
          className={`text-xs rounded-full px-2.5 py-1 border flex items-center gap-1 ${
            item.received
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-slate-700 text-slate-500"
          }`}
        >
          {item.received && <CheckCircle2 className="w-3 h-3" />}
          {item.received ? "Received" : "Not received"}
        </span>
        {item.serials && item.serials.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewSerials(item);
            }}
            className="text-xs rounded-full px-2.5 py-1 border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/20"
          >
            SME # ({item.serials.length})
          </button>
        )}
        {item.needsTransfer && (
          <span className="text-xs rounded-full px-2.5 py-1 border border-purple-500/30 bg-purple-500/10 text-purple-300">
            🚚 Transfer
          </span>
        )}
      </div>
      {item.notes && (
        <p
          className="text-xs text-slate-500 italic mt-2"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.notes}
        </p>
      )}
    </div>
  );
}

function ConfirmDelete({ title, message, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
        <h3 className="text-slate-100 font-semibold mb-1.5">{title}</h3>
        <p className="text-slate-400 text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 text-sm rounded-md py-2 bg-red-600 text-white font-semibold hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobNameModal({
  initialName = "",
  initialColor = null,
  parentName = null,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed, color);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
        <h3 className="text-slate-100 font-semibold mb-1">{title}</h3>
        {parentName && (
          <p className="text-xs text-slate-500 mb-2">Under "{parentName}"</p>
        )}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. 4th Street Substation"
          className={`w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 ${
            parentName ? "mt-1" : "mt-3"
          } mb-4`}
        />
        <p className="text-xs font-medium text-slate-400 mb-1.5">Color</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {JOB_COLORS.map((c) => (
            <button
              key={c.label}
              onClick={() => setColor(c.value)}
              title={c.label}
              className={`w-7 h-7 rounded-full ${c.dot} flex items-center justify-center ${
                color === c.value ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-slate-100" : ""
              }`}
            >
              {c.value === null && (
                <X className="w-3.5 h-3.5 text-slate-300" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, indent, outstanding, onSelect, onRename, onDelete }) {
  const borderClass = job.color ? JOB_COLOR_BORDER[job.color] : "border-l-slate-800";
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-slate-900 border border-slate-800 border-l-4 ${borderClass} rounded-lg p-4 hover:border-slate-700 transition-colors flex items-center justify-between gap-3 ${
        indent ? "ml-6" : ""
      }`}
      style={indent ? { width: "calc(100% - 1.5rem)" } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
          <Briefcase className="w-4 h-4 text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-100 truncate">{job.name}</p>
          <p className="text-xs text-slate-500">
            {job.items.length} item{job.items.length === 1 ? "" : "s"}
            {outstanding > 0 ? ` · ${outstanding} outstanding` : " · all complete"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRename(job);
          }}
          className="text-slate-600 hover:text-slate-300 p-1.5 rounded-md hover:bg-slate-800"
        >
          <Pencil className="w-3.5 h-3.5" />
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDelete(job);
          }}
          className="text-slate-600 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function JobPicker({
  jobs,
  catalog,
  onSelect,
  onCreateClick,
  onCreateSubJobClick,
  onDeleteRequest,
  onRenameRequest,
  onResetRequest,
  onOpenCatalog,
  onExportAll,
  onImportAll,
  onSignOut,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const topLevel = jobs.filter((j) => !j.parentId);
  const childrenOf = (parentId) => jobs.filter((j) => j.parentId === parentId);

  const query = searchQuery.trim().toLowerCase();
  const searching = query.length > 0;

  const matchingJobs = searching
    ? jobs.filter((j) => j.name.toLowerCase().includes(query))
    : [];

  const matchingItemResults = searching
    ? jobs.flatMap((j) =>
        j.items
          .filter((i) => i.name.toLowerCase().includes(query))
          .map((i) => ({ item: i, job: j }))
      )
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center">
              <Package className="w-4.5 h-4.5 text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 leading-tight">WareHub</h1>
              <p className="text-xs text-slate-500 leading-tight">Select a job</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCatalog}
              title="Item catalog"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            <button
              onClick={onSignOut}
              title="Log out"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              onClick={onCreateClick}
              className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New job</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {jobs.length > 0 && (
          <div className="relative mb-5">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search job names or items across all jobs..."
              className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm rounded-md pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {searching ? (
          <div className="space-y-4">
            {matchingJobs.length === 0 && matchingItemResults.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                No jobs or items match "{searchQuery}".
              </p>
            ) : (
              <>
                {matchingJobs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Jobs ({matchingJobs.length})
                    </p>
                    <div className="space-y-2.5">
                      {matchingJobs.map((job) => {
                        const outstanding = job.items.filter((i) => i.status !== "green").length;
                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            indent={false}
                            outstanding={outstanding}
                            onSelect={() => onSelect(job.id)}
                            onRename={onRenameRequest}
                            onDelete={onDeleteRequest}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                {matchingItemResults.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Items ({matchingItemResults.length})
                    </p>
                    <div className="space-y-2">
                      {matchingItemResults.map(({ item, job }) => (
                        <button
                          key={`${job.id}-${item.id}`}
                          onClick={() => onSelect(job.id)}
                          className="w-full text-left bg-slate-900 border border-slate-800 rounded-md p-3 hover:border-slate-700"
                        >
                          <p className="text-sm text-slate-100 truncate">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            In "{job.name}" · Have {item.qtyHave} of {item.qtyNeeded}
                            {item.qtyUnit ? ` ${item.qtyUnit}` : ""} · {item.gang}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg">
            <Briefcase className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm mb-4">No jobs yet. Create one to start tracking inventory.</p>
            <button
              onClick={onCreateClick}
              className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-4 py-2 hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              New job
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {topLevel.map((job) => {
              const outstanding = job.items.filter((i) => i.status !== "green").length;
              const children = childrenOf(job.id);
              const isCollapsed = collapsed[job.id];
              return (
                <div key={job.id}>
                  <div className="flex items-center gap-1">
                    {children.length > 0 ? (
                      <button
                        onClick={() =>
                          setCollapsed((prev) => ({ ...prev, [job.id]: !prev[job.id] }))
                        }
                        className="text-slate-500 hover:text-slate-300 p-1.5 shrink-0"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isCollapsed ? "-rotate-90" : ""
                          }`}
                        />
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <JobCard
                        job={job}
                        indent={false}
                        outstanding={outstanding}
                        onSelect={() => onSelect(job.id)}
                        onRename={onRenameRequest}
                        onDelete={onDeleteRequest}
                      />
                    </div>
                  </div>

                  {!isCollapsed && children.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {children.map((child) => {
                        const childOutstanding = child.items.filter(
                          (i) => i.status !== "green"
                        ).length;
                        return (
                          <JobCard
                            key={child.id}
                            job={child}
                            indent
                            outstanding={childOutstanding}
                            onSelect={() => onSelect(child.id)}
                            onRename={onRenameRequest}
                            onDelete={onDeleteRequest}
                          />
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => onCreateSubJobClick(job)}
                    className="ml-6 mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400"
                  >
                    <Plus className="w-3 h-3" />
                    Add sub-job under "{job.name}"
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center mt-8">
          <button
            onClick={onResetRequest}
            className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
          >
            Reset all data
          </button>
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              onClick={onExportAll}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
            >
              Export all data (backup)
            </button>
            <span className="text-slate-700">·</span>
            <label className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 cursor-pointer">
              Import all data (restore backup)
              <input
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) onImportAll(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-[10px] text-slate-700 mt-2">Build check: 2026-07-14-B</p>
        </div>
      </main>
    </div>
  );
}

function JobInventory({ job, onUpdateJob, onBackToJobs, catalog, onOpenCatalog, onRenameJob }) {
  const { items, containerOptions, activityLog } = job;
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [serialsView, setSerialsView] = useState(null);
  const [transferListOpen, setTransferListOpen] = useState(false);
  const [gangFilter, setGangFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
  const [containerFilter, setContainerFilter] = useState("All");
  const [procFilter, setProcFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [groupByGang, setGroupByGang] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState({});
  const [bulkGangPicker, setBulkGangPicker] = useState(false);
  const [bulkStoragePicker, setBulkStoragePicker] = useState(false);
  const [bulkContainerPicker, setBulkContainerPicker] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [containersOpen, setContainersOpen] = useState(false);
  const [pickListOpen, setPickListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const logActivity = (message, extra = {}) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      ...extra,
      activityLog: [{ id: Date.now(), time: timeStamp(), message }, ...prevJob.activityLog].slice(
        0,
        50
      ),
    }));
  };

  const addContainer = (name) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      containerOptions: prevJob.containerOptions.includes(name)
        ? prevJob.containerOptions
        : [...prevJob.containerOptions, name],
      activityLog: [
        { id: Date.now(), time: timeStamp(), message: `Added container "${name}"` },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const renameContainer = (oldName, newName) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      containerOptions: prevJob.containerOptions.map((c) => (c === oldName ? newName : c)),
      items: prevJob.items.map((i) => ({
        ...i,
        containers: (i.containers || []).map((c) =>
          c.name === oldName ? { ...c, name: newName } : c
        ),
      })),
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Renamed container "${oldName}" → "${newName}"`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const deleteContainer = (name) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      containerOptions: prevJob.containerOptions.filter((c) => c !== name),
      items: prevJob.items.map((i) => {
        const remaining = (i.containers || []).filter((c) => c.name !== name);
        return { ...i, containers: remaining, qtyHave: totalHave(remaining) };
      }),
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Removed container "${name}" (items unassigned, not deleted)`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const pullItemsIntoContainer = (containerName, qtyMap) => {
    const itemIds = Object.keys(qtyMap).map(Number);
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.map((i) => {
        if (!(i.id in qtyMap)) return i;
        const pulledQty = qtyMap[i.id];
        const existing = (i.containers || []).filter((c) => c.name !== containerName);
        const newContainers =
          pulledQty > 0 ? [...existing, { name: containerName, qty: pulledQty }] : existing;
        const qtyHave = totalHave(newContainers);
        const status = qtyHave >= i.qtyNeeded ? "green" : qtyHave > 0 ? "yellow" : "red";
        return { ...i, containers: newContainers, qtyHave, status };
      }),
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Pulled ${itemIds.length} item${
            itemIds.length === 1 ? "" : "s"
          } into "${containerName}"`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const matchesProcFilter = (item) => {
    if (procFilter === "All") return true;
    if (procFilter === "not_ordered") return !item.ordered;
    if (procFilter === "ordered_awaiting") return item.ordered && !item.received;
    if (procFilter === "received") return item.received;
    return true;
  };

  const matchesSearch = (item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.containers || []).some((c) => c.name.toLowerCase().includes(q)) ||
      (item.notes || "").toLowerCase().includes(q) ||
      (item.serials || []).some((sn) => sn.toLowerCase().includes(q))
    );
  };

  const STATUS_RANK = { red: 0, yellow: 1, green: 2 };

  const sortItems = (list) => {
    const sorted = [...list];
    switch (sortBy) {
      case "name-asc":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case "qty-desc":
        return sorted.sort((a, b) => b.qtyNeeded - a.qtyNeeded);
      case "qty-asc":
        return sorted.sort((a, b) => a.qtyNeeded - b.qtyNeeded);
      case "status":
        return sorted.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
      default:
        return sorted;
    }
  };

  const filtered = sortItems(
    items.filter(
      (i) =>
        (gangFilter === "All" || i.gang === gangFilter) &&
        (storageFilter === "All" || i.storage === storageFilter) &&
        (containerFilter === "All" ||
          (i.containers || []).some((c) => c.name === containerFilter)) &&
        (statusFilter === "All" || i.status === statusFilter) &&
        matchesProcFilter(i) &&
        matchesSearch(i)
    )
  );

  const saveItem = (item) => {
    if (item.id) {
      const before = items.find((i) => i.id === item.id);
      const changes = diffItems(before, item);
      onUpdateJob((prevJob) => ({
        ...prevJob,
        items: prevJob.items.map((i) => (i.id === item.id ? item : i)),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message:
              changes.length > 0
                ? `Updated "${item.name}": ${changes.join(", ")}`
                : `Updated "${item.name}" (no field changes)`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    } else {
      const newItem = { ...item, id: Date.now() };
      onUpdateJob((prevJob) => ({
        ...prevJob,
        items: [...prevJob.items, newItem],
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Added "${item.name}" (needed ${item.qtyNeeded}, ${item.gang})`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    }
    setFormState(null);
  };

  const deleteItem = (item) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.filter((i) => i.id !== item.id),
      activityLog: [
        { id: Date.now(), time: timeStamp(), message: `Deleted "${item.name}"` },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const toggleItemSelect = (id) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedItemIds = Object.keys(selectedIds)
    .filter((id) => selectedIds[id])
    .map(Number);

  const clearSelection = () => {
    setSelectedIds({});
    setSelectMode(false);
  };

  const bulkUpdate = (updater, label) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.map((i) => (selectedItemIds.includes(i.id) ? updater(i) : i)),
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `${label} for ${selectedItemIds.length} item${
            selectedItemIds.length === 1 ? "" : "s"
          }`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
    clearSelection();
  };

  const bulkSetOrdered = (value) =>
    bulkUpdate((i) => ({ ...i, ordered: value }), `Marked ${value ? "ordered" : "not ordered"}`);
  const bulkSetReceived = (value) =>
    bulkUpdate((i) => ({ ...i, received: value }), `Marked ${value ? "received" : "not received"}`);
  const bulkSetGang = (gang) => {
    bulkUpdate((i) => ({ ...i, gang }), `Gang set to ${gang}`);
    setBulkGangPicker(false);
  };
  const bulkSetStorage = (storage) => {
    bulkUpdate((i) => ({ ...i, storage }), `Storage set to ${storage}`);
    setBulkStoragePicker(false);
  };
  const bulkSetContainer = (container) => {
    bulkUpdate(
      (i) => {
        const containers = [{ name: container, qty: i.qtyNeeded }];
        return { ...i, containers, qtyHave: totalHave(containers), status: "green" };
      },
      `Moved to container "${container}" (full quantity)`
    );
    setBulkContainerPicker(false);
  };
  const bulkDelete = () => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.filter((i) => !selectedItemIds.includes(i.id)),
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Deleted ${selectedItemIds.length} item${
            selectedItemIds.length === 1 ? "" : "s"
          } in bulk`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
    setBulkDeleteConfirm(false);
    clearSelection();
  };

  const importItems = (previewRows) => {
    const qtyNum = (p) => (Number(p.qtyNeeded) > 0 ? Number(p.qtyNeeded) : 1);
    const newItems = previewRows.map((p, idx) => {
      const containerName = (p.container || "").trim();
      const containers = containerName ? [{ name: containerName, qty: qtyNum(p) }] : [];
      return {
        ...emptyItem(p.storage),
        id: Date.now() + idx,
        name: p.name,
        qtyNeeded: qtyNum(p),
        qtyUnit: p.qtyUnit || "",
        containers,
        qtyHave: totalHave(containers),
        status: containers.length > 0 ? "green" : "red",
        gang: p.gang,
        needsTransfer: !!p.needsTransfer,
        ordered: !!p.ordered,
      };
    });
    const newContainerNames = [
      ...new Set(
        newItems.flatMap((i) => i.containers.map((c) => c.name)).filter(Boolean)
      ),
    ];
    const matchedCount = previewRows.filter((p) => p.matched).length;
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: [...prevJob.items, ...newItems],
      containerOptions: [
        ...prevJob.containerOptions,
        ...newContainerNames.filter((name) => !prevJob.containerOptions.includes(name)),
      ],
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Imported ${newItems.length} item${
            newItems.length === 1 ? "" : "s"
          } (${matchedCount} matched from catalog)`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const counts = {
    total: items.length,
    ordered: items.filter((i) => i.ordered).length,
    received: items.filter((i) => i.received).length,
    complete: items.filter((i) => i.status === "green").length,
    outstanding: items.filter((i) => i.status !== "green").length,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBackToJobs}
              className="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center shrink-0 hover:bg-slate-700"
            >
              <ChevronLeft className="w-4.5 h-4.5 text-slate-300" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-100 leading-tight truncate flex items-center gap-2">
                {job.color && (
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      JOB_COLORS.find((c) => c.value === job.color)?.dot || ""
                    }`}
                  />
                )}
                {job.name}
              </h1>
              <p className="text-xs text-slate-500 leading-tight">Job inventory tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="More actions"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setImportOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    Import items
                  </button>
                  <button
                    onClick={() => {
                      setPickListOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <Printer className="w-4 h-4 text-slate-400" />
                    Print pick list
                  </button>
                  <button
                    onClick={() => {
                      setTransferListOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <Truck className="w-4 h-4 text-slate-400" />
                    Transfer list
                  </button>
                  <button
                    onClick={() => {
                      setExportOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    Export items
                  </button>
                  <button
                    onClick={() => {
                      setRenameOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <Pencil className="w-4 h-4 text-slate-400" />
                    Rename job
                  </button>

                  <button
                    onClick={() => {
                      setContainersOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left border-t border-slate-700"
                  >
                    <Archive className="w-4 h-4 text-slate-400" />
                    Containers
                  </button>
                  <button
                    onClick={() => {
                      setSelectMode(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <CheckSquare className="w-4 h-4 text-slate-400" />
                    Select items
                  </button>
                  <button
                    onClick={() => {
                      onOpenCatalog();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    Item catalog
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setFormState(emptyItem(STORAGE_OPTIONS[0]))}
              className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add item</span>
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, container, notes, or SME #..."
            className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-sm rounded-md pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <p className="text-xs text-slate-500">Items</p>
            <p className="text-lg font-bold text-slate-100">{counts.total}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <p className="text-xs text-slate-500">Ordered</p>
            <p className="text-lg font-bold text-slate-100">{counts.ordered}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <p className="text-xs text-slate-500">Received</p>
            <p className="text-lg font-bold text-slate-100">{counts.received}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <p className="text-xs text-slate-500">Complete</p>
            <p className="text-lg font-bold text-emerald-400">{counts.complete}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className="text-lg font-bold text-amber-400">{counts.outstanding}</p>
          </div>
        </div>

        {/* Gang filter tabs */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {["All", ...GANG_OPTIONS].map((g) => (
            <button
              key={g}
              onClick={() => setGangFilter(g)}
              className={`text-sm rounded-full px-3.5 py-1.5 border whitespace-nowrap transition-colors ${
                gangFilter === g
                  ? "bg-slate-100 text-slate-900 border-slate-100 font-medium"
                  : "border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Storage, container + status filters */}
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <Select
              value={storageFilter}
              onChange={setStorageFilter}
              options={["All", ...STORAGE_OPTIONS]}
              labels={{ All: "All storage locations" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Select
              value={containerFilter}
              onChange={setContainerFilter}
              options={["All", ...[...containerOptions].sort((a, b) => a.localeCompare(b))]}
              labels={{ All: "All containers" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <select
              value={procFilter}
              onChange={(e) => setProcFilter(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            >
              <option value="All">Ordered/received: all</option>
              <option value="not_ordered">Not ordered</option>
              <option value="ordered_awaiting">Ordered, awaiting</option>
              <option value="received">Received</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            >
              <option value="default">Sort: default order</option>
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="qty-desc">Qty needed (high–low)</option>
              <option value="qty-asc">Qty needed (low–high)</option>
              <option value="status">Status (none first)</option>
            </select>
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
            <button
              onClick={() => setGroupByGang((v) => !v)}
              className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border whitespace-nowrap ${
                groupByGang
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Layers className="w-3 h-3" />
              Group by gang
            </button>
            {(gangFilter !== "All" ||
              storageFilter !== "All" ||
              containerFilter !== "All" ||
              statusFilter !== "All" ||
              procFilter !== "All" ||
              searchQuery) && (
              <button
                onClick={() => {
                  setGangFilter("All");
                  setStorageFilter("All");
                  setContainerFilter("All");
                  setStatusFilter("All");
                  setProcFilter("All");
                  setSearchQuery("");
                }}
                className="text-xs text-slate-500 hover:text-slate-300 whitespace-nowrap px-1"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Bulk select bar */}
        {selectMode && (
          <div className="flex items-center flex-wrap gap-2 mb-4 p-3 bg-slate-900 border border-amber-600/40 rounded-md">
            <span className="text-xs text-slate-300 font-medium">
              {selectedItemIds.length} selected
            </span>
            <button
              onClick={() =>
                setSelectedIds(
                  filtered.reduce((acc, i) => ({ ...acc, [i.id]: true }), {})
                )
              }
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Select all ({filtered.length})
            </button>
            <div className="flex-1" />
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5"
            >
              Cancel
            </button>
            {selectedItemIds.length > 0 && (
              <>
                <button
                  onClick={() => bulkSetOrdered(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Mark ordered
                </button>
                <button
                  onClick={() => bulkSetReceived(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Mark received
                </button>
                <button
                  onClick={() => setBulkGangPicker(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Set gang
                </button>
                <button
                  onClick={() => setBulkStoragePicker(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Set storage
                </button>
                <button
                  onClick={() => setBulkContainerPicker(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Move to container
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="text-xs bg-red-500/10 border border-red-700/40 text-red-400 rounded-md px-2.5 py-1.5 hover:bg-red-500/20"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {/* Item cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-lg">
            <Package className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">
              {items.length === 0
                ? "No items yet for this job. Add one to get started."
                : "No items match your search or filters. Try clearing one or add a new item."}
            </p>
          </div>
        ) : groupByGang ? (
          <div className="space-y-4">
            {Object.entries(
              filtered.reduce((groups, item) => {
                (groups[item.gang] = groups[item.gang] || []).push(item);
                return groups;
              }, {})
            )
              .sort(([a], [b]) => {
                const order = [...GANG_OPTIONS];
                return order.indexOf(a) - order.indexOf(b);
              })
              .map(([gang, gangItems]) => (
                <div key={gang}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs rounded-full px-2.5 py-1 border ${GANG_COLOR[gang]}`}>
                      {gang}
                    </span>
                    <span className="text-xs text-slate-600">
                      {gangItems.length} item{gangItems.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {gangItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        selectMode={selectMode}
                        selected={!!selectedIds[item.id]}
                        onToggleSelect={toggleItemSelect}
                        onEdit={setFormState}
                        onDelete={setDeleteTarget}
                        onViewSerials={setSerialsView}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={!!selectedIds[item.id]}
                onToggleSelect={toggleItemSelect}
                onEdit={setFormState}
                onDelete={setDeleteTarget}
                onViewSerials={setSerialsView}
              />
            ))}
          </div>
        )}

        {/* Activity log */}
        <div className="mt-6 border border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 hover:bg-slate-800/60"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <History className="w-4 h-4 text-slate-500" />
              Activity log
              <span className="text-xs text-slate-600">({activityLog.length})</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform ${logOpen ? "rotate-180" : ""}`}
            />
          </button>
          {logOpen && (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80">
              {activityLog.map((entry) => (
                <div key={entry.id} className="px-4 py-2.5 flex gap-3">
                  <span className="text-xs text-slate-600 shrink-0 w-28">{entry.time}</span>
                  <span className="text-sm text-slate-300">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {formState && (
        <ItemForm
          initial={formState}
          containerOptions={containerOptions}
          onAddContainer={addContainer}
          onSave={saveItem}
          onCancel={() => setFormState(null)}
          existingItems={items}
        />
      )}

      {deleteTarget && (
        <ConfirmDelete
          title="Delete item?"
          message={`"${deleteTarget.name}" will be removed from this job. This can't be undone.`}
          onConfirm={() => {
            deleteItem(deleteTarget);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {serialsView && (
        <SerialsModal
          itemName={serialsView.name}
          serials={serialsView.serials || []}
          onClose={() => setSerialsView(null)}
        />
      )}

      {transferListOpen && (
        <TransferListModal
          jobName={job.name}
          items={items}
          onClose={() => setTransferListOpen(false)}
        />
      )}

      {exportOpen && (
        <ExportModal jobName={job.name} items={items} onClose={() => setExportOpen(false)} />
      )}

      {importOpen && (
        <ImportModal
          catalog={catalog}
          existingItems={items}
          onImport={importItems}
          onClose={() => setImportOpen(false)}
          onOpenCatalog={() => {
            setImportOpen(false);
            onOpenCatalog();
          }}
        />
      )}

      {containersOpen && (
        <ContainersModal
          containerOptions={containerOptions}
          items={items}
          onClose={() => setContainersOpen(false)}
          onAdd={addContainer}
          onRename={renameContainer}
          onDelete={deleteContainer}
          onPull={pullItemsIntoContainer}
        />
      )}

      {bulkGangPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-3">
              Set gang for {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"}
            </h3>
            <div className="space-y-1.5 mb-4">
              {GANG_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => bulkSetGang(g)}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  {g}
                </button>
              ))}
            </div>
            <button
              onClick={() => setBulkGangPicker(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bulkStoragePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-3">
              Set storage for {selectedItemIds.length} item
              {selectedItemIds.length === 1 ? "" : "s"}
            </h3>
            <div className="space-y-1.5 mb-4">
              {STORAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => bulkSetStorage(s)}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => setBulkStoragePicker(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bulkContainerPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">
              Move {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"} to
              container
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Sets the full quantity needed into this one container for each item selected,
              replacing any existing breakdown. For a partial amount split across containers,
              use "Pull items into this container" from the Containers screen instead.
            </p>
            {containerOptions.length === 0 ? (
              <p className="text-sm text-slate-500 mb-4">
                No containers yet — add one from the Containers screen first.
              </p>
            ) : (
              <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
                {[...containerOptions].sort((a, b) => a.localeCompare(b)).map((c) => (
                  <button
                    key={c}
                    onClick={() => bulkSetContainer(c)}
                    className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setBulkContainerPicker(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {bulkDeleteConfirm && (
        <ConfirmDelete
          title="Delete selected items?"
          message={`${selectedItemIds.length} item${
            selectedItemIds.length === 1 ? "" : "s"
          } will be removed from this job. This can't be undone.`}
          onConfirm={bulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}

      {pickListOpen && (
        <PickListModal jobName={job.name} items={items} onClose={() => setPickListOpen(false)} />
      )}

      {renameOpen && (
        <JobNameModal
          initialName={job.name}
          initialColor={job.color}
          title="Rename job"
          confirmLabel="Save"
          onConfirm={(name, color) => {
            onRenameJob(name, color);
            setRenameOpen(false);
          }}
          onCancel={() => setRenameOpen(false)}
        />
      )}
    </div>
  );
}

const JOBS_KEY = "warehub-jobs";
const ACTIVE_JOB_KEY = "warehub-active-job";
const CATALOG_KEY = "warehub-catalog";
// Set to "true" the moment we ever successfully save real job data. Lets us
// tell "genuinely new account" apart from "storage came back empty when it
// shouldn't have" — the latter must never be treated as a fresh start.
const INITIALIZED_KEY = "warehub-initialized";

// Saves a key, but first checks whether another tab/device has saved a
// newer version since we last knew about it. If so, this refuses to save
// (instead of silently overwriting someone else's more recent changes) and
// returns {ok:false, conflict:true} so the caller can warn the user rather
// than lose data with no trace.
async function saveWithRetry(key, value, expectedUpdatedAt, attempts = 2) {
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

async function getWithRetry(key, attempts = 6) {
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

function WareHub({ onSignOut }) {
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [showPicker, setShowPicker] = useState(true);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [jobDeleteTarget, setJobDeleteTarget] = useState(null);
  const [jobRenameTarget, setJobRenameTarget] = useState(null);
  const [subJobParent, setSubJobParent] = useState(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [importAllError, setImportAllError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [pendingSync, setPendingSync] = useState(false);
  const jobsSaveTimer = useRef(null);
  const jobsRef = useRef([]);
  const jobsUpdatedAtRef = useRef(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const catalogSaveTimer = useRef(null);
  const catalogRef = useRef([]);
  const catalogUpdatedAtRef = useRef(null);
  const [conflictWarning, setConflictWarning] = useState(false);

  // Warn before closing/reloading if a save is still pending or in flight —
  // this can't guarantee the save finishes, but it stops you from powering
  // off or closing the tab without knowing there's unsaved work in transit.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const hasPendingSave = !!jobsSaveTimer.current || !!catalogSaveTimer.current || syncing;
      if (hasPendingSave) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [syncing]);

  // Keep refs in sync so an unmount-time flush always has the latest data,
  // even though the cleanup closure below can't see later state updates
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  // Safety net: if the component unmounts (e.g. a live code update while
  // you're mid-edit) with a debounced save still pending, flush it
  // immediately instead of silently canceling it — this is what could have
  // caused work to appear lost if edits landed right as a new version loaded
  useEffect(() => {
    return () => {
      if (jobsSaveTimer.current) {
        clearTimeout(jobsSaveTimer.current);
        saveWithRetry(JOBS_KEY, JSON.stringify(jobsRef.current), jobsUpdatedAtRef.current);
      }
      if (catalogSaveTimer.current) {
        clearTimeout(catalogSaveTimer.current);
        saveWithRetry(
          CATALOG_KEY,
          JSON.stringify(catalogRef.current),
          catalogUpdatedAtRef.current
        );
      }
    };
  }, []);

  // Track connectivity so we can pause saves gracefully instead of erroring
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setRetryTick((t) => t + 1); // flush any pending changes immediately
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Fix for a known iOS/Safari quirk: elements with :hover styles can require
  // an extra "warm-up" tap on the very first touch of the page before clicks
  // register normally. An empty touchstart listener disables that behavior.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  // Load saved data once on mount. Critically: if we can't confirm the load
  // actually succeeded (not just "no data"), we do NOT fall back to empty/seed
  // defaults, because the auto-save effects would then immediately persist
  // that empty state and permanently overwrite any real saved data.
  const loadAllData = async () => {
    setLoading(true);
    setLoadFailed(false);
    setLoadingSlow(false);
    const slowTimer = setTimeout(() => setLoadingSlow(true), 3000);

    const jobsResult = await getWithRetry(JOBS_KEY);
    const activeResult = await getWithRetry(ACTIVE_JOB_KEY);
    const catalogResult = await getWithRetry(CATALOG_KEY);
    clearTimeout(slowTimer);

    if (!jobsResult.ok || !catalogResult.ok) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    let loadedJobs = null;
    try {
      if (jobsResult.value) loadedJobs = JSON.parse(jobsResult.value);
    } catch {
      // corrupted stored data, not a read failure — safe to fall back
    }

    let loadedActiveId = null;
    try {
      if (activeResult.ok && activeResult.value) loadedActiveId = JSON.parse(activeResult.value);
    } catch {
      // ignore — just falls back to the first job
    }

    let loadedCatalog = [];
    try {
      if (catalogResult.value) loadedCatalog = JSON.parse(catalogResult.value);
    } catch {
      // corrupted stored data, not a read failure — safe to fall back to empty
    }

    const migrateGang = (job) => ({
      ...job,
      items: job.items.map((i) =>
        migrateItemContainers(i.gang === "Welders" ? { ...i, gang: "Welding" } : i)
      ),
    });
    const finalJobs =
      loadedJobs && loadedJobs.length > 0 ? loadedJobs.map(migrateGang) : [seedJob()];
    setJobs(finalJobs);
    const validActiveId = finalJobs.some((j) => j.id === loadedActiveId)
      ? loadedActiveId
      : finalJobs[0].id;
    setActiveJobId(validActiveId);
    setCatalog(loadedCatalog.map((c) => (c.gang === "Welders" ? { ...c, gang: "Welding" } : c)));
    jobsUpdatedAtRef.current = jobsResult.updatedAt || null;
    catalogUpdatedAtRef.current = catalogResult.updatedAt || null;
    setConflictWarning(false);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Persist jobs whenever they change (after initial load completes), debounced
  // so several quick edits in a row don't each trigger their own blocking save
  useEffect(() => {
    if (loading || loadFailed || conflictWarning) return;
    if (!isOnline) {
      setPendingSync(true);
      return;
    }
    if (jobsSaveTimer.current) clearTimeout(jobsSaveTimer.current);
    jobsSaveTimer.current = setTimeout(() => {
      jobsSaveTimer.current = null;
      (async () => {
        setSyncing(true);
        const result = await saveWithRetry(
          JOBS_KEY,
          JSON.stringify(jobs),
          jobsUpdatedAtRef.current
        );
        setSyncing(false);
        if (result.conflict) {
          setConflictWarning(true);
          return;
        }
        setSaveError(result.ok ? null : result.error);
        if (result.ok) {
          setPendingSync(false);
          jobsUpdatedAtRef.current = result.updatedAt;
        }
      })();
    }, 600);
    return () => {
      if (jobsSaveTimer.current) clearTimeout(jobsSaveTimer.current);
    };
  }, [jobs, loading, retryTick, isOnline, conflictWarning]);

  // Persist which job is active
  useEffect(() => {
    if (loading || loadFailed || activeJobId == null) return;
    if (!isOnline) {
      setPendingSync(true);
      return;
    }
    (async () => {
      setSyncing(true);
      const result = await saveWithRetry(ACTIVE_JOB_KEY, JSON.stringify(activeJobId));
      setSyncing(false);
      if (!result.ok) setSaveError(result.error);
    })();
  }, [activeJobId, loading, retryTick, isOnline]);

  // Persist catalog whenever it changes, debounced like jobs
  useEffect(() => {
    if (loading || loadFailed || conflictWarning) return;
    if (!isOnline) return;
    if (catalogSaveTimer.current) clearTimeout(catalogSaveTimer.current);
    catalogSaveTimer.current = setTimeout(() => {
      catalogSaveTimer.current = null;
      (async () => {
        const result = await saveWithRetry(
          CATALOG_KEY,
          JSON.stringify(catalog),
          catalogUpdatedAtRef.current
        );
        if (result.conflict) {
          setConflictWarning(true);
          return;
        }
        if (!result.ok) setSaveError(result.error);
        else catalogUpdatedAtRef.current = result.updatedAt;
      })();
    }, 600);
    return () => {
      if (catalogSaveTimer.current) clearTimeout(catalogSaveTimer.current);
    };
  }, [catalog, loading, retryTick, isOnline, conflictWarning]);

  const activeJob = jobs.find((j) => j.id === activeJobId);

  const updateActiveJob = (updater) => {
    setJobs((prev) => prev.map((j) => (j.id === activeJobId ? updater(j) : j)));
  };

  const createJob = (name, color, parentId = null) => {
    const job = newJob(name, parentId, color);
    setJobs((prev) => [...prev, job]);
    setActiveJobId(job.id);
    setShowNewJobModal(false);
    setSubJobParent(null);
    setShowPicker(false);
  };

  const deleteJob = (job) => {
    setJobs((prev) => prev.filter((j) => j.id !== job.id && j.parentId !== job.id));
    if (activeJobId === job.id || jobs.find((j) => j.id === activeJobId)?.parentId === job.id) {
      setActiveJobId(null);
      setShowPicker(true);
    }
    setJobDeleteTarget(null);
  };

  const renameJob = (jobId, newName, newColor) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              name: newName,
              color: newColor,
              activityLog: [
                {
                  id: Date.now(),
                  time: timeStamp(),
                  message: `Job renamed to "${newName}"`,
                },
                ...j.activityLog,
              ].slice(0, 50),
            }
          : j
      )
    );
  };

  const saveCatalogItem = (item) => {
    setCatalog((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      return exists ? prev.map((c) => (c.id === item.id ? item : c)) : [...prev, item];
    });
  };

  const bulkSaveCatalogItems = (items) => {
    setCatalog((prev) => [...prev, ...items]);
  };

  const deleteCatalogItem = (id) => {
    setCatalog((prev) => prev.filter((c) => c.id !== id));
  };

  const resetAllData = async () => {
    const fresh = [seedJob()];
    setJobs(fresh);
    setActiveJobId(fresh[0].id);
    setShowPicker(false);
    setResetConfirmOpen(false);
    const jobsResult = await saveWithRetry(JOBS_KEY, JSON.stringify(fresh));
    const activeResult = await saveWithRetry(ACTIVE_JOB_KEY, JSON.stringify(fresh[0].id));
    if (jobsResult.ok) jobsUpdatedAtRef.current = jobsResult.updatedAt;
    setConflictWarning(false);
    if (!jobsResult.ok) setSaveError(jobsResult.error);
    else if (!activeResult.ok) setSaveError(activeResult.error);
    else setSaveError(null);
  };

  const exportAllData = () => {
    try {
      const payload = {
        exportedFrom: "WareHub",
        exportedAt: new Date().toISOString(),
        jobs,
        catalog,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `warehub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setSaveError("Couldn't create the backup file");
    }
  };

  const importAllData = (file) => {
    if (
      !window.confirm(
        "This replaces every job and catalog item currently in this app with what's in the backup file. Continue?"
      )
    ) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.jobs)) {
          setImportAllError("That file doesn't look like a WareHub backup.");
          return;
        }
        const importedJobs = parsed.jobs;
        const importedCatalog = Array.isArray(parsed.catalog) ? parsed.catalog : [];
        setJobs(importedJobs);
        setCatalog(importedCatalog);
        const firstJob = importedJobs.find((j) => !j.parentId) || importedJobs[0];
        if (firstJob) setActiveJobId(firstJob.id);
        setShowPicker(true);
        setImportAllError(null);
        const jobsResult = await saveWithRetry(JOBS_KEY, JSON.stringify(importedJobs));
        const catalogResult = await saveWithRetry(CATALOG_KEY, JSON.stringify(importedCatalog));
        if (jobsResult.ok) jobsUpdatedAtRef.current = jobsResult.updatedAt;
        if (catalogResult.ok) catalogUpdatedAtRef.current = catalogResult.updatedAt;
        setConflictWarning(false);
        if (!jobsResult.ok) setSaveError(jobsResult.error);
        else if (!catalogResult.ok) setSaveError(catalogResult.error);
        else setSaveError(null);
      } catch {
        setImportAllError("Couldn't read that file — make sure it's an unmodified WareHub backup.");
      }
    };
    reader.readAsText(file);
  };

  if (loadFailed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-700/40 flex items-center justify-center mx-auto mb-4">
            <X className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="font-semibold text-slate-100 mb-2">Couldn't load your saved data</h2>
          <p className="text-sm text-slate-500 mb-5">
            To protect your existing jobs and catalog, nothing will be changed or saved until
            this loads successfully. This is usually a temporary connection issue.
          </p>
          <button
            onClick={loadAllData}
            className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-4 py-2 hover:bg-amber-400"
          >
            Try again
          </button>
          <p className="text-xs text-red-400/90 mt-5 max-w-xs mx-auto">
            ⚠ Avoid the option below unless you're certain this device has never held your
            real data. It starts empty, and since your data is shared across devices, saving
            from here could overwrite what's really there.
          </p>
          <button
            onClick={() => {
              setLoadFailed(false);
              setJobs([seedJob()]);
              setActiveJobId(1);
              setLoading(false);
            }}
            className="block mx-auto mt-2 text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
          >
            Continue anyway (starts empty)
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-2.5 text-slate-500 text-sm text-center">
          <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <span>{loadingSlow ? "Still connecting..." : "Loading your jobs..."}</span>
          {loadingSlow && (
            <span className="text-xs text-slate-600 max-w-xs">
              Taking longer than usual — this can happen on a fresh browser session. Hang
              tight, this can take up to 10 seconds.
            </span>
          )}
        </div>
      </div>
    );
  }

  const showingPicker = showPicker || !activeJob;

  return (
    <>
      {!isOnline ? (
        <div className="fixed top-0 inset-x-0 z-[60] bg-amber-900/90 text-amber-100 text-xs text-center py-2 px-4">
          You're offline — changes are kept here and will sync automatically once you're back
          online.
        </div>
      ) : (
        saveError && (
          <div className="fixed top-0 inset-x-0 z-[60] bg-red-900/90 text-red-100 text-xs text-center py-2 px-4 flex items-center justify-center gap-3">
            <span>Couldn't save changes: {saveError}</span>
            <button
              onClick={() => setRetryTick((t) => t + 1)}
              className="underline underline-offset-2 shrink-0 font-semibold"
            >
              Retry
            </button>
          </div>
        )
      )}

      {syncing && (
        <div className="fixed bottom-3 right-3 z-[60] bg-amber-500 text-slate-950 text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2 shadow-lg">
          <div className="w-3 h-3 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
          Saving — don't close yet
        </div>
      )}

      {conflictWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-amber-600/50 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">
              This was updated somewhere else
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              Another tab or device saved changes to this data after you last loaded it. To
              avoid silently overwriting their work, nothing further will save from here until
              you choose:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setConflictWarning(false);
                  loadAllData();
                }}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Reload the latest version (recommended)
              </button>
              <button
                onClick={async () => {
                  setSyncing(true);
                  const jobsResult = await saveWithRetry(JOBS_KEY, JSON.stringify(jobs));
                  const catalogResult = await saveWithRetry(
                    CATALOG_KEY,
                    JSON.stringify(catalog)
                  );
                  setSyncing(false);
                  if (jobsResult.ok) jobsUpdatedAtRef.current = jobsResult.updatedAt;
                  if (catalogResult.ok) catalogUpdatedAtRef.current = catalogResult.updatedAt;
                  setConflictWarning(false);
                }}
                className="w-full text-sm rounded-md py-2.5 border border-red-700/50 text-red-400 hover:bg-red-500/10"
              >
                Overwrite with what's on this screen
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4">
              Reloading discards any edits made in this tab since it last synced. Overwriting
              discards whatever the other tab/device saved instead.
            </p>
          </div>
        </div>
      )}

      {importAllError && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-red-900/90 text-red-100 text-xs text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>{importAllError}</span>
          <button
            onClick={() => setImportAllError(null)}
            className="underline underline-offset-2 shrink-0 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {showingPicker ? (
        <JobPicker
          jobs={jobs}
          catalog={catalog}
          onSelect={(id) => {
            setActiveJobId(id);
            setShowPicker(false);
          }}
          onCreateClick={() => setShowNewJobModal(true)}
          onCreateSubJobClick={(job) => setSubJobParent(job)}
          onDeleteRequest={(job) => setJobDeleteTarget(job)}
          onRenameRequest={(job) => setJobRenameTarget(job)}
          onResetRequest={() => setResetConfirmOpen(true)}
          onOpenCatalog={() => setCatalogModalOpen(true)}
          onExportAll={exportAllData}
          onImportAll={importAllData}
          onSignOut={onSignOut}
        />
      ) : (
        <JobInventory
          job={activeJob}
          onUpdateJob={updateActiveJob}
          onBackToJobs={() => setShowPicker(true)}
          catalog={catalog}
          onOpenCatalog={() => setCatalogModalOpen(true)}
          onRenameJob={(name, color) => renameJob(activeJob.id, name, color)}
        />
      )}

      {catalogModalOpen && (
        <CatalogModal
          catalog={catalog}
          onSave={saveCatalogItem}
          onBulkSave={bulkSaveCatalogItems}
          onDelete={deleteCatalogItem}
          onClose={() => setCatalogModalOpen(false)}
        />
      )}

      {showNewJobModal && (
        <JobNameModal
          title="New job"
          confirmLabel="Create job"
          onConfirm={(name, color) => createJob(name, color)}
          onCancel={() => setShowNewJobModal(false)}
        />
      )}

      {subJobParent && (
        <JobNameModal
          title="New sub-job"
          parentName={subJobParent.name}
          confirmLabel="Create sub-job"
          onConfirm={(name, color) => createJob(name, color, subJobParent.id)}
          onCancel={() => setSubJobParent(null)}
        />
      )}

      {jobRenameTarget && (
        <JobNameModal
          initialName={jobRenameTarget.name}
          initialColor={jobRenameTarget.color}
          title="Rename job"
          confirmLabel="Save"
          onConfirm={(name, color) => {
            renameJob(jobRenameTarget.id, name, color);
            setJobRenameTarget(null);
          }}
          onCancel={() => setJobRenameTarget(null)}
        />
      )}

      {jobDeleteTarget && (
        <ConfirmDelete
          title="Delete job?"
          message={
            jobs.some((j) => j.parentId === jobDeleteTarget.id)
              ? `"${jobDeleteTarget.name}" and all of its sub-jobs (and their items) will be removed. This can't be undone.`
              : `"${jobDeleteTarget.name}" and all of its items will be removed. This can't be undone.`
          }
          onConfirm={() => deleteJob(jobDeleteTarget)}
          onCancel={() => setJobDeleteTarget(null)}
        />
      )}

      {resetConfirmOpen && (
        <ConfirmDelete
          title="Reset all data?"
          message="Every job, item, and container will be permanently erased and replaced with the sample job. This can't be undone."
          confirmLabel="Reset all data"
          onConfirm={resetAllData}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </>
  );
}

function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    onSignedIn(data.session);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded-md bg-amber-500 flex items-center justify-center">
            <Package className="w-5 h-5 text-slate-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-bold text-xl text-slate-100">WareHub</h1>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onSignedIn={setSession} />;
  }

  return <WareHub onSignOut={() => supabase.auth.signOut()} />;
}
