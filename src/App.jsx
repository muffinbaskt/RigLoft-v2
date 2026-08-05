import { useState, useEffect, useRef, useMemo } from "react";
import QRCode from "qrcode";
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
  ChevronRight,
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
  FileText,
  BookOpen,
  Archive,
  CheckSquare,
  Printer,
  Layers,
  LogOut,
  ListChecks,
  Inbox,
  ClipboardList,
  RotateCcw,
  Home,
  QrCode,
  Bell,
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
const GANG_OPTIONS = ["Raising", "Bolt Up", "Plumb up", "Welding", "Safety", "Misc", "Unassigned"];
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
  "Bolt Up": "bg-sky-500/15 text-sky-300 border-sky-500/30",
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
        gang: "Bolt Up",
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
        received: "no",
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
        received: "no",
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

function newReturn(jobId, jobName, date) {
  return {
    id: Date.now(),
    jobId,
    jobName,
    date,
    items: [],
    createdAt: timeStamp(),
  };
}

function newJob(name, parentId = null, color = null, isQuickTransfer = false) {
  return {
    id: Date.now(),
    name,
    createdAt: timeStamp(),
    parentId,
    color,
    isQuickTransfer,
    items: [],
    containerOptions: [],
    categoryOptions: [],
    todos: [],
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
  if (normalizeReceived(before.received) !== normalizeReceived(after.received))
    changes.push(`received → ${normalizeReceived(after.received)}`);
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
  if ((before.category || "") !== (after.category || ""))
    changes.push(`category → ${after.category || "(none)"}`);
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
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyItem(defaultStorage) {
  return {
    id: null,
    _formKey: `new-${Date.now()}-${Math.random()}`,
    name: "",
    qtyNeeded: "",
    qtyUnit: "",
    qtyHave: 0,
    ordered: false,
    received: "no",
    storage: defaultStorage,
    storageDetail: "",
    containers: [], // [{ name, qty }] — qtyHave is always the sum of these
    status: "red",
    gang: GANG_OPTIONS[0],
    category: "",
    catalogId: null, // manual catalog link override — takes priority over name-matching
    serials: [],
    needsTransfer: false,
    notes: "",
  };
}

// A small, cheerful two-note chime played on save — synthesized directly
// rather than loading a sound file, so there's nothing extra to bundle.
// Every sound effect reuses this one shared context instead of creating a
// brand new one per call — repeatedly creating audio contexts (e.g. once
// per checkbox tap during bulk select) is genuinely expensive and was
// causing real slowdowns, since browsers don't clean those up for free.
let sharedAudioCtx = null;
function getAudioCtx() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playSaveChime() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    const playNote = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.16, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playNote(880, now, 0.12); // A5
    playNote(1318.51, now + 0.09, 0.22); // E6 — a bright little upward "ding-ding"
  } catch {
    // Audio not available/blocked in this browser — fine to just skip it
  }
}

// A very short, quiet "tick" — meant for things you do over and over in a
// row (checking off items, toggling a box), where a full chime would get
// annoying fast.
function playSoftTap() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Audio not available/blocked — fine to just skip it
  }
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

// "received" used to be a plain true/false — this normalizes old data so
// existing items keep working correctly now that there's a third,
// "partial" state in between.
function normalizeReceived(r) {
  if (r === true || r === "yes") return "yes";
  if (r === "partial") return "partial";
  return "no";
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

// Same priority the item edit form itself uses: a manual catalog link
// always wins over automatic name-matching.
function getEffectiveCatalogMatch(item, catalog) {
  if (item.catalogId) {
    return catalog.find((c) => c.id === item.catalogId) || null;
  }
  return findCatalogMatch(item.name, catalog);
}

// Caches each item's catalog match keyed by the item object itself, not by
// id — since untouched items keep the exact same object reference across
// re-renders (React's normal immutable-update pattern), this means editing
// or saving anywhere in the app no longer forces every single item across
// every job to redo catalog matching, only the ones that actually changed.
// Resets automatically whenever the catalog itself changes, since a cached
// match could otherwise point at stale catalog data.
let catalogMatchCache = new WeakMap();
let catalogMatchCacheCatalogRef = null;

function getCachedCatalogMatch(item, catalog) {
  if (catalog !== catalogMatchCacheCatalogRef) {
    catalogMatchCache = new WeakMap();
    catalogMatchCacheCatalogRef = catalog;
  }
  if (catalogMatchCache.has(item)) return catalogMatchCache.get(item);
  const match = getEffectiveCatalogMatch(item, catalog);
  catalogMatchCache.set(item, match);
  return match;
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
      const serialsPart = parts[4] || "";
      const serials = parseSerials(serialsPart);

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
        category: match ? match.category || "" : "",
        container: containerPart,
        serials,
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

function AddContainer({ onAdd, label = "Add container", placeholder = "e.g. Conex 20-01" }) {
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
        {label}
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
        placeholder={placeholder}
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

function ItemForm({
  initial,
  containerOptions,
  onAddContainer,
  categoryOptions = [],
  onAddCategory,
  onSave,
  onCancel,
  existingItems = [],
  catalog = [],
  onSaveCatalogItem,
  isQuickTransfer = false,
}) {
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
  const [addToCatalog, setAddToCatalog] = useState(false);
  const [qtContainerText, setQtContainerText] = useState(
    (initial.containers && initial.containers[0] && initial.containers[0].name) || ""
  );
  const set = (field) => (val) => setItem((prev) => ({ ...prev, [field]: val }));

  const existingCatalogMatch = item.name.trim() ? findCatalogMatch(item.name, catalog) : null;

  const [manualCatalogLinkId, setManualCatalogLinkId] = useState(initial.catalogId || null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogPickerSearch, setCatalogPickerSearch] = useState("");
  const manualCatalogLink = manualCatalogLinkId
    ? catalog.find((c) => c.id === manualCatalogLinkId)
    : null;
  // A manual choice always wins over whatever the automatic name-match found
  const effectiveCatalogMatch = manualCatalogLink || existingCatalogMatch;

  const handleSerialsChange = (text) => {
    const prevCount = parseSerials(serialsText).length;
    const newCount = parseSerials(text).length;
    setSerialsText(text);
    setItem((prev) => {
      const currentHave = totalHave(prev.containers);

      if (newCount > prevCount) {
        // Increasing — same as before, bump the have-count up to match.
        if (newCount <= currentHave) return prev;
        if (prev.containers.length === 0) {
          // No container yet — rather than silently doing nothing, or
          // guessing an existing container that might be entirely wrong,
          // create a clearly-labeled placeholder so it's obvious this
          // still needs a real container assigned.
          const placeholderName = "SME Item Placeholder";
          onAddContainer(placeholderName);
          return { ...prev, containers: [{ name: placeholderName, qty: newCount }] };
        }
        const updated = [...prev.containers];
        updated[0] = { ...updated[0], qty: updated[0].qty + (newCount - currentHave) };
        return { ...prev, containers: updated };
      }

      if (newCount < prevCount && prev.containers.length > 0) {
        // Decreasing — this is the careful case. Some items genuinely have
        // no SME# tracked at all (currentHave can be bigger than
        // prevCount), and removing a serial shouldn't eat into that
        // untracked buffer — it should only account for the one serial
        // that actually went away.
        // Example: have 6, only 5 have SME#s (1 untracked). Remove one
        // SME# → 4 tracked. Have should drop to 5 (4 + the same 1
        // untracked), not fall all the way to 4.
        const untracked = Math.max(0, currentHave - prevCount);
        const targetHave = newCount + untracked;
        const reduceBy = currentHave - targetHave;
        if (reduceBy <= 0) return prev;
        const updated = [...prev.containers];
        updated[0] = {
          ...updated[0],
          qty: Math.max(0, updated[0].qty - Math.min(reduceBy, updated[0].qty)),
        };
        return { ...prev, containers: updated };
      }

      return prev;
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

  const canSave = item.name.trim().length > 0;

  const duplicateItem = item.name.trim()
    ? existingItems.find((i) => {
        if (i.id === item.id) return false;
        const normName = normalizeText(item.name).replace(/\s+/g, "");
        const normOther = normalizeText(i.name).replace(/\s+/g, "");
        return normName === normOther;
      })
    : null;

  if (isQuickTransfer) {
    const handleQuickSerialsChange = (text) => {
      const prevCount = parseSerials(serialsText).length;
      const newCount = parseSerials(text).length;
      setSerialsText(text);
      setItem((prev) => {
        const currentQty = Number(prev.qtyNeeded) || 0;
        if (newCount > prevCount) {
          // Only ever bumps up, never down — if you've already typed a
          // bigger quantity than the SME count on purpose, this leaves it
          // alone rather than overwriting it.
          if (newCount <= currentQty) return prev;
          return { ...prev, qtyNeeded: newCount };
        }
        if (newCount < prevCount) {
          // Preserves any untracked buffer (items with no SME# at all),
          // same logic as the full item form — only reduces by exactly
          // how many serials actually went away.
          const untracked = Math.max(0, currentQty - prevCount);
          const targetQty = newCount + untracked;
          if (targetQty >= currentQty) return prev;
          return { ...prev, qtyNeeded: targetQty };
        }
        return prev;
      });
    };

    const saveQuickItem = () => {
      if (!canSave) return;
      const finalQtyNeeded = Number(item.qtyNeeded) || 0;
      const finalSerials = parseSerials(serialsText);
      const containerName = qtContainerText.trim();
      playSaveChime();
      const { _formKey, ...itemToSave } = item;
      onSave({
        ...itemToSave,
        qtyNeeded: finalQtyNeeded,
        qtyHave: finalQtyNeeded,
        containers: containerName ? [{ name: containerName, qty: finalQtyNeeded }] : [],
        serials: finalSerials,
        status: "green",
        catalogId: manualCatalogLinkId,
        needsTransfer: !!(effectiveCatalogMatch && effectiveCatalogMatch.needsTransfer),
      });
    };

    return (
      <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-slate-100 font-semibold text-base">
              {initial.id ? "Edit item" : "Add item"}
            </h2>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Item</label>
              <input
                autoFocus
                value={item.name}
                onChange={(e) => set("name")(e.target.value)}
                placeholder="e.g. Comealong, 3ton"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              {duplicateItem && (
                <p className="text-xs text-amber-400 mt-1.5">
                  ⚠ Already in this list: "{duplicateItem.name}"
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <p className="text-xs text-slate-600">
                  {manualCatalogLink
                    ? `Linked to catalog item "${manualCatalogLink.name}"`
                    : "No catalog link"}
                </p>
                <button
                  onClick={() => setCatalogPickerOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
                >
                  Choose catalog item
                </button>
                {manualCatalogLink && (
                  <button
                    onClick={() => setManualCatalogLinkId(null)}
                    className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">QTY</label>
              <input
                type="number"
                min="0"
                value={item.qtyNeeded}
                onChange={(e) => set("qtyNeeded")(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">SME</label>
              <input
                value={serialsText}
                onChange={(e) => handleQuickSerialsChange(e.target.value)}
                placeholder="12345, 12346, 12347"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Container <span className="text-slate-600">(optional)</span>
              </label>
              <input
                value={qtContainerText}
                onChange={(e) => setQtContainerText(e.target.value)}
                placeholder="Leave blank if it's just going in the truck"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={onCancel}
              className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={saveQuickItem}
              disabled={!canSave}
              className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
            >
              Save item
            </button>
          </div>
        </div>
      </div>

      {catalogPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={() => setCatalogPickerOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-base">Choose catalog item</h3>
              <button
                onClick={() => setCatalogPickerOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={catalogPickerSearch}
                  onChange={(e) => setCatalogPickerSearch(e.target.value)}
                  placeholder="Search catalog..."
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {catalog.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  Your catalog is empty — add items to it first from the Item Catalog screen.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...catalog]
                    .filter((c) =>
                      c.name.toLowerCase().includes(catalogPickerSearch.trim().toLowerCase())
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setManualCatalogLinkId(c.id);
                          setCatalogPickerOpen(false);
                          setCatalogPickerSearch("");
                        }}
                        className="w-full text-left border border-slate-800 rounded-md p-3 hover:border-slate-700"
                      >
                        <p className="text-sm text-slate-100">{c.name}</p>
                        <p className="text-xs text-slate-500">
                          {c.gang} · {c.storage}
                          {c.category ? ` · ${c.category}` : ""}
                        </p>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  return (
    <>
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
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <p className="text-xs text-slate-600">
                  {effectiveCatalogMatch ? (
                    <>
                      Linked to catalog item "{effectiveCatalogMatch.name}"
                      {manualCatalogLink && " (manually chosen)"}
                    </>
                  ) : (
                    "No catalog match"
                  )}
                </p>
                {effectiveCatalogMatch && (
                  <button
                    onClick={() =>
                      setItem((prev) => ({
                        ...prev,
                        gang: effectiveCatalogMatch.gang,
                        storage: effectiveCatalogMatch.storage,
                        category: effectiveCatalogMatch.category || "",
                        needsTransfer: !!effectiveCatalogMatch.needsTransfer,
                      }))
                    }
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    Use these settings
                  </button>
                )}
                <button
                  onClick={() => setCatalogPickerOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
                >
                  Choose catalog item
                </button>
                {manualCatalogLink && (
                  <button
                    onClick={() => setManualCatalogLinkId(null)}
                    className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
                  >
                    Clear
                  </button>
                )}
              </div>
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
            {!isQuickTransfer && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Qty have
                </label>
                <div className="w-full bg-slate-800/50 border border-slate-700 text-slate-300 text-sm rounded-md px-3 py-2">
                  {currentTotalHave}
                  <span className="text-slate-600 text-xs ml-1">(from containers below)</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Gang</label>
              <Select value={item.gang} onChange={set("gang")} options={GANG_OPTIONS} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-400">
                Category <span className="text-slate-600">(optional, separate from gang)</span>
              </label>
              <AddContainer
                onAdd={(name) => {
                  onAddCategory(name);
                  set("category")(name);
                }}
                label="Add category"
                placeholder="e.g. Rigging, Hand Tools"
              />
            </div>
            <Select
              value={item.category || ""}
              onChange={set("category")}
              options={["", ...[...categoryOptions].sort((a, b) => a.localeCompare(b))]}
              labels={{ "": "No category" }}
            />
            <p className="text-xs text-slate-600 mt-1">
              A quick grouping like "Rigging" or "Consumables" — searchable, but never changes
              which gang this belongs to.
            </p>
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
                  { v: "yes", label: "Yes", active: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" },
                  { v: "partial", label: "Partial", active: "bg-yellow-500/15 border-yellow-500/50 text-yellow-300" },
                  { v: "no", label: "No", active: "bg-red-500/15 border-red-500/50 text-red-300" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => set("received")(opt.v)}
                    className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                      normalizeReceived(item.received) === opt.v
                        ? opt.active
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

          {!isQuickTransfer && (
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
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Status in job
            </label>
            <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2">
              <StatusDot
                status={
                  isQuickTransfer || currentTotalHave >= Number(item.qtyNeeded || 0)
                    ? "green"
                    : currentTotalHave > 0
                    ? "yellow"
                    : "red"
                }
                size="sm"
              />
              <span className="text-sm text-slate-300">
                {isQuickTransfer || currentTotalHave >= Number(item.qtyNeeded || 0)
                  ? "Complete"
                  : currentTotalHave > 0
                  ? "Partial"
                  : "None"}
              </span>
              <span className="text-xs text-slate-600 ml-auto">
                {isQuickTransfer
                  ? "Quick transfers are always logged as complete"
                  : "Set automatically from qty have vs. qty needed"}
              </span>
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

          {onSaveCatalogItem && (
            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer select-none bg-slate-800/50 border border-slate-700 rounded-md p-2.5">
              <input
                type="checkbox"
                checked={addToCatalog}
                onChange={(e) => setAddToCatalog(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-amber-500 mt-0.5 shrink-0"
              />
              <span>
                {effectiveCatalogMatch
                  ? `Update "${effectiveCatalogMatch.name}" in the catalog with this gang/storage`
                  : "Also add this item to the catalog (auto-fills gang/storage on future imports)"}
              </span>
            </label>
          )}
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
              const cleanContainers = isQuickTransfer
                ? []
                : item.containers
                    .filter((c) => c.name)
                    .map((c) => ({ name: c.name, qty: Number(c.qty) || 0 }));
              // A quick transfer is already handed over the moment it's
              // logged — there's nothing to "still receive," so it's
              // treated as fully complete rather than tracked against
              // containers like a normal job item.
              const finalQtyHave = isQuickTransfer ? finalQtyNeeded : totalHave(cleanContainers);
              const finalStatus = isQuickTransfer
                ? "green"
                : finalQtyHave >= finalQtyNeeded
                ? "green"
                : finalQtyHave > 0
                ? "yellow"
                : "red";

              if (addToCatalog && onSaveCatalogItem) {
                onSaveCatalogItem({
                  id: effectiveCatalogMatch ? effectiveCatalogMatch.id : Date.now(),
                  name: item.name.trim(),
                  gang: item.gang,
                  storage: item.storage,
                  needsTransfer: !!item.needsTransfer,
                });
              }

              playSaveChime();

              const { _formKey, ...itemToSave } = item;
              onSave({
                ...itemToSave,
                qtyNeeded: finalQtyNeeded,
                qtyHave: finalQtyHave,
                containers: cleanContainers,
                serials: finalSerials,
                status: finalStatus,
                catalogId: manualCatalogLinkId,
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

    {catalogPickerOpen && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={() => setCatalogPickerOpen(false)}>
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <h3 className="text-slate-100 font-semibold text-base">Choose catalog item</h3>
            <button
              onClick={() => setCatalogPickerOpen(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-5 pt-4 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={catalogPickerSearch}
                onChange={(e) => setCatalogPickerSearch(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {catalog.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Your catalog is empty — add items to it first from the Item Catalog screen.
              </p>
            ) : (
              <div className="space-y-2">
                {[...catalog]
                  .filter((c) =>
                    c.name.toLowerCase().includes(catalogPickerSearch.trim().toLowerCase())
                  )
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setManualCatalogLinkId(c.id);
                        setCatalogPickerOpen(false);
                        setCatalogPickerSearch("");
                      }}
                      className="w-full text-left border border-slate-800 rounded-md p-3 hover:border-slate-700"
                    >
                      <p className="text-sm text-slate-100">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.gang} · {c.storage}
                        {c.category ? ` · ${c.category}` : ""}
                      </p>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function SerialsModal({ itemName, serials, onClose }) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? serials.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()))
    : serials;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
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

function TransferListModal({ jobName, items, requisitions = [], catalog = [], onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Pinned items (set from the catalog screen) always sort to the top,
  // ahead of everything else — determined by the item's actual catalog
  // link, not by matching text in the name (which broke on things like a
  // stray space in "Gang Box" vs "Gangbox").
  const isPinned = (item) => {
    const match = getCachedCatalogMatch(item, catalog);
    return !!(match && match.pinned);
  };
  const sortWithPriority = (list, getName) =>
    [...list].sort((a, b) => {
      const pinA = isPinned(a) ? 0 : 1;
      const pinB = isPinned(b) ? 0 : 1;
      if (pinA !== pinB) return pinA - pinB;
      return getName(a).localeCompare(getName(b));
    });

  const transferItems = sortWithPriority(
    items.filter((i) => i.needsTransfer),
    (i) => i.name
  );

  const lineFor = (item) =>
    item.serials && item.serials.length > 0
      ? `${item.name}: ${item.serials.join(", ")}`
      : `${item.name} x${item.qtyHave}`;

  const reqLineFor = (r) => `${r.spec} x${r.qty}${r.location ? ` — ${r.location}` : ""}`;

  const reqCategoriesText = [...new Set(requisitions.map((r) => r.category))]
    .map(
      (cat) =>
        `${cat}:\n${requisitions
          .filter((r) => r.category === cat)
          .map(reqLineFor)
          .join("\n")}`
    )
    .join("\n\n");

  const asText = [
    transferItems.map(lineFor).join("\n"),
    requisitions.length > 0 ? `\nRequisitions:\n${reqCategoriesText}` : "",
  ]
    .filter(Boolean)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="min-w-0">
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-400" />
              Transfer list
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {jobName} · {transferItems.length} item{transferItems.length === 1 ? "" : "s"}
              {requisitions.length > 0
                ? ` · ${requisitions.length} REQ${requisitions.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {transferItems.length === 0 && requisitions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              No items are marked to transfer yet, and there's nothing on the REQ page either.
              Mark items with "Needs transfer" in the item form, or add requisitions from the
              REQ page.
            </p>
          ) : (
            <>
              {transferItems.length > 0 && (
                <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden mb-4">
                  {transferItems.map((item) => (
                    <div key={item.id} className="px-3 py-2 bg-slate-800/40">
                      <p className="text-sm text-slate-100">
                        {item.name}{" "}
                        {!(item.serials && item.serials.length > 0) && (
                          <span className="text-slate-500">x{item.qtyHave}</span>
                        )}
                      </p>
                      {item.serials && item.serials.length > 0 && (
                        <p className="text-xs text-fuchsia-300 font-mono break-words mt-0.5">
                          {item.serials.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {requisitions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Requisitions
                  </p>
                  <div className="space-y-3">
                    {[...new Set(requisitions.map((r) => r.category))].map((cat) => (
                      <div key={cat}>
                        <p className="text-xs font-semibold text-slate-400 mb-1.5">{cat}</p>
                        <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
                          {requisitions
                            .filter((r) => r.category === cat)
                            .map((r) => (
                              <div key={r.id} className="px-3 py-2 bg-slate-800/40">
                                <p className="text-sm text-slate-100">
                                  {r.spec} <span className="text-slate-500">x{r.qty}</span>
                                </p>
                                {r.location && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    📍 {r.location}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {(transferItems.length > 0 || requisitions.length > 0) && (
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
    normalizeReceived(i.received),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
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
    category: "",
    vendor: "",
    needsTransfer: false,
    pinned: false,
  };
}

function CatalogItemForm({ initial, existingCategories = [], existingVendors = [], onSave, onCancel }) {
  const [item, setItem] = useState({ needsTransfer: false, pinned: false, category: "", ...initial });
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
              Category <span className="text-slate-600">(optional)</span>
            </label>
            <input
              list="catalog-category-options"
              value={item.category || ""}
              onChange={(e) => set("category")(e.target.value)}
              placeholder="e.g. Rigging, Hand Tools"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
            <datalist id="catalog-category-options">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Usual vendor <span className="text-slate-600">(optional)</span>
            </label>
            <input
              list="catalog-vendor-options"
              value={item.vendor || ""}
              onChange={(e) => set("vendor")(e.target.value)}
              placeholder="e.g. Fastenal, McMaster-Carr"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
            />
            <datalist id="catalog-vendor-options">
              {existingVendors.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <p className="text-xs text-slate-600 mt-1">
              Never shown on job pages — only used to group outstanding items by vendor on the
              pick list, for ordering purposes.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Always needs transfer when job ships?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => set("needsTransfer")(true)}
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  item.needsTransfer
                    ? "bg-purple-500/15 border-purple-500/50 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                Yes
              </button>
              <button
                onClick={() =>
                  setItem((prev) => ({ ...prev, needsTransfer: false, pinned: false }))
                }
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  !item.needsTransfer
                    ? "bg-purple-500/15 border-purple-500/50 text-purple-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                No
              </button>
              <button
                onClick={() =>
                  setItem((prev) =>
                    prev.pinned
                      ? { ...prev, pinned: false }
                      : { ...prev, pinned: true, needsTransfer: true }
                  )
                }
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  item.pinned
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                Pin
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Items matched to this catalog entry during import will be pre-flagged for
              transfer automatically. Pinned items always sort to the top of the transfer list,
              ahead of everything else.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                  "Come along 3-ton | Raising | Red conex\n3/4in A325 bolts | Bolt Up | Conex row | yes\n7018 welding rod | Welders | Covered"
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

function CatalogModal({
  catalog,
  isEditor,
  onSave,
  onBulkSave,
  onDelete,
  onBulkSetCategory,
  onBulkSetVendor,
  onClose,
}) {
  const [editing, setEditing] = useState(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState({});
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [newVendorText, setNewVendorText] = useState("");

  const existingCategories = [
    ...new Set(catalog.map((c) => c.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const existingVendors = [
    ...new Set(catalog.map((c) => c.vendor).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const filteredCatalog = catalog
    .filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const toggleSelect = (id) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const selectedCatalogIds = Object.keys(selectedIds)
    .filter((id) => selectedIds[id])
    .map(Number);
  const clearSelection = () => {
    setSelectedIds({});
    setSelectMode(false);
  };

  const applyCategory = (category) => {
    onBulkSetCategory(selectedCatalogIds, category);
    setCategoryPickerOpen(false);
    setNewCategoryText("");
    clearSelection();
  };

  const applyVendor = (vendor) => {
    onBulkSetVendor(selectedCatalogIds, vendor);
    setVendorPickerOpen(false);
    setNewVendorText("");
    clearSelection();
  };

  if (editing) {
    return (
      <CatalogItemForm
        initial={editing}
        existingCategories={existingCategories}
        existingVendors={existingVendors}
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
              {isEditor && catalog.length > 0 && (
                <button
                  onClick={() => {
                    if (selectMode) clearSelection();
                    else setSelectMode(true);
                  }}
                  title={selectMode ? "Cancel selecting" : "Select items"}
                  className={`text-xs rounded-md px-2.5 py-1.5 font-medium ${
                    selectMode
                      ? "bg-amber-500/15 border border-amber-500/50 text-amber-300"
                      : "border border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {selectMode ? "Cancel" : "Select"}
                </button>
              )}
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

          <div className="px-5 pt-4 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>

          {selectMode && (
            <div className="flex items-center flex-wrap gap-2 mx-5 mt-3 p-2.5 bg-slate-800/60 border border-amber-600/40 rounded-md shrink-0">
              <span className="text-xs text-slate-300 font-medium">
                {selectedCatalogIds.length} selected
              </span>
              <button
                onClick={() =>
                  setSelectedIds(
                    filteredCatalog.reduce((acc, c) => ({ ...acc, [c.id]: true }), {})
                  )
                }
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Select all ({filteredCatalog.length})
              </button>
              <div className="flex-1" />
              {selectedCatalogIds.length > 0 && (
                <>
                  <button
                    onClick={() => setCategoryPickerOpen(true)}
                    className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-amber-400"
                  >
                    Set category
                  </button>
                  <button
                    onClick={() => setVendorPickerOpen(true)}
                    className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-amber-400"
                  >
                    Set vendor
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {catalog.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                No catalog items yet. Add the materials you commonly order, along with their
                usual gang and storage, so future imports can auto-fill them.
              </p>
            ) : filteredCatalog.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                No catalog items match "{searchQuery}".
              </p>
            ) : (
              <div className="space-y-2">
                {filteredCatalog.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => selectMode && toggleSelect(c.id)}
                    className={`border rounded-md p-3 flex items-center justify-between gap-2 ${
                      selectMode ? "cursor-pointer" : ""
                    } ${
                      selectedIds[c.id]
                        ? "border-amber-500/70 bg-amber-500/5"
                        : "border-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={!!selectedIds[c.id]}
                          onChange={() => toggleSelect(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-amber-500 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500">
                          {c.gang} · {c.storage}
                          {c.category ? ` · ${c.category}` : ""}
                          {c.vendor ? ` · 🏷️ ${c.vendor}` : ""}
                          {c.needsTransfer ? " · 🚚 transfer" : ""}
                        </p>
                      </div>
                    </div>
                    {isEditor && !selectMode && (
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
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isEditor && !selectMode && (
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
          )}
        </div>
      </div>

      {categoryPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setCategoryPickerOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-100 font-semibold mb-3">
              Set category for {selectedCatalogIds.length} item
              {selectedCatalogIds.length === 1 ? "" : "s"}
            </h3>
            {existingCategories.length > 0 && (
              <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                {existingCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => applyCategory(cat)}
                    className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-4">
              <input
                autoFocus
                value={newCategoryText}
                onChange={(e) => setNewCategoryText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newCategoryText.trim() && applyCategory(newCategoryText.trim())}
                placeholder="Or type a new category..."
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                onClick={() => newCategoryText.trim() && applyCategory(newCategoryText.trim())}
                disabled={!newCategoryText.trim()}
                className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
            <button
              onClick={() => applyCategory("")}
              className="w-full text-xs text-slate-500 hover:text-slate-300 mb-2"
            >
              Clear category from selected items
            </button>
            <button
              onClick={() => setCategoryPickerOpen(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {vendorPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setVendorPickerOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-100 font-semibold mb-3">
              Set vendor for {selectedCatalogIds.length} item
              {selectedCatalogIds.length === 1 ? "" : "s"}
            </h3>
            {existingVendors.length > 0 && (
              <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                {existingVendors.map((v) => (
                  <button
                    key={v}
                    onClick={() => applyVendor(v)}
                    className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-4">
              <input
                autoFocus
                value={newVendorText}
                onChange={(e) => setNewVendorText(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && newVendorText.trim() && applyVendor(newVendorText.trim())
                }
                placeholder="Or type a new vendor..."
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                onClick={() => newVendorText.trim() && applyVendor(newVendorText.trim())}
                disabled={!newVendorText.trim()}
                className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
            <button
              onClick={() => applyVendor("")}
              className="w-full text-xs text-slate-500 hover:text-slate-300 mb-2"
            >
              Clear vendor from selected items
            </button>
            <button
              onClick={() => setVendorPickerOpen(false)}
              className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
  catalog = [],
  isEditor,
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
    .filter((i) => {
      const q = pickSearch.trim().toLowerCase();
      if (!q) return true;
      const catalogMatch = getCachedCatalogMatch(i, catalog);
      return (
        i.name.toLowerCase().includes(q) ||
        (catalogMatch && catalogMatch.name.toLowerCase().includes(q))
      );
    });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
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

        {isEditor && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <button
              onClick={() => setPicking(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              Pull items into this container
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRequestsModal({ onClose }) {
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const canvasRef = useRef(null);

  // Points to the genuinely separate field-request app (its own deployment,
  // with none of this app's code in it).
  const fieldUrl = "https://field-suggestions.vercel.app";

  const refresh = async () => {
    setLoading(true);
    const result = await fetchFieldRequests();
    setRequests(result.requests);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, fieldUrl, { width: 200, margin: 1 }, () => {});
    }
  }, [fieldUrl]);

  const markDone = async (id) => {
    await updateFieldRequestStatus(id, "done");
    refresh();
  };
  const reopen = async (id) => {
    await updateFieldRequestStatus(id, "pending");
    refresh();
  };
  const handleDelete = async (id) => {
    await deleteFieldRequest(id);
    setDeleteTarget(null);
    refresh();
  };

  const pending = requests.filter((r) => r.status !== "done");
  const done = requests.filter((r) => r.status === "done");
  const list = tab === "pending" ? pending : done;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">Field requests</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800 shrink-0 flex flex-col items-center">
          <canvas ref={canvasRef} className="rounded-md bg-white p-2" />
          <p className="text-xs text-slate-500 mt-2 text-center">
            Print or share this — anyone who scans it can send a request without seeing any of
            your job data.
          </p>
          <button
            onClick={() => navigator.clipboard && navigator.clipboard.writeText(fieldUrl)}
            className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 mt-1.5"
          >
            Copy link instead
          </button>
        </div>

        <div className="flex border-b border-slate-800 shrink-0">
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 text-sm py-2.5 ${
              tab === "pending"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab("done")}
            className={`flex-1 text-sm py-2.5 ${
              tab === "done"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Done ({done.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-10">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {tab === "pending" ? "Nothing pending right now." : "Nothing marked done yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {list.map((r) => (
                <div key={r.id} className="border border-slate-800 rounded-md p-3">
                  {r.job_or_location && (
                    <p className="text-xs font-semibold text-amber-400 mb-1">
                      {r.job_or_location}
                      {r.gang ? ` · ${r.gang}` : ""}
                    </p>
                  )}
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">{r.text}</p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {r.reported_by ? `${r.reported_by} · ` : ""}
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                  {r.contact_email && (
                    <p className="text-xs text-slate-500">📧 {r.contact_email}</p>
                  )}
                  <div className="flex gap-2 mt-2.5">
                    {tab === "pending" ? (
                      <button
                        onClick={() => markDone(r.id)}
                        className="flex-1 text-xs rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                      >
                        Mark done
                      </button>
                    ) : (
                      <button
                        onClick={() => reopen(r.id)}
                        className="flex-1 text-xs rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="text-slate-600 hover:text-red-400 p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDelete
          title="Delete this request?"
          message="This will be permanently removed."
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function SuggestionsInboxModal({
  suggestions,
  resolvedSuggestions,
  resolvedLoading,
  jobs,
  loading,
  onApprove,
  onDeny,
  onDelete,
  onRevert,
  onReapprove,
  onClose,
}) {
  const [tab, setTab] = useState("pending");
  const [notifStatus, setNotifStatus] = useState("checking");
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    getNotificationStatus().then(setNotifStatus);
  }, []);

  const toggleNotifications = async () => {
    setNotifBusy(true);
    if (notifStatus === "subscribed") {
      await disablePushNotifications();
      setNotifStatus("not-subscribed");
    } else {
      const result = await enablePushNotifications();
      setNotifStatus(result.ok ? "subscribed" : "denied");
    }
    setNotifBusy(false);
  };

  const jobName = (jobId) => jobs.find((j) => String(j.id) === String(jobId))?.name || "Unknown job";

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const suggestionBody = (s) => (
    <>
      <p className="text-xs text-slate-500 mb-1.5">
        {jobName(s.job_id)} · Submitted {formatDate(s.created_at)}
      </p>
      {s.suggestion_type === "new_item" ? (
        <>
          <p className="text-sm text-slate-100 font-semibold">New item: {s.payload.name}</p>
          <p className="text-xs text-slate-500">
            Qty needed: {s.payload.qtyNeeded}
            {s.payload.container ? ` · Container: ${s.payload.container}` : ""}
          </p>
        </>
      ) : s.suggestion_type === "complete_todo" ? (
        <p className="text-sm text-slate-100 font-semibold">
          ✓ Mark To Do done: {s.payload.todoText}
        </p>
      ) : s.suggestion_type === "add_todo" ? (
        <p className="text-sm text-slate-100 font-semibold">
          + New To Do: {s.payload.text}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-100 font-semibold">{s.payload.itemName}</p>
          <p className="text-xs text-slate-500">
            Qty have → {s.payload.qtyHave}
            {s.payload.container?.clear
              ? " · removed from container"
              : s.payload.container
              ? ` · ${s.payload.container.name}: ${s.payload.container.qty}`
              : ""}
            {" · "}
            {s.payload.ordered ? "Ordered" : "Not ordered"} ·{" "}
            {normalizeReceived(s.payload.received) === "yes"
              ? "Received"
              : normalizeReceived(s.payload.received) === "partial"
              ? "Partially received"
              : "Not received"}
          </p>
        </>
      )}
      {s.note && <p className="text-xs text-slate-400 italic mt-1.5">"{s.note}"</p>}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">Suggestions</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {notifStatus !== "checking" && notifStatus !== "unsupported" && (
          <div className="px-5 py-3 border-b border-slate-800 shrink-0 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Bell
                className={`w-4 h-4 shrink-0 ${
                  notifStatus === "subscribed" ? "text-amber-400" : "text-slate-500"
                }`}
              />
              <span className="text-xs text-slate-400 truncate">
                {notifStatus === "subscribed"
                  ? "Notifying this device of new suggestions"
                  : notifStatus === "denied"
                  ? "Notifications blocked — check your browser's site settings"
                  : "Get notified on this device when a suggestion comes in"}
              </span>
            </div>
            {notifStatus !== "denied" && (
              <button
                onClick={toggleNotifications}
                disabled={notifBusy}
                className={`text-xs rounded-md px-2.5 py-1.5 shrink-0 font-medium ${
                  notifStatus === "subscribed"
                    ? "border border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "bg-amber-500 text-slate-950 hover:bg-amber-400"
                } disabled:opacity-50`}
              >
                {notifBusy ? "..." : notifStatus === "subscribed" ? "Turn off" : "Turn on"}
              </button>
            )}
          </div>
        )}

        <div className="flex border-b border-slate-800 shrink-0">
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 text-sm py-2.5 ${
              tab === "pending"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Pending ({suggestions.length})
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 text-sm py-2.5 ${
              tab === "history"
                ? "text-amber-400 border-b-2 border-amber-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            History
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "pending" ? (
            loading ? (
              <div className="flex justify-center py-10">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing pending. Suggestions from anyone viewing your shared link show up
                here.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div key={s.id} className="border border-slate-800 rounded-md p-3">
                    {suggestionBody(s)}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => onDelete(s)}
                        title="Delete — no history kept"
                        className="text-slate-500 hover:text-red-400 px-2.5 rounded-md border border-slate-700 hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeny(s)}
                        className="flex-1 text-xs rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        Ignore
                      </button>
                      <button
                        onClick={() => onApprove(s)}
                        className="flex-1 text-xs rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : resolvedLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : resolvedSuggestions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing resolved yet. Approved and ignored suggestions will show up here.
            </p>
          ) : (
            <div className="space-y-3">
              {resolvedSuggestions.map((s) => (
                <div key={s.id} className="border border-slate-800 rounded-md p-3">
                  {suggestionBody(s)}
                  <p className="text-xs mt-1.5">
                    <span
                      className={
                        s.status === "approved" ? "text-emerald-400" : "text-slate-500"
                      }
                    >
                      {s.status === "approved" ? "✓ Approved" : "✕ Ignored"}
                    </span>
                    <span className="text-slate-600"> · {formatDate(s.resolved_at)}</span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    {s.status === "approved" ? (
                      <button
                        onClick={() => onRevert(s)}
                        className="flex-1 text-xs rounded-md py-2 border border-red-700/50 text-red-400 hover:bg-red-500/10"
                      >
                        Revert this change
                      </button>
                    ) : (
                      <button
                        onClick={() => onReapprove(s)}
                        className="flex-1 text-xs rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                      >
                        Approve after all
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(s)}
                      title="Remove from history"
                      className="text-slate-500 hover:text-red-400 px-2.5 rounded-md border border-slate-700 hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Standard sizes that should always be there for these specific categories,
// so you're not retyping the same list every job — quantities always start
// at 0 and "Add entry" still works normally for anything one-off or new.
const REQUISITION_TEMPLATES = {
  Shims: [
    '1/16"',
    '1/8"',
    '1/4"',
    '1/2"',
    '1"',
    "Safety Cable Washer Bar",
    "Wedge",
    "Tag Line Hook",
  ],
  "Safety Post": ["#7 (Hook Pole)", "#9 (Rectangle)", "#10 (V)"],
};

function ReferenceDocsModal({ job, isEditor, onUpdateJob, onClose }) {
  const docs = job.referenceDocuments || [];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChosen = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow choosing the same file again later
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    const result = await uploadReferenceDocument(job.id, file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error || "Upload failed");
      return;
    }
    onUpdateJob((prevJob) => ({
      ...prevJob,
      referenceDocuments: [
        ...(prevJob.referenceDocuments || []),
        {
          id: Date.now(),
          name: result.name,
          url: result.url,
          path: result.path,
          uploadedAt: timeStamp(),
        },
      ],
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Uploaded reference document "${result.name}"`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const confirmDelete = async () => {
    const doc = deleteTarget;
    setDeleteTarget(null);
    await deleteReferenceDocument(doc.path);
    onUpdateJob((prevJob) => ({
      ...prevJob,
      referenceDocuments: (prevJob.referenceDocuments || []).filter((d) => d.id !== doc.id),
    }));
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Reference documents</h2>
              <p className="text-xs text-slate-500">Original sheets, orders, or drawings for this job</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {docs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing uploaded yet — attach the original PDF this job's items came from, so
                it's easy to reference later.
              </p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-2 border border-slate-800 rounded-md p-3"
                  >
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 min-w-0 flex-1 hover:text-amber-400"
                    >
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-sm text-slate-100 truncate">{doc.name}</span>
                    </a>
                    {isEditor && (
                      <button
                        onClick={() => setDeleteTarget(doc)}
                        className="text-slate-600 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-red-400 mt-3">Couldn't upload: {uploadError}</p>
            )}
          </div>

          {isEditor && (
            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChosen}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading ? "Uploading..." : "Upload PDF"}
              </button>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDelete
          title="Remove this document?"
          message={`"${deleteTarget.name}" will be removed. This can't be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function ReturnDetailPage({ ret, onUpdate, onBack, onGoHome, onDeleteReturn }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [smeText, setSmeText] = useState("");
  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const [deleteReturnConfirm, setDeleteReturnConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const addItem = () => {
    if (!name.trim()) return;
    playSaveChime();
    const newItem = {
      id: Date.now(),
      name: name.trim(),
      qty: qty.trim() === "" ? 0 : Number(qty) || 0,
      sme: parseSerials(smeText),
    };
    onUpdate({ ...ret, items: [...ret.items, newItem] });
    setName("");
    setQty("");
    setSmeText("");
  };

  const deleteItem = (id) => {
    onUpdate({ ...ret, items: ret.items.filter((i) => i.id !== id) });
    setDeleteItemTarget(null);
  };

  const asText = ret.items
    .map((i) => (i.sme.length > 0 ? `${i.name}: ${i.sme.join(", ")}` : `${i.name} x${i.qty}`))
    .join("\n");

  const copyList = async () => {
    const ok = await copyToClipboard(
      `Return — ${ret.jobName} — ${ret.date}\n\n${asText || "(no items yet)"}`
    );
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200 shrink-0">
              <Home className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0" />
                Return — {ret.jobName}
              </p>
              <p className="text-xs text-slate-500">{ret.date}</p>
            </div>
          </div>
          <button
            onClick={() => setDeleteReturnConfirm(true)}
            className="text-slate-500 hover:text-red-400 p-2 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-5">
          <p className="text-xs font-medium text-slate-400 mb-2">Add item</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Item name"
              className="col-span-2 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <input
              type="number"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Qty (0 ok)"
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={smeText}
              onChange={(e) => setSmeText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="SME # (optional)"
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={addItem}
              disabled={!name.trim()}
              className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-4 py-2 hover:bg-amber-400 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {ret.items.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            No items logged yet — add whatever's actually come back in above.
          </p>
        ) : (
          <div className="space-y-2 mb-5">
            {ret.items.map((i) => (
              <div
                key={i.id}
                className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                  i.qty === 0
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      i.qty === 0 ? "text-red-300" : "text-slate-100"
                    }`}
                  >
                    {i.name} <span className="text-slate-500 font-normal">x{i.qty}</span>
                    {i.qty === 0 && (
                      <span className="ml-1.5 text-[10px] font-medium tracking-wide uppercase bg-red-500/15 border border-red-500/40 text-red-300 rounded-full px-1.5 py-0.5">
                        0 qty
                      </span>
                    )}
                  </p>
                  {i.sme.length > 0 && (
                    <p className="text-xs text-fuchsia-300 font-mono mt-0.5 break-words">
                      {i.sme.join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDeleteItemTarget(i)}
                  className="text-slate-600 hover:text-red-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {ret.items.length > 0 && (
          <button
            onClick={copyList}
            className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <Copy className="w-4 h-4" />
            {copied ? "Copied!" : "Copy print-ready list"}
          </button>
        )}
      </main>

      {deleteItemTarget && (
        <ConfirmDelete
          title="Remove this item?"
          message={`"${deleteItemTarget.name}" will be removed from this return.`}
          onConfirm={() => deleteItem(deleteItemTarget.id)}
          onCancel={() => setDeleteItemTarget(null)}
        />
      )}

      {deleteReturnConfirm && (
        <ConfirmDelete
          title="Delete this whole return?"
          message={`The entire return record for ${ret.date} will be permanently removed.`}
          onConfirm={() => onDeleteReturn(ret.id)}
          onCancel={() => setDeleteReturnConfirm(false)}
        />
      )}
    </div>
  );
}

function ReturnsListPage({ returns, onOpenReturn, onBack, onGoHome }) {
  const [collapsed, setCollapsed] = useState({});

  const jobGroups = [...new Map(returns.map((r) => [r.jobId, r.jobName])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1])
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200">
            <Home className="w-4 h-4" />
          </button>
          <p className="font-semibold text-slate-100 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-emerald-400" />
            Returns
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        {jobGroups.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            No returns logged yet — start one from "+ Quick Transfer" on the job picker screen.
          </p>
        ) : (
          <div className="space-y-4">
            {jobGroups.map(([jobId, jobName]) => {
              const entries = returns
                .filter((r) => r.jobId === jobId)
                .sort((a, b) => b.date.localeCompare(a.date));
              const isCollapsed = collapsed[jobId];
              return (
                <div key={jobId}>
                  <button
                    onClick={() => setCollapsed((prev) => ({ ...prev, [jobId]: !prev[jobId] }))}
                    className="w-full flex items-center gap-2 mb-2 text-left"
                  >
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                    <span className="font-semibold text-slate-100">{jobName}</span>
                    <span className="text-xs text-slate-600">
                      {entries.length} return{entries.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 pl-6">
                      {entries.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => onOpenReturn(r)}
                          className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700"
                        >
                          <p className="text-sm font-medium text-slate-100">{r.date}</p>
                          <p className="text-xs text-slate-500">
                            {r.items.length} item{r.items.length === 1 ? "" : "s"}
                            {r.items.some((i) => i.qty === 0) && (
                              <span className="text-red-400"> · some at 0 qty</span>
                            )}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function RequisitionsPage({ job, isEditor, onUpdateJob, onBack }) {
  const requisitions = job.requisitions || [];
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addRowFor, setAddRowFor] = useState(null);
  const [newSpec, setNewSpec] = useState("");
  const [newQty, setNewQty] = useState("");
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [checkMode, setCheckMode] = useState({});

  const categoryOrder = job.requisitionCategoryOrder || [];
  const categories = [
    ...categoryOrder,
    ...[...new Set(requisitions.map((r) => r.category))].filter(
      (c) => !categoryOrder.includes(c)
    ),
  ];

  const entriesFor = (cat) => requisitions.filter((r) => r.category === cat);

  const addCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const template = REQUISITION_TEMPLATES[trimmed];
    const templateEntries = template
      ? template.map((spec, idx) => ({ id: Date.now() + idx, category: trimmed, spec, qty: 0 }))
      : [];
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitionCategoryOrder: [...(prevJob.requisitionCategoryOrder || []), trimmed],
      requisitions: [...(prevJob.requisitions || []), ...templateEntries],
    }));
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const deleteCategory = (cat) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: (prevJob.requisitions || []).filter((r) => r.category !== cat),
      requisitionCategoryOrder: (prevJob.requisitionCategoryOrder || []).filter(
        (c) => c !== cat
      ),
    }));
    setDeleteCategoryTarget(null);
  };

  const addEntry = (category) => {
    const spec = newSpec.trim();
    const qty = Number(newQty) || 0;
    if (!spec) return;
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: [
        ...(prevJob.requisitions || []),
        { id: Date.now(), category, spec, qty },
      ],
    }));
    setNewSpec("");
    setNewQty("");
    setAddRowFor(null);
  };

  const saveEntry = () => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: (prevJob.requisitions || []).map((r) =>
        r.id === editingEntry.id ? editingEntry : r
      ),
    }));
    setEditingEntry(null);
  };

  const qtyInputRefs = useRef({});

  const updateQty = (id, value) => {
    const qty = value === "" ? 0 : Number(value) || 0;
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: (prevJob.requisitions || []).map((r) =>
        r.id === id ? { ...r, qty } : r
      ),
    }));
  };

  const focusNextQty = (rows, currentId) => {
    const idx = rows.findIndex((r) => r.id === currentId);
    const next = rows.slice(idx + 1).find((r) => !r.fulfilled);
    const el = next && qtyInputRefs.current[next.id];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const toggleFulfilled = (id) => {
    playSoftTap();
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: (prevJob.requisitions || []).map((r) =>
        r.id === id ? { ...r, fulfilled: !r.fulfilled } : r
      ),
    }));
  };

  const deleteEntry = (id) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      requisitions: (prevJob.requisitions || []).filter((r) => r.id !== id),
    }));
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-md bg-slate-800 flex items-center justify-center shrink-0 hover:bg-slate-700"
            >
              <ChevronLeft className="w-4.5 h-4.5 text-slate-300" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-100 leading-tight truncate">Requisitions</h1>
              <p className="text-xs text-slate-500 leading-tight truncate">{job.name}</p>
            </div>
          </div>
          {isEditor && (
            <button
              onClick={() => setAddingCategory(true)}
              className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add category</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {categories.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-lg">
            <p className="text-slate-500 text-sm mb-4">
              No requisition categories yet — add one to get started (e.g. Shims, Safety
              Post, Wire).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const rows = entriesFor(cat);
              return (
                <div
                  key={cat}
                  className="border border-slate-800 rounded-lg overflow-hidden flex flex-col"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
                    <h3 className="font-semibold text-slate-100">{cat}</h3>
                    <div className="flex items-center gap-1">
                      {isEditor && rows.length > 0 && (
                        <button
                          onClick={() =>
                            setCheckMode((prev) => ({ ...prev, [cat]: !prev[cat] }))
                          }
                          className={`text-xs rounded-md px-2 py-1 font-medium ${
                            checkMode[cat]
                              ? "bg-emerald-500/15 border border-emerald-500/50 text-emerald-300"
                              : "border border-slate-700 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {checkMode[cat] ? "Done" : "Check off"}
                        </button>
                      )}
                      {isEditor && (
                        <button
                          onClick={() => setDeleteCategoryTarget(cat)}
                          className="text-slate-600 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5 flex-1">
                    {rows.length === 0 && (
                      <p className="text-xs text-slate-600 text-center py-4">Nothing here yet.</p>
                    )}
                    {rows.map((r) =>
                      checkMode[cat] ? (
                        <button
                          key={r.id}
                          onClick={() => toggleFulfilled(r.id)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border text-left transition-colors ${
                            r.fulfilled
                              ? "bg-emerald-500/15 border-emerald-500/60"
                              : "bg-slate-800/40 border-slate-700 hover:border-slate-600"
                          }`}
                        >
                          <span
                            className={`text-sm truncate ${
                              r.fulfilled ? "text-emerald-300" : "text-slate-200"
                            }`}
                          >
                            {r.spec}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs ${
                                r.fulfilled ? "text-emerald-400" : "text-slate-500"
                              }`}
                            >
                              x {r.qty}
                            </span>
                            {r.fulfilled && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </span>
                        </button>
                      ) : editingEntry && editingEntry.id === r.id ? (
                        <div key={r.id} className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editingEntry.spec}
                              onChange={(e) =>
                                setEditingEntry({ ...editingEntry, spec: e.target.value })
                              }
                              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                            <input
                              type="number"
                              value={editingEntry.qty}
                              onChange={(e) =>
                                setEditingEntry({
                                  ...editingEntry,
                                  qty: Number(e.target.value) || 0,
                                })
                              }
                              className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              value={editingEntry.location || ""}
                              onChange={(e) =>
                                setEditingEntry({ ...editingEntry, location: e.target.value })
                              }
                              placeholder="Location (optional)"
                              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-400 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                            />
                            <button
                              onClick={saveEntry}
                              className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2 py-1.5 shrink-0"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingEntry(null)}
                              className="text-slate-500 hover:text-slate-300 p-1 shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={r.id}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-800/60 ${
                            r.fulfilled ? "bg-emerald-500/10 border border-emerald-500/30" : ""
                          }`}
                        >
                          <span className="flex flex-col min-w-0">
                            <span className="flex items-center gap-1.5 min-w-0">
                              {r.fulfilled && isEditor && (
                                <button
                                  onClick={() => toggleFulfilled(r.id)}
                                  title="Uncheck to edit quantity again"
                                  className="shrink-0"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 hover:text-emerald-300" />
                                </button>
                              )}
                              {r.fulfilled && !isEditor && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span
                                className={`text-sm truncate ${
                                  r.fulfilled ? "text-emerald-300" : "text-slate-200"
                                }`}
                              >
                                {r.spec}
                              </span>
                            </span>
                            {r.location && (
                              <span className="text-xs text-slate-500 truncate pl-0">
                                📍 {r.location}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-500">x</span>
                            <input
                              ref={(el) => (qtyInputRefs.current[r.id] = el)}
                              type="number"
                              min="0"
                              value={r.qty}
                              disabled={!isEditor || r.fulfilled}
                              title={r.fulfilled ? "Uncheck this item to edit its quantity" : ""}
                              onChange={(e) => updateQty(r.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  focusNextQty(rows, r.id);
                                }
                              }}
                              onFocus={(e) => e.target.select()}
                              className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60 disabled:opacity-70"
                            />
                            {isEditor && (
                              <>
                                <button
                                  onClick={() => setEditingEntry(r)}
                                  className="text-slate-600 hover:text-slate-300 p-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(r)}
                                  className="text-slate-600 hover:text-red-400 p-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  {isEditor && (
                    <div className="p-3 border-t border-slate-800">
                      {addRowFor === cat ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={newSpec}
                            onChange={(e) => setNewSpec(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addEntry(cat)}
                            placeholder='e.g. 1/16"'
                            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                          />
                          <input
                            type="number"
                            value={newQty}
                            onChange={(e) => setNewQty(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addEntry(cat)}
                            placeholder="qty"
                            className="w-16 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                          />
                          <button
                            onClick={() => addEntry(cat)}
                            className="text-xs bg-amber-500 text-slate-950 font-semibold rounded-md px-2 py-1.5 shrink-0"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setAddRowFor(null);
                              setNewSpec("");
                              setNewQty("");
                            }}
                            className="text-slate-500 hover:text-slate-300 p-1 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddRowFor(cat)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 py-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add entry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isEditor && addingCategory && (
          <div className="mt-4">
            <div className="flex items-center gap-2 max-w-sm">
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="e.g. Shims, Safety Post, Wire"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
              <button
                onClick={addCategory}
                className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-3.5 py-2 shrink-0"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategoryName("");
                }}
                className="text-slate-500 hover:text-slate-300 p-2 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {deleteTarget && (
        <ConfirmDelete
          title="Remove entry?"
          message={`"${deleteTarget.spec}" will be removed.`}
          onConfirm={() => deleteEntry(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deleteCategoryTarget && (
        <ConfirmDelete
          title="Remove category?"
          message={`"${deleteCategoryTarget}" and everything in it will be removed.`}
          onConfirm={() => deleteCategory(deleteCategoryTarget)}
          onCancel={() => setDeleteCategoryTarget(null)}
        />
      )}
    </div>
  );
}

function TodoListModal({
  todos,
  isEditor,
  job,
  onAddCustom,
  onToggleDone,
  onDelete,
  onClearFinished,
  onClose,
}) {
  const [newText, setNewText] = useState("");
  const [sentIds, setSentIds] = useState({});

  // For tasks created from "Add to To Do," the quantity was only ever a
  // snapshot at the moment it was added — this looks up the actual current
  // item so the task reflects reality instead of staying frozen forever.
  const getTodoDisplayText = (t) => {
    if (!t.itemId) return t.text;
    const item = (job.items || []).find((i) => i.id === t.itemId);
    if (!item) return t.text; // item was deleted — fall back to the snapshot
    return `${item.name} — ${item.qtyHave} out of ${item.qtyNeeded}${
      item.qtyUnit ? ` ${item.qtyUnit}` : ""
    }`;
  };

  const [taskSuggestionSent, setTaskSuggestionSent] = useState(false);

  const submitCustom = async () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    if (isEditor) {
      onAddCustom(trimmed);
      setNewText("");
      return;
    }
    setNewText("");
    playSaveChime();
    await submitSuggestion({
      jobId: job.id,
      itemId: null,
      type: "add_todo",
      payload: { text: trimmed },
      note: "",
    });
    setTaskSuggestionSent(true);
    setTimeout(() => setTaskSuggestionSent(false), 2500);
  };

  const handleCheck = async (t) => {
    if (isEditor) {
      onToggleDone(t.id);
      return;
    }
    if (sentIds[t.id]) return;
    setSentIds((prev) => ({ ...prev, [t.id]: true }));
    playSaveChime();
    await submitSuggestion({
      jobId: job.id,
      itemId: null,
      type: "complete_todo",
      payload: { todoId: t.id, todoText: t.text },
      note: "",
    });
  };

  const pending = todos
    .filter((t) => !t.done)
    .sort((a, b) => getTodoDisplayText(a).localeCompare(getTodoDisplayText(b)));
  const done = todos
    .filter((t) => t.done)
    .sort((a, b) => getTodoDisplayText(a).localeCompare(getTodoDisplayText(b)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-emerald-400" />
              To Do
            </h2>
            <p className="text-xs text-slate-500">
              {pending.length} pending · {done.length} done
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isEditor && (
          <p className="text-xs text-slate-500 px-5 pt-3">
            Checking something off sends it to the job owner for approval — it won't mark as
            done until they confirm it.
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {todos.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing here yet. Select items in the job and "Add to To Do," or add a custom
              task below.
            </p>
          ) : (
            <div className="space-y-4">
              {pending.length > 0 && (
                <div className="space-y-2">
                  {pending.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 border border-slate-800 rounded-md p-3"
                    >
                      <input
                        type="checkbox"
                        checked={!isEditor && sentIds[t.id] ? true : false}
                        disabled={!isEditor && !!sentIds[t.id]}
                        onChange={() => handleCheck(t)}
                        className="w-4 h-4 rounded accent-emerald-500 mt-0.5 shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-50"
                      />
                      <p className="text-sm text-slate-100 flex-1 min-w-0">
                        {getTodoDisplayText(t)}
                        {!isEditor && sentIds[t.id] && (
                          <span className="block text-xs text-amber-400 mt-0.5">
                            Sent for approval
                          </span>
                        )}
                      </p>
                      {isEditor && (
                        <button
                          onClick={() => onDelete(t.id)}
                          className="text-slate-600 hover:text-red-400 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600">Done</p>
                    {isEditor && (
                      <button
                        onClick={() => onClearFinished(done.map((t) => t.id))}
                        className="text-xs text-slate-500 hover:text-red-400"
                      >
                        Clear all finished tasks
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {done.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-start gap-3 border border-slate-800/60 rounded-md p-3 opacity-60"
                      >
                        <input
                          type="checkbox"
                          checked={true}
                          disabled={!isEditor}
                          onChange={() => onToggleDone(t.id)}
                          className="w-4 h-4 rounded accent-emerald-500 mt-0.5 shrink-0 cursor-pointer disabled:cursor-default"
                        />
                        <p className="text-sm text-slate-400 line-through flex-1 min-w-0">
                          {getTodoDisplayText(t)}
                        </p>
                        {isEditor && (
                          <button
                            onClick={() => onDelete(t.id)}
                            className="text-slate-600 hover:text-red-400 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          {taskSuggestionSent && (
            <p className="text-xs text-amber-400 mb-2">Task suggestion sent for approval</p>
          )}
          <div className="flex items-center gap-2">
            <input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCustom()}
              placeholder={isEditor ? "Add a custom task..." : "Suggest a task..."}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={submitCustom}
              className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
            >
              {isEditor ? "Add" : "Suggest"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContainersModal({
  containerOptions,
  items,
  catalog = [],
  isEditor,
  initialContainer = null,
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
  const [openContainer, setOpenContainer] = useState(initialContainer);

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
        catalog={catalog}
        isEditor={isEditor}
        onClose={onClose}
        onBack={() => setOpenContainer(null)}
        onPull={(qtyMap) => onPull(openContainer, qtyMap)}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                        {isEditor && (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {isEditor && (
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
          )}
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
          const unit = item.qtyUnit ? " " + escapeHtml(item.qtyUnit) : "";
          const stillNeeded = Math.max(0, (item.qtyNeeded || 0) - (item.qtyHave || 0));
          return `
            <tr>
              <td><div class="checkbox"></div></td>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.qtyNeeded)}${unit}</td>
              <td>${escapeHtml(item.qtyHave)}${unit}</td>
              <td>${escapeHtml(stillNeeded)}${unit}</td>
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
              <tr>
                <th class="cb-col"></th>
                <th>Item</th>
                <th class="qty-col">Qty Requested</th>
                <th class="qty-col">Qty Have</th>
                <th class="qty-col">Qty Needed</th>
                <th class="side-col">Storage</th>
                <th class="side-col">Container</th>
              </tr>
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
  .qty-col { width: 58px; }
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

function PickListModal({ jobName, items, catalog = [], onClose }) {
  const [groupOption, setGroupOption] = useState("gang");
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const filteredItems = outstandingOnly ? items.filter((i) => i.status !== "green") : items;

  const vendorFor = (item) => {
    const match = getEffectiveCatalogMatch(item, catalog);
    return match && match.vendor ? match.vendor : "No vendor set";
  };

  const groups =
    groupOption === "container"
      ? filteredItems.reduce((acc, item) => {
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
      : groupOption === "vendor"
      ? filteredItems.reduce((acc, item) => {
          const key = vendorFor(item);
          (acc[key] = acc[key] || []).push(item);
          return acc;
        }, {})
      : filteredItems.reduce((acc, item) => {
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

  const handleDownloadCsv = () => {
    try {
      const columns = [
        "Item",
        "Qty Requested",
        "Qty Have",
        "Qty Needed",
        "Unit",
        "Gang",
        "Storage",
        "Container",
        "Vendor",
      ];
      const rows = sortedGroupKeys.flatMap((groupKey) =>
        groups[groupKey].map((item) => {
          const stillNeeded = Math.max(0, (item.qtyNeeded || 0) - (item.qtyHave || 0));
          const containersText = (item.containers || [])
            .map((c) => `${c.name}: ${c.qty}`)
            .join("; ");
          const storageText =
            item.storage === "Other" && item.storageDetail ? item.storageDetail : item.storage;
          return [
            item.name,
            item.qtyNeeded,
            item.qtyHave,
            stillNeeded,
            item.qtyUnit || "",
            item.gang,
            storageText,
            containersText,
            vendorFor(item) === "No vendor set" ? "" : vendorFor(item),
          ];
        })
      );
      const csv = [columns, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = jobName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      link.download = `${safeName || "job"}-pick-list.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // download unavailable in this environment
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <Printer className="w-4 h-4 text-slate-400" />
              Print pick list
            </h2>
            <p className="text-xs text-slate-500">
              {jobName} · {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
              {outstandingOnly ? " (partial or none only)" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Group by</label>
            <select
              value={groupOption}
              onChange={(e) => setGroupOption(e.target.value)}
              className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            >
              <option value="gang">Gang</option>
              <option value="storage">Storage location</option>
              <option value="container">Container</option>
              <option value="vendor">Vendor (for ordering)</option>
              <option value="none">Don't group</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={outstandingOnly}
              onChange={(e) => setOutstandingOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            Only include partial or not-started items (skip anything complete)
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {outstandingOnly
                ? "Nothing partial or outstanding — everything in this job is complete."
                : "This job doesn't have any items yet."}
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

        {filteredItems.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-800 shrink-0 space-y-2">
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              <Download className="w-4 h-4" />
              Download pick list (for printing)
            </button>
            <button
              onClick={handleDownloadCsv}
              className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Download className="w-4 h-4" />
              Download as CSV (for Excel)
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

  const updateSerials = (lineId, value) => {
    setPreview((prev) =>
      prev.map((p) => (p.lineId === lineId ? { ...p, serials: parseSerials(value) } : p))
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
          category: match ? match.category || "" : "",
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
                  "Come along 3-ton | 4 | yes | Conex 20-04 | 12290, 12372, 12381, 12388\n3/4in A325 bolts | 500\nGrinder disc 9in | 4 box | yes | Gangbox 19268"
                }
                rows={8}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 font-mono resize-none"
              />
              <p className="text-xs text-slate-600 mt-2">
                Paste one item per line as "name | quantity | ordered (yes/no, optional) |
                container (optional) | SME #s comma-separated (optional)". Add a unit after
                the number if it's not single items — e.g. "4 box" — and it'll carry through.
                A container name that doesn't exist yet gets created automatically. Items
                matching your catalog auto-fill gang and storage. Everything's editable on the
                next screen.
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
                  <div className="mt-2">
                    <input
                      value={(p.serials || []).join(", ")}
                      onChange={(e) => updateSerials(p.lineId, e.target.value)}
                      placeholder="SME #s, comma-separated (optional)"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                    />
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

function SuggestEditModal({ job, item, onSubmit, onClose }) {
  const currentContainer = (item.containers || [])[0];
  const [qtyHave, setQtyHave] = useState(item.qtyHave);
  const [containerName, setContainerName] = useState(currentContainer?.name || "");
  const [containerQty, setContainerQty] = useState(currentContainer?.qty || item.qtyHave);
  const [ordered, setOrdered] = useState(item.ordered);
  const [received, setReceived] = useState(normalizeReceived(item.received));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    playSaveChime();
    const result = await submitSuggestion({
      jobId: job.id,
      itemId: item.id,
      type: "edit_item",
      payload: {
        itemName: item.name,
        qtyHave: Number(qtyHave) || 0,
        container: containerName.trim()
          ? { name: containerName.trim(), qty: Number(containerQty) || 0 }
          : { clear: true },
        ordered,
        received,
      },
      note,
    });
    setSubmitting(false);
    if (result.ok) setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-slate-100 font-semibold mb-1.5">Suggestion sent</h3>
          <p className="text-sm text-slate-500 mb-4">
            The job owner will review it before anything changes.
          </p>
          <button
            onClick={onClose}
            className="w-full text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base">Suggest a change</h2>
            <p className="text-xs text-slate-500">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500">
            You're viewing this job without edit access. Propose a change below — the job
            owner will see it and can approve or ignore it.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Qty have</label>
              <input
                type="number"
                min="0"
                value={qtyHave}
                onChange={(e) => setQtyHave(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none pb-2">
                <input
                  type="checkbox"
                  checked={ordered}
                  onChange={(e) => setOrdered(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-amber-500"
                />
                Ordered
              </label>
              <div className="pb-2">
                <label className="block text-xs text-slate-400 mb-1">Received</label>
                <Select
                  value={received}
                  onChange={setReceived}
                  options={["no", "partial", "yes"]}
                  labels={{ no: "No", partial: "Partial", yes: "Yes" }}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Container
              </label>
              <input
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                placeholder="e.g. Gangbox 12345"
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Qty in that container
              </label>
              <input
                type="number"
                min="0"
                value={containerQty}
                onChange={(e) => setContainerQty(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything else the owner should know..."
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send suggestion"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestNewItemModal({ job, onClose }) {
  const [name, setName] = useState("");
  const [qtyNeeded, setQtyNeeded] = useState("");
  const [container, setContainer] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    playSaveChime();
    const result = await submitSuggestion({
      jobId: job.id,
      itemId: null,
      type: "new_item",
      payload: {
        name: name.trim(),
        qtyNeeded: Number(qtyNeeded) || 1,
        container: container.trim() || null,
      },
      note,
    });
    setSubmitting(false);
    if (result.ok) setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-slate-100 font-semibold mb-1.5">Suggestion sent</h3>
          <p className="text-sm text-slate-500 mb-4">
            The job owner will review it before it's added.
          </p>
          <button
            onClick={onClose}
            className="w-full text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">Suggest a new item</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500">
            You're viewing this job without edit access. Propose an item to add — the job
            owner will see it and can approve or ignore it.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Item name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Qty needed
              </label>
              <input
                type="number"
                min="1"
                value={qtyNeeded}
                onChange={(e) => setQtyNeeded(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Container (optional)
              </label>
              <input
                value={container}
                onChange={(e) => setContainer(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send suggestion"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, selectMode, selected, isEditor, onToggleSelect, onEdit, onDelete, onViewSerials, onSuggestEdit, onOpenContainer }) {
  const handleCardClick = () => {
    if (selectMode) {
      onToggleSelect(item.id);
    } else if (!isEditor) {
      onSuggestEdit(item);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`bg-slate-900 rounded-lg p-4 transition-colors border ${
        selectMode || !isEditor ? "cursor-pointer" : ""
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
                    item.qtyNeeded > 0
                      ? Math.min(100, (item.qtyHave / item.qtyNeeded) * 100)
                      : 100
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
        {!selectMode && isEditor && (
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
        {item.category && (
          <span className="text-xs rounded-full px-2.5 py-1 border border-teal-500/30 bg-teal-500/10 text-teal-300">
            {item.category}
          </span>
        )}
        <span className="text-xs rounded-full px-2.5 py-1 border border-slate-700 text-slate-400">
          {item.storage === "Other" && item.storageDetail ? item.storageDetail : item.storage}
        </span>
        {(item.containers || []).map((c, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              onOpenContainer(c.name);
            }}
            className="text-xs rounded-full px-2.5 py-1 border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50"
          >
            📦 {c.name}: {c.qty}
          </button>
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
            normalizeReceived(item.received) === "yes"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : normalizeReceived(item.received) === "partial"
              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
              : "border-slate-700 text-slate-500"
          }`}
        >
          {normalizeReceived(item.received) === "yes" && <CheckCircle2 className="w-3 h-3" />}
          {normalizeReceived(item.received) === "yes"
            ? "Received"
            : normalizeReceived(item.received) === "partial"
            ? "Partially received"
            : "Not received"}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
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

function TransferOrReturnModal({ onChooseTransfer, onChooseReturn, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
        <h3 className="text-slate-100 font-semibold mb-1.5">Quick Transfer</h3>
        <p className="text-xs text-slate-500 mb-4">What's this for?</p>
        <div className="space-y-2.5">
          <button
            onClick={onChooseTransfer}
            className="w-full text-left border border-slate-700 rounded-md p-3 hover:border-sky-500/50 hover:bg-sky-500/5"
          >
            <p className="text-sm font-medium text-slate-100 flex items-center gap-2">
              <Truck className="w-4 h-4 text-sky-400" />
              Transfer
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Sending items out to the field.
            </p>
          </button>
          <button
            onClick={onChooseReturn}
            className="w-full text-left border border-slate-700 rounded-md p-3 hover:border-emerald-500/50 hover:bg-emerald-500/5"
          >
            <p className="text-sm font-medium text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              Return
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracking items coming back into the shop.
            </p>
          </button>
        </div>
        <button
          onClick={onCancel}
          className="w-full text-sm rounded-md py-2.5 mt-4 border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewReturnModal({ jobs, onSubmit, onCancel }) {
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);

  const realJobs = jobs.filter((j) => !j.isQuickTransfer);
  const filtered = realJobs.filter((j) =>
    j.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (!selectedJob) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <h3 className="text-slate-100 font-semibold">Which job is this return for?</h3>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-5 pt-4 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {search.trim() && (
              <button
                onClick={() =>
                  setSelectedJob({ id: `custom-${search.trim()}`, name: search.trim() })
                }
                className="w-full text-left border border-dashed border-amber-500/40 bg-amber-500/5 rounded-md p-3 hover:border-amber-500/60 mb-3"
              >
                <p className="text-sm text-amber-300">
                  Use "{search.trim()}" as a custom job
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Not tracked in Riggy — just a name for this return.
                </p>
              </button>
            )}
            {filtered.length === 0 ? (
              !search.trim() && (
                <p className="text-sm text-slate-500 text-center py-10">
                  Search for a job, or type any name to use as a custom one.
                </p>
              )
            ) : (
              <div className="space-y-2">
                {filtered.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j)}
                    className="w-full text-left border border-slate-800 rounded-md p-3 hover:border-slate-700"
                  >
                    <p className="text-sm text-slate-100">{j.name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
        <h3 className="text-slate-100 font-semibold mb-1">Return for "{selectedJob.name}"</h3>
        <p className="text-xs text-slate-500 mb-4">When did this come back in?</p>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDate(todayStr)}
            className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
              date === todayStr
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            Today
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedJob(null)}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Back
          </button>
          <button
            onClick={() => onSubmit(selectedJob, date)}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickTransferNameModal({ onSubmit, onCancel }) {
  const [name, setName] = useState("");

  const submit = () => {
    if (name.trim()) onSubmit(name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
        <h3 className="text-slate-100 font-semibold mb-1.5">Quick transfer</h3>
        <p className="text-xs text-slate-500 mb-3">
          Type a job name, a person's name, or wherever it's headed — "Comealong, 5" style
          entries under it will group together every time you use this same name again.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. John, or Job 2442"
          className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Continue
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

function JobCard({
  job,
  indent,
  outstanding,
  entryCount,
  isEditor,
  onSelect,
  onRename,
  onDelete,
}) {
  const borderClass = job.isQuickTransfer
    ? "border-l-sky-500"
    : job.parentId
    ? "border-l-purple-500"
    : job.color
    ? JOB_COLOR_BORDER[job.color]
    : "border-l-slate-800";
  const items = job.items || [];
  const completeCount = items.filter((i) => i.status === "green").length;
  const completePct = items.length > 0 ? Math.round((completeCount / items.length) * 100) : 0;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-slate-900 border-t border-r border-b border-slate-800 border-l-4 ${borderClass} rounded-lg p-4 hover:border-slate-700 transition-colors flex items-center justify-between gap-3 ${
        indent ? "ml-6" : ""
      }`}
      style={indent ? { width: "calc(100% - 1.5rem)" } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
            job.isQuickTransfer
              ? "bg-sky-500/10"
              : job.parentId
              ? "bg-purple-500/10"
              : "bg-slate-800"
          }`}
        >
          {job.isQuickTransfer ? (
            <Truck className="w-4 h-4 text-sky-400" />
          ) : (
            <Briefcase
              className={`w-4 h-4 ${job.parentId ? "text-purple-400" : "text-slate-400"}`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100 truncate flex items-center gap-1.5">
            {job.name}
            {job.isQuickTransfer && (
              <span className="text-[10px] font-medium tracking-wide uppercase bg-sky-500/10 border border-sky-500/40 text-sky-300 rounded-full px-1.5 py-0.5 shrink-0">
                Quick
              </span>
            )}
            {!job.isQuickTransfer && job.parentId && (
              <span className="text-[10px] font-medium tracking-wide uppercase bg-purple-500/10 border border-purple-500/40 text-purple-300 rounded-full px-1.5 py-0.5 shrink-0">
                Sub-job
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {entryCount !== undefined ? (
              <>
                {entryCount} entr{entryCount === 1 ? "y" : "ies"}
              </>
            ) : (
              <>
                {items.length} item{items.length === 1 ? "" : "s"}
                {" ("}
                {items.reduce((sum, i) => sum + (Number(i.qtyNeeded) || 0), 0)} units)
                {outstanding > 0
                  ? ` · ${outstanding} outstanding (${items
                      .filter((i) => i.status !== "green")
                      .reduce(
                        (sum, i) =>
                          sum + Math.max(0, (Number(i.qtyNeeded) || 0) - (Number(i.qtyHave) || 0)),
                        0
                      )} units)`
                  : " · all complete"}
              </>
            )}
          </p>
          {items.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 max-w-[160px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${completePct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{completePct}%</span>
            </div>
          )}
        </div>
      </div>
      {isEditor && (
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
      )}
    </button>
  );
}

function JobPicker({
  jobs,
  catalog,
  isEditor,
  onRequestLogin,
  onSelect,
  onCreateClick,
  onCreateQuickTransferClick,
  onCreateSubJobClick,
  onDeleteRequest,
  onRenameRequest,
  onResetRequest,
  onOpenCatalog,
  onExportAll,
  onImportAll,
  onSignOut,
  pendingSuggestionCount,
  onOpenSuggestions,
  onOpenFieldRequests,
  pendingFieldRequestCount,
  onOpenReturnsList,
  returnsCount,
  onCheckForUpdate,
  updateCheckMessage,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [itemResultsCollapsed, setItemResultsCollapsed] = useState({});

  // The actual search runs against this debounced value instead of the raw
  // input, so a fast typist doesn't trigger a full re-scan of every item in
  // every job on every single keystroke — only once things pause briefly.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const [backupFolderName, setBackupFolderName] = useState(null);
  const [backupFolderChecked, setBackupFolderChecked] = useState(false);

  useEffect(() => {
    if (!FS_ACCESS_SUPPORTED) {
      setBackupFolderChecked(true);
      return;
    }
    loadBackupDirectoryHandle().then((handle) => {
      setBackupFolderName(handle ? handle.name : null);
      setBackupFolderChecked(true);
    });
  }, []);

  const handleChooseBackupFolder = async () => {
    const result = await chooseBackupFolder();
    if (result.ok) setBackupFolderName(result.name);
  };

  const handleClearBackupFolder = async () => {
    await clearBackupDirectoryHandle();
    setBackupFolderName(null);
  };

  const topLevel = jobs.filter((j) => !j.parentId && !j.isQuickTransfer);
  const quickTransferJobs = jobs.filter((j) => j.isQuickTransfer && !j.parentId);
  const childrenOf = (parentId) => jobs.filter((j) => j.parentId === parentId);

  // The catalog link for a given item never depends on what's being typed
  // into the search box — only on the item itself and the catalog. Working
  // it out once here (and only again when jobs/catalog actually change)
  // means the search itself, below, is just a cheap lookup per keystroke
  // instead of re-running the catalog matching logic on every item, on
  // every job, every single time a letter is typed.
  const catalogMatchByItemKey = useMemo(() => {
    const map = new Map();
    jobs.forEach((j) => {
      (j.items || []).forEach((i) => {
        map.set(`${j.id}-${i.id}`, getCachedCatalogMatch(i, catalog));
      });
    });
    return map;
  }, [jobs, catalog]);

  const query = debouncedSearchQuery.trim().toLowerCase();
  const searching = query.length > 0;

  const matchingJobs = searching
    ? jobs.filter((j) => j.name.toLowerCase().includes(query))
    : [];

  const matchingItemResultsByJob = useMemo(() => {
    if (!searching) return [];
    const byGroupKey = new Map();
    jobs.forEach((j) => {
      // Quick transfer entries roll up under their shared parent folder for
      // display purposes — otherwise every single timestamped transfer
      // would show as its own separate group instead of collapsing
      // together the same way they do on the job picker screen.
      const groupJob =
        j.isQuickTransfer && j.parentId
          ? jobs.find((p) => p.id === j.parentId) || j
          : j;
      (j.items || []).forEach((i) => {
        const catalogMatch = catalogMatchByItemKey.get(`${j.id}-${i.id}`);
        const matches =
          i.name.toLowerCase().includes(query) ||
          (i.category || "").toLowerCase().includes(query) ||
          (i.serials || []).some((s) => s.toLowerCase().includes(query)) ||
          (catalogMatch && catalogMatch.name.toLowerCase().includes(query));
        if (!matches) return;
        const matchedSerial = (i.serials || []).find((s) => s.toLowerCase().includes(query));
        if (!byGroupKey.has(groupJob.id)) byGroupKey.set(groupJob.id, { job: groupJob, results: [] });
        // navJobId is where this specific item actually lives — needed since
        // that may be a child entry even though the group is shown under
        // its parent's name.
        byGroupKey.get(groupJob.id).results.push({ item: i, matchedSerial, navJobId: j.id });
      });
    });
    return [...byGroupKey.values()].sort((a, b) => a.job.name.localeCompare(b.job.name));
  }, [searching, query, jobs, catalogMatchByItemKey]);

  const totalMatchingItems = matchingItemResultsByJob.reduce(
    (sum, g) => sum + g.results.length,
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {updateCheckMessage && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-4 py-2 shadow-lg">
          {updateCheckMessage}
        </div>
      )}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onCheckForUpdate}
              title="Check for updates"
              className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center active:scale-90 transition-transform"
            >
              <Package className="w-4.5 h-4.5 text-slate-950" strokeWidth={2.5} />
            </button>
            <div>
              <h1 className="font-bold text-slate-100 leading-tight flex items-center gap-2">
                Riggy
                {!isEditor && (
                  <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-400 rounded-full px-2 py-0.5">
                    View only
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 leading-tight">Select a job 🌐</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditor && (
              <button
                onClick={onOpenSuggestions}
                title="Suggestions"
                className={`relative flex items-center justify-center rounded-md p-2 border ${
                  pendingSuggestionCount > 0
                    ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/25"
                    : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <Inbox className="w-4 h-4" />
                {pendingSuggestionCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingSuggestionCount > 9 ? "9+" : pendingSuggestionCount}
                  </span>
                )}
              </button>
            )}
            {isEditor && (
              <button
                onClick={onOpenFieldRequests}
                title="Field requests"
                className={`relative flex items-center justify-center rounded-md p-2 border ${
                  pendingFieldRequestCount > 0
                    ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/25"
                    : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <QrCode className="w-4 h-4" />
                {pendingFieldRequestCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendingFieldRequestCount > 9 ? "9+" : pendingFieldRequestCount}
                  </span>
                )}
              </button>
            )}
            {isEditor && (
              <button
                onClick={onOpenReturnsList}
                title="Returns"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenCatalog}
              title="Item catalog"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            {isEditor ? (
              <button
                onClick={onSignOut}
                title="Log out"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onRequestLogin}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 px-1"
              >
                Log in to edit
              </button>
            )}
            {isEditor && (
              <button
                onClick={onCreateQuickTransferClick}
                className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-slate-700"
              >
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">Quick Transfer</span>
              </button>
            )}
            {isEditor && (
              <button
                onClick={onCreateClick}
                className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New job</span>
              </button>
            )}
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
              placeholder="Search job names, items, or SME #s across all jobs..."
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
            {matchingJobs.length === 0 && totalMatchingItems === 0 ? (
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
                        const outstanding = (job.items || []).filter((i) => i.status !== "green").length;
                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            indent={false}
                            outstanding={outstanding}
                            isEditor={isEditor}
                            onSelect={() => onSelect(job.id)}
                            onRename={onRenameRequest}
                            onDelete={onDeleteRequest}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                {totalMatchingItems > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Items ({totalMatchingItems})
                    </p>
                    <div className="space-y-3">
                      {matchingItemResultsByJob.map(({ job, results }) => {
                        const isCollapsed = itemResultsCollapsed[job.id];
                        const dotClass = job.isQuickTransfer
                          ? "bg-sky-500"
                          : job.parentId
                          ? "bg-purple-500"
                          : "bg-slate-600";
                        return (
                          <div key={job.id}>
                            <button
                              onClick={() =>
                                setItemResultsCollapsed((prev) => ({
                                  ...prev,
                                  [job.id]: !prev[job.id],
                                }))
                              }
                              className="w-full flex items-center gap-2 mb-2 text-left"
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
                                  isCollapsed ? "-rotate-90" : ""
                                }`}
                              />
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                              <span className="text-sm font-medium text-slate-200 truncate">
                                {job.name}
                              </span>
                              {job.isQuickTransfer && (
                                <span className="text-[10px] font-medium tracking-wide uppercase bg-sky-500/10 border border-sky-500/40 text-sky-300 rounded-full px-1.5 py-0.5 shrink-0">
                                  Quick
                                </span>
                              )}
                              {!job.isQuickTransfer && job.parentId && (
                                <span className="text-[10px] font-medium tracking-wide uppercase bg-purple-500/10 border border-purple-500/40 text-purple-300 rounded-full px-1.5 py-0.5 shrink-0">
                                  Sub-job
                                </span>
                              )}
                              <span className="text-xs text-slate-600 shrink-0">
                                {results.length} item{results.length === 1 ? "" : "s"}
                              </span>
                            </button>
                            {!isCollapsed && (
                              <div className="space-y-2">
                                {results.map(({ item, matchedSerial, navJobId }) => (
                                  <button
                                    key={item.id}
                                    onClick={() => onSelect(navJobId)}
                                    className="w-full text-left bg-slate-900 border border-slate-800 rounded-md p-3 hover:border-slate-700"
                                  >
                                    <p className="text-sm text-slate-100 truncate">{item.name}</p>
                                    <p className="text-xs text-slate-500">
                                      Have {item.qtyHave} of {item.qtyNeeded}
                                      {item.qtyUnit ? ` ${item.qtyUnit}` : ""} · {item.gang}
                                    </p>
                                    {(item.containers || []).length > 0 && (
                                      <p className="text-xs text-slate-500">
                                        📦{" "}
                                        {item.containers
                                          .map((c) => `${c.name}: ${c.qty}`)
                                          .join(", ")}
                                      </p>
                                    )}
                                    {matchedSerial && (
                                      <p className="text-xs text-fuchsia-300 font-mono mt-0.5">
                                        Matched SME #: {matchedSerial}
                                      </p>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg">
            <Briefcase className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm mb-4">
              {isEditor
                ? "No jobs yet. Create one to start tracking inventory."
                : "No jobs to show."}
            </p>
            {isEditor && (
              <button
                onClick={onCreateClick}
                className="inline-flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-4 py-2 hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                New job
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {topLevel.map((job) => {
              const outstanding = (job.items || []).filter((i) => i.status !== "green").length;
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
                        isEditor={isEditor}
                        onSelect={() => onSelect(job.id)}
                        onRename={onRenameRequest}
                        onDelete={onDeleteRequest}
                      />
                    </div>
                  </div>

                  {!isCollapsed && children.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {children.map((child) => {
                        const childOutstanding = (child.items || []).filter(
                          (i) => i.status !== "green"
                        ).length;
                        return (
                          <JobCard
                            key={child.id}
                            job={child}
                            indent
                            outstanding={childOutstanding}
                            isEditor={isEditor}
                            onSelect={() => onSelect(child.id)}
                            onRename={onRenameRequest}
                            onDelete={onDeleteRequest}
                          />
                        );
                      })}
                    </div>
                  )}

                  {isEditor && (
                    <button
                      onClick={() => onCreateSubJobClick(job)}
                      className="ml-6 mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400"
                    >
                      <Plus className="w-3 h-3" />
                      Add sub-job under "{job.name}"
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!searching && quickTransferJobs.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Quick Transfers
            </p>
            <div className="space-y-2.5">
              {quickTransferJobs.map((job) => {
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
                      <div className="flex-1 min-w-0 px-1 py-1">
                        <p className="font-semibold text-slate-100 text-base flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-sky-400 shrink-0" />
                          <span className="truncate">{job.name}</span>
                          <span className="text-[10px] font-medium tracking-wide uppercase bg-sky-500/10 border border-sky-500/40 text-sky-300 rounded-full px-1.5 py-0.5 shrink-0">
                            Quick
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {children.length} entr{children.length === 1 ? "y" : "ies"}
                        </p>
                      </div>
                    </div>

                    {!isCollapsed && children.length > 0 && (
                      <div className="mt-2.5 space-y-2.5">
                        {children.map((child) => {
                          const childOutstanding = (child.items || []).filter(
                            (i) => i.status !== "green"
                          ).length;
                          return (
                            <JobCard
                              key={child.id}
                              job={child}
                              indent
                              outstanding={childOutstanding}
                              isEditor={isEditor}
                              onSelect={() => onSelect(child.id)}
                              onRename={onRenameRequest}
                              onDelete={onDeleteRequest}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          {isEditor && (
            <button
              onClick={onResetRequest}
              className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
            >
              Reset all data
            </button>
          )}
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              onClick={onExportAll}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
            >
              Export all data (backup)
            </button>
            {isEditor && (
              <>
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
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-700 mt-2">
            Build: {new Date(__BUILD_TIME__).toLocaleString()}
          </p>
          {isEditor && backupFolderChecked && FS_ACCESS_SUPPORTED && (
            <div className="mt-3 text-xs text-slate-600">
              {backupFolderName ? (
                <span>
                  Backups saving to "{backupFolderName}" —{" "}
                  <button
                    onClick={handleClearBackupFolder}
                    className="underline underline-offset-2 hover:text-slate-400"
                  >
                    stop using this folder
                  </button>
                </span>
              ) : (
                <button
                  onClick={handleChooseBackupFolder}
                  className="underline underline-offset-2 hover:text-slate-400"
                >
                  Choose a folder for automatic backups
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function JobInventory({
  job,
  isEditor,
  onRequestLogin,
  onUpdateJob,
  onBackToJobs,
  catalog,
  onSaveCatalogItem,
  onOpenCatalog,
  onRenameJob,
}) {
  const items = job.items || [];
  const containerOptions = job.containerOptions || [];
  const categoryOptions = job.categoryOptions || [];
  const activityLog = job.activityLog || [];
  const [formState, setFormState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [serialsView, setSerialsView] = useState(null);
  const [transferListOpen, setTransferListOpen] = useState(false);
  const [gangFilter, setGangFilter] = useState("All");
  const [storageFilter, setStorageFilter] = useState("All");
  const [containerFilter, setContainerFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [procFilter, setProcFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [groupByGang, setGroupByGang] = useState(true);
  const [collapsedGangs, setCollapsedGangs] = useState({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState({});
  const [bulkGangPicker, setBulkGangPicker] = useState(false);
  const [bulkStoragePicker, setBulkStoragePicker] = useState(false);
  const [bulkContainerPicker, setBulkContainerPicker] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [referenceDocsOpen, setReferenceDocsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [containersOpen, setContainersOpen] = useState(false);
  const [containerToOpen, setContainerToOpen] = useState(null);

  const openContainerFromItem = (containerName) => {
    setContainerToOpen(containerName);
    setContainersOpen(true);
  };
  const [pickListOpen, setPickListOpen] = useState(false);
  const [todoListOpen, setTodoListOpen] = useState(false);
  const [suggestEditTarget, setSuggestEditTarget] = useState(null);
  const [suggestNewItemOpen, setSuggestNewItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [requisitionsOpen, setRequisitionsOpen] = useState(false);

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

  const addCategory = (name) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      categoryOptions: (prevJob.categoryOptions || []).includes(name)
        ? prevJob.categoryOptions
        : [...(prevJob.categoryOptions || []), name],
    }));
  };

  const [categorySync, setCategorySync] = useState(null); // { preview, applied }

  const buildCategorySyncPreview = () => {
    const changes = [];
    items.forEach((i) => {
      // Respects a manual catalog link first (from the item form's "Choose
      // catalog item"), falling back to automatic name-matching otherwise —
      // same priority the item edit form itself uses.
      const match = i.catalogId
        ? catalog.find((c) => c.id === i.catalogId)
        : findCatalogMatch(i.name, catalog);
      if (!match) return;

      const fieldChanges = {};
      if (match.gang && match.gang !== i.gang) fieldChanges.gang = match.gang;
      if (match.storage && match.storage !== i.storage) fieldChanges.storage = match.storage;
      // Category still only fills in if missing — never overwrites one you
      // deliberately chose by hand, unlike gang/storage which should match
      // the catalog template once something is actually linked to it.
      if (!i.category && match.category) fieldChanges.category = match.category;
      if (!!match.needsTransfer !== !!i.needsTransfer) {
        fieldChanges.needsTransfer = !!match.needsTransfer;
      }

      if (Object.keys(fieldChanges).length > 0) {
        changes.push({ id: i.id, name: i.name, fieldChanges });
      }
    });
    return changes;
  };

  const applyCategorySyncPreview = (preview) => {
    const byId = new Map(preview.map((c) => [c.id, c.fieldChanges]));
    const newCategoryNames = [
      ...new Set(preview.map((c) => c.fieldChanges.category).filter(Boolean)),
    ];
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.map((i) =>
        byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i
      ),
      categoryOptions: [
        ...new Set([...(prevJob.categoryOptions || []), ...newCategoryNames]),
      ],
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Synced gang/storage/category/transfer from catalog for ${preview.length} item${
            preview.length === 1 ? "" : "s"
          }`,
        },
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
    if (procFilter === "ordered_awaiting")
      return item.ordered && normalizeReceived(item.received) === "no";
    if (procFilter === "partially_received") return normalizeReceived(item.received) === "partial";
    if (procFilter === "received") return normalizeReceived(item.received) === "yes";
    return true;
  };

  const matchesSearch = (item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const catalogMatch = getCachedCatalogMatch(item, catalog);
    return (
      item.name.toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q) ||
      (item.containers || []).some((c) => c.name.toLowerCase().includes(q)) ||
      (item.notes || "").toLowerCase().includes(q) ||
      (item.serials || []).some((sn) => sn.toLowerCase().includes(q)) ||
      (catalogMatch && catalogMatch.name.toLowerCase().includes(q))
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
        (categoryFilter === "All" || i.category === categoryFilter) &&
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
    playSoftTap();
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
    playSaveChime();
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
    bulkUpdate((i) => ({ ...i, received: value }), `Marked received: ${value}`);
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
        // Preserves whatever you actually have on hand, exactly as-is —
        // whether that's less than what's needed (a normal partial item),
        // exactly enough, or more than needed (a genuine surplus). Moving
        // an item to a different container should never change how many
        // of it you actually have.
        const qty = i.qtyHave;
        const containers = [{ name: container, qty }];
        const status = qty >= i.qtyNeeded ? "green" : qty > 0 ? "yellow" : "red";
        return { ...i, containers, qtyHave: qty, status };
      },
      `Moved to container "${container}"`
    );
    setBulkContainerPicker(false);
  };

  const [bulkCatalogPicker, setBulkCatalogPicker] = useState(false);
  const [bulkCatalogPickerSearch, setBulkCatalogPickerSearch] = useState("");

  const bulkSetCatalogLink = (catalogItem) => {
    bulkUpdate(
      (i) => ({ ...i, catalogId: catalogItem.id }),
      `Linked to catalog item "${catalogItem.name}"`
    );
    setBulkCatalogPicker(false);
    setBulkCatalogPickerSearch("");
  };

  const todos = job.todos || [];

  const addCustomTodo = (text) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: [
        ...(prevJob.todos || []),
        { id: Date.now(), text, done: false, itemId: null },
      ],
    }));
  };

  const bulkAddToTodo = () => {
    playSaveChime();
    const newTodos = selectedItemIds.map((id, idx) => {
      const item = items.find((i) => i.id === id);
      const text = `${item.name} — ${item.qtyHave} out of ${item.qtyNeeded}${
        item.qtyUnit ? ` ${item.qtyUnit}` : ""
      }`;
      return { id: Date.now() + idx, text, done: false, itemId: id };
    });
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: [...(prevJob.todos || []), ...newTodos],
      activityLog: [
        {
          id: Date.now(),
          time: timeStamp(),
          message: `Added ${newTodos.length} item${
            newTodos.length === 1 ? "" : "s"
          } to To Do`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
    clearSelection();
    setTodoListOpen(true);
  };

  const toggleTodoDone = (id) => {
    playSoftTap();
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: (prevJob.todos || []).map((t) =>
        t.id === id ? { ...t, done: !t.done } : t
      ),
    }));
  };

  const deleteTodo = (id) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: (prevJob.todos || []).filter((t) => t.id !== id),
    }));
  };

  const clearFinishedTodos = (ids) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: (prevJob.todos || []).filter((t) => !ids.includes(t.id)),
    }));
  };

  const bulkDelete = () => {
    playSaveChime();
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
        category: p.category || "",
        serials: p.serials || [],
        needsTransfer: !!p.needsTransfer,
        ordered: !!p.ordered,
      };
    });
    const newContainerNames = [
      ...new Set(
        newItems.flatMap((i) => i.containers.map((c) => c.name)).filter(Boolean)
      ),
    ];
    const newCategoryNames = [
      ...new Set(newItems.map((i) => i.category).filter(Boolean)),
    ];
    const matchedCount = previewRows.filter((p) => p.matched).length;
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: [...prevJob.items, ...newItems],
      containerOptions: [
        ...prevJob.containerOptions,
        ...newContainerNames.filter((name) => !prevJob.containerOptions.includes(name)),
      ],
      categoryOptions: [
        ...(prevJob.categoryOptions || []),
        ...newCategoryNames.filter(
          (name) => !(prevJob.categoryOptions || []).includes(name)
        ),
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
    totalUnits: items.reduce((sum, i) => sum + (Number(i.qtyNeeded) || 0), 0),
    ordered: items.filter((i) => i.ordered).length,
    orderedUnits: items
      .filter((i) => i.ordered)
      .reduce((sum, i) => sum + (Number(i.qtyNeeded) || 0), 0),
    received: items.filter((i) => normalizeReceived(i.received) === "yes").length,
    receivedUnits: items
      .filter((i) => normalizeReceived(i.received) === "yes")
      .reduce((sum, i) => sum + (Number(i.qtyNeeded) || 0), 0),
    complete: items.filter((i) => i.status === "green").length,
    completeUnits: items
      .filter((i) => i.status === "green")
      .reduce((sum, i) => sum + (Number(i.qtyNeeded) || 0), 0),
    outstanding: items.filter((i) => i.status !== "green").length,
    // Outstanding shows the actual remaining gap (still needed minus what's
    // on hand), not just the total scope of those items — that's the more
    // useful number for "what's actually left to get."
    outstandingUnits: items
      .filter((i) => i.status !== "green")
      .reduce((sum, i) => sum + Math.max(0, (Number(i.qtyNeeded) || 0) - (Number(i.qtyHave) || 0)), 0),
  };

  if (requisitionsOpen) {
    return (
      <RequisitionsPage
        job={job}
        isEditor={isEditor}
        onUpdateJob={onUpdateJob}
        onBack={() => setRequisitionsOpen(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {categorySync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={() => setCategorySync(null)}>
          <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-800 shrink-0">
              <h2 className="text-slate-100 font-semibold text-base">
                {categorySync.applied
                  ? "Categories updated"
                  : categorySync.preview.length === 0
                  ? "Nothing to sync"
                  : `Sync ${categorySync.preview.length} item${
                      categorySync.preview.length === 1 ? "" : "s"
                    } from catalog?`}
              </h2>
              {!categorySync.applied && categorySync.preview.length === 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Every item already matches its catalog entry, or has no catalog link to pull
                  from.
                </p>
              )}
            </div>
            {categorySync.preview.length > 0 && (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {categorySync.preview.map((c) => (
                  <div
                    key={c.id}
                    className="text-sm border border-slate-800 rounded-md px-3 py-2"
                  >
                    <p className="text-slate-200 truncate mb-1">{c.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {c.fieldChanges.gang && (
                        <span className="text-teal-300">Gang → {c.fieldChanges.gang}</span>
                      )}
                      {c.fieldChanges.storage && (
                        <span className="text-teal-300">
                          Storage → {c.fieldChanges.storage}
                        </span>
                      )}
                      {c.fieldChanges.category && (
                        <span className="text-teal-300">
                          Category → {c.fieldChanges.category}
                        </span>
                      )}
                      {c.fieldChanges.needsTransfer !== undefined && (
                        <span className="text-teal-300">
                          🚚 Transfer → {c.fieldChanges.needsTransfer ? "Yes" : "No"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 px-5 py-4 border-t border-slate-800 shrink-0">
              {categorySync.applied || categorySync.preview.length === 0 ? (
                <button
                  onClick={() => setCategorySync(null)}
                  className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setCategorySync(null)}
                    className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      applyCategorySyncPreview(categorySync.preview);
                      setCategorySync({ preview: categorySync.preview, applied: true });
                    }}
                    className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                  >
                    Apply
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
              onClick={() => setRequisitionsOpen(true)}
              title="Requisitions"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-md px-2.5 py-2 hover:bg-slate-700"
            >
              REQ
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="More actions"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-40 overflow-hidden">
                  {isEditor && (
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
                  )}
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
                  {isEditor && (
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
                  )}

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
                  {isEditor && (
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
                  )}
                  <button
                    onClick={() => {
                      setTodoListOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <ListChecks className="w-4 h-4 text-slate-400" />
                    To Do{" "}
                    {todos.filter((t) => !t.done).length > 0 && (
                      <span className="text-xs text-emerald-400">
                        ({todos.filter((t) => !t.done).length})
                      </span>
                    )}
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
                  <button
                    onClick={() => {
                      setReferenceDocsOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    Reference documents
                    {(job.referenceDocuments || []).length > 0 && (
                      <span className="text-xs text-slate-500 ml-auto">
                        ({job.referenceDocuments.length})
                      </span>
                    )}
                  </button>
                  {isEditor && (
                    <button
                      onClick={() => {
                        setCategorySync({ preview: buildCategorySyncPreview(), applied: false });
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                    >
                      <Layers className="w-4 h-4 text-slate-400" />
                      Sync from catalog
                    </button>
                  )}
                </div>
            )}
            {isEditor ? (
              <button
                onClick={() => setFormState(emptyItem(STORAGE_OPTIONS[0]))}
                className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add item</span>
              </button>
            ) : (
              <button
                onClick={() => setSuggestNewItemOpen(true)}
                className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-slate-700"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Suggest item</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[5]" onClick={() => setMenuOpen(false)} />
      )}

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
          <div
            className="bg-slate-900 border border-slate-800 rounded-md p-3"
            title="Item entries / total units needed across all of them"
          >
            <p className="text-xs text-slate-500">Items</p>
            <p className="text-lg font-bold text-slate-100">
              {counts.total}
              <span className="text-slate-500 font-normal"> / {counts.totalUnits}</span>
            </p>
          </div>
          <div
            className="bg-slate-900 border border-slate-800 rounded-md p-3"
            title="Item entries / total units ordered across all of them"
          >
            <p className="text-xs text-slate-500">Ordered</p>
            <p className="text-lg font-bold text-slate-100">
              {counts.ordered}
              <span className="text-slate-500 font-normal"> / {counts.orderedUnits}</span>
            </p>
          </div>
          <div
            className="bg-slate-900 border border-slate-800 rounded-md p-3"
            title="Item entries / total units received across all of them"
          >
            <p className="text-xs text-slate-500">Received</p>
            <p className="text-lg font-bold text-slate-100">
              {counts.received}
              <span className="text-slate-500 font-normal"> / {counts.receivedUnits}</span>
            </p>
          </div>
          <div
            className="bg-slate-900 border border-slate-800 rounded-md p-3"
            title="Item entries / total units across all of them"
          >
            <p className="text-xs text-slate-500">Complete</p>
            <p className="text-lg font-bold text-emerald-400">
              {counts.complete}
              <span className="text-slate-500 font-normal"> / {counts.completeUnits}</span>
            </p>
          </div>
          <div
            className="bg-slate-900 border border-slate-800 rounded-md p-3"
            title="Item entries / units still actually needed (not yet on hand)"
          >
            <p className="text-xs text-slate-500">Outstanding</p>
            <p className="text-lg font-bold text-amber-400">
              {counts.outstanding}
              <span className="text-slate-500 font-normal"> / {counts.outstandingUnits}</span>
            </p>
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
          <div className="flex-1 min-w-0">
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={["All", ...[...categoryOptions].sort((a, b) => a.localeCompare(b))]}
              labels={{ All: "All categories" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3.5 shrink-0" />
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setStatusFilter("All")}
              title="All statuses"
              className={`w-8 h-8 rounded-full shrink-0 transition-transform ${
                statusFilter === "All" ? "ring-2 ring-offset-2 ring-offset-slate-950 ring-slate-100 scale-105" : "opacity-70 hover:opacity-100"
              }`}
              style={{
                background: "conic-gradient(#10b981 0deg 120deg, #fbbf24 120deg 240deg, #ef4444 240deg 360deg)",
              }}
            />
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                title={s.label}
                className={`w-8 h-8 rounded-full shrink-0 transition-transform ${STATUS_DOT[s.value]} ${
                  statusFilter === s.value
                    ? "ring-2 ring-offset-2 ring-offset-slate-950 ring-slate-100 scale-105"
                    : "opacity-70 hover:opacity-100"
                }`}
              />
            ))}
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
              <option value="partially_received">Partially received</option>
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
                !groupByGang
                  ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Layers className="w-3 h-3" />
              {groupByGang ? "Show all" : "Grouped by gang"}
            </button>
            {(gangFilter !== "All" ||
              storageFilter !== "All" ||
              containerFilter !== "All" ||
              categoryFilter !== "All" ||
              statusFilter !== "All" ||
              procFilter !== "All" ||
              searchQuery) && (
              <button
                onClick={() => {
                  setGangFilter("All");
                  setStorageFilter("All");
                  setContainerFilter("All");
                  setCategoryFilter("All");
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
                  onClick={() => bulkSetReceived("yes")}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Mark received
                </button>
                <button
                  onClick={() => bulkSetReceived("partial")}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Mark partial
                </button>
                <button
                  onClick={() => bulkSetReceived("no")}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Mark not received
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
                  onClick={() => setBulkCatalogPicker(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Link to catalog
                </button>
                <button
                  onClick={bulkAddToTodo}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Add to To Do
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
              .map(([gang, gangItems]) => {
                const isCollapsed = !!collapsedGangs[gang];
                return (
                  <div key={gang}>
                    <button
                      onClick={() =>
                        setCollapsedGangs((prev) => ({ ...prev, [gang]: !prev[gang] }))
                      }
                      className="w-full flex items-center gap-2 mb-2 text-left"
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
                          isCollapsed ? "" : "rotate-90"
                        }`}
                      />
                      {isCollapsed ? (
                        <span className="text-xs text-slate-400">
                          {gang} — {gangItems.length} item{gangItems.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <>
                          <span
                            className={`text-xs rounded-full px-2.5 py-1 border ${GANG_COLOR[gang]}`}
                          >
                            {gang}
                          </span>
                          <span className="text-xs text-slate-600">
                            {gangItems.length} item{gangItems.length === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2.5">
                        {gangItems.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            selectMode={selectMode}
                            selected={!!selectedIds[item.id]}
                            isEditor={isEditor}
                            onToggleSelect={toggleItemSelect}
                            onEdit={setFormState}
                            onDelete={setDeleteTarget}
                            onViewSerials={setSerialsView}
                            onSuggestEdit={setSuggestEditTarget}
                            onOpenContainer={openContainerFromItem}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={!!selectedIds[item.id]}
                isEditor={isEditor}
                onToggleSelect={toggleItemSelect}
                onEdit={setFormState}
                onDelete={setDeleteTarget}
                onViewSerials={setSerialsView}
                onSuggestEdit={setSuggestEditTarget}
                onOpenContainer={openContainerFromItem}
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
          key={formState.id || formState._formKey || "new"}
          initial={formState}
          containerOptions={containerOptions}
          onAddContainer={addContainer}
          categoryOptions={categoryOptions}
          onAddCategory={addCategory}
          onSave={saveItem}
          onCancel={() => setFormState(null)}
          existingItems={items}
          catalog={catalog}
          onSaveCatalogItem={onSaveCatalogItem}
          isQuickTransfer={!!job.isQuickTransfer}
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
          requisitions={job.requisitions || []}
          catalog={catalog}
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
          catalog={catalog}
          isEditor={isEditor}
          initialContainer={containerToOpen}
          onClose={() => {
            setContainersOpen(false);
            setContainerToOpen(null);
          }}
          onAdd={addContainer}
          onRename={renameContainer}
          onDelete={deleteContainer}
          onPull={pullItemsIntoContainer}
        />
      )}

      {bulkGangPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setBulkGangPicker(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setBulkStoragePicker(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setBulkContainerPicker(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-100 font-semibold mb-1.5">
              Move {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"} to
              container
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Moves whatever quantity each item actually has on hand into this one container,
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

      {bulkCatalogPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={() => { setBulkCatalogPicker(false); setBulkCatalogPickerSearch(""); }}>
          <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold">
                Link {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"} to
                catalog item
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Every item selected gets linked to whichever one you pick — this overrides any
                automatic name-matching for these items.
              </p>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={bulkCatalogPickerSearch}
                  onChange={(e) => setBulkCatalogPickerSearch(e.target.value)}
                  placeholder="Search catalog..."
                  className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {catalog.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  Your catalog is empty — add items to it first from the Item Catalog screen.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...catalog]
                    .filter((c) =>
                      c.name.toLowerCase().includes(bulkCatalogPickerSearch.trim().toLowerCase())
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => bulkSetCatalogLink(c)}
                        className="w-full text-left border border-slate-800 rounded-md p-3 hover:border-slate-700"
                      >
                        <p className="text-sm text-slate-100">{c.name}</p>
                        <p className="text-xs text-slate-500">
                          {c.gang} · {c.storage}
                          {c.category ? ` · ${c.category}` : ""}
                        </p>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <button
                onClick={() => {
                  setBulkCatalogPicker(false);
                  setBulkCatalogPickerSearch("");
                }}
                className="w-full text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
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
        <PickListModal
          jobName={job.name}
          items={items}
          catalog={catalog}
          onClose={() => setPickListOpen(false)}
        />
      )}

      {todoListOpen && (
        <TodoListModal
          todos={todos}
          isEditor={isEditor}
          job={job}
          onAddCustom={addCustomTodo}
          onToggleDone={toggleTodoDone}
          onDelete={deleteTodo}
          onClearFinished={clearFinishedTodos}
          onClose={() => setTodoListOpen(false)}
        />
      )}

      {referenceDocsOpen && (
        <ReferenceDocsModal
          job={job}
          isEditor={isEditor}
          onUpdateJob={onUpdateJob}
          onClose={() => setReferenceDocsOpen(false)}
        />
      )}

      {suggestEditTarget && (
        <SuggestEditModal
          job={job}
          item={suggestEditTarget}
          onClose={() => setSuggestEditTarget(null)}
        />
      )}

      {suggestNewItemOpen && (
        <SuggestNewItemModal job={job} onClose={() => setSuggestNewItemOpen(false)} />
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
const RETURNS_KEY = "warehub-returns";
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

// Anyone (including viewers with no login) can submit a suggestion — this
// hits its own database table with its own permission rules, separate from
// the main app_storage table, so it never conflicts with view-only access.
async function submitSuggestion({ jobId, itemId, type, payload, note }) {
  try {
    const { error } = await supabase.from("suggestions").insert({
      job_id: String(jobId),
      item_id: itemId ? String(itemId) : null,
      suggestion_type: type,
      payload,
      note: note || null,
    });
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function submitFieldRequest(text, reportedBy) {
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

async function fetchFieldRequests() {
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

async function updateFieldRequestStatus(id, status) {
  try {
    const { error } = await supabase.from("field_requests").update({ status }).eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function deleteFieldRequest(id) {
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
async function fetchPendingSuggestions() {
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

async function fetchResolvedSuggestions() {
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

async function uploadReferenceDocument(jobId, file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${jobId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("job-documents").upload(path, file);
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("job-documents").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, path, name: file.name };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function deleteReferenceDocument(path) {
  try {
    const { error } = await supabase.storage.from("job-documents").remove([path]);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function updateSuggestionRow(id, fields) {
  try {
    const { error } = await supabase.from("suggestions").update(fields).eq("id", id);
    return { ok: !error, error: error ? error.message : null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function deleteSuggestionRow(id) {
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
const VAPID_PUBLIC_KEY =
  "BAFxZKXXoeA1H9n7wwwCWR8GU2zyMy4n_YqrLAXXK7qLs8Rs2STK6BlRqOu4syVIm-avrtkCTO2sjTfzLJxjrMc";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getNotificationStatus() {
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

async function enablePushNotifications() {
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

async function disablePushNotifications() {
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

// Compares two timestamps by actual moment in time rather than raw string
// equality, since the same instant can come back formatted differently
// depending on its source (browser-generated vs. Postgres-returned).
function sameInstant(a, b) {
  if (!a || !b) return a === b;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
}

// Deterministic stringify (sorted keys) so two objects with the same
// content but different key order still compare as equal.
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function deepEqualExcept(a, b, excludeKeys) {
  const strip = (o) => {
    const copy = { ...o };
    excludeKeys.forEach((k) => delete copy[k]);
    return copy;
  };
  return deepEqual(strip(a || {}), strip(b || {}));
}

// Generic three-way merge for a list of objects with a stable `.id`.
// Compares "mine" and "theirs" against a common "base" so it can tell
// apart three situations per entry: only one side touched it (auto-merge,
// no conflict), neither touched it (unchanged), or both sides changed it
// differently (a real conflict, needs a human choice).
function threeWayMergeList(baseList, mineList, theirList) {
  const baseById = new Map((baseList || []).map((x) => [String(x.id), x]));
  const mineById = new Map((mineList || []).map((x) => [String(x.id), x]));
  const theirById = new Map((theirList || []).map((x) => [String(x.id), x]));
  const allIds = new Set([...baseById.keys(), ...mineById.keys(), ...theirById.keys()]);

  const merged = [];
  const conflicts = [];

  for (const id of allIds) {
    const base = baseById.get(id) || null;
    const mine = mineById.get(id) || null;
    const theirs = theirById.get(id) || null;

    if (!mine && !theirs) continue; // gone from both, nothing to do

    if (!base && mine && !theirs) {
      merged.push(mine); // I added it
      continue;
    }
    if (!base && !mine && theirs) {
      merged.push(theirs); // they added it
      continue;
    }
    if (!base && mine && theirs) {
      merged.push(deepEqual(mine, theirs) ? mine : mine);
      if (!deepEqual(mine, theirs)) conflicts.push({ id, mine, theirs, base: null });
      continue;
    }

    const mineChanged = !deepEqual(base, mine);
    const theirsChanged = !deepEqual(base, theirs);

    if (!mine && theirs) {
      // I deleted it
      if (!theirsChanged) continue; // they didn't touch it — honor my deletion
      conflicts.push({ id, mine: null, theirs, base, type: "deleted_by_me" });
      merged.push(theirs);
      continue;
    }
    if (mine && !theirs) {
      // they deleted it
      if (!mineChanged) continue; // I didn't touch it — honor their deletion
      conflicts.push({ id, mine, theirs: null, base, type: "deleted_by_them" });
      merged.push(mine);
      continue;
    }

    if (!mineChanged && !theirsChanged) {
      merged.push(base);
    } else if (mineChanged && !theirsChanged) {
      merged.push(mine);
    } else if (!mineChanged && theirsChanged) {
      merged.push(theirs);
    } else if (deepEqual(mine, theirs)) {
      merged.push(mine); // both changed it to the same thing
    } else {
      conflicts.push({ id, mine, theirs, base });
      merged.push(mine); // tentative, pending resolution
    }
  }

  return { merged, conflicts };
}

// Applies the item-level three-way merge to every job, plus a lighter
// merge of job-level metadata (name, color, etc.) so a rename by one side
// doesn't collide with an item change by the other.
// Only these fields represent an actual choice a person made that could
// genuinely differ between two sides. Everything else on a job (activity
// log, container list, to-dos) is naturally additive — there's nothing to
// meaningfully "pick" between, so those get combined automatically instead
// of being treated as a conflict.
const JOB_META_KEYS = ["name", "color", "parentId"];

function pickKeys(obj, keys) {
  const out = {};
  keys.forEach((k) => (out[k] = obj ? obj[k] : undefined));
  return out;
}

function unionById(theirsList, mineList) {
  const byId = new Map();
  (theirsList || []).forEach((x) => byId.set(String(x.id), x));
  (mineList || []).forEach((x) => byId.set(String(x.id), x)); // mine wins ties
  return [...byId.values()];
}

function threeWayMergeJobs(baseJobs, mineJobs, theirJobs) {
  const baseById = new Map((baseJobs || []).map((j) => [String(j.id), j]));
  const mineById = new Map((mineJobs || []).map((j) => [String(j.id), j]));
  const theirById = new Map((theirJobs || []).map((j) => [String(j.id), j]));
  const allIds = new Set([...baseById.keys(), ...mineById.keys(), ...theirById.keys()]);

  const finalJobs = [];
  const jobConflicts = [];
  const itemConflicts = [];

  for (const id of allIds) {
    const base = baseById.get(id) || null;
    const mine = mineById.get(id) || null;
    const theirs = theirById.get(id) || null;

    if (!mine && !theirs) continue;

    // Merge items first (works even if only one side has the job at all)
    const itemMerge = threeWayMergeList(
      base ? base.items : [],
      mine ? mine.items : theirs ? theirs.items : [],
      theirs ? theirs.items : mine ? mine.items : []
    );

    // Was this job meaningfully touched on a given side? (metadata OR items)
    const mineMetaChanged = mine && !deepEqual(pickKeys(base, JOB_META_KEYS), pickKeys(mine, JOB_META_KEYS));
    const theirsMetaChanged = theirs && !deepEqual(pickKeys(base, JOB_META_KEYS), pickKeys(theirs, JOB_META_KEYS));
    const mineTouched = mineMetaChanged || itemMerge.conflicts.length > 0 || (mine && !deepEqual(base?.items, mine.items));
    const theirsTouched = theirsMetaChanged || (theirs && !deepEqual(base?.items, theirs.items));

    if (!mine && theirs) {
      if (base && !theirsTouched) continue; // I deleted it, they didn't touch it — honor deletion
      finalJobs.push(theirs);
      if (base) jobConflicts.push({ id, mine: null, theirs, base, kind: "job", subtype: "deletion" });
      continue;
    }
    if (mine && !theirs) {
      if (base && !mineTouched) continue; // they deleted it, I didn't touch it — honor deletion
      finalJobs.push(mine);
      if (base) jobConflicts.push({ id, mine, theirs: null, base, kind: "job", subtype: "deletion" });
      continue;
    }

    // Present on both sides — combine the additive parts automatically
    const containerOptions = [
      ...new Set([...(mine.containerOptions || []), ...(theirs.containerOptions || [])]),
    ];
    const todos = unionById(theirs.todos, mine.todos);
    const activityLog = unionById(theirs.activityLog, mine.activityLog)
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, 50);

    itemMerge.conflicts.forEach((c) =>
      itemConflicts.push({ jobId: id, jobName: mine.name || theirs.name, ...c })
    );

    let metaResolution = pickKeys(mine, JOB_META_KEYS);
    let metaConflict = null;
    if (!mineMetaChanged) {
      metaResolution = pickKeys(theirs, JOB_META_KEYS);
    } else if (!theirsMetaChanged) {
      metaResolution = pickKeys(mine, JOB_META_KEYS);
    } else if (deepEqual(pickKeys(mine, JOB_META_KEYS), pickKeys(theirs, JOB_META_KEYS))) {
      metaResolution = pickKeys(mine, JOB_META_KEYS);
    } else {
      metaConflict = {
        id,
        kind: "job",
        subtype: "metadata",
        base: pickKeys(base, JOB_META_KEYS),
        mine: pickKeys(mine, JOB_META_KEYS),
        theirs: pickKeys(theirs, JOB_META_KEYS),
      };
    }

    const mergedJob = {
      ...mine,
      ...metaResolution,
      items: itemMerge.merged,
      containerOptions,
      todos,
      activityLog,
    };

    if (metaConflict) jobConflicts.push(metaConflict);
    finalJobs.push(mergedJob);
  }

  return { jobs: finalJobs, jobConflicts, itemConflicts };
}

// Changes made while offline are kept here so they survive closing the
// app/tab entirely, not just losing network mid-session. This is separate
// from the main Supabase-backed storage, since it needs to work with zero
// connectivity.
const OFFLINE_QUEUE_KEY = "warehub-offline-queue";

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false; // localStorage full or unavailable — best effort only
  }
}

function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearOfflineQueue() {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // nothing more we can do
  }
}

// Shared across every backup trigger (hourly auto-backup, conflict-safety
// backup, etc.) so two independent systems can't both fire a download in
// the same moment — genuinely separate backups (minutes/hours apart) are
// unaffected, this only catches true back-to-back duplicates.
let lastBackupDownloadAt = 0;

// Lets backups write straight into a folder you pick once, instead of the
// browser's regular Downloads folder every time. Only works in Chrome-family
// desktop browsers (including ChromeOS) — Android has no equivalent, so it
// quietly falls back to a normal download there.
const FS_ACCESS_SUPPORTED = typeof window !== "undefined" && "showDirectoryPicker" in window;
const BACKUP_DIR_DB = "riggy-backup-prefs";
const BACKUP_DIR_STORE = "handles";
const BACKUP_DIR_KEY = "backupDirectory";

function openBackupPrefsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BACKUP_DIR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBackupDirectoryHandle(handle) {
  const db = await openBackupPrefsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_DIR_STORE, "readwrite");
    tx.objectStore(BACKUP_DIR_STORE).put(handle, BACKUP_DIR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBackupDirectoryHandle() {
  try {
    const db = await openBackupPrefsDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(BACKUP_DIR_STORE, "readonly");
      const req = tx.objectStore(BACKUP_DIR_STORE).get(BACKUP_DIR_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function clearBackupDirectoryHandle() {
  try {
    const db = await openBackupPrefsDB();
    const tx = db.transaction(BACKUP_DIR_STORE, "readwrite");
    tx.objectStore(BACKUP_DIR_STORE).delete(BACKUP_DIR_KEY);
  } catch {
    // nothing more to do
  }
}

async function chooseBackupFolder() {
  if (!FS_ACCESS_SUPPORTED) {
    return { ok: false, error: "Not supported in this browser." };
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveBackupDirectoryHandle(handle);
    return { ok: true, name: handle.name };
  } catch (err) {
    // User canceled the picker — not a real error
    if (err && err.name === "AbortError") return { ok: false, canceled: true };
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function downloadBackupFile(jobs, catalog, label, { force = false } = {}) {
  if (!force && Date.now() - lastBackupDownloadAt < 10000) return false;
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `riggy-${label.replace(/\s+/g, "-")}-${stamp}.json`;
  const payload = {
    exportedFrom: `Riggy (${label})`,
    exportedAt: now.toISOString(),
    jobs,
    catalog,
  };
  const jsonText = JSON.stringify(payload, null, 2);

  // Try the folder you chose, if you've set one up and it's still accessible
  if (FS_ACCESS_SUPPORTED) {
    try {
      const dirHandle = await loadBackupDirectoryHandle();
      if (dirHandle) {
        const permission = await dirHandle.queryPermission({ mode: "readwrite" });
        if (permission === "granted") {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonText);
          await writable.close();
          lastBackupDownloadAt = Date.now();
          return true;
        }
      }
    } catch {
      // Folder no longer accessible for some reason — fall back below
      // rather than losing the backup entirely.
    }
  }

  try {
    lastBackupDownloadAt = Date.now();
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function downloadOfflineBackup(queue) {
  return downloadBackupFile(queue.jobs, queue.catalog, "offline-conflict-backup");
}

// Quietly saves a backup file on its own, no button needed — these are
// tiny (plain JSON), so there's no real cost to keeping this frequent.
const AUTO_BACKUP_KEY = "warehub-last-auto-backup";
const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // once an hour

let autoBackupInFlight = false; // in-memory guard against a same-tab burst

async function maybeAutoBackup(jobs, catalog) {
  if (!jobs || jobs.length === 0) return; // nothing real to back up yet
  if (autoBackupInFlight) return;
  try {
    const last = localStorage.getItem(AUTO_BACKUP_KEY);
    const lastTime = last ? new Date(last).getTime() : 0;
    if (Date.now() - lastTime < AUTO_BACKUP_INTERVAL_MS) return;
    // Mark it as done BEFORE actually downloading — closes the race where
    // several queued checks (e.g. after the tab was backgrounded a long
    // time) all read the same stale timestamp and each decide to back up.
    autoBackupInFlight = true;
    localStorage.setItem(AUTO_BACKUP_KEY, new Date().toISOString());
    await downloadBackupFile(jobs, catalog, "auto-backup");
  } catch {
    // best effort only — never worth interrupting anything over this
  } finally {
    autoBackupInFlight = false;
  }
}

function WareHub({ isEditor, onSignOut, onRequestLogin }) {
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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);
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
  // Tracks "the last version we know for sure matched the server" — the
  // common ancestor a three-way merge needs. Updated after every successful
  // load and every successful save, not just when going offline.
  const jobsBaseRef = useRef([]);
  const [catalog, setCatalog] = useState([]);
  const [returns, setReturns] = useState([]);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const catalogSaveTimer = useRef(null);
  const catalogRef = useRef([]);
  const catalogUpdatedAtRef = useRef(null);
  const catalogBaseRef = useRef([]);
  const [conflictWarning, setConflictWarning] = useState(false);

  // Offline support: snapshot of the last-confirmed-synced timestamps at
  // the moment connectivity was lost, used later to check whether anything
  // else changed on the server while disconnected.
  const offlineSnapshotRef = useRef(null);
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [mergeState, setMergeState] = useState(null);

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

  // The core of offline support: when we're back online (either mid-session
  // or on a fresh app open after being offline when it was last closed),
  // check whether the server actually still matches what it looked like
  // when we went offline. If nothing else touched it, sync the queued
  // changes straight through. If something did, don't silently overwrite —
  // download a backup of the queued changes first, then let the user choose.
  const reconcileOfflineChanges = async () => {
    const queue = loadOfflineQueue();
    if (!queue) return;

    setReconciling(true);
    const jobsResult = await getWithRetry(JOBS_KEY);
    const catalogResult = await getWithRetry(CATALOG_KEY);
    setReconciling(false);

    if (!jobsResult.ok || !catalogResult.ok) {
      // Can't confirm the current server state right now — leave the queue
      // in place and try again next time we're back online.
      return;
    }

    const jobsMatch = sameInstant(jobsResult.updatedAt, queue.jobsAsOf);
    const catalogMatch = sameInstant(catalogResult.updatedAt, queue.catalogAsOf);

    if (jobsMatch && catalogMatch) {
      // Nothing else touched this at all — sync straight through
      const jobsSave = await saveWithRetry(JOBS_KEY, JSON.stringify(queue.jobs), queue.jobsAsOf);
      const catalogSave = await saveWithRetry(
        CATALOG_KEY,
        JSON.stringify(queue.catalog),
        queue.catalogAsOf
      );
      if (jobsSave.ok) {
        jobsUpdatedAtRef.current = jobsSave.updatedAt;
        jobsBaseRef.current = queue.jobs;
        setJobs(queue.jobs);
      }
      if (catalogSave.ok) {
        catalogUpdatedAtRef.current = catalogSave.updatedAt;
        catalogBaseRef.current = queue.catalog;
        setCatalog(queue.catalog);
      }
      clearOfflineQueue();
      offlineSnapshotRef.current = null;
      setOfflineQueued(false);
      setSaveError(!jobsSave.ok ? jobsSave.error : !catalogSave.ok ? catalogSave.error : null);
      return;
    }

    // Something else changed while we were offline — figure out exactly
    // what, at the individual item level, rather than treating the whole
    // thing as one big conflict.
    await downloadOfflineBackup(queue);

    const theirJobs = JSON.parse(jobsResult.value || "[]");
    const theirCatalog = JSON.parse(catalogResult.value || "[]");

    const jobMerge = threeWayMergeJobs(queue.baseJobs, queue.jobs, theirJobs);
    const catalogMerge = threeWayMergeList(queue.baseCatalog, queue.catalog, theirCatalog);

    const allConflicts = [
      ...jobMerge.itemConflicts.map((c) => ({ ...c, kind: "item" })),
      ...jobMerge.jobConflicts.map((c) => ({ ...c, kind: "job" })),
      ...catalogMerge.conflicts.map((c) => ({ ...c, kind: "catalog" })),
    ];

    if (allConflicts.length === 0) {
      // Different parts of the data changed on each side — no real overlap,
      // so the merge is clean even though the whole-blob timestamp differed.
      const jobsSave = await saveWithRetry(JOBS_KEY, JSON.stringify(jobMerge.jobs));
      const catalogSave = await saveWithRetry(
        CATALOG_KEY,
        JSON.stringify(catalogMerge.merged)
      );
      if (jobsSave.ok) {
        jobsUpdatedAtRef.current = jobsSave.updatedAt;
        jobsBaseRef.current = jobMerge.jobs;
        setJobs(jobMerge.jobs);
      }
      if (catalogSave.ok) {
        catalogUpdatedAtRef.current = catalogSave.updatedAt;
        catalogBaseRef.current = catalogMerge.merged;
        setCatalog(catalogMerge.merged);
      }
      clearOfflineQueue();
      offlineSnapshotRef.current = null;
      setOfflineQueued(false);
      return;
    }

    // Genuine overlap on specific items — hold onto the clean parts of the
    // merge and ask only about what's actually contested.
    setMergeState({
      jobs: jobMerge.jobs,
      catalog: catalogMerge.merged,
      conflicts: allConflicts.map((c) => ({ ...c, resolution: "mine" })),
    });
  };

  // Track connectivity so we can pause saves gracefully instead of erroring
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setRetryTick((t) => t + 1); // flush any pending changes immediately
      reconcileOfflineChanges();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // A backgrounded tab's login can quietly expire while nothing is watching
  // it — refresh it proactively the moment the tab is looked at again,
  // rather than waiting for a save to fail first and surface a scary error.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === "visible") {
        try {
          await supabase.auth.refreshSession();
        } catch {
          // If this fails, the normal save-conflict/error handling still
          // catches it — this is just trying to avoid it happening at all.
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Also check periodically for long sessions that stay open past the
  // initial load — otherwise a full day of work in one sitting would only
  // ever get backed up once, right at the start. Also check whenever the
  // tab becomes visible again — a backgrounded tab's timers get throttled
  // by the browser and can queue up, so relying on the interval alone risks
  // several checks firing in a burst right when you come back to it.
  useEffect(() => {
    if (!isEditor) return;
    const timer = setInterval(() => {
      maybeAutoBackup(jobsRef.current, catalogRef.current);
    }, 10 * 60 * 1000); // check every 10 minutes; actual backup still only every hour
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeAutoBackup(jobsRef.current, catalogRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isEditor]);

  // Detects when a new version of the app has finished downloading in the
  // background and is sitting ready — instead of silently waiting for every
  // tab to close before it takes over, this surfaces a button so you can
  // apply it on demand.
  const swRegistrationRef = useRef(null);
  const [updateCheckMessage, setUpdateCheckMessage] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloadedOnce = false;
    const onControllerChange = () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      swRegistrationRef.current = registration;

      // An update may already be sitting there waiting from before this
      // page load even happened.
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      });

      // Check right away, then keep checking — otherwise this only ever
      // runs once at initial load, and a version deployed later would sit
      // unnoticed until the next full page reload.
      registration.update().catch(() => {});
    });

    const recheck = () => {
      if (swRegistrationRef.current) swRegistrationRef.current.update().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    const interval = setInterval(recheck, 30 * 60 * 1000); // every 30 minutes
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  const applyUpdate = () => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };

  const checkForUpdateNow = async () => {
    if (!("serviceWorker" in navigator)) {
      setUpdateCheckMessage("Not available in this browser");
      setTimeout(() => setUpdateCheckMessage(null), 3000);
      return;
    }
    setUpdateCheckMessage("Checking...");
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) swRegistrationRef.current = registration;
    if (!registration) {
      setUpdateCheckMessage("Still setting up — try again in a moment");
    } else {
      await registration.update().catch(() => {});
      // Give the "updatefound" listener a moment to fire before reporting
      setTimeout(() => {
        setUpdateCheckMessage(
          waitingWorkerRef.current ? "Update found!" : "You're on the latest version"
        );
      }, 600);
    }
    setTimeout(() => setUpdateCheckMessage(null), 3000);
  };

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

    try {
      await loadAllDataInner();
    } catch (err) {
      // Whatever went wrong, never leave the app stuck on the loading
      // spinner forever — fall back to the same "couldn't load" screen
      // used for a genuine connection failure, with a Retry button.
      console.error("Unexpected error while loading:", err);
      setLoadFailed(true);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  };

  const loadAllDataInner = async () => {
    const jobsResult = await getWithRetry(JOBS_KEY);
    const activeResult = await getWithRetry(ACTIVE_JOB_KEY);
    const catalogResult = await getWithRetry(CATALOG_KEY);
    const returnsResult = await getWithRetry(RETURNS_KEY);

    if (!jobsResult.ok || !catalogResult.ok) {
      setLoadFailed(true);
      return;
    }

    // Returns are lower-stakes than jobs/catalog — don't block the whole
    // app from loading if this one specifically fails for some reason.
    try {
      if (returnsResult.ok && returnsResult.value) {
        setReturns(JSON.parse(returnsResult.value));
      }
    } catch {
      // corrupted stored data — just start with an empty list
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

    const normalizeGangName = (g) => {
      if (g === "Welders") return "Welding";
      if (g === "Bolt-up") return "Bolt Up";
      return g;
    };
    const migrateGang = (job) => ({
      ...job,
      items: (job.items || []).map((i) => {
        let needsTransfer = i.needsTransfer;
        if (job.isQuickTransfer) {
          const match = getCachedCatalogMatch(i, loadedCatalog);
          needsTransfer = !!(match && match.needsTransfer);
        }
        return migrateItemContainers({
          ...i,
          gang: normalizeGangName(i.gang),
          needsTransfer,
        });
      }),
    });
    const finalJobs =
      loadedJobs && loadedJobs.length > 0 ? loadedJobs.map(migrateGang) : [seedJob()];
    setJobs(finalJobs);
    const validActiveId = finalJobs.some((j) => j.id === loadedActiveId)
      ? loadedActiveId
      : finalJobs[0].id;
    setActiveJobId(validActiveId);
    const finalCatalog = loadedCatalog.map((c) => ({ ...c, gang: normalizeGangName(c.gang) }));
    setCatalog(finalCatalog);
    jobsUpdatedAtRef.current = jobsResult.updatedAt || null;
    catalogUpdatedAtRef.current = catalogResult.updatedAt || null;
    jobsBaseRef.current = finalJobs;
    catalogBaseRef.current = finalCatalog;
    setConflictWarning(false);

    if (isEditor) maybeAutoBackup(finalJobs, loadedCatalog);

    // If there's a leftover offline queue from a previous session (the app
    // was closed while offline), check it now that we know what the server
    // actually looks like — always after the normal load, never racing it.
    if ((typeof navigator === "undefined" || navigator.onLine) && isEditor) {
      reconcileOfflineChanges();
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Called from the jobs/catalog persist effects while offline — captures
  // a snapshot of "what we last knew the server looked like" the first
  // time we go offline this session, then keeps the local queue updated
  // with the latest data as further edits happen, all in localStorage so
  // it survives closing the app entirely.
  const persistOfflineQueue = () => {
    if (!offlineSnapshotRef.current) {
      // Captured once, the moment we first go offline this session — this
      // is the "common ancestor" a three-way merge needs, not just the
      // timestamp, so we can tell exactly which items changed on which side.
      offlineSnapshotRef.current = {
        jobsAsOf: jobsUpdatedAtRef.current,
        catalogAsOf: catalogUpdatedAtRef.current,
        baseJobs: jobsRef.current,
        baseCatalog: catalogRef.current,
      };
    }
    saveOfflineQueue({
      jobs: jobsRef.current,
      catalog: catalogRef.current,
      jobsAsOf: offlineSnapshotRef.current.jobsAsOf,
      catalogAsOf: offlineSnapshotRef.current.catalogAsOf,
      baseJobs: offlineSnapshotRef.current.baseJobs,
      baseCatalog: offlineSnapshotRef.current.baseCatalog,
      savedAt: new Date().toISOString(),
    });
    setOfflineQueued(true);
  };

  // Runs the same smart three-way merge used for offline reconnection, but
  // for a regular online save that discovers someone else saved first (e.g.
  // two tabs/devices active at once). If nothing actually overlaps, this
  // syncs silently — only a genuine collision on the same item interrupts.
  const handleSaveConflict = async () => {
    const theirJobsResult = await getWithRetry(JOBS_KEY);
    const theirCatalogResult = await getWithRetry(CATALOG_KEY);
    if (!theirJobsResult.ok || !theirCatalogResult.ok) {
      setConflictWarning(true); // can't even check right now — rare fallback
      return;
    }
    const theirJobs = JSON.parse(theirJobsResult.value || "[]");
    const theirCatalog = JSON.parse(theirCatalogResult.value || "[]");

    const jobMerge = threeWayMergeJobs(jobsBaseRef.current, jobsRef.current, theirJobs);
    const catalogMerge = threeWayMergeList(
      catalogBaseRef.current,
      catalogRef.current,
      theirCatalog
    );

    const allConflicts = [
      ...jobMerge.itemConflicts.map((c) => ({ ...c, kind: "item" })),
      ...jobMerge.jobConflicts.map((c) => ({ ...c, kind: "job" })),
      ...catalogMerge.conflicts.map((c) => ({ ...c, kind: "catalog" })),
    ];

    if (allConflicts.length === 0) {
      const jobsSave = await saveWithRetry(JOBS_KEY, JSON.stringify(jobMerge.jobs));
      const catalogSave = await saveWithRetry(CATALOG_KEY, JSON.stringify(catalogMerge.merged));
      if (jobsSave.ok) {
        jobsUpdatedAtRef.current = jobsSave.updatedAt;
        jobsBaseRef.current = jobMerge.jobs;
        setJobs(jobMerge.jobs);
      }
      if (catalogSave.ok) {
        catalogUpdatedAtRef.current = catalogSave.updatedAt;
        catalogBaseRef.current = catalogMerge.merged;
        setCatalog(catalogMerge.merged);
      }
      setPendingSync(false);
      return;
    }

    setMergeState({
      jobs: jobMerge.jobs,
      catalog: catalogMerge.merged,
      conflicts: allConflicts.map((c) => ({ ...c, resolution: "mine" })),
    });
  };

  // Persist jobs whenever they change (after initial load completes), debounced
  // so several quick edits in a row don't each trigger their own blocking save
  useEffect(() => {
    if (loading || loadFailed || conflictWarning || !isEditor) return;
    if (!isOnline) {
      setPendingSync(true);
      persistOfflineQueue();
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
          await handleSaveConflict();
          return;
        }
        setSaveError(result.ok ? null : result.error);
        if (result.ok) {
          setPendingSync(false);
          jobsUpdatedAtRef.current = result.updatedAt;
          jobsBaseRef.current = jobs;
        }
      })();
    }, 600);
    return () => {
      if (jobsSaveTimer.current) clearTimeout(jobsSaveTimer.current);
    };
  }, [jobs, loading, retryTick, isOnline, conflictWarning, isEditor]);

  // Persist which job is active
  useEffect(() => {
    if (loading || loadFailed || activeJobId == null || !isEditor) return;
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
  }, [activeJobId, loading, retryTick, isOnline, isEditor]);

  // Persist catalog whenever it changes, debounced like jobs
  useEffect(() => {
    if (loading || loadFailed || conflictWarning || !isEditor) return;
    if (!isOnline) {
      persistOfflineQueue();
      return;
    }
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
          await handleSaveConflict();
          return;
        }
        if (!result.ok) setSaveError(result.error);
        else {
          catalogUpdatedAtRef.current = result.updatedAt;
          catalogBaseRef.current = catalog;
        }
      })();
    }, 600);
    return () => {
      if (catalogSaveTimer.current) clearTimeout(catalogSaveTimer.current);
    };
  }, [catalog, loading, retryTick, isOnline, conflictWarning, isEditor]);


  const activeJob = jobs.find((j) => j.id === activeJobId);

  const updateActiveJob = (updater) => {
    setJobs((prev) => prev.map((j) => (j.id === activeJobId ? updater(j) : j)));
  };

  const updateJobById = (jobId, updater) => {
    setJobs((prev) => prev.map((j) => (String(j.id) === String(jobId) ? updater(j) : j)));
  };

  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [fieldRequestsOpen, setFieldRequestsOpen] = useState(false);
  const [suggestionsList, setSuggestionsList] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [pendingFieldRequestCount, setPendingFieldRequestCount] = useState(0);

  const refreshFieldRequestCount = async () => {
    if (!isEditor) return;
    const result = await fetchFieldRequests();
    if (result.ok) {
      setPendingFieldRequestCount(result.requests.filter((r) => r.status !== "done").length);
    }
  };

  const refreshSuggestions = async () => {
    if (!isEditor) return;
    setSuggestionsLoading(true);
    const result = await fetchPendingSuggestions();
    setSuggestionsLoading(false);
    if (result.ok) {
      setSuggestionsList(result.suggestions);
      setPendingSuggestionCount(result.suggestions.length);
    }
  };

  const [resolvedSuggestionsList, setResolvedSuggestionsList] = useState([]);
  const [resolvedSuggestionsLoading, setResolvedSuggestionsLoading] = useState(false);

  const refreshResolvedSuggestions = async () => {
    if (!isEditor) return;
    setResolvedSuggestionsLoading(true);
    const result = await fetchResolvedSuggestions();
    setResolvedSuggestionsLoading(false);
    if (result.ok) setResolvedSuggestionsList(result.suggestions);
  };

  useEffect(() => {
    if (isEditor) {
      refreshSuggestions();
      refreshFieldRequestCount();
    }
  }, [isEditor]);

  const approveSuggestion = async (s) => {
    const job = jobs.find((j) => String(j.id) === String(s.job_id));
    if (!job) {
      await updateSuggestionRow(s.id, { status: "denied", resolved_at: new Date().toISOString() });
      refreshSuggestions();
      return;
    }
    if (s.suggestion_type === "edit_item") {
      const before = job.items.find((i) => String(i.id) === String(s.item_id));
      const previousState = before
        ? {
            containers: before.containers || [],
            qtyHave: before.qtyHave,
            ordered: before.ordered,
            received: before.received,
            status: before.status,
          }
        : null;
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        items: prevJob.items.map((i) => {
          if (String(i.id) !== String(s.item_id)) return i;
          let containers = i.containers || [];
          if (s.payload.container?.clear) {
            containers = [];
          } else if (s.payload.container && s.payload.container.name) {
            const others = containers.filter((c) => c.name !== s.payload.container.name);
            containers = [...others, s.payload.container];
          }
          const qtyHave =
            s.payload.qtyHave !== undefined ? s.payload.qtyHave : totalHave(containers);
          const status =
            qtyHave >= i.qtyNeeded ? "green" : qtyHave > 0 ? "yellow" : "red";
          return {
            ...i,
            containers,
            qtyHave,
            ordered: s.payload.ordered,
            received: s.payload.received,
            status,
          };
        }),
        containerOptions:
          s.payload.container && s.payload.container.name
            ? [...new Set([...prevJob.containerOptions, s.payload.container.name])]
            : prevJob.containerOptions,
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Approved suggested change to "${s.payload.itemName}"${
              s.note ? ` — note: ${s.note}` : ""
            }`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
      await updateSuggestionRow(s.id, {
        status: "approved",
        resolved_at: new Date().toISOString(),
        previous_state: previousState,
      });
    } else if (s.suggestion_type === "new_item") {
      const newItemId = Date.now();
      updateJobById(s.job_id, (prevJob) => {
        const containers = s.payload.container
          ? [{ name: s.payload.container, qty: s.payload.qtyNeeded }]
          : [];
        const newItem = {
          ...emptyItem(STORAGE_OPTIONS[0]),
          id: newItemId,
          name: s.payload.name,
          qtyNeeded: s.payload.qtyNeeded,
          containers,
          qtyHave: totalHave(containers),
          status: containers.length > 0 ? "green" : "red",
        };
        return {
          ...prevJob,
          items: [...prevJob.items, newItem],
          containerOptions: s.payload.container
            ? [...new Set([...prevJob.containerOptions, s.payload.container])]
            : prevJob.containerOptions,
          activityLog: [
            {
              id: Date.now(),
              time: timeStamp(),
              message: `Approved suggested new item "${s.payload.name}"${
                s.note ? ` — note: ${s.note}` : ""
              }`,
            },
            ...prevJob.activityLog,
          ].slice(0, 50),
        };
      });
      await updateSuggestionRow(s.id, {
        status: "approved",
        resolved_at: new Date().toISOString(),
        created_item_id: String(newItemId),
      });
    } else if (s.suggestion_type === "complete_todo") {
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        todos: (prevJob.todos || []).map((t) =>
          String(t.id) === String(s.payload.todoId) ? { ...t, done: true } : t
        ),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Approved To Do completion: "${s.payload.todoText}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
      await updateSuggestionRow(s.id, {
        status: "approved",
        resolved_at: new Date().toISOString(),
      });
    } else if (s.suggestion_type === "add_todo") {
      const newTodoId = Date.now();
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        todos: [
          ...(prevJob.todos || []),
          { id: newTodoId, text: s.payload.text, done: false, itemId: null },
        ],
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Approved suggested To Do: "${s.payload.text}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
      await updateSuggestionRow(s.id, {
        status: "approved",
        resolved_at: new Date().toISOString(),
        created_item_id: String(newTodoId),
      });
    }
    refreshSuggestions();
  };

  const denySuggestion = async (s) => {
    await updateSuggestionRow(s.id, { status: "denied", resolved_at: new Date().toISOString() });
    refreshSuggestions();
  };

  const deleteSuggestion = async (s) => {
    await deleteSuggestionRow(s.id);
    refreshSuggestions();
    refreshResolvedSuggestions();
  };

  // Genuinely undoes an approved change — restores the item to exactly how
  // it was before approval (for edit_item) or removes the item that was
  // created (for new_item) — then puts the suggestion back as pending so
  // it can be reconsidered.
  const revertSuggestion = async (s) => {
    if (s.suggestion_type === "edit_item" && s.previous_state) {
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        items: prevJob.items.map((i) =>
          String(i.id) === String(s.item_id) ? { ...i, ...s.previous_state } : i
        ),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Reverted approved change to "${s.payload.itemName}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    } else if (s.suggestion_type === "new_item" && s.created_item_id) {
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        items: prevJob.items.filter((i) => String(i.id) !== String(s.created_item_id)),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Reverted approved new item "${s.payload.name}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    } else if (s.suggestion_type === "complete_todo") {
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        todos: (prevJob.todos || []).map((t) =>
          String(t.id) === String(s.payload.todoId) ? { ...t, done: false } : t
        ),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Reverted To Do completion: "${s.payload.todoText}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    } else if (s.suggestion_type === "add_todo" && s.created_item_id) {
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        todos: (prevJob.todos || []).filter(
          (t) => String(t.id) !== String(s.created_item_id)
        ),
        activityLog: [
          {
            id: Date.now(),
            time: timeStamp(),
            message: `Reverted approved To Do: "${s.payload.text}"`,
          },
          ...prevJob.activityLog,
        ].slice(0, 50),
      }));
    }
    await updateSuggestionRow(s.id, { status: "pending", resolved_at: null });
    refreshSuggestions();
    refreshResolvedSuggestions();
  };

  // Re-runs approval on a previously ignored suggestion — same effect as
  // approving it fresh from the main inbox.
  const reapproveSuggestion = async (s) => {
    await approveSuggestion(s);
    refreshResolvedSuggestions();
  };

  const createJob = (name, color, parentId = null) => {
    const job = newJob(name, parentId, color);
    setJobs((prev) => [...prev, job]);
    setActiveJobId(job.id);
    setShowNewJobModal(false);
    setSubJobParent(null);
    setShowPicker(false);
  };

  const [showQuickTransferModal, setShowQuickTransferModal] = useState(false);
  const [showTransferOrReturnChoice, setShowTransferOrReturnChoice] = useState(false);
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [showReturnsListPage, setShowReturnsListPage] = useState(false);
  const [activeReturnId, setActiveReturnId] = useState(null);
  const activeReturn = returns.find((r) => r.id === activeReturnId) || null;

  const createOrOpenQuickTransfer = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Each use creates its own separate, timestamped entry — never reused
    // — but entries with the same name collapse together under one shared
    // folder on the job picker screen, found or created here.
    const parent = jobs.find(
      (j) => j.isQuickTransfer && !j.parentId && j.name.toLowerCase() === trimmed.toLowerCase()
    );

    const entryName = `${new Date().toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    })} - ${trimmed}`;

    if (parent) {
      const entry = newJob(entryName, parent.id, null, true);
      setJobs((prev) => [...prev, entry]);
      setActiveJobId(entry.id);
    } else {
      const folder = newJob(trimmed, null, null, true);
      const entry = newJob(entryName, folder.id, null, true);
      setJobs((prev) => [...prev, folder, entry]);
      setActiveJobId(entry.id);
    }
    setShowPicker(false);
    setShowQuickTransferModal(false);
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

  const bulkSetCatalogCategory = (ids, category) => {
    setCatalog((prev) =>
      prev.map((c) => (ids.includes(c.id) ? { ...c, category } : c))
    );
  };

  const bulkSetCatalogVendor = (ids, vendor) => {
    setCatalog((prev) =>
      prev.map((c) => (ids.includes(c.id) ? { ...c, vendor } : c))
    );
  };

  // Returns use a simple direct save — no offline queue or merge logic,
  // since these are lower-stakes, append-mostly records rather than the
  // constantly-edited job/catalog data that actually needs conflict
  // resolution.
  const updateReturns = (updater) => {
    setReturns((prev) => {
      const next = updater(prev);
      saveWithRetry(RETURNS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const createReturn = (job, date) => {
    const ret = newReturn(job.id, job.name, date);
    updateReturns((prev) => [...prev, ret]);
    setActiveReturnId(ret.id);
    setShowNewReturnModal(false);
    setShowPicker(false);
  };

  const updateReturn = (updated) => {
    updateReturns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const deleteReturn = (id) => {
    updateReturns((prev) => prev.filter((r) => r.id !== id));
    setActiveReturnId(null);
    setShowReturnsListPage(true);
  };

  const resetAllData = async () => {
    const fresh = [seedJob()];
    setJobs(fresh);
    setActiveJobId(fresh[0].id);
    setShowPicker(false);
    setResetConfirmOpen(false);
    const jobsResult = await saveWithRetry(JOBS_KEY, JSON.stringify(fresh));
    const activeResult = await saveWithRetry(ACTIVE_JOB_KEY, JSON.stringify(fresh[0].id));
    if (jobsResult.ok) {
      jobsUpdatedAtRef.current = jobsResult.updatedAt;
      jobsBaseRef.current = fresh;
    }
    setConflictWarning(false);
    if (!jobsResult.ok) setSaveError(jobsResult.error);
    else if (!activeResult.ok) setSaveError(activeResult.error);
    else setSaveError(null);
  };

  const exportAllData = async () => {
    const ok = await downloadBackupFile(jobs, catalog, "manual-export", { force: true });
    if (!ok) setSaveError("Couldn't create the backup file");
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
          setImportAllError("That file doesn't look like a Riggy backup.");
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
        if (jobsResult.ok) {
          jobsUpdatedAtRef.current = jobsResult.updatedAt;
          jobsBaseRef.current = importedJobs;
        }
        if (catalogResult.ok) {
          catalogUpdatedAtRef.current = catalogResult.updatedAt;
          catalogBaseRef.current = importedCatalog;
        }
        setConflictWarning(false);
        if (!jobsResult.ok) setSaveError(jobsResult.error);
        else if (!catalogResult.ok) setSaveError(catalogResult.error);
        else setSaveError(null);
      } catch {
        setImportAllError("Couldn't read that file — make sure it's an unmodified Riggy backup.");
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

      {updateAvailable && (
        <button
          onClick={applyUpdate}
          className="fixed top-0 inset-x-0 z-[80] w-full bg-amber-500 text-slate-950 text-sm font-medium shadow-lg text-left"
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span>A new version of Riggy is ready</span>
            <span className="bg-slate-950 text-amber-400 text-xs font-semibold rounded-md px-4 py-2.5 shrink-0">
              Update now
            </span>
          </div>
        </button>
      )}

      {syncing && (
        <div className="fixed bottom-3 right-3 z-[60] bg-amber-500 text-slate-950 text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2 shadow-lg">
          <div className="w-3 h-3 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
          Saving — don't close yet
        </div>
      )}

      {!isOnline && offlineQueued && (
        <div className="fixed bottom-3 right-3 z-[60] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-3 py-2 flex items-center gap-2 shadow-lg">
          📴 Offline — changes saved on this device, will sync when back online
        </div>
      )}

      {reconciling && (
        <div className="fixed bottom-3 right-3 z-[60] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-3 py-2 flex items-center gap-2 shadow-lg">
          <div className="w-3 h-3 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin" />
          Checking for updates from while you were offline...
        </div>
      )}

      {conflictWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-amber-600/50 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">
              Couldn't check what changed
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              Something else saved changes to this data, but the connection isn't cooperating
              enough right now to check exactly what — so there's no way to merge automatically
              this time. To avoid silently overwriting their work, choose:
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
                  if (jobsResult.ok) {
                    jobsUpdatedAtRef.current = jobsResult.updatedAt;
                    jobsBaseRef.current = jobs;
                  }
                  if (catalogResult.ok) {
                    catalogUpdatedAtRef.current = catalogResult.updatedAt;
                    catalogBaseRef.current = catalog;
                  }
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

      {mergeState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
          <div className="bg-slate-900 border border-amber-600/50 rounded-lg w-full max-w-lg max-h-full flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold mb-1">
                A few things changed on both sides
              </h3>
              <p className="text-xs text-slate-400">
                Everything else synced automatically with no conflict. A backup of your
                offline changes was downloaded automatically too, just in case. Only these{" "}
                {mergeState.conflicts.length} item{mergeState.conflicts.length === 1 ? "" : "s"}{" "}
                need a decision:
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {mergeState.conflicts.map((c, idx) => {
                const label =
                  c.kind === "catalog"
                    ? `Catalog: ${(c.mine || c.theirs || c.base)?.name || "item"}`
                    : c.kind === "job"
                    ? `Job: ${(c.mine || c.theirs)?.name || "unnamed"}`
                    : `${mergeState.conflicts[idx].jobName || "Job"} — ${
                        (c.mine || c.theirs || c.base)?.name || "item"
                      }`;
                const mineLabel =
                  c.mine === null
                    ? "Deleted (by you)"
                    : c.kind === "job"
                    ? c.mine.name
                    : `Qty ${c.mine.qtyHave ?? "—"} of ${c.mine.qtyNeeded ?? "—"}${
                        c.mine.containers?.length
                          ? ` · ${c.mine.containers.map((x) => `${x.name}: ${x.qty}`).join(", ")}`
                          : ""
                      }`;
                const theirsLabel =
                  c.theirs === null
                    ? "Deleted (elsewhere)"
                    : c.kind === "job"
                    ? c.theirs.name
                    : `Qty ${c.theirs.qtyHave ?? "—"} of ${c.theirs.qtyNeeded ?? "—"}${
                        c.theirs.containers?.length
                          ? ` · ${c.theirs.containers
                              .map((x) => `${x.name}: ${x.qty}`)
                              .join(", ")}`
                          : ""
                      }`;
                return (
                  <div key={idx} className="border border-slate-800 rounded-md p-3">
                    <p className="text-sm text-slate-100 font-semibold mb-2">{label}</p>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          checked={c.resolution === "mine"}
                          onChange={() =>
                            setMergeState((prev) => ({
                              ...prev,
                              conflicts: prev.conflicts.map((x, i) =>
                                i === idx ? { ...x, resolution: "mine" } : x
                              ),
                            }))
                          }
                          className="mt-0.5 accent-amber-500"
                        />
                        <span className="text-slate-300">
                          <span className="text-amber-400 font-medium">Your version: </span>
                          {mineLabel}
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          checked={c.resolution === "theirs"}
                          onChange={() =>
                            setMergeState((prev) => ({
                              ...prev,
                              conflicts: prev.conflicts.map((x, i) =>
                                i === idx ? { ...x, resolution: "theirs" } : x
                              ),
                            }))
                          }
                          className="mt-0.5 accent-amber-500"
                        />
                        <span className="text-slate-300">
                          <span className="text-sky-400 font-medium">Their version: </span>
                          {theirsLabel}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-slate-800 shrink-0">
              <button
                onClick={async () => {
                  let finalJobs = mergeState.jobs;
                  let finalCatalog = mergeState.catalog;

                  mergeState.conflicts.forEach((c) => {
                    const winner = c.resolution === "mine" ? c.mine : c.theirs;
                    if (c.kind === "catalog") {
                      finalCatalog = winner
                        ? [...finalCatalog.filter((x) => String(x.id) !== String(c.id)), winner]
                        : finalCatalog.filter((x) => String(x.id) !== String(c.id));
                    } else if (c.kind === "job" && c.subtype === "deletion") {
                      // mine/theirs here are full job objects (or null) —
                      // safe to splice in directly or remove entirely.
                      finalJobs = winner
                        ? [...finalJobs.filter((j) => String(j.id) !== String(c.id)), winner]
                        : finalJobs.filter((j) => String(j.id) !== String(c.id));
                    } else if (c.kind === "job" && c.subtype === "metadata") {
                      // mine/theirs here are only {name, color, parentId} —
                      // patch just those fields onto the already-merged job
                      // (which already has the right items/containers/etc.),
                      // never replace the whole object with a partial one.
                      finalJobs = finalJobs.map((j) =>
                        String(j.id) === String(c.id) ? { ...j, ...winner } : j
                      );
                    } else {
                      finalJobs = finalJobs.map((j) => {
                        if (String(j.id) !== String(c.jobId)) return j;
                        const items = winner
                          ? [...j.items.filter((i) => String(i.id) !== String(c.id)), winner]
                          : j.items.filter((i) => String(i.id) !== String(c.id));
                        return { ...j, items };
                      });
                    }
                  });

                  const jobsSave = await saveWithRetry(JOBS_KEY, JSON.stringify(finalJobs));
                  const catalogSave = await saveWithRetry(
                    CATALOG_KEY,
                    JSON.stringify(finalCatalog)
                  );
                  if (jobsSave.ok) {
                    jobsUpdatedAtRef.current = jobsSave.updatedAt;
                    jobsBaseRef.current = finalJobs;
                    setJobs(finalJobs);
                  }
                  if (catalogSave.ok) {
                    catalogUpdatedAtRef.current = catalogSave.updatedAt;
                    catalogBaseRef.current = finalCatalog;
                    setCatalog(finalCatalog);
                  }
                  clearOfflineQueue();
                  offlineSnapshotRef.current = null;
                  setOfflineQueued(false);
                  setMergeState(null);
                }}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Apply and sync
              </button>
              <p className="text-xs text-slate-600 mt-3">
                Your full offline changes are also saved in the backup file that just
                downloaded, regardless of what you pick here.
              </p>
            </div>
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

      {activeReturn ? (
        <ReturnDetailPage
          ret={activeReturn}
          onUpdate={updateReturn}
          onBack={() => {
            setActiveReturnId(null);
            setShowReturnsListPage(true);
          }}
          onGoHome={() => {
            setActiveReturnId(null);
            setShowReturnsListPage(false);
            setShowPicker(true);
          }}
          onDeleteReturn={deleteReturn}
        />
      ) : showReturnsListPage ? (
        <ReturnsListPage
          returns={returns}
          onOpenReturn={(r) => {
            setActiveReturnId(r.id);
            setShowReturnsListPage(false);
          }}
          onBack={() => setShowReturnsListPage(false)}
          onGoHome={() => {
            setShowReturnsListPage(false);
            setShowPicker(true);
          }}
        />
      ) : showingPicker ? (
        <JobPicker
          jobs={jobs}
          catalog={catalog}
          isEditor={isEditor}
          onRequestLogin={onRequestLogin}
          onSelect={(id) => {
            setActiveJobId(id);
            setShowPicker(false);
          }}
          onCreateClick={() => setShowNewJobModal(true)}
          onCreateQuickTransferClick={() => setShowTransferOrReturnChoice(true)}
          onCreateSubJobClick={(job) => setSubJobParent(job)}
          onDeleteRequest={(job) => setJobDeleteTarget(job)}
          onRenameRequest={(job) => setJobRenameTarget(job)}
          onResetRequest={() => setResetConfirmOpen(true)}
          onOpenCatalog={() => setCatalogModalOpen(true)}
          onExportAll={exportAllData}
          onImportAll={importAllData}
          onSignOut={onSignOut}
          pendingSuggestionCount={pendingSuggestionCount}
          onOpenSuggestions={() => {
            setSuggestionsOpen(true);
            refreshSuggestions();
            refreshResolvedSuggestions();
          }}
          onOpenFieldRequests={() => {
            setFieldRequestsOpen(true);
            refreshFieldRequestCount();
          }}
          pendingFieldRequestCount={pendingFieldRequestCount}
          onOpenReturnsList={() => setShowReturnsListPage(true)}
          returnsCount={returns.length}
          onCheckForUpdate={checkForUpdateNow}
          updateCheckMessage={updateCheckMessage}
        />
      ) : (
        <JobInventory
          job={activeJob}
          isEditor={isEditor}
          onRequestLogin={onRequestLogin}
          onUpdateJob={updateActiveJob}
          onBackToJobs={() => setShowPicker(true)}
          catalog={catalog}
          onSaveCatalogItem={saveCatalogItem}
          onOpenCatalog={() => setCatalogModalOpen(true)}
          onRenameJob={(name, color) => renameJob(activeJob.id, name, color)}
        />
      )}

      {catalogModalOpen && (
        <CatalogModal
          catalog={catalog}
          isEditor={isEditor}
          onSave={saveCatalogItem}
          onBulkSave={bulkSaveCatalogItems}
          onDelete={deleteCatalogItem}
          onBulkSetCategory={bulkSetCatalogCategory}
          onBulkSetVendor={bulkSetCatalogVendor}
          onClose={() => setCatalogModalOpen(false)}
        />
      )}

      {suggestionsOpen && (
        <SuggestionsInboxModal
          suggestions={suggestionsList}
          resolvedSuggestions={resolvedSuggestionsList}
          resolvedLoading={resolvedSuggestionsLoading}
          jobs={jobs}
          loading={suggestionsLoading}
          onApprove={approveSuggestion}
          onDeny={denySuggestion}
          onDelete={deleteSuggestion}
          onRevert={revertSuggestion}
          onReapprove={reapproveSuggestion}
          onClose={() => setSuggestionsOpen(false)}
        />
      )}

      {fieldRequestsOpen && (
        <FieldRequestsModal
          onClose={() => {
            setFieldRequestsOpen(false);
            refreshFieldRequestCount();
          }}
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

      {showTransferOrReturnChoice && (
        <TransferOrReturnModal
          onChooseTransfer={() => {
            setShowTransferOrReturnChoice(false);
            setShowQuickTransferModal(true);
          }}
          onChooseReturn={() => {
            setShowTransferOrReturnChoice(false);
            setShowNewReturnModal(true);
          }}
          onCancel={() => setShowTransferOrReturnChoice(false)}
        />
      )}

      {showNewReturnModal && (
        <NewReturnModal
          jobs={jobs}
          onSubmit={createReturn}
          onCancel={() => setShowNewReturnModal(false)}
        />
      )}

      {showQuickTransferModal && (
        <QuickTransferNameModal
          onSubmit={createOrOpenQuickTransfer}
          onCancel={() => setShowQuickTransferModal(false)}
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

function LoginScreen({ onSignedIn, embedded = false }) {
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

  const content = (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2.5 justify-center mb-6">
        <div className="w-9 h-9 rounded-md bg-amber-500 flex items-center justify-center">
          <Package className="w-5 h-5 text-slate-950" strokeWidth={2.5} />
        </div>
        <h1 className="font-bold text-xl text-slate-100">Riggy</h1>
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
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      {content}
    </div>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [showLogin, setShowLogin] = useState(false);

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

  return (
    <>
      <WareHub
        isEditor={!!session}
        onSignOut={() => supabase.auth.signOut()}
        onRequestLogin={() => setShowLogin(true)}
      />
      {showLogin && !session && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-sm">
            <button
              onClick={() => setShowLogin(false)}
              className="absolute -top-10 right-0 text-slate-400 hover:text-slate-200"
            >
              <X className="w-6 h-6" />
            </button>
            <LoginScreen
              embedded
              onSignedIn={(s) => {
                setSession(s);
                setShowLogin(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
