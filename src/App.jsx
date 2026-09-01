import { useState, useEffect, useRef, useMemo } from "react";
import QRCode from "qrcode";
import { supabase } from "./supabaseClient";
import {
  Package,
  Plus,
  X,
  Trash2,
  Pencil,
  Lock,
  Unlock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Filter,
  Briefcase,
  Heart,
  ShoppingCart,
  Settings,
  Users,
  Image as ImageIcon,
  ScanLine,
  Camera,
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
  AlertTriangle,
  DollarSign,
  Shuffle,
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

// Date.now() alone only has millisecond resolution — two items created in
// the same millisecond (a fast double-tap, or several rows created in a
// tight loop) would get the exact same id, and since ids are used as Set
// keys for things like transfer selection, that makes two genuinely
// different items behave as if they were the same one. This guarantees
// every id is strictly unique and still roughly time-ordered.
let __lastGeneratedId = 0;
function uniqueId() {
  const id = Math.max(Date.now(), __lastGeneratedId + 1);
  __lastGeneratedId = id;
  return id;
}

// Tapping into a number field (Qty, capacity, etc.) selects the existing
// value instead of just placing a cursor — so typing a new number
// immediately overwrites whatever was there (often a "0"), rather than
// needing to manually clear or position the cursor first. Both handlers
// are needed: onFocus covers the first tap into an unfocused field,
// onClick covers re-tapping a field that's already focused (which
// doesn't re-fire onFocus in most browsers).
function selectOnFocus(e) {
  e.target.select();
}

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
    id: uniqueId(),
    jobId,
    jobName,
    date,
    items: [],
    createdAt: timeStamp(),
  };
}

function newJob(name, parentId = null, color = null, isQuickTransfer = false) {
  return {
    id: uniqueId(),
    name,
    createdAt: timeStamp(),
    parentId,
    color,
    isQuickTransfer,
    sealed: false,
    items: [],
    containerOptions: [],
    categoryOptions: [],
    todos: [],
    activityLog: [{ id: uniqueId(), time: timeStamp(), message: `Job "${name}" created.` }],
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

// SME#s that already belong to a locked Received/Staged/Sent batch on a
// Love List item — permanent historical record, never editable again.
// Used to keep the SME# entry box showing only what's new/unrecorded,
// rather than mixing fresh entries in with numbers that already shipped.
function lockedLoveSerials(item) {
  return [
    ...new Set([
      ...((item.receivedBatches || []).flatMap((b) => b.serials || [])),
      ...((item.stagedBatches || []).flatMap((b) => b.serials || [])),
      ...((item.sentBatches || []).flatMap((b) => b.serials || [])),
    ]),
  ];
}

function emptyItem(defaultStorage) {
  return {
    id: null,
    _formKey: `new-${uniqueId()}-${Math.random()}`,
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
    backorderQty: 0, // still outstanding from a supplier, set/updated via Receiving
    backorderReceiptDate: null, // date of whichever receipt most recently set backorderQty — protects against an older, already-superseded receipt overwriting it if processed out of order
    // Points at another item's id, within the same job — "this item's
    // qty counts toward that item's requirement." Used purely for the
    // combined Have/Needed display; both items stay fully independent
    // otherwise (own containers, own serials, own transfer tracking),
    // since the actual transfer record already lists items separately
    // and that distinction needs to survive.
    substituteForItemId: null,
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

// A container counts as "fully transferred" — physically gone from the yard —
// once every item portion that was ever placed in it has been locked as
// transferred, and at least one item actually referenced it. Containers with
// no history at all (e.g. freshly created, never used) are NOT transferred,
// so they stay available for new items.
function isContainerTransferred(containerName, items) {
  const inContainer = (items || []).filter((i) =>
    (i.containers || []).some((c) => c.name === containerName)
  );
  if (inContainer.length === 0) return false;
  return inContainer.every((i) =>
    (i.transferredContainers || []).includes(containerName)
  );
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
  // Learned aliases take priority over any name-based guessing — if this
  // exact phrase has been manually linked before, trust that over a fuzzy
  // guess every time.
  let match = catalog.find((c) =>
    (c.aliases || []).some((a) => normalizeText(a) === normName)
  );
  if (match) return match;
  // Exact normalized match first
  match = catalog.find((c) => normalizeText(c.name) === normName);
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
  // Squashed substring: catches a name typed as separate words matching
  // a catalog entry written as one compound word, or vice versa (e.g.
  // "Jet Pack" vs "Lanyards (JetPack)") — neither the word-respecting
  // substring check above nor the whole-word token-overlap check below
  // can bridge a word that's split in one string but joined in the
  // other, since squashing "jet pack" only ever produces "jetpack" as a
  // single token, never matching "jet" or "pack" as separate tokens.
  const squashCandidates = catalog.filter((c) => {
    const cSquash = normalizeText(c.name).replace(/\s+/g, "");
    return cSquash.length > 2 && (squashName.includes(cSquash) || cSquash.includes(squashName));
  });
  if (squashCandidates.length > 0) {
    squashCandidates.sort(
      (a, b) => Math.abs(a.name.length - name.length) - Math.abs(b.name.length - name.length)
    );
    return squashCandidates[0];
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
        matchedCatalogName: match ? match.name : null,
        gang: match ? match.gang : "Unassigned",
        storage: match ? match.storage : "Unassigned",
        storageDetail: match && match.storage === "Other" ? match.storageDetail || "" : "",
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
  // When true, this is a non-editor proposing a change rather than an
  // editor making one directly — same exact form, same full visibility
  // into everything (containers, gang, category, storage, catalog link),
  // just routed to onSuggest instead of onSave so the owner reviews it
  // first.
  suggestMode = false,
  onSuggest,
  // Both optional, and only meaningful for an existing item on a regular
  // (non-quick-transfer, non-suggest) edit — these open pickers that live
  // one level up, at the job screen itself, since that's where the full
  // items list and worker roster actually are.
  onLinkSubstitute,
  onAssignWorker,
  workerTasks = [],
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
  const [suggestNote, setSuggestNote] = useState("");

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

  // Transferred containers are physically gone — don't offer them as a
  // destination for new (or reassigned) container rows.
  const transferredContainerNames = new Set(
    containerOptions.filter((name) => isContainerTransferred(name, existingItems))
  );
  const assignableContainerOptions = containerOptions.filter(
    (name) => !transferredContainerNames.has(name)
  );

  const addContainerRow = () => {
    const used = new Set(item.containers.map((c) => c.name));
    const nextAvailable = [...assignableContainerOptions].sort((a, b) => a.localeCompare(b)).find(
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
        // A name-based auto-match is just as real a link as one you
        // pick manually — it was already being shown as "Linked to catalog
        // item X", so saving only the manual half was silently leaving
        // items looking linked in the form while never actually getting a
        // catalogId, which is exactly why some items were missing the
        // Vendor button despite the form appearing to show a link.
        catalogId: effectiveCatalogMatch ? effectiveCatalogMatch.id : null,
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
                onFocus={selectOnFocus}
                onClick={selectOnFocus}
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
          {suggestMode && (
            <p className="text-xs text-slate-500 -mt-1">
              You're viewing this job without edit access — this is exactly what the owner sees.
              Change whatever needs updating below; nothing takes effect until they approve it.
            </p>
          )}
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
                        storageDetail:
                          effectiveCatalogMatch.storage === "Other"
                            ? effectiveCatalogMatch.storageDetail || ""
                            : prev.storageDetail,
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

          {!suggestMode && initial.id && (onLinkSubstitute || onAssignWorker) && (
            <div className="border border-slate-800 rounded-md p-3 space-y-2">
              {onLinkSubstitute && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500 truncate">
                    {item.substituteForItemId
                      ? `🔀 Counts toward "${
                          (existingItems.find((i) => i.id === item.substituteForItemId) || {}).name || "another item"
                        }"`
                      : "Not counting toward another item"}
                  </p>
                  <button
                    onClick={() => onLinkSubstitute(item)}
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0"
                  >
                    {item.substituteForItemId ? "Change" : "Link one"}
                  </button>
                </div>
              )}
              {onAssignWorker && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500 truncate">
                    {(() => {
                      const assigned = (item.assignedTaskIds || [])
                        .map((tid) => workerTasks.find((t) => t.id === tid))
                        .filter(Boolean);
                      return assigned.length > 0
                        ? `👤 ${assigned.map((t) => t.workerName).join(", ")}`
                        : "Not assigned to a worker";
                    })()}
                  </p>
                  <button
                    onClick={() => onAssignWorker(item)}
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0"
                  >
                    {(item.assignedTaskIds || []).length > 0 ? "Change" : "Assign"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Qty needed</label>
              <input
                type="number"
                onFocus={selectOnFocus}
                onClick={selectOnFocus}
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
                {item.containers.map((c, idx) => {
                  // A row's current value can be a name that isn't in
                  // this job's real container list at all — either a
                  // transferred container (locked, shown read-only-ish
                  // below) or "Unassigned", the synthetic bucket
                  // Receiving drops freshly-shipped stock into before
                  // it's been sorted into a real gangbox/conex. Either
                  // way, the dropdown needs to actually include the
                  // row's own value, or the browser silently falls back
                  // to showing whatever option happens to be first —
                  // which looks like the item's in the wrong place even
                  // though the saved data is completely correct.
                  const isTransferred = transferredContainerNames.has(c.name);
                  const isKnownOption = assignableContainerOptions.includes(c.name);
                  const rowOptions =
                    isTransferred || !isKnownOption
                      ? [...new Set([c.name, ...assignableContainerOptions])]
                      : assignableContainerOptions;
                  return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={c.name}
                        onChange={(val) => updateContainerRow(idx, "name", val)}
                        options={[...rowOptions].sort((a, b) => a.localeCompare(b))}
                        labels={
                          isTransferred
                            ? { [c.name]: `${c.name} (transferred — pick a new container)` }
                            : c.name === "Unassigned"
                            ? { [c.name]: "Unassigned (needs sorting into a real container)" }
                            : undefined
                        }
                      />
                    </div>
                    <input
                      type="number"
                      onFocus={selectOnFocus}
                      onClick={selectOnFocus}
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
                  );
                })}
              </div>
            )}
            <button
              onClick={addContainerRow}
              disabled={assignableContainerOptions.length === 0}
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

          {onSaveCatalogItem && !suggestMode && (
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

        {suggestMode && (
          <div className="px-5 pb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Note (optional)
            </label>
            <textarea
              value={suggestNote}
              onChange={(e) => setSuggestNote(e.target.value)}
              placeholder="Anything else the owner should know..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 resize-none"
            />
          </div>
        )}

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

              const { _formKey, ...itemToSave } = item;
              const finalItem = {
                ...itemToSave,
                qtyNeeded: finalQtyNeeded,
                qtyHave: finalQtyHave,
                containers: cleanContainers,
                serials: finalSerials,
                status: finalStatus,
                catalogId: effectiveCatalogMatch ? effectiveCatalogMatch.id : null,
              };

              playSaveChime();

              if (suggestMode) {
                onSuggest(finalItem, suggestNote);
                return;
              }

              if (addToCatalog && onSaveCatalogItem) {
                onSaveCatalogItem({
                  id: effectiveCatalogMatch ? effectiveCatalogMatch.id : uniqueId(),
                  name: item.name.trim(),
                  gang: item.gang,
                  storage: item.storage,
                  needsTransfer: !!item.needsTransfer,
                });
              }

              onSave(finalItem);
            }}
            disabled={!canSave}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500"
          >
            {suggestMode ? "Suggest changes" : "Save item"}
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

function TransferListModal({ jobName, items, requisitions = [], catalog = [], onLockItems, onUnlockItem, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [choosingMode, setChoosingMode] = useState(false);
  const [partialSelect, setPartialSelect] = useState(null); // Set of item ids, or null when not in partial mode
  const [justTransferred, setJustTransferred] = useState(null); // items from the batch just locked, for the copy screen
  const [justCopied, setJustCopied] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [transferDate, setTransferDate] = useState(todayStr);

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

  const allTransferItems = items.filter((i) => i.needsTransfer);

  // An item split across multiple containers needs each portion tracked
  // independently — "transferred the copy in Conex 10-20" shouldn't touch
  // the copy sitting in Conex 10-21. Items with no container at all are
  // treated as a single implicit portion.
  const NO_CONTAINER = "__unassigned__";
  const containerPortions = (item) =>
    item.containers && item.containers.length > 0
      ? item.containers.map((c) => c.name)
      : [NO_CONTAINER];
  const isPortionTransferred = (item, containerName) =>
    (item.transferredContainers || []).includes(containerName);
  const remainingPortions = (item) =>
    containerPortions(item).filter((name) => !isPortionTransferred(item, name));

  const activeItems = sortWithPriority(
    allTransferItems.filter((i) => remainingPortions(i).length > 0),
    (i) => i.name
  );
  const lockedItems = sortWithPriority(
    allTransferItems.filter((i) => remainingPortions(i).length === 0),
    (i) => i.name
  );
  const transferItems = activeItems; // what actually gets copied/exported

  // Selection keys are item+container composite pairs, since the same
  // item can have independent transfer status per container it sits in.
  const portionKey = (itemId, containerName) => `${itemId}::${containerName}`;
  const parsePortionKey = (key) => {
    const sep = key.indexOf("::");
    return { itemId: Number(key.slice(0, sep)), containerName: key.slice(sep + 2) };
  };

  const containerGroups = [
    ...new Set(
      activeItems.flatMap((i) => remainingPortions(i).filter((n) => n !== NO_CONTAINER))
    ),
  ].sort((a, b) => a.localeCompare(b));
  const unassignedActiveItems = activeItems.filter((i) =>
    remainingPortions(i).includes(NO_CONTAINER)
  );
  // What actually shows on the selection screen — SME-tracked items only.
  const itemsInContainer = (name) =>
    activeItems.filter((i) => remainingPortions(i).includes(name));

  // Not shown individually, but swept in silently at confirm time whenever
  // the whole container gets checked off — untracked bulk items in the
  // same container should go with it without cluttering the selection
  // list one by one.
  const nonSmeItemsInContainer = (name) =>
    items.filter(
      (i) =>
        (!i.serials || i.serials.length === 0) &&
        (i.containers || []).some((c) => c.name === name) &&
        !isPortionTransferred(i, name)
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

  // Only items with an SME# tracked make it into the copied/printed
  // record — bulk untracked items don't need a paper trail the same way.
  const smeTransferItems = transferItems.filter((i) => i.serials && i.serials.length > 0);

  const asText = [
    smeTransferItems.map(lineFor).join("\n"),
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

  const toggleSelectPortion = (itemId, containerName) => {
    const key = portionKey(itemId, containerName);
    setPartialSelect((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectContainer = (name) => {
    const keysInContainer = itemsInContainer(name).map((i) => portionKey(i.id, name));
    const allSelected = keysInContainer.every((k) => partialSelect.has(k));
    setPartialSelect((prev) => {
      const next = new Set(prev);
      keysInContainer.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const confirmPartialTransfer = () => {
    const pairs = [...partialSelect].map(parsePortionKey);

    // Any container where every SME-tracked item shown got checked counts
    // as "the whole container" — sweep its untracked items in too, silently.
    const fullySelectedContainers = containerGroups.filter((name) => {
      const smeItems = itemsInContainer(name);
      return smeItems.length > 0 && smeItems.every((i) => partialSelect.has(portionKey(i.id, name)));
    });
    const sweptPairs = fullySelectedContainers.flatMap((name) =>
      nonSmeItemsInContainer(name).map((i) => ({ itemId: i.id, containerName: name }))
    );

    const allPairs = [...pairs, ...sweptPairs];
    const selectedItemIds = [...new Set(allPairs.map((p) => p.itemId))];
    const selectedItems = items.filter((i) => selectedItemIds.includes(i.id));
    onLockItems(allPairs, transferDate);
    setPartialSelect(null);
    setJustTransferred(selectedItems);
  };

  const confirmFullTransfer = () => {
    const pairs = activeItems.flatMap((i) =>
      remainingPortions(i).map((containerName) => ({ itemId: i.id, containerName }))
    );
    const touchedContainers = [...new Set(pairs.map((p) => p.containerName))].filter(
      (n) => n !== NO_CONTAINER
    );
    const sweptPairs = touchedContainers.flatMap((name) =>
      nonSmeItemsInContainer(name).map((i) => ({ itemId: i.id, containerName: name }))
    );
    const allPairs = [...pairs, ...sweptPairs];
    const selectedItemIds = [...new Set(allPairs.map((p) => p.itemId))];
    const selectedItems = items.filter((i) => selectedItemIds.includes(i.id));
    onLockItems(allPairs, transferDate);
    setConfirmFull(false);
    setJustTransferred(selectedItems);
  };

  // Shown right after confirming either kind of transfer — a focused,
  // copy-ready list of exactly what just moved, for printing/pasting
  // somewhere without needing to re-open the full transfer list.
  if (justTransferred) {
    const smeJustTransferred = justTransferred.filter((i) => i.serials && i.serials.length > 0);
    const text = smeJustTransferred.map(lineFor).join("\n");
    const copyJustTransferred = async () => {
      const ok = await copyToClipboard(`Transferred — ${jobName}\n\n${text}`);
      if (ok) {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1500);
      }
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Marked as transferred</h2>
              <p className="text-xs text-slate-500">
                {justTransferred.length} item{justTransferred.length === 1 ? "" : "s"} — copy the
                list below to print or paste it
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
              {justTransferred.map((item) => (
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
          </div>
          <div className="px-5 py-4 border-t border-slate-800 shrink-0 space-y-2">
            {smeJustTransferred.length > 0 && (
              <button
                onClick={copyJustTransferred}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Copy className="w-3.5 h-3.5" />
                {justCopied ? "Copied!" : "Copy this list"}
              </button>
            )}
            <button
              onClick={() => setJustTransferred(null)}
              className="w-full text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Partial-selection screen replaces the normal view while active.
  if (partialSelect) {
    const selectedCount = partialSelect.size;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-lg rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Select what's transferring</h2>
              <p className="text-xs text-slate-500">{selectedCount} selected</p>
            </div>
            <button
              onClick={() => setPartialSelect(null)}
              className="text-slate-400 hover:text-slate-200 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {containerGroups.map((name) => {
              const inContainer = itemsInContainer(name);
              const allSelected = inContainer.every((i) => partialSelect.has(portionKey(i.id, name)));
              return (
                <div key={name}>
                  <label className="flex items-center gap-2 mb-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectContainer(name)}
                      className="w-4 h-4 rounded accent-amber-500"
                    />
                    <span className="text-xs font-semibold text-slate-400">
                      📦 {name} — select all
                    </span>
                  </label>
                  <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden ml-1">
                    {inContainer.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2.5 px-3 py-2 bg-slate-800/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={partialSelect.has(portionKey(item.id, name))}
                          onChange={() => toggleSelectPortion(item.id, name)}
                          className="w-4 h-4 rounded accent-amber-500 shrink-0"
                        />
                        <p className="text-sm text-slate-100 flex-1 min-w-0">
                          {item.name}{" "}
                          <span className="text-slate-500">
                            x{(item.containers || []).find((c) => c.name === name)?.qty ?? item.qtyHave}
                          </span>
                        </p>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {unassignedActiveItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1.5">No container assigned</p>
                <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden ml-1">
                  {unassignedActiveItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2.5 px-3 py-2 bg-slate-800/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={partialSelect.has(portionKey(item.id, NO_CONTAINER))}
                        onChange={() => toggleSelectPortion(item.id, NO_CONTAINER)}
                        className="w-4 h-4 rounded accent-amber-500 shrink-0"
                      />
                      <p className="text-sm text-slate-100 flex-1 min-w-0">
                        {item.name}{" "}
                        <span className="text-slate-500">x{item.qtyHave}</span>
                      </p>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-800 shrink-0">
            <p className="text-xs text-slate-500 mb-1.5">Transfer date</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setTransferDate(todayStr)}
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  transferDate === todayStr
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                Today
              </button>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <button
              onClick={confirmPartialTransfer}
              disabled={selectedCount === 0}
              className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
            >
              Mark {selectedCount || ""} selected as transferred
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              {jobName} · {activeItems.length} item{activeItems.length === 1 ? "" : "s"} ready
              {lockedItems.length > 0 ? ` · ${lockedItems.length} already transferred` : ""}
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
          {activeItems.length === 0 && lockedItems.length === 0 && requisitions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              No items are marked to transfer yet, and there's nothing on the REQ page either.
              Mark items with "Needs transfer" in the item form, or add requisitions from the
              REQ page.
            </p>
          ) : (
            <>
              {activeItems.length > 0 && (
                <div className="mb-4">
                  {choosingMode ? (
                    <div className="border border-amber-500/40 bg-amber-500/5 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-300 mb-1">What's transferring?</p>
                      <button
                        onClick={() => {
                          setChoosingMode(false);
                          setConfirmFull(true);
                        }}
                        className="w-full text-left border border-slate-700 rounded-md p-2.5 hover:border-amber-500/50 hover:bg-amber-500/5"
                      >
                        <p className="text-sm font-medium text-slate-100">Full transfer</p>
                        <p className="text-xs text-slate-500">
                          All {activeItems.length} item{activeItems.length === 1 ? "" : "s"} below
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          setChoosingMode(false);
                          setPartialSelect(new Set());
                        }}
                        className="w-full text-left border border-slate-700 rounded-md p-2.5 hover:border-amber-500/50 hover:bg-amber-500/5"
                      >
                        <p className="text-sm font-medium text-slate-100">Partial transfer</p>
                        <p className="text-xs text-slate-500">Pick specific containers/items</p>
                      </button>
                      <button
                        onClick={() => setChoosingMode(false)}
                        className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setChoosingMode(true)}
                      className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-200 hover:bg-slate-800"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Start transfer
                    </button>
                  )}
                </div>
              )}

              {activeItems.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-slate-500 mb-2">Ready to transfer</p>
                  <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
                    {activeItems.map((item) => (
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
                </div>
              )}

              {lockedItems.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-emerald-500 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Already transferred
                  </p>
                  <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
                    {lockedItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-3 py-2 bg-slate-800/20 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-slate-400">
                            {item.name}{" "}
                            <span className="text-slate-600">x{item.qtyHave}</span>
                          </p>
                          {item.transferredDate && (
                            <p className="text-xs text-slate-600">{item.transferredDate}</p>
                          )}
                        </div>
                        <button
                          onClick={() => onUnlockItem(item.id)}
                          className="text-xs text-slate-500 hover:text-amber-400 shrink-0"
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
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

        {(activeItems.length > 0 || requisitions.length > 0) && (
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

      {confirmFull && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">
              Mark everything as transferred?
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              All {activeItems.length} item{activeItems.length === 1 ? "" : "s"} on this list
              will be locked as already transferred.
            </p>
            <p className="text-xs text-slate-500 mb-1.5">Transfer date</p>
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setTransferDate(todayStr)}
                className={`flex-1 text-sm rounded-md py-2 border transition-colors ${
                  transferDate === todayStr
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                Today
              </button>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFull(false)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmFullTransfer}
                className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Confirm transfer
              </button>
            </div>
          </div>
        </div>
      )}
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
    storageDetail: "",
    category: "",
    vendor: "",
    needsTransfer: false,
    pinned: false,
    aliases: [],
    // Marks catalog entries that intentionally cover several real
    // variants (e.g. a generic "Reamer" entry spanning multiple sizes) —
    // duplicate detection skips catalog-ID matching for these, since a
    // shared link doesn't actually mean the same physical item.
    multiSize: false,
  };
}

function CatalogItemForm({ initial, existingCategories = [], existingVendors = [], onSave, onCancel }) {
  const [item, setItem] = useState({ needsTransfer: false, pinned: false, multiSize: false, category: "", storageDetail: "", ...initial });
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
            {item.storage === "Other" && (
              <input
                value={item.storageDetail || ""}
                onChange={(e) => set("storageDetail")(e.target.value)}
                placeholder="Specify location..."
                className="w-full mt-2 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60"
              />
            )}
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Usual vendor</label>
            <div className="w-full bg-slate-800/50 border border-slate-700 text-sm rounded-md px-3 py-2">
              {item.vendor ? (
                <span className="text-slate-200">{item.vendor}</span>
              ) : (
                <span className="text-slate-600">Not enough purchase history yet</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Set automatically from Receiving history — whichever vendor has delivered the most
              of this item. Never shown on job pages, only used to group outstanding items by
              vendor on the pick list.
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
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!item.multiSize}
                onChange={(e) => set("multiSize")(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <span className="text-sm text-slate-200">
                Covers several sizes/variants (e.g. "Reamer")
              </span>
            </label>
            <p className="text-xs text-slate-600 mt-1 ml-6">
              Love Lists' duplicate detection skips matching by catalog link for entries marked
              this way, since two requests linked to the same broad entry might genuinely be
              different sizes, not the same request. It'll still catch duplicates by name.
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
            onClick={() => canSave && onSave({ ...item, id: item.id || uniqueId() })}
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
      id: uniqueId() + idx,
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
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null); // { linked, checked } after a run completes
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [unlinkedItems, setUnlinkedItems] = useState([]);
  const [linkingUnlinked, setLinkingUnlinked] = useState(null); // the row being linked, while its picker is open
  const [unlinkedCatalogSearch, setUnlinkedCatalogSearch] = useState("");
  const [costOverviewOpen, setCostOverviewOpen] = useState(false);
  const [costOverviewSearch, setCostOverviewSearch] = useState("");
  const [viewingVendorForCatalogId, setViewingVendorForCatalogId] = useState(null);
  // Layered on top of the catalog prop for vendor-history changes made
  // from inside this screen — the prop itself only ever refreshes when
  // the app reloads, so without this, clearing or deleting a purchase
  // record would look like it "came back" the moment you reopened
  // anything showing that item's history.
  const [vendorHistoryOverrides, setVendorHistoryOverrides] = useState({});
  const applyVendorOverride = (catalogId, changes) =>
    setVendorHistoryOverrides((prev) => ({ ...prev, [catalogId]: changes }));
  const catalogWithOverrides = catalog.map((c) =>
    vendorHistoryOverrides[c.id] ? { ...c, ...vendorHistoryOverrides[c.id] } : c
  );

  // Fixes the exact gap the "Linked to catalog item X" text used to leave
  // behind — that display only ever meant a name-based match was FOUND,
  // never that it was actually saved as a real catalogId unless you also
  // separately picked it manually. Any item still missing a catalogId
  // despite a clean name-match gets linked here in one pass, across every
  // job and every Love List at once — instead of reopening each one by
  // hand just to hit Save.
  const syncCatalogLinks = async () => {
    setSyncing(true);
    let linked = 0;
    let checked = 0;
    try {
      const [jResult, lResult, aResult] = await Promise.all([
        getWithRetry(JOBS_KEY),
        getWithRetry(LOVE_LISTS_KEY),
        getWithRetry(RECEIPT_ARCHIVE_KEY),
      ]);
      if (jResult.ok && jResult.value) {
        const jobs = JSON.parse(jResult.value);
        const nextJobs = jobs.map((j) => ({
          ...j,
          items: (j.items || []).map((i) => {
            if (i.catalogId) return i;
            checked++;
            const match = i.name && i.name.trim() ? findCatalogMatch(i.name, catalog) : null;
            if (match) {
              linked++;
              return { ...i, catalogId: match.id };
            }
            return i;
          }),
        }));
        await saveWithRetry(JOBS_KEY, JSON.stringify(nextJobs));
      }
      if (lResult.ok && lResult.value) {
        const lists = JSON.parse(lResult.value);
        const nextLists = lists.map((l) => ({
          ...l,
          items: (l.items || []).map((i) => {
            if (i.catalogId) return i;
            checked++;
            const match = i.name && i.name.trim() ? findCatalogMatch(i.name, catalog) : null;
            if (match) {
              linked++;
              return { ...i, catalogId: match.id };
            }
            return i;
          }),
        }));
        await saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(nextLists));
      }
      if (aResult.ok && aResult.value) {
        const archiveEntries = JSON.parse(aResult.value);
        // Collected as we go — anything that gets linked here AND has
        // shipped quantity and a vendor on its receipt needs the same
        // vendor-spend logging a manual link would trigger, otherwise a
        // bulk sync silently leaves cost history incomplete for exactly
        // the items it was supposed to fix.
        const newlyEligible = []; // { catalogId, catalogName, entryId, shippedQty, unitPrice, vendor, receiptDate }
        const nextEntries = archiveEntries.map((e) => ({
          ...e,
          items: (e.items || []).map((i) => {
            if (i.catalogId) return i;
            checked++;
            const match = i.name && i.name.trim() ? findCatalogMatch(i.name, catalog) : null;
            if (match) {
              linked++;
              if (i.shippedQty > 0 && e.vendor) {
                newlyEligible.push({
                  catalogId: match.id,
                  catalogName: match.name,
                  entryId: e.id,
                  shippedQty: i.shippedQty,
                  unitPrice: i.unitPrice || 0,
                  vendor: e.vendor,
                  receiptDate: e.receiptDate,
                });
              }
              return { ...i, catalogId: match.id };
            }
            return i;
          }),
        }));

        if (newlyEligible.length > 0) {
          const cResult = await getWithRetry(CATALOG_KEY);
          if (cResult.ok && cResult.value) {
            const recordsByCatalogId = {};
            newlyEligible.forEach((l) => {
              const record = {
                id: uniqueId(),
                vendor: l.vendor.trim(),
                qty: l.shippedQty,
                amount: Math.round(l.unitPrice * l.shippedQty * 100) / 100,
                date: l.receiptDate || new Date().toISOString().slice(0, 10),
              };
              (recordsByCatalogId[l.catalogId] = recordsByCatalogId[l.catalogId] || []).push(record);
            });
            const nextCatalog = JSON.parse(cResult.value).map((c) => {
              const newRecords = recordsByCatalogId[c.id];
              if (!newRecords) return c;
              const updatedHistory = [...(c.vendorHistory || []), ...newRecords];
              return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || c.vendor };
            });
            await saveWithRetry(CATALOG_KEY, JSON.stringify(nextCatalog));
          }
          // Also reflected on each entry's own displayed summary, same
          // shape the Archive detail view already knows how to render.
          const byEntry = {};
          newlyEligible.forEach((l) => {
            const amount = Math.round(l.unitPrice * l.shippedQty * 100) / 100;
            (byEntry[l.entryId] = byEntry[l.entryId] || []).push({
              catalogName: l.catalogName,
              qty: l.shippedQty,
              amount,
            });
          });
          Object.entries(byEntry).forEach(([entryId, additions]) => {
            const idx = nextEntries.findIndex((e) => e.id === entryId);
            if (idx !== -1) {
              nextEntries[idx] = {
                ...nextEntries[idx],
                vendorSummary: [...(nextEntries[idx].vendorSummary || []), ...additions],
              };
            }
          });
        }

        await saveWithRetry(RECEIPT_ARCHIVE_KEY, JSON.stringify(nextEntries));
      }
      setSyncResult({ linked, checked });
    } catch (err) {
      setSyncResult({ error: err && err.message ? err.message : String(err) });
    }
    setSyncing(false);
  };

  // A one-off locator, not something meant to stay in daily use — after
  // a big cleanup like Sync Catalog, this is for tracking down whatever
  // it genuinely couldn't match on its own (no name overlap at all),
  // rather than hunting through every job, list, and archived receipt
  // by hand to find them.
  const findUnlinkedItems = async () => {
    setUnlinkedLoading(true);
    setUnlinkedOpen(true);
    const rows = [];
    try {
      const [jResult, lResult, aResult] = await Promise.all([
        getWithRetry(JOBS_KEY),
        getWithRetry(LOVE_LISTS_KEY),
        getWithRetry(RECEIPT_ARCHIVE_KEY),
      ]);
      if (jResult.ok && jResult.value) {
        JSON.parse(jResult.value).forEach((j) => {
          (j.items || []).forEach((i) => {
            if (!i.catalogId && i.name && i.name.trim()) {
              rows.push({ source: "job", targetId: j.id, targetLabel: j.name, itemId: i.id, itemName: i.name });
            }
          });
        });
      }
      if (lResult.ok && lResult.value) {
        JSON.parse(lResult.value).forEach((l) => {
          (l.items || []).forEach((i) => {
            if (!i.catalogId && i.name && i.name.trim()) {
              rows.push({
                source: "love_list",
                targetId: l.id,
                targetLabel: `${l.jobLabel}${l.subJobLabel ? ` — ${l.subJobLabel}` : ""}`,
                itemId: i.id,
                itemName: i.name,
              });
            }
          });
        });
      }
      if (aResult.ok && aResult.value) {
        JSON.parse(aResult.value).forEach((e) => {
          (e.items || []).forEach((i) => {
            if (!i.catalogId && i.name && i.name.trim()) {
              rows.push({
                source: "archive",
                targetId: e.id,
                targetLabel: `${e.vendor || "Unknown vendor"}${e.receiptDate ? ` · ${e.receiptDate}` : ""}`,
                itemId: i.id,
                itemName: i.name,
              });
            }
          });
        });
      }
    } catch {}
    setUnlinkedItems(rows);
    setUnlinkedLoading(false);
  };

  // Links one row directly from the locator — writes straight to
  // whichever store it actually lives in (job, Love List, or archive),
  // so fixing something found here doesn't require navigating away to
  // wherever it happens to sit.
  const linkUnlinkedItem = async (row, catalogItem) => {
    if (row.source === "job") {
      const result = await getWithRetry(JOBS_KEY);
      if (result.ok && result.value) {
        const jobs = JSON.parse(result.value).map((j) =>
          j.id !== row.targetId
            ? j
            : { ...j, items: j.items.map((i) => (i.id === row.itemId ? { ...i, catalogId: catalogItem.id } : i)) }
        );
        await saveWithRetry(JOBS_KEY, JSON.stringify(jobs));
      }
    } else if (row.source === "love_list") {
      const result = await getWithRetry(LOVE_LISTS_KEY);
      if (result.ok && result.value) {
        const lists = JSON.parse(result.value).map((l) =>
          l.id !== row.targetId
            ? l
            : { ...l, items: l.items.map((i) => (i.id === row.itemId ? { ...i, catalogId: catalogItem.id } : i)) }
        );
        await saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(lists));
      }
    } else {
      const result = await getWithRetry(RECEIPT_ARCHIVE_KEY);
      if (result.ok && result.value) {
        const allEntries = JSON.parse(result.value);
        const targetEntry = allEntries.find((e) => e.id === row.targetId);
        const targetItem = targetEntry && targetEntry.items.find((i) => i.id === row.itemId);
        const entries = allEntries.map((e) =>
          e.id !== row.targetId
            ? e
            : { ...e, items: e.items.map((i) => (i.id === row.itemId ? { ...i, catalogId: catalogItem.id } : i)) }
        );

        // Same vendor-spend logging the Archive's own "Change" button
        // does — a link made from this locator should count exactly the
        // same as one made from inside the receipt itself.
        if (targetItem && targetItem.shippedQty > 0 && targetEntry.vendor) {
          const record = {
            id: uniqueId(),
            vendor: targetEntry.vendor.trim(),
            qty: targetItem.shippedQty,
            amount: Math.round((targetItem.unitPrice || 0) * targetItem.shippedQty * 100) / 100,
            date: targetEntry.receiptDate || new Date().toISOString().slice(0, 10),
          };
          const cResult = await getWithRetry(CATALOG_KEY);
          if (cResult.ok && cResult.value) {
            const nextCatalog = JSON.parse(cResult.value).map((c) => {
              if (c.id !== catalogItem.id) return c;
              const updatedHistory = [...(c.vendorHistory || []), record];
              return { ...c, vendorHistory: updatedHistory, vendor: computeUsualVendor(updatedHistory) || c.vendor };
            });
            await saveWithRetry(CATALOG_KEY, JSON.stringify(nextCatalog));
          }
          const entryIdx = entries.findIndex((e) => e.id === row.targetId);
          if (entryIdx !== -1) {
            entries[entryIdx] = {
              ...entries[entryIdx],
              vendorSummary: [
                ...(entries[entryIdx].vendorSummary || []),
                { catalogName: catalogItem.name, qty: record.qty, amount: record.amount },
              ],
            };
          }
        }

        await saveWithRetry(RECEIPT_ARCHIVE_KEY, JSON.stringify(entries));
      }
    }
    setUnlinkedItems((prev) => prev.filter((r) => !(r.source === row.source && r.itemId === row.itemId)));
    setLinkingUnlinked(null);
    setUnlinkedCatalogSearch("");
  };

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
        catalog={catalog}
        existingCategories={existingCategories}
        existingVendors={existingVendors}
        onSave={(item) => {
          onSave(item);
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />    );
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
                onClick={() => {
                  setSyncResult(null);
                  setSyncConfirmOpen(true);
                }}
                title="Sync catalog links"
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={findUnlinkedItems}
                title="Find unlinked items"
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCostOverviewOpen(true)}
                title="Cost overview — every item's vendor spend at once"
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-800"
              >
                <DollarSign className="w-4 h-4" />
              </button>
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

      {syncConfirmOpen && !syncing && !syncResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">Sync catalog links?</h3>
            <p className="text-slate-400 text-sm mb-5">
              Checks every item across every job, Love List, and archived receipt. Any item whose
              name already matches a catalog entry, but doesn't have a real link saved yet, gets
              linked automatically. Items that already have a link, or don't match anything, are
              left untouched.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSyncConfirmOpen(false)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={syncCatalogLinks}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {syncing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin shrink-0" />
            <p className="text-sm text-slate-300">Checking every item...</p>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">
              {syncResult.error ? "Sync failed" : "Sync complete"}
            </h3>
            <p className="text-slate-400 text-sm mb-5">
              {syncResult.error
                ? syncResult.error
                : `Checked ${syncResult.checked} unlinked item${
                    syncResult.checked === 1 ? "" : "s"
                  } — linked ${syncResult.linked} to a matching catalog entry. Reload the page to
                    see the update reflected wherever you currently have a job, Love List, or the
                    Receipt Archive open.`}
            </p>
            <button
              onClick={() => {
                setSyncResult(null);
                setSyncConfirmOpen(false);
              }}
              className="w-full text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {unlinkedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm">
                Unlinked items {!unlinkedLoading && `(${unlinkedItems.length})`}
              </h3>
              <button onClick={() => setUnlinkedOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {unlinkedLoading ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin shrink-0" />
                  <p className="text-sm text-slate-400">Checking every job, list, and archived receipt...</p>
                </div>
              ) : unlinkedItems.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Nothing unlinked anywhere — everything's connected to something in the catalog.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {unlinkedItems.map((row) => (
                    <div
                      key={`${row.source}:${row.itemId}`}
                      className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60"
                    >
                      <p className="text-sm text-slate-100">{row.itemName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {row.source === "job" ? "Job" : row.source === "love_list" ? "Love List" : "Archived receipt"}{" "}
                        · {row.targetLabel}
                      </p>
                      <button
                        onClick={() => {
                          setLinkingUnlinked(row);
                          setUnlinkedCatalogSearch("");
                        }}
                        className="text-[11px] text-amber-400 hover:underline decoration-dotted mt-1"
                      >
                        🔍 Link to catalog
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {linkingUnlinked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                Link "{linkingUnlinked.itemName}" to...
              </h3>
              <button
                onClick={() => {
                  setLinkingUnlinked(null);
                  setUnlinkedCatalogSearch("");
                }}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <input
                autoFocus
                value={unlinkedCatalogSearch}
                onChange={(e) => setUnlinkedCatalogSearch(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {catalog
                .filter((c) => c.name.toLowerCase().includes(unlinkedCatalogSearch.trim().toLowerCase()))
                .slice(0, 50)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => linkUnlinkedItem(linkingUnlinked, c)}
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

      {costOverviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md max-h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm">Cost overview</h3>
              <button onClick={() => setCostOverviewOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <input
                autoFocus
                value={costOverviewSearch}
                onChange={(e) => setCostOverviewSearch(e.target.value)}
                placeholder="Search by item or vendor..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {(() => {
                const withHistory = catalogWithOverrides
                  .filter((c) => (c.vendorHistory || []).length > 0)
                  .map((c) => ({
                    ...c,
                    totalSpent: c.vendorHistory.reduce((s, r) => s + (r.amount || 0), 0),
                    totalQty: c.vendorHistory.reduce((s, r) => s + (r.qty || 0), 0),
                  }))
                  .filter((c) => {
                    const q = costOverviewSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.name.toLowerCase().includes(q) ||
                      (c.vendor || "").toLowerCase().includes(q) ||
                      (c.vendorHistory || []).some((r) => (r.vendor || "").toLowerCase().includes(q))
                    );
                  })
                  .sort((a, b) => b.totalSpent - a.totalSpent);

                const grandTotal = withHistory.reduce((s, c) => s + c.totalSpent, 0);

                if (withHistory.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 text-center py-6">
                      {catalogWithOverrides.some((c) => (c.vendorHistory || []).length > 0)
                        ? "Nothing matches that search."
                        : "No purchase history logged anywhere yet."}
                    </p>
                  );
                }

                return (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      {withHistory.length} item{withHistory.length === 1 ? "" : "s"} with history ·
                      ${grandTotal.toFixed(2)} total
                    </p>
                    <div className="space-y-1.5">
                      {withHistory.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setViewingVendorForCatalogId(c.id)}
                          className="w-full text-left border border-slate-800 rounded-lg p-2.5 hover:border-slate-700 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-slate-100 truncate">{c.name}</p>
                            <p className="text-xs text-slate-500">
                              {c.vendor || "No usual vendor"} · {c.totalQty} received
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-emerald-400 shrink-0">
                            ${c.totalSpent.toFixed(2)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {viewingVendorForCatalogId &&
        (() => {
          const item = catalogWithOverrides.find((c) => c.id === viewingVendorForCatalogId);
          return item ? (
            <VendorBreakdownModal
              catalogItem={item}
              onClose={() => setViewingVendorForCatalogId(null)}
              onChange={applyVendorOverride}
            />
          ) : null;
        })()}
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
  const transferred = isContainerTransferred(containerName, items);
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
                        onClick={selectOnFocus}
                        min="0"
                        value={qtyOverrides[item.id] ?? remaining}
                        onChange={(e) => setQty(item.id, e.target.value)}
                        onFocus={(e) => {
                          selectOnFocus(e);
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
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-slate-100 font-semibold text-base truncate">{containerName}</h2>
                {transferred && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/40 rounded-full px-2 py-0.5">
                    Transferred
                  </span>
                )}
              </div>
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
            {transferred ? (
              <p className="text-xs text-slate-500 text-center">
                This container is marked transferred — it's no longer here, so new items can't
                be pulled into it.
              </p>
            ) : (
              <button
                onClick={() => setPicking(true)}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                Pull items into this container
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GeneralTodoModal({ todos, onAdd, onToggle, onDelete, onClearFinished, onClose }) {
  const [newText, setNewText] = useState("");

  const pending = [...todos]
    .filter((t) => !t.done)
    .sort((a, b) => a.text.localeCompare(b.text));
  const done = [...todos]
    .filter((t) => t.done)
    .sort((a, b) => a.text.localeCompare(b.text));

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText);
    setNewText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40">
      <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-slate-100 font-semibold text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              Shop To Do
            </h2>
            <p className="text-xs text-slate-500">General stuff, not tied to any one job</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="What needs to get done?"
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="text-sm bg-amber-500 text-slate-950 font-semibold rounded-md px-4 py-2 hover:bg-amber-400 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {pending.length === 0 && done.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing on the list yet.
            </p>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="space-y-2 mb-4">
                  {pending.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-start gap-2.5 border border-slate-800 rounded-md p-3 cursor-pointer hover:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onToggle(t.id)}
                        className="w-4 h-4 rounded accent-emerald-500 mt-0.5 shrink-0 cursor-pointer"
                      />
                      <p className="text-sm text-slate-100 flex-1 min-w-0">{t.text}</p>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          onDelete(t.id);
                        }}
                        className="text-slate-600 hover:text-red-400 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </label>
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600">Done</p>
                    <button
                      onClick={() => onClearFinished(done.map((t) => t.id))}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      Clear all finished tasks
                    </button>
                  </div>
                  <div className="space-y-2">
                    {done.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-start gap-2.5 border border-slate-800 rounded-md p-3 cursor-pointer hover:border-slate-700 opacity-60"
                      >
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => onToggle(t.id)}
                          className="w-4 h-4 rounded accent-emerald-500 mt-0.5 shrink-0 cursor-pointer"
                        />
                        <p className="text-sm text-slate-400 line-through flex-1 min-w-0">
                          {t.text}
                        </p>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            onDelete(t.id);
                          }}
                          className="text-slate-600 hover:text-red-400 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
          {s.payload.proposedItem ? (
            <p className="text-xs text-slate-500">
              Qty: {s.payload.proposedItem.qtyHave}/{s.payload.proposedItem.qtyNeeded}
              {s.payload.proposedItem.qtyUnit ? ` ${s.payload.proposedItem.qtyUnit}` : ""}
              {" · "}
              {(s.payload.proposedItem.containers || []).length > 0
                ? s.payload.proposedItem.containers.map((c) => `${c.name}: ${c.qty}`).join(", ")
                : "No containers"}
              {" · "}
              {s.payload.proposedItem.ordered ? "Ordered" : "Not ordered"} ·{" "}
              {normalizeReceived(s.payload.proposedItem.received) === "yes"
                ? "Received"
                : normalizeReceived(s.payload.proposedItem.received) === "partial"
                ? "Partially received"
                : "Not received"}
            </p>
          ) : (
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
          )}
        </>
      )}
      {s.note && <p className="text-xs text-slate-400 italic mt-1.5">"{s.note}"</p>}
      {s.submitted_by && (
        <p className="text-xs text-sky-400 mt-1.5">👤 Suggested by {s.submitted_by}</p>
      )}
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

// Pinch-to-zoom / double-tap / scroll-wheel zoomable image, used anywhere
// a photo opens inline in a fullscreen overlay (Reference Documents, Love
// List photos) rather than in the browser's own PDF viewer — those get
// native pinch-zoom for free, this is what gives inline photos the same
// ability. Pass a fresh `key` (usually the photo's URL) from the caller
// so zoom/pan resets whenever a different photo is shown.
function ZoomableImage({ src, alt = "" }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef({ startDist: 0, startScale: 1, startTranslate: { x: 0, y: 0 }, panStart: null });
  const lastTap = useRef(0);

  const clampScale = (s) => Math.min(4, Math.max(1, s));
  const reset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };
  const dist = (a, b) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

  const handleTouchStart = (e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      gesture.current.startDist = dist(e.touches[0], e.touches[1]);
      gesture.current.startScale = scale;
      gesture.current.startTranslate = translate;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        scale > 1 ? reset() : setScale(2);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      if (scale > 1) {
        gesture.current.panStart = {
          x: e.touches[0].clientX - translate.x,
          y: e.touches[0].clientY - translate.y,
        };
      }
    }
  };

  const handleTouchMove = (e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / (gesture.current.startDist || 1);
      setScale(clampScale(gesture.current.startScale * ratio));
    } else if (e.touches.length === 1 && scale > 1 && gesture.current.panStart) {
      e.preventDefault();
      setTranslate({
        x: e.touches[0].clientX - gesture.current.panStart.x,
        y: e.touches[0].clientY - gesture.current.panStart.y,
      });
    }
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    gesture.current.panStart = null;
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const next = clampScale(scale + (e.deltaY < 0 ? 0.2 : -0.2));
    setScale(next);
    if (next === 1) setTranslate({ x: 0, y: 0 });
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    scale > 1 ? reset() : setScale(2);
  };

  // Mouse click-and-drag panning (desktop) — mirrors the single-finger
  // touch pan above, but tracked on window rather than the image itself,
  // so dragging still works smoothly even if the cursor slides off the
  // shrunk-down image edge mid-drag.
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.stopPropagation();
    e.preventDefault();
    gesture.current.panStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!gesture.current.panStart) return;
      setTranslate({
        x: e.clientX - gesture.current.panStart.x,
        y: e.clientY - gesture.current.panStart.y,
      });
    };
    const onUp = () => {
      gesture.current.panStart = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
        transition: scale === 1 ? "transform 0.15s ease" : "none",
        touchAction: "none",
        cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        WebkitUserDrag: "none",
        userSelect: "none",
      }}
      className="max-w-full max-h-full rounded-lg select-none"
    />
  );
}

function ReferenceDocsModal({ job, isEditor, onUpdateJob, onClose }) {
  const docs = job.referenceDocuments || [];
  const photoDocs = docs.filter((d) => (d.type || "").startsWith("image/"));
  const fileDocs = docs.filter((d) => !(d.type || "").startsWith("image/"));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewingUrl, setViewingUrl] = useState(null);
  const [pdfQueue, setPdfQueue] = useState([]); // PDFs still waiting on a convert-vs-keep decision
  const pdfPrompt = pdfQueue[0] || null;
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const addDoc = (result) => {
    const isPhoto = (result.type || "").startsWith("image/");
    onUpdateJob((prevJob) => ({
      ...prevJob,
      referenceDocuments: [
        ...(prevJob.referenceDocuments || []),
        {
          id: uniqueId(),
          name: result.name,
          url: result.url,
          path: result.path,
          type: result.type || "",
          uploadedAt: timeStamp(),
        },
      ],
      activityLog: [
        {
          id: uniqueId(),
          time: timeStamp(),
          message: isPhoto ? "Added a photo" : `Uploaded reference document "${result.name}"`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const doUpload = async (file) => {
    const result = await uploadReferenceDocument(job.id, file);
    if (!result.ok) {
      setUploadError((prev) => (prev ? `${prev} · ${result.error}` : result.error || "Upload failed"));
      return;
    }
    addDoc(result);
  };

  // Handles any number of selected files at once — images upload straight
  // away in sequence, and any PDFs get queued up for their own
  // convert-vs-keep decision, one at a time, since that choice genuinely
  // depends on what each specific PDF actually is.
  const handleFilesChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow choosing the same files again later
    if (files.length === 0) return;

    const pdfs = files.filter((f) => f.type === "application/pdf");
    const others = files.filter((f) => f.type !== "application/pdf");

    if (others.length > 0) {
      setUploadError(null);
      setUploading(true);
      for (const file of others) {
        await doUpload(file);
      }
      setUploading(false);
    }
    if (pdfs.length > 0) setPdfQueue((prev) => [...prev, ...pdfs]);
  };

  const keepPdfAsIs = async () => {
    if (!pdfPrompt) return;
    setPdfQueue((prev) => prev.slice(1));
    setUploadError(null);
    setUploading(true);
    await doUpload(pdfPrompt);
    setUploading(false);
  };

  const convertPdfToPhotos = async () => {
    if (!pdfPrompt) return;
    const file = pdfPrompt;
    setPdfQueue((prev) => prev.slice(1));
    setUploadError(null);
    setUploading(true);
    try {
      const imageFiles = await pdfToImageFiles(file);
      for (const imgFile of imageFiles) {
        const result = await uploadReferenceDocument(job.id, imgFile);
        if (result.ok) addDoc(result);
      }
    } catch (err) {
      setUploadError(
        "Couldn't convert that PDF — " + (err && err.message ? err.message : String(err))
      );
    }
    setUploading(false);
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

  if (viewingUrl) {
    return (
      <div
        className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
        onClick={() => setViewingUrl(null)}
      >
        <button
          onClick={() => setViewingUrl(null)}
          className="absolute top-4 right-4 text-slate-300 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <ZoomableImage key={viewingUrl} src={viewingUrl} alt="Reference photo" />
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 pt-8 pb-40" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md rounded-lg max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 className="text-slate-100 font-semibold text-base">Reference documents</h2>
              <p className="text-xs text-slate-500">
                Original sheets, orders, drawings, or receipts for this job
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {docs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">
                Nothing here yet — attach the original PDF this job's items came from, or snap
                a photo of a receipt, so it's easy to reference later.
              </p>
            ) : (
              <>
                {fileDocs.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {fileDocs.map((doc) => (
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
                {photoDocs.length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    {photoDocs.map((doc) => (
                      <div key={doc.id} className="relative group">
                        <button
                          onClick={() => setViewingUrl(doc.url)}
                          className="block w-full aspect-square rounded-lg overflow-hidden border border-slate-800"
                        >
                          <img src={doc.url} alt="" className="w-full h-full object-cover" />
                        </button>
                        {isEditor && (
                          <button
                            onClick={() => setDeleteTarget(doc)}
                            className="absolute top-1.5 right-1.5 bg-slate-950/80 text-slate-300 hover:text-red-400 rounded-full p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {uploadError && (
              <p className="text-xs text-red-400 mt-3">Couldn't upload: {uploadError}</p>
            )}
          </div>

          {isEditor && (
            <div className="px-5 py-4 border-t border-slate-800 shrink-0 space-y-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => photoInputRef.current && photoInputRef.current.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {uploading ? "Uploading..." : "Take a photo"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                multiple
                onChange={handleFilesChosen}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-1.5 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading ? "Uploading..." : "Upload a file"}
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
                onClick={convertPdfToPhotos}
                className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Convert to photo(s)
              </button>
              <button
                onClick={keepPdfAsIs}
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
      id: uniqueId(),
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
              onFocus={selectOnFocus}
              onClick={selectOnFocus}
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
      ? template.map((spec, idx) => ({ id: uniqueId() + idx, category: trimmed, spec, qty: 0 }))
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
        { id: uniqueId(), category, spec, qty },
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
                              onFocus={selectOnFocus}
                              onClick={selectOnFocus}
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
                              onClick={selectOnFocus}
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
                            onFocus={selectOnFocus}
                            onClick={selectOnFocus}
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
  managerName,
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
      submittedBy: managerName,
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
      submittedBy: managerName,
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
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm text-slate-100 truncate">{name}</p>
                          {isContainerTransferred(name, items) && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/40 rounded-full px-2 py-0.5">
                              Transferred
                            </span>
                          )}
                        </div>
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
    const serials = parseSerials(value);
    setPreview((prev) =>
      prev.map((p) => {
        if (p.lineId !== lineId) return p;
        // Same convention as every other SME#-linked quantity field in the
        // app — typing in more SME#s than the current quantity bumps it up
        // to match, but it's never lowered automatically (some items
        // genuinely don't have an SME# for every unit).
        const currentQty = Number(p.qtyNeeded) || 0;
        const needsBump = serials.length > currentQty;
        return {
          ...p,
          serials,
          qtyNeeded: needsBump ? serials.length : p.qtyNeeded,
          qtyDefaulted: needsBump ? false : p.qtyDefaulted,
        };
      })
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
          matchedCatalogName: match ? match.name : null,
          gang: match ? match.gang : "Unassigned",
          storage: match ? match.storage : "Unassigned",
          storageDetail: match && match.storage === "Other" ? match.storageDetail || "" : "",
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
                        onFocus={selectOnFocus}
                        onClick={selectOnFocus}
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
                        ? `→ ${p.matchedCatalogName} · ${p.gang} · ${p.storage}${p.needsTransfer ? " · 🚚 transfer" : ""}`
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

function SuggestEditModal({ job, item, managerName, onSubmit, onClose }) {
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
      submittedBy: managerName,
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
                onFocus={selectOnFocus}
                onClick={selectOnFocus}
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
                onFocus={selectOnFocus}
                onClick={selectOnFocus}
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

function SuggestNewItemModal({ job, managerName, onClose }) {
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
      submittedBy: managerName,
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
                onFocus={selectOnFocus}
                onClick={selectOnFocus}
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

function ItemCard({ item, catalog = [], selectMode, selected, isEditor, workerTasks = [], onToggleSelect, onEdit, onDelete, onViewSerials, onSuggestEdit, onOpenContainer, onAssignItem, onMergeItem, onViewVendor, onViewReceipt, combinedInfo, substituteTargetName, onLinkSubstitute }) {
  const handleCardClick = () => {
    if (selectMode) {
      onToggleSelect(item.id);
    } else if (!isEditor) {
      onSuggestEdit(item);
    }
  };

  // Display-only — the underlying item.qtyHave and item.status are never
  // touched by this, so containers, serials, and transfer tracking all
  // stay exactly as accurate as they always were. This only changes what
  // the card shows when another item has been linked as counting toward
  // this one's requirement (a substitute tool model, say).
  const displayHave = combinedInfo ? combinedInfo.qtyHave : item.qtyHave;
  const displayStatus =
    displayHave >= item.qtyNeeded ? "green" : displayHave > 0 ? "yellow" : "red";

  return (
    <div
      onClick={handleCardClick}
      className={`bg-slate-900 rounded-lg p-4 transition-colors border ${
        selectMode || !isEditor ? "cursor-pointer" : ""
      } ${
        selected
          ? "border-amber-500/70 bg-amber-500/5"
          : item.importedViaReceiving
          ? "border-sky-500/50 bg-sky-500/5"
          : (item.transferredContainers || []).length > 0
          ? "border-purple-500/40 bg-purple-500/5"
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
            <StatusDot status={displayStatus} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 truncate">{item.name}</p>
            <p className="text-sm text-slate-500">
              Have {displayHave} of {item.qtyNeeded}
              {item.qtyUnit ? ` ${item.qtyUnit}` : ""} needed
            </p>
            {combinedInfo && (
              <p className="text-xs text-sky-400 mt-0.5">
                🔀 Combined with {combinedInfo.contributors.map((c) => `${c.name} (${c.qtyHave})`).join(", ")}
              </p>
            )}
            {substituteTargetName && (
              <p className="text-xs text-sky-400 mt-0.5">↳ Counts toward "{substituteTargetName}"</p>
            )}
            <p className="text-xs text-slate-600 mt-0.5">
              {item.catalogId
                ? `🔗 ${catalog.find((c) => c.id === item.catalogId)?.name || "Linked catalog item"}`
                : "Not linked to catalog"}
            </p>
            <div className="mt-1.5 h-1.5 w-full max-w-[160px] rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  displayHave >= item.qtyNeeded
                    ? "bg-emerald-500"
                    : displayHave > 0
                    ? "bg-amber-400"
                    : "bg-red-500"
                }`}
                style={{
                  width: `${
                    item.qtyNeeded > 0
                      ? Math.min(100, (displayHave / item.qtyNeeded) * 100)
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
        {item.importedViaReceiving && isEditor && (
          <span className="text-xs rounded-full pl-2.5 pr-1.5 py-1 border border-sky-500/40 bg-sky-500/10 text-sky-300 flex items-center gap-1.5">
            <Inbox className="w-3 h-3" />
            Imported
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMergeItem(item);
              }}
              className="text-sky-200 hover:text-white underline decoration-dotted"
            >
              Merge
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMergeItem(item, { dismiss: true });
              }}
              className="text-sky-500 hover:text-sky-300"
              title="This is genuinely a new item — stop highlighting it"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        {(item.transferredContainers || []).length > 0 && (
          <span className="text-xs rounded-full px-2.5 py-1 border border-purple-500/40 bg-purple-500/10 text-purple-300 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Transferred
          </span>
        )}
        {item.backorderQty > 0 && (
          <span className="text-xs rounded-full px-2.5 py-1 border border-red-500/40 bg-red-500/10 text-red-300">
            {item.backorderQty} on backorder
          </span>
        )}
        {item.catalogId && onViewVendor && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewVendor(item);
            }}
            className="text-xs rounded-full px-2.5 py-1 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 flex items-center gap-1"
          >
            🏷️ Vendor
          </button>
        )}
        {item.sourceReceipt && onViewReceipt && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewReceipt(item);
            }}
            className="text-xs rounded-full px-2.5 py-1 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 flex items-center gap-1"
          >
            🧾 Receipt
          </button>
        )}
        {(() => {
          const assignedTaskIds = item.assignedTaskIds || [];
          const assignedTasks = assignedTaskIds
            .map((tid) => workerTasks.find((t) => t.id === tid))
            .filter(Boolean);
          // The "+ Assign" / "+ Add worker" action itself moved into the
          // edit form to keep the card less cluttered — already-assigned
          // workers still show here since that's status worth seeing at
          // a glance, not an action.
          return (
            <>
              {assignedTasks.map((task) => {
                const taskMeta = workerTaskStatusMeta(task.status);
                return (
                  <button
                    key={task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignItem(item);
                    }}
                    disabled={!isEditor}
                    className={`text-xs rounded-full px-2.5 py-1 border ${taskMeta.color}`}
                  >
                    👤 {task.workerName} · {taskMeta.label}
                  </button>
                );
              })}
            </>
          );
        })()}
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
  onToggleSeal,
  onToggleArchive,
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
            {job.sealed && (
              <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-700 border border-slate-600 text-slate-300 rounded-full px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Sealed
              </span>
            )}
            {job.archived && (
              <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-500 rounded-full px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                <Archive className="w-2.5 h-2.5" />
                Archived
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
              onToggleSeal(job);
            }}
            title={job.sealed ? "Unseal (allow editing again)" : "Seal (make read-only)"}
            className="text-slate-600 hover:text-slate-300 p-1.5 rounded-md hover:bg-slate-800"
          >
            {job.sealed ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggleArchive(job);
            }}
            title={job.archived ? "Unarchive (show in main list)" : "Archive (hide from main list)"}
            className="text-slate-600 hover:text-slate-300 p-1.5 rounded-md hover:bg-slate-800"
          >
            <Archive className="w-3.5 h-3.5" />
          </span>
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
  isManager,
  onRequestLogin,
  onSelect,
  onCreateClick,
  onCreateQuickTransferClick,
  onCreateSubJobClick,
  onDeleteRequest,
  onToggleJobSeal,
  onToggleJobArchive,
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
  onOpenGeneralTodo,
  onOpenWorkerTasks,
  onCheckForUpdate,
  onGoToLanding,
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

  const [showArchived, setShowArchived] = useState(false);

  const topLevel = jobs
    .filter((j) => !j.parentId && !j.isQuickTransfer)
    .filter((j) => showArchived || !j.archived);
  const archivedCount = jobs.filter((j) => !j.parentId && !j.isQuickTransfer && j.archived).length;
  const quickTransferJobs = jobs
    .filter((j) => j.isQuickTransfer && !j.parentId)
    .filter((j) => showArchived || !j.archived);
  const archivedQuickTransferCount = jobs.filter(
    (j) => j.isQuickTransfer && !j.parentId && j.archived
  ).length;
  const childrenOf = (parentId) =>
    jobs.filter((j) => j.parentId === parentId).filter((j) => showArchived || !j.archived);

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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-y-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onGoToLanding}
              title="Back to app home"
              className="w-8 h-8 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:bg-slate-700 active:scale-90 transition-transform"
            >
              <Home className="w-4 h-4" />
            </button>
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
                    {isManager ? "Manager" : "View only"}
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 leading-tight">Select a job 🌐</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
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
            {isEditor && (
              <button
                onClick={onOpenGeneralTodo}
                title="Shop To Do"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <ClipboardList className="w-4 h-4" />
              </button>
            )}
            {isEditor && (
              <button
                onClick={onOpenWorkerTasks}
                title="Worker Tasks"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenCatalog}
              title="Item catalog"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            {isEditor || isManager ? (
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
                            onToggleSeal={onToggleJobSeal}
                            onToggleArchive={onToggleJobArchive}
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
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-1"
              >
                <Archive className="w-3.5 h-3.5" />
                {showArchived ? "Hide" : "Show"} {archivedCount} archived job{archivedCount === 1 ? "" : "s"}
              </button>
            )}
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
                        onToggleSeal={onToggleJobSeal}
                        onToggleArchive={onToggleJobArchive}
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
                            onToggleSeal={onToggleJobSeal}
                            onToggleArchive={onToggleJobArchive}
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

        {!searching && (quickTransferJobs.length > 0 || archivedQuickTransferCount > 0) && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                Quick Transfers
              </p>
              {archivedQuickTransferCount > 0 && (
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {showArchived ? "Hide" : "Show"} {archivedQuickTransferCount} archived
                </button>
              )}
            </div>
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
                          {job.archived && (
                            <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-500 rounded-full px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                              <Archive className="w-2.5 h-2.5" />
                              Archived
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {children.length} entr{children.length === 1 ? "y" : "ies"}
                        </p>
                      </div>
                      {isEditor && (
                        <button
                          onClick={() => onToggleJobArchive(job)}
                          title={job.archived ? "Unarchive (show in main list)" : "Archive (hide from main list)"}
                          className="text-slate-600 hover:text-slate-300 p-1.5 shrink-0"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {isEditor && (
                        <button
                          onClick={() => onDeleteRequest(job)}
                          className="text-slate-600 hover:text-red-400 p-1.5 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
                              onToggleSeal={onToggleJobSeal}
                              onToggleArchive={onToggleJobArchive}
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

// Lets you fix an over-eager import — pick another item in the same job
// to fold this one into, filling whatever it's short and leaving any
// leftover here. Commits on tap since the preview already shows exactly
// what will happen, same as the catalog-link pickers elsewhere.
function MergeItemModal({ item, items, onConfirm, onClose }) {
  const [search, setSearch] = useState("");
  if (!item) return null;
  const sourceHave = totalHave(item.containers);
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
            Has {sourceHave} on hand. Whatever's needed to fill the target moves over — anything
            left stays here.
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
              const cHave = totalHave(c.containers);
              const cNeeded = Number(c.qtyNeeded) || 0;
              const remaining = Math.max(0, cNeeded - cHave);
              // Same conversion the actual merge uses — compare in the
              // target's unit, not raw numbers, so "12 each" correctly
              // reads as enough to fill a "1 doz" need.
              const sourceHaveInTargetUnits = convertQtyForUnit(sourceHave, item.qtyUnit, c.qtyUnit);
              const willMoveInTargetUnits = Math.min(sourceHaveInTargetUnits, remaining);
              const willMoveInSourceUnits = convertQtyForUnit(willMoveInTargetUnits, c.qtyUnit, item.qtyUnit);
              const unitsDiffer = (item.qtyUnit || "each") !== (c.qtyUnit || "each");
              return (
                <button
                  key={c.id}
                  onClick={() => onConfirm(c.id)}
                  disabled={willMoveInTargetUnits <= 0}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-800 hover:border-slate-700 mb-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <p className="text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    Have {cHave} of {cNeeded}
                    {willMoveInTargetUnits > 0
                      ? ` — will take ${willMoveInTargetUnits}${unitsDiffer ? ` ${c.qtyUnit || "each"}` : ""}, leaving ${
                          sourceHave - willMoveInSourceUnits
                        } here`
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

// Shown from either a Job or Love List item card — the purchase history
// lives on the catalog entry, so this reads straight off that rather
// than anything specific to the job/list you happened to open it from.
// Read-only look at whichever receipt most recently touched this
// specific item — a self-contained snapshot rather than a live lookup,
// so it still works even if the original Receiving history entry (or
// archived receipt) it came from was since deleted or cleared.
function SourceReceiptModal({ sourceReceipt, onClose }) {
  const [viewingPhoto, setViewingPhoto] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-100 font-semibold text-base">
            {sourceReceipt.label || sourceReceipt.vendor || "Receipt"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {[
            sourceReceipt.vendor && sourceReceipt.label && `Vendor: ${sourceReceipt.vendor}`,
            sourceReceipt.receiptDate && `Date: ${sourceReceipt.receiptDate}`,
            sourceReceipt.poNumber && `PO: ${sourceReceipt.poNumber}`,
          ]
            .filter(Boolean)
            .join(" · ") || "No further details recorded"}
        </p>
        {sourceReceipt.photoUrl ? (
          <>
            <button
              onClick={() => setViewingPhoto(true)}
              className="w-full rounded-lg overflow-hidden border border-slate-800"
            >
              <img src={sourceReceipt.photoUrl} alt="Receipt" className="w-full max-h-64 object-cover" />
            </button>
            {(sourceReceipt.extraPhotoUrls || []).length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {sourceReceipt.extraPhotoUrls.map((url, i) => (
                  <button key={i} className="rounded-md overflow-hidden border border-slate-800">
                    <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center py-6">No photo saved with this receipt.</p>
        )}
      </div>
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
          onClick={() => setViewingPhoto(false)}
        >
          <button
            onClick={() => setViewingPhoto(false)}
            className="absolute top-4 right-4 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <ZoomableImage key={sourceReceipt.photoUrl} src={sourceReceipt.photoUrl} alt="Receipt" />
        </div>
      )}
    </div>
  );
}

function VendorBreakdownModal({ catalogItem, onClose, onChange }) {
  const [history, setHistory] = useState(catalogItem.vendorHistory || []);
  const [showIndividual, setShowIndividual] = useState(false);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  const persist = async (nextHistory) => {
    const nextVendor = computeUsualVendor(nextHistory) || "";
    // Tells whichever screen opened this modal right away — without
    // this, closing and reopening (a fresh instance, since this modal
    // fully unmounts rather than just hiding) would read the parent's
    // still-stale catalog data and show the old entries again, even
    // though storage was already correctly updated.
    if (onChange) onChange(catalogItem.id, { vendorHistory: nextHistory, vendor: nextVendor });
    const result = await getWithRetry(CATALOG_KEY);
    if (result.ok && result.value) {
      const next = JSON.parse(result.value).map((c) =>
        c.id === catalogItem.id ? { ...c, vendorHistory: nextHistory, vendor: nextVendor } : c
      );
      await saveWithRetry(CATALOG_KEY, JSON.stringify(next));
    }
  };

  const deleteRecord = (recordId) => {
    const next = history.filter((r) => r.id !== recordId);
    setHistory(next);
    persist(next);
  };

  const clearAll = () => {
    setHistory([]);
    persist([]);
  };

  const grouped = {};
  history.forEach((r) => {
    if (!r.vendor) return;
    if (!grouped[r.vendor]) grouped[r.vendor] = { qty: 0, amount: 0 };
    grouped[r.vendor].qty += r.qty || 0;
    grouped[r.vendor].amount += r.amount || 0;
  });
  const rows = Object.entries(grouped)
    .map(([vendor, data]) => ({ vendor, ...data }))
    .sort((a, b) => b.amount - a.amount);
  const totalSpent = rows.reduce((sum, r) => sum + r.amount, 0);
  const individualSorted = [...history].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-slate-100 font-semibold text-base truncate">{catalogItem.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Purchase history by vendor{totalSpent > 0 ? ` · $${totalSpent.toFixed(2)} total` : ""}
        </p>
        <div className="flex-1 overflow-y-auto space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No purchase history recorded yet — this fills in automatically as receipts linked
              to this item get approved with a vendor and price on them.
            </p>
          ) : (
            <>
              {rows.map((r) => (
                <div
                  key={r.vendor}
                  className="border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100 truncate">
                      {r.vendor}
                      {catalogItem.vendor === r.vendor && (
                        <span className="ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 border bg-amber-500/15 text-amber-300 border-amber-500/40">
                          Usual
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{r.qty} received</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-400 shrink-0">
                    {r.amount > 0 ? `$${r.amount.toFixed(2)}` : "—"}
                  </p>
                </div>
              ))}

              <button
                onClick={() => setShowIndividual((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300 pt-1"
              >
                {showIndividual ? "▲ Hide" : "▼ Show"} individual purchases ({history.length}) — for
                removing duplicates or bad entries
              </button>

              {showIndividual && (
                <div className="space-y-1.5 pt-1">
                  {individualSorted.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-xs border border-slate-800 rounded-md px-2.5 py-2 bg-slate-900/60"
                    >
                      <span className="text-slate-300 truncate">
                        {r.vendor} · {r.qty} · {r.date || "no date"}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-400 font-medium">
                          {r.amount > 0 ? `$${r.amount.toFixed(2)}` : "—"}
                        </span>
                        <button
                          onClick={() => setDeleteRecordTarget(r)}
                          className="text-slate-600 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setConfirmingClearAll(true)}
                className="text-xs text-slate-600 hover:text-red-400 pt-2 block"
              >
                Clear all history for this item
              </button>
            </>
          )}
        </div>
      </div>

      {deleteRecordTarget && (
        <ConfirmDelete
          title="Remove this purchase record?"
          message={`${deleteRecordTarget.vendor} · ${deleteRecordTarget.qty} · ${
            deleteRecordTarget.date || "no date"
          } will be permanently removed from this item's history. This can't be undone.`}
          onConfirm={() => {
            deleteRecord(deleteRecordTarget.id);
            setDeleteRecordTarget(null);
          }}
          onCancel={() => setDeleteRecordTarget(null)}
        />
      )}

      {confirmingClearAll && (
        <ConfirmDelete
          title="Clear all history for this item?"
          message="Every vendor purchase record for this catalog item is permanently removed, and its Usual Vendor resets until new receipts come in. This can't be undone."
          onConfirm={() => {
            clearAll();
            setConfirmingClearAll(false);
          }}
          onCancel={() => setConfirmingClearAll(false)}
        />
      )}
    </div>
  );
}

function JobInventory({
  job,
  isEditor: rawIsEditor,
  managerName,
  workers = [],
  workerTasks = [],
  onAssignToWorker,
  onUnassignWorkerTask,
  onRequestLogin,
  onUpdateJob,
  onBackToJobs,
  catalog,
  onSaveCatalogItem,
  onOpenCatalog,
  onRenameJob,
}) {
  // A sealed job behaves exactly like browse-only mode, regardless of
  // being actually logged in — reuses every existing disabled-editing
  // check throughout this screen instead of needing a second, separate
  // "can I edit this" system.
  const isEditor = rawIsEditor && !job.sealed;
  const items = job.items || [];
  const containerOptions = job.containerOptions || [];
  // Transferred containers are physically gone — excluded anywhere items
  // get newly assigned to a container, but kept in filters/lists so past
  // records stay visible.
  const assignableContainerOptions = containerOptions.filter(
    (name) => !isContainerTransferred(name, items)
  );
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
  const [importedOnlyFilter, setImportedOnlyFilter] = useState(false);
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
  const [bulkAssignPicker, setBulkAssignPicker] = useState(false);
  const [assigningItem, setAssigningItem] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [referenceDocsOpen, setReferenceDocsOpen] = useState(false);
  const [pullFromReceivingOpen, setPullFromReceivingOpen] = useState(false);
  const [mergingItem, setMergingItem] = useState(null);
  const [viewingVendorFor, setViewingVendorFor] = useState(null); // the catalog item, while its vendor breakdown is open
  // Layered on top of catalog for vendor-history changes made from
  // inside this modal — the catalog prop itself only refreshes on
  // reload, so without this, closing and reopening the same item's
  // Vendor breakdown would show the pre-clear entries again.
  const [vendorHistoryOverrides, setVendorHistoryOverrides] = useState({});
  const applyVendorOverride = (catalogId, changes) =>
    setVendorHistoryOverrides((prev) => ({ ...prev, [catalogId]: changes }));
  const [viewingReceiptFor, setViewingReceiptFor] = useState(null);
  const [linkingSubstituteItem, setLinkingSubstituteItem] = useState(null);
  const [substituteSearch, setSubstituteSearch] = useState("");
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
  const [suggestionSentConfirm, setSuggestionSentConfirm] = useState(false);
  const [suggestNewItemOpen, setSuggestNewItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [requisitionsOpen, setRequisitionsOpen] = useState(false);

  const logActivity = (message, extra = {}) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      ...extra,
      activityLog: [{ id: uniqueId(), time: timeStamp(), message }, ...prevJob.activityLog].slice(
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
        { id: uniqueId(), time: timeStamp(), message: `Added container "${name}"` },
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
      if (match.storage && match.storage !== i.storage) {
        fieldChanges.storage = match.storage;
        // "Other" is meaningless without the actual detail text — carry
        // that over too whenever the storage itself is changing, not just
        // the "Other" label on its own.
        if (match.storage === "Other") {
          fieldChanges.storageDetail = match.storageDetail || "";
        }
      } else if (
        match.storage === "Other" &&
        (match.storageDetail || "") !== (i.storageDetail || "")
      ) {
        // Storage is already "Other" on both sides, but the actual detail
        // text differs (or was never carried over in the first place) —
        // sync it on its own even though the top-level storage value
        // itself isn't changing.
        fieldChanges.storageDetail = match.storageDetail || "";
      }
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
          id: uniqueId(),
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
          id: uniqueId(),
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
          id: uniqueId(),
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
          id: uniqueId(),
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
    if (procFilter === "transferred") return (item.transferredContainers || []).length > 0;
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
        (!importedOnlyFilter || i.importedViaReceiving) &&
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
            id: uniqueId(),
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
      const newItem = { ...item, id: uniqueId() };
      onUpdateJob((prevJob) => ({
        ...prevJob,
        items: [...prevJob.items, newItem],
        activityLog: [
          {
            id: uniqueId(),
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
        { id: uniqueId(), time: timeStamp(), message: `Deleted "${item.name}"` },
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
          id: uniqueId(),
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

  // Not routed through bulkUpdate — creating a worker task per item is a
  // real side effect (writing to Worker Tasks storage), not a pure data
  // transform, so it needs its own path.
  const bulkAssignToWorker = (workerIds) => {
    if (!workerIds || workerIds.length === 0 || !onAssignToWorker) return;
    playSaveChime();
    const targetItems = (job.items || []).filter((i) => selectedItemIds.includes(i.id));
    const newTaskIdsByItemId = {};
    targetItems.forEach((item) => {
      const existingWorkerIds = (item.assignedTaskIds || [])
        .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
        .filter(Boolean);
      const taskIds = [];
      workerIds.forEach((wid) => {
        if (existingWorkerIds.includes(wid)) return; // already assigned — don't duplicate
        const worker = workers.find((w) => w.id === wid);
        if (!worker) return;
        const taskId = onAssignToWorker(
          worker,
          `${item.name} ${item.qtyHave}/${item.qtyNeeded}`,
          job.name,
          { type: "job_item", itemId: item.id, jobId: job.id }
        );
        if (taskId) taskIds.push(taskId);
      });
      newTaskIdsByItemId[item.id] = taskIds;
    });
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.map((i) =>
        newTaskIdsByItemId[i.id]
          ? { ...i, assignedTaskIds: [...(i.assignedTaskIds || []), ...newTaskIdsByItemId[i.id]] }
          : i
      ),
      activityLog: [
        {
          id: uniqueId(),
          time: timeStamp(),
          message: `Assigned ${targetItems.length} item${targetItems.length === 1 ? "" : "s"} to ${workerIds.length} worker${workerIds.length === 1 ? "" : "s"}`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
    setBulkAssignPicker(false);
    clearSelection();
  };

  const confirmAssignSingle = (workerIds) => {
    if (!assigningItem || !onAssignToWorker) return;
    playSaveChime();
    const currentTaskIds = assigningItem.assignedTaskIds || [];
    const currentWorkerIds = currentTaskIds
      .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
      .filter(Boolean);

    const addedWorkerIds = workerIds.filter((wid) => !currentWorkerIds.includes(wid));
    const removedTaskIds = currentTaskIds.filter((tid) => {
      const t = workerTasks.find((task) => task.id === tid);
      return t && !workerIds.includes(t.workerId);
    });

    const newTaskIds = addedWorkerIds
      .map((wid) => {
        const worker = workers.find((w) => w.id === wid);
        if (!worker) return null;
        return onAssignToWorker(
          worker,
          `${assigningItem.name} ${assigningItem.qtyHave}/${assigningItem.qtyNeeded}`,
          job.name,
          { type: "job_item", itemId: assigningItem.id, jobId: job.id }
        );
      })
      .filter(Boolean);

    if (onUnassignWorkerTask) removedTaskIds.forEach((tid) => onUnassignWorkerTask(tid));

    const finalTaskIds = [
      ...currentTaskIds.filter((tid) => !removedTaskIds.includes(tid)),
      ...newTaskIds,
    ];

    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: prevJob.items.map((i) =>
        i.id === assigningItem.id ? { ...i, assignedTaskIds: finalTaskIds } : i
      ),
    }));
    setAssigningItem(null);
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
  const lockTransferItems = (pairs, date) => {
    playSaveChime();
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: (prevJob.items || []).map((i) => {
        const containersToLock = pairs.filter((p) => p.itemId === i.id).map((p) => p.containerName);
        if (containersToLock.length === 0) return i;
        const merged = [...new Set([...(i.transferredContainers || []), ...containersToLock])];
        return { ...i, transferredContainers: merged, transferredDate: date };
      }),
      activityLog: [
        {
          id: uniqueId(),
          time: timeStamp(),
          message: `Marked ${pairs.length} item portion${pairs.length === 1 ? "" : "s"} as transferred (${date})`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
  };

  const unlockTransferItem = (id) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: (prevJob.items || []).map((i) =>
        i.id === id ? { ...i, transferredContainers: [] } : i
      ),
    }));
  };

  const [unlockConfirmTarget, setUnlockConfirmTarget] = useState(null); // { item, action: "edit" | "delete" }

  const requestEditItem = (item) => {
    if ((item.transferredContainers || []).length > 0) {
      setUnlockConfirmTarget({ item, action: "edit" });
    } else {
      setFormState(item);
    }
  };

  // The "Imported" badge's two actions: tapping Merge opens the picker
  // below; tapping the X just clears the flag, for whenever the imported
  // item genuinely is a new, distinct item and not a match for anything
  // already on the list.
  const handleMergeAction = (item, options = {}) => {
    if (options.dismiss) {
      onUpdateJob((prevJob) => ({
        ...prevJob,
        items: prevJob.items.map((i) => (i.id === item.id ? { ...i, importedViaReceiving: false } : i)),
      }));
      return;
    }
    setMergingItem(item);
  };

  const confirmMerge = (targetId) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: mergeJobItems(prevJob.items, mergingItem.id, targetId),
    }));
    playSaveChime();
    setMergingItem(null);
  };

  const handleViewVendor = (item) => {
    if (!item.catalogId) return;
    setViewingVendorFor(item.catalogId);
  };

  const handleViewReceipt = (item) => {
    if (!item.sourceReceipt) return;
    setViewingReceiptFor(item.sourceReceipt);
  };

  // Items that point at another item via substituteForItemId get their
  // qty folded into that item's displayed Have/Needed — purely a display
  // combination. Containers, serials, and transfer tracking all stay
  // fully separate per item underneath, since the actual transfer record
  // already lists each item on its own and that distinction has to
  // survive — this is only about the dashboard correctly showing the
  // requirement as satisfied when it's being filled by a mix of two
  // interchangeable things (an old and new tool model, say).
  const combinedTotals = {}; // targetItemId -> { qtyHave, contributors: [{id, name, qtyHave}] }
  items.forEach((i) => {
    if (!i.substituteForItemId) return;
    const target = items.find((t) => t.id === i.substituteForItemId);
    if (!target) return;
    if (!combinedTotals[target.id]) {
      combinedTotals[target.id] = { qtyHave: target.qtyHave, contributors: [] };
    }
    combinedTotals[target.id].qtyHave += i.qtyHave;
    combinedTotals[target.id].contributors.push({ id: i.id, name: i.name, qtyHave: i.qtyHave });
  });

  const linkSubstitute = (item, targetItem) => {
    onUpdateJob((prevJob) => ({
      ...prevJob,
      items: (prevJob.items || []).map((i) =>
        i.id === item.id ? { ...i, substituteForItemId: targetItem ? targetItem.id : null } : i
      ),
      activityLog: [
        {
          id: uniqueId(),
          time: timeStamp(),
          message: targetItem
            ? `"${item.name}" now counts toward "${targetItem.name}"'s requirement`
            : `"${item.name}" no longer counts toward another item's requirement`,
        },
        ...prevJob.activityLog,
      ].slice(0, 50),
    }));
    setLinkingSubstituteItem(null);
  };

  const requestDeleteItem = (item) => {
    if ((item.transferredContainers || []).length > 0) {
      setUnlockConfirmTarget({ item, action: "delete" });
    } else {
      setDeleteTarget(item);
    }
  };

  const confirmUnlockAndProceed = () => {
    if (!unlockConfirmTarget) return;
    const { item, action } = unlockConfirmTarget;
    unlockTransferItem(item.id);
    const unlockedItem = { ...item, transferredContainers: [] };
    if (action === "edit") setFormState(unlockedItem);
    else setDeleteTarget(unlockedItem);
    setUnlockConfirmTarget(null);
  };

  const bulkSetContainer = (container) => {
    bulkUpdate(
      (i) => {
        // Preserves whatever you actually have on hand — except for 0,
        // which is a special case: nothing's been accounted for yet, so
        // moving it into a container means you're placing the full needed
        // quantity there now, not "moving zero of it."
        const qty = i.qtyHave === 0 ? i.qtyNeeded : i.qtyHave;
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
        { id: uniqueId(), text, done: false, itemId: null },
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
      return { id: uniqueId() + idx, text, done: false, itemId: id };
    });
    onUpdateJob((prevJob) => ({
      ...prevJob,
      todos: [...(prevJob.todos || []), ...newTodos],
      activityLog: [
        {
          id: uniqueId(),
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
          id: uniqueId(),
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
        id: uniqueId() + idx,
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
          id: uniqueId(),
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
                          {c.fieldChanges.storage === "Other" && c.fieldChanges.storageDetail
                            ? ` (${c.fieldChanges.storageDetail})`
                            : ""}
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
                {job.sealed && (
                  <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-700 border border-slate-600 text-slate-300 rounded-full px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    Sealed
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 leading-tight">
                {job.sealed ? "Sealed — read only" : "Job inventory tracker"}
              </p>
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
                        setPullFromReceivingOpen(true);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700 text-left"
                    >
                      <Inbox className="w-4 h-4 text-slate-400" />
                      Pull from Receiving
                    </button>
                  )}
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
              <option value="transferred">Transferred</option>
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
              onClick={() => setImportedOnlyFilter((v) => !v)}
              className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border whitespace-nowrap ${
                importedOnlyFilter
                  ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              <Inbox className="w-3 h-3" />
              Imported only
            </button>
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
              importedOnlyFilter ||
              searchQuery) && (
              <button
                onClick={() => {
                  setGangFilter("All");
                  setStorageFilter("All");
                  setContainerFilter("All");
                  setCategoryFilter("All");
                  setStatusFilter("All");
                  setProcFilter("All");
                  setImportedOnlyFilter(false);
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
                  onClick={() => setBulkAssignPicker(true)}
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-700"
                >
                  Assign to worker
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
                            onEdit={requestEditItem}
                            onDelete={requestDeleteItem}
                            onViewSerials={setSerialsView}
                            onSuggestEdit={setSuggestEditTarget}
                            onOpenContainer={openContainerFromItem}
                            workerTasks={workerTasks}
                            onAssignItem={setAssigningItem}
                            onMergeItem={handleMergeAction}
                            onViewVendor={handleViewVendor}
                            onViewReceipt={handleViewReceipt}
                            combinedInfo={combinedTotals[item.id]}
                            substituteTargetName={item.substituteForItemId ? (items.find((i) => i.id === item.substituteForItemId) || {}).name : null}
                            catalog={catalog}
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
                onEdit={requestEditItem}
                onDelete={requestDeleteItem}
                onViewSerials={setSerialsView}
                onSuggestEdit={setSuggestEditTarget}
                onOpenContainer={openContainerFromItem}
                workerTasks={workerTasks}
                onAssignItem={setAssigningItem}
                onMergeItem={handleMergeAction}
                onViewVendor={handleViewVendor}
                onViewReceipt={handleViewReceipt}
                combinedInfo={combinedTotals[item.id]}
                substituteTargetName={item.substituteForItemId ? (items.find((i) => i.id === item.substituteForItemId) || {}).name : null}
                catalog={catalog}
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
          onLinkSubstitute={setLinkingSubstituteItem}
          onAssignWorker={setAssigningItem}
          workerTasks={workerTasks}
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

      {unlockConfirmTarget && (
        <ConfirmDelete
          title="This item has been transferred"
          message={`"${unlockConfirmTarget.item.name}" is locked since it's already marked as transferred. Unlock it to ${
            unlockConfirmTarget.action === "delete" ? "delete it" : "make changes"
          }?`}
          confirmLabel="Unlock"
          onConfirm={confirmUnlockAndProceed}
          onCancel={() => setUnlockConfirmTarget(null)}
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
          onLockItems={lockTransferItems}
          onUnlockItem={unlockTransferItem}
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
              Moves whatever quantity each item actually has on hand into this one container
              (items still at 0 get the full needed quantity, since nothing's been placed yet),
              replacing any existing breakdown. For a partial amount split across containers,
              use "Pull items into this container" from the Containers screen instead.
            </p>
            {assignableContainerOptions.length === 0 ? (
              <p className="text-sm text-slate-500 mb-4">
                {containerOptions.length === 0
                  ? "No containers yet — add one from the Containers screen first."
                  : "Every container is marked transferred — add a new one from the Containers screen first."}
              </p>
            ) : (
              <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
                {[...assignableContainerOptions].sort((a, b) => a.localeCompare(b)).map((c) => (
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

      {bulkAssignPicker && (
        <AssignToWorkerModal
          workers={workers}
          itemLabel={`${selectedItemIds.length} selected item${selectedItemIds.length === 1 ? "" : "s"}`}
          onConfirm={bulkAssignToWorker}
          onCancel={() => setBulkAssignPicker(false)}
        />
      )}

      {assigningItem && (
        <AssignToWorkerModal
          workers={workers}
          itemLabel={`${assigningItem.name} ${assigningItem.qtyHave}/${assigningItem.qtyNeeded}`}
          initiallySelectedWorkerIds={(assigningItem.assignedTaskIds || [])
            .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
            .filter(Boolean)}
          onConfirm={confirmAssignSingle}
          onCancel={() => setAssigningItem(null)}
        />
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
          managerName={managerName}
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

      {pullFromReceivingOpen && (
        <PullFromReceivingModal
          targetType="job"
          targetLabel={job.name}
          target={job}
          onApplyToTarget={(updatedJob) => onUpdateJob(() => updatedJob)}
          onClose={() => setPullFromReceivingOpen(false)}
        />
      )}

      {mergingItem && (
        <MergeItemModal
          item={mergingItem}
          items={job.items || []}
          onConfirm={confirmMerge}
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
        <SourceReceiptModal sourceReceipt={viewingReceiptFor} onClose={() => setViewingReceiptFor(null)} />
      )}

      {linkingSubstituteItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={() => {
            setLinkingSubstituteItem(null);
            setSubstituteSearch("");
          }}
        >
          <div
            className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-slate-100 font-semibold text-sm truncate">
                "{linkingSubstituteItem.name}" counts toward...
              </h3>
              <button
                onClick={() => {
                  setLinkingSubstituteItem(null);
                  setSubstituteSearch("");
                }}
                className="text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 px-5 pt-3">
              Pick another item on this job — its Have total will include this item's quantity too,
              so the requirement shows as satisfied even though the actual units are tracked
              separately (own containers, own serials, own transfers).
            </p>
            <div className="px-5 pt-3 shrink-0">
              <input
                autoFocus
                value={substituteSearch}
                onChange={(e) => setSubstituteSearch(e.target.value)}
                placeholder="Search items on this job..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {linkingSubstituteItem.substituteForItemId && (
                <button
                  onClick={() => linkSubstitute(linkingSubstituteItem, null)}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-red-800/40 text-red-400 hover:bg-red-500/10 mb-2"
                >
                  Stop counting toward another item
                </button>
              )}
              {items
                .filter((i) => i.id !== linkingSubstituteItem.id && i.substituteForItemId !== linkingSubstituteItem.id)
                .filter((i) => i.name.toLowerCase().includes(substituteSearch.trim().toLowerCase()))
                .map((i) => (
                  <button
                    key={i.id}
                    onClick={() => linkSubstitute(linkingSubstituteItem, i)}
                    className={`w-full text-left text-sm rounded-md px-3 py-2 border mb-1.5 ${
                      linkingSubstituteItem.substituteForItemId === i.id
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                        : "border-slate-800 hover:border-slate-700 text-slate-100"
                    }`}
                  >
                    {i.name}
                    <span className="text-xs text-slate-500 ml-1.5">
                      ({i.qtyHave} of {i.qtyNeeded})
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {suggestEditTarget && (
        <ItemForm
          key={suggestEditTarget.id}
          initial={suggestEditTarget}
          containerOptions={containerOptions}
          onAddContainer={addContainer}
          categoryOptions={categoryOptions}
          onAddCategory={addCategory}
          onCancel={() => setSuggestEditTarget(null)}
          existingItems={items}
          catalog={catalog}
          isQuickTransfer={!!job.isQuickTransfer}
          suggestMode
          onSuggest={async (finalItem, note) => {
            const result = await submitSuggestion({
              jobId: job.id,
              itemId: suggestEditTarget.id,
              type: "edit_item",
              payload: { itemName: suggestEditTarget.name, proposedItem: finalItem },
              note,
              submittedBy: managerName,
            });
            setSuggestEditTarget(null);
            if (result.ok) setSuggestionSentConfirm(true);
          }}
        />
      )}

      {suggestionSentConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setSuggestionSentConfirm(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-slate-100 font-semibold mb-1.5">Suggestion sent</h3>
            <p className="text-sm text-slate-500 mb-4">
              The job owner will review it before anything changes.
            </p>
            <button
              onClick={() => setSuggestionSentConfirm(false)}
              className="w-full text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {suggestNewItemOpen && (
        <SuggestNewItemModal job={job} managerName={managerName} onClose={() => setSuggestNewItemOpen(false)} />
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
const GENERAL_TODOS_KEY = "warehub-general-todos";
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
async function submitSuggestion({ jobId, itemId, type, payload, note, submittedBy }) {
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

// Downscales an oversized photo before it goes to Supabase Storage — the
// goal is trimming the huge dimensions modern phone cameras produce
// (often 3000-4000px wide) down to something reasonable, while keeping
// quality high enough that fine print on a receipt or packing list stays
// perfectly legible. Non-image files (PDFs, etc.) and anything already
// under the cap pass through untouched — nothing to gain by re-encoding
// those.
function resizeImageForUpload(file, { maxWidth = 2000, quality = 0.92 } = {}) {
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
function storagePathFromPublicUrl(url) {
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
function loadPdfJs() {
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
async function pdfToImageFiles(file) {
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

async function uploadReferenceDocument(jobId, file) {
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
async function uploadLoveListScan(file) {
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
async function uploadWorkerTaskPhoto(file) {
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
async function uploadReceiptScan(file) {
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
    // referenceDocuments was missing from this list entirely — meaning it
    // never merged at all, it just silently took whichever side "mine"
    // happened to be during a conflict, dropping anything uploaded on the
    // other side. Same union-by-id treatment as todos/activityLog fixes it.
    const referenceDocuments = unionById(theirs.referenceDocuments, mine.referenceDocuments);

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
      referenceDocuments,
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

// Same idea, same chosen folder, as its own separate file — Love Lists
// data is structurally different enough from jobs/catalog that it doesn't
// belong jammed into the same backup payload.
let lastLoveListsBackupDownloadAt = 0;
const AUTO_BACKUP_LOVE_LISTS_KEY = "warehub-last-auto-backup-lovelists";
let loveListsAutoBackupInFlight = false;

async function downloadLoveListsBackupFile(loveLists, { force = false } = {}) {
  if (!force && Date.now() - lastLoveListsBackupDownloadAt < 10000) return false;
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `riggy-love-lists-${stamp}.json`;
  const payload = {
    exportedFrom: "Riggy (Love Lists)",
    exportedAt: now.toISOString(),
    loveLists,
  };
  const jsonText = JSON.stringify(payload, null, 2);

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
          lastLoveListsBackupDownloadAt = Date.now();
          return true;
        }
      }
    } catch {
      // Folder no longer accessible — fall back below rather than losing it
    }
  }

  try {
    lastLoveListsBackupDownloadAt = Date.now();
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

async function maybeAutoBackupLoveLists(loveLists) {
  if (!loveLists || loveLists.length === 0) return;
  if (loveListsAutoBackupInFlight) return;
  try {
    const last = localStorage.getItem(AUTO_BACKUP_LOVE_LISTS_KEY);
    const lastTime = last ? new Date(last).getTime() : 0;
    if (Date.now() - lastTime < AUTO_BACKUP_INTERVAL_MS) return;
    loveListsAutoBackupInFlight = true;
    localStorage.setItem(AUTO_BACKUP_LOVE_LISTS_KEY, new Date().toISOString());
    await downloadLoveListsBackupFile(loveLists);
  } catch {
    // best effort only
  } finally {
    loveListsAutoBackupInFlight = false;
  }
}

function WareHub({ isEditor, isManager, managerName, onSignOut, onRequestLogin, onGoToLanding, initialAction }) {
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
  const [generalTodos, setGeneralTodos] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerTasks, setWorkerTasks] = useState([]);
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
    const generalTodosResult = await getWithRetry(GENERAL_TODOS_KEY);

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
    try {
      if (generalTodosResult.ok && generalTodosResult.value) {
        setGeneralTodos(JSON.parse(generalTodosResult.value));
      }
    } catch {
      // corrupted stored data — just start with an empty list
    }
    try {
      const workersResult = await getWithRetry(WORKERS_KEY);
      if (workersResult.ok && workersResult.value) setWorkers(JSON.parse(workersResult.value));
    } catch {
      // corrupted stored data — just start with an empty roster
    }
    try {
      const workerTasksResult = await getWithRetry(WORKER_TASKS_KEY);
      if (workerTasksResult.ok && workerTasksResult.value) {
        setWorkerTasks(JSON.parse(workerTasksResult.value).map(migrateWorkerTask));
      }
    } catch {
      // corrupted stored data — just start empty
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
    // Items created before the collision-proof id generator existed could
    // genuinely share the same id (e.g. two items saved in the same
    // millisecond) — this shows up as selecting one item in things like
    // the transfer screen also selecting an unrelated item that happens
    // to share its id. Give any duplicate a fresh, real unique id.
    const dedupeItemIds = (jobItems) => {
      const seenIds = new Set();
      return jobItems.map((i) => {
        if (seenIds.has(i.id)) {
          const freshId = uniqueId();
          seenIds.add(freshId);
          return { ...i, id: freshId };
        }
        seenIds.add(i.id);
        return i;
      });
    };
    const migrateGang = (job) => ({
      ...job,
      items: dedupeItemIds(
        (job.items || []).map((i) => {
          let needsTransfer = i.needsTransfer;
          if (job.isQuickTransfer) {
            const match = getCachedCatalogMatch(i, loadedCatalog);
            needsTransfer = !!(match && match.needsTransfer);
          }
          // Old whole-item transferLocked boolean → new per-container
          // tracking. Locks every container this item currently sits in
          // (or the implicit "no container" slot), preserving the fact
          // that it was already marked transferred rather than silently
          // reverting it to active.
          let transferredContainers = i.transferredContainers;
          if (transferredContainers === undefined && i.transferLocked) {
            transferredContainers =
              i.containers && i.containers.length > 0
                ? i.containers.map((c) => c.name)
                : ["__unassigned__"];
          }
          const { transferLocked, ...rest } = i;
          return migrateItemContainers({
            ...rest,
            gang: normalizeGangName(i.gang),
            needsTransfer,
            transferredContainers,
          });
        })
      ),
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

  // Lets the landing screen's icons jump straight into a specific action
  // (open Suggestions, start a Quick Transfer, etc.) instead of just
  // dropping you on the plain job picker — runs once, after real data has
  // loaded.
  const initialActionDone = useRef(false);
  useEffect(() => {
    if (loading || !initialAction || initialActionDone.current) return;
    initialActionDone.current = true;
    if (initialAction === "checkUpdate") {
      checkForUpdateNow();
      return;
    }
    if (!isEditor) return;
    switch (initialAction) {
      case "suggestions":
        setSuggestionsOpen(true);
        refreshSuggestions();
        refreshResolvedSuggestions();
        break;
      case "fieldRequests":
        setFieldRequestsOpen(true);
        refreshFieldRequestCount();
        break;
      case "returns":
        setShowReturnsListPage(true);
        break;
      case "todo":
        setShowGeneralTodo(true);
        break;
      case "workerTasks":
        setShowWorkerTasks(true);
        break;
      case "catalog":
        setCatalogModalOpen(true);
        break;
      case "quickTransfer":
        setShowTransferOrReturnChoice(true);
        break;
      case "newJob":
        setShowNewJobModal(true);
        break;
      default:
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialAction, isEditor]);

  const approveSuggestion = async (s) => {
    const job = jobs.find((j) => String(j.id) === String(s.job_id));
    if (!job) {
      await updateSuggestionRow(s.id, { status: "denied", resolved_at: new Date().toISOString() });
      refreshSuggestions();
      return;
    }
    if (s.suggestion_type === "edit_item") {
      const before = job.items.find((i) => String(i.id) === String(s.item_id));
      // A full snapshot now, not just the narrow subset the old suggestion
      // form used to touch — since a suggestion can now propose a change
      // to genuinely any field (name, gang, category, storage, catalog
      // link, multiple containers), reverting it later needs everything
      // to restore correctly, not just quantity and container.
      const previousState = before ? { ...before } : null;
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        items: prevJob.items.map((i) => {
          if (String(i.id) !== String(s.item_id)) return i;
          if (s.payload.proposedItem) {
            // Current shape — a full proposed item, applied wholesale.
            return { ...s.payload.proposedItem, id: i.id };
          }
          // Older shape, kept working for anything already pending from
          // before this — a narrow, field-by-field suggestion.
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
        containerOptions: (() => {
          if (s.payload.proposedItem) {
            const newNames = (s.payload.proposedItem.containers || [])
              .map((c) => c.name)
              .filter(Boolean);
            return [...new Set([...prevJob.containerOptions, ...newNames])];
          }
          return s.payload.container && s.payload.container.name
            ? [...new Set([...prevJob.containerOptions, s.payload.container.name])]
            : prevJob.containerOptions;
        })(),
        activityLog: [
          {
            id: uniqueId(),
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
      const newItemId = uniqueId();
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
              id: uniqueId(),
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
            id: uniqueId(),
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
      const newTodoId = uniqueId();
      updateJobById(s.job_id, (prevJob) => ({
        ...prevJob,
        todos: [
          ...(prevJob.todos || []),
          { id: newTodoId, text: s.payload.text, done: false, itemId: null },
        ],
        activityLog: [
          {
            id: uniqueId(),
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
            id: uniqueId(),
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
            id: uniqueId(),
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
            id: uniqueId(),
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
            id: uniqueId(),
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
  const [showGeneralTodo, setShowGeneralTodo] = useState(false);
  const [showWorkerTasks, setShowWorkerTasks] = useState(false);
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

  const toggleJobSeal = (job) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, sealed: !j.sealed } : j)));
  };

  const toggleJobArchive = (job) => {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, archived: !j.archived } : j)));
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
                  id: uniqueId(),
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

  const updateGeneralTodos = (updater) => {
    setGeneralTodos((prev) => {
      const next = updater(prev);
      saveWithRetry(GENERAL_TODOS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Assigning an item creates a real task, not just a label — same
  // behavior as the Love Lists side, so it shows up in Worker Tasks and
  // counts toward that person's completion rate either way.
  const assignItemToWorker = (worker, itemLabel, jobLabel, source) => {
    if (!isEditor) return null;
    const task = newWorkerTask(worker.id, worker.name, itemLabel, jobLabel, source);
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

  // Worker Tasks manages its own independent copy of this data while
  // it is open, so edits/deletes made there do not automatically reach
  // whatever is already sitting in memory here — refresh on close so item
  // cards do not keep showing an assignment that was actually deleted.
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

  const addGeneralTodo = (text) => {
    if (!text.trim()) return;
    playSaveChime();
    updateGeneralTodos((prev) => [
      { id: uniqueId(), text: text.trim(), done: false },
      ...prev,
    ]);
  };

  const toggleGeneralTodo = (id) => {
    playSoftTap();
    updateGeneralTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const deleteGeneralTodo = (id) => {
    updateGeneralTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const clearFinishedGeneralTodos = (ids) => {
    updateGeneralTodos((prev) => prev.filter((t) => !ids.includes(t.id)));
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
          isManager={isManager}
          onRequestLogin={onRequestLogin}
          onSelect={(id) => {
            setActiveJobId(id);
            setShowPicker(false);
          }}
          onCreateClick={() => setShowNewJobModal(true)}
          onCreateQuickTransferClick={() => setShowTransferOrReturnChoice(true)}
          onCreateSubJobClick={(job) => setSubJobParent(job)}
          onDeleteRequest={(job) => setJobDeleteTarget(job)}
          onToggleJobSeal={toggleJobSeal}
          onToggleJobArchive={toggleJobArchive}
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
          onOpenGeneralTodo={() => setShowGeneralTodo(true)}
          onOpenWorkerTasks={() => setShowWorkerTasks(true)}
          onCheckForUpdate={checkForUpdateNow}
          onGoToLanding={onGoToLanding}
          updateCheckMessage={updateCheckMessage}
        />
      ) : (
        <JobInventory
          key={activeJob.id}
          job={activeJob}
          isEditor={isEditor && !activeJob.sealed}
          managerName={managerName}
          workers={workers}
          workerTasks={workerTasks}
          onAssignToWorker={assignItemToWorker}
          onUnassignWorkerTask={unassignWorkerTask}
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

      {showGeneralTodo && (
        <GeneralTodoModal
          todos={generalTodos}
          onAdd={addGeneralTodo}
          onToggle={toggleGeneralTodo}
          onDelete={deleteGeneralTodo}
          onClearFinished={clearFinishedGeneralTodos}
          onClose={() => setShowGeneralTodo(false)}
        />
      )}

      {showWorkerTasks && (
        <WorkerTasksSection
          onClose={() => {
            setShowWorkerTasks(false);
            reloadWorkerData();
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

function AppLandingScreen({ isEditor, isManager, onSelectLove, onSelectJobs, onSelectKiosk, onSelectReceiving, onSelectBackorders, onSelectArchive, pendingSuggestionCount = 0, onRequestLogin, onSignOut }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onSelectJobs("checkUpdate")}
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
              <p className="text-xs text-slate-500 leading-tight">What are you working on?</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditor && (
              <button
                onClick={() => onSelectJobs("suggestions")}
                title="Suggestions"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <Inbox className="w-4 h-4" />
              </button>
            )}
            {isEditor && (
              <button
                onClick={() => onSelectJobs("fieldRequests")}
                title="Field requests"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
            {isEditor && (
              <button
                onClick={() => onSelectJobs("returns")}
                title="Returns"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {isEditor && (
              <button
                onClick={() => onSelectJobs("todo")}
                title="Shop To Do"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <ClipboardList className="w-4 h-4" />
              </button>
            )}
            {isEditor && (
              <button
                onClick={() => onSelectJobs("workerTasks")}
                title="Worker Tasks"
                className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
              >
                <Users className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onSelectJobs("catalog")}
              title="Item catalog"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            {isEditor || isManager ? (
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
                onClick={() => onSelectJobs("quickTransfer")}
                className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-slate-700"
              >
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">Quick Transfer</span>
              </button>
            )}
            {isEditor && (
              <button
                onClick={() => onSelectJobs("newJob")}
                className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New job</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={onSelectLove}
            className="bg-slate-900 border-2 border-slate-800 hover:border-rose-500/60 hover:bg-rose-500/5 rounded-xl p-8 text-center transition-colors"
          >
            <Heart className="w-9 h-9 text-rose-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-100">Love Lists</p>
            <p className="text-xs text-slate-500 mt-1">Daily field requests, across every job</p>
          </button>
          <button
            onClick={() => onSelectJobs()}
            className="relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500/60 hover:bg-amber-500/5 rounded-xl p-8 text-center transition-colors"
          >
            {isEditor && pendingSuggestionCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-slate-950">
                {pendingSuggestionCount > 9 ? "9+" : pendingSuggestionCount}
              </span>
            )}
            <Briefcase className="w-9 h-9 text-amber-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-100">Job Lists</p>
            <p className="text-xs text-slate-500 mt-1">Full job inventory tracking</p>
          </button>
          {isEditor && (
            <div className="sm:col-span-2 flex justify-center">
              <button
                onClick={onSelectReceiving}
                className="w-full sm:w-1/2 bg-slate-900 border-2 border-slate-800 hover:border-sky-500/60 hover:bg-sky-500/5 rounded-xl p-8 text-center transition-colors"
              >
                <Inbox className="w-9 h-9 text-sky-400 mx-auto mb-3" />
                <p className="text-lg font-semibold text-slate-100">Receiving</p>
                <p className="text-xs text-slate-500 mt-1">Scan receipts, match items, apply to jobs</p>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onSelectKiosk}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
        >
          <Users className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300">Worker Kiosk</span>
        </button>
        {isEditor && (
          <button
            onClick={onSelectBackorders}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-300">Backorders</span>
          </button>
        )}
        {isEditor && (
          <button
            onClick={onSelectArchive}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
          >
            <BookOpen className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-300">Receipt Archive</span>
          </button>
        )}
      </main>
    </div>
  );
}

const LOVE_STATUSES = [
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
const nextLoveStatus = (item) => {
  const idx = LOVE_STATUSES.findIndex((s) => s.key === item.status);
  let next = idx + 1;
  if (LOVE_STATUSES[next]?.key === "ordered" && item.needsOrdering === false) next += 1;
  return next >= 0 && next < LOVE_STATUSES.length ? LOVE_STATUSES[next].key : null;
};
const prevLoveStatus = (item) => {
  const idx = LOVE_STATUSES.findIndex((s) => s.key === item.status);
  let prev = idx - 1;
  if (LOVE_STATUSES[prev]?.key === "ordered" && item.needsOrdering === false) prev -= 1;
  return prev >= 0 ? LOVE_STATUSES[prev].key : null;
};
const loveStatusMeta = (key) => LOVE_STATUSES.find((s) => s.key === key) || LOVE_STATUSES[0];

// The plain status label ("Staged to send") is only accurate when the
// whole quantity is in that state together. Once some of it has actually
// shipped (locked into sentBatches) but the item's still short of the
// full order — blocked from flipping all the way to "Sent" — showing
// "Staged to send" for the remainder is misleading: that missing balance
// was never staged, it was never even received. This swaps the label to
// something that tells the truth about what's actually outstanding.
function loveItemDisplayMeta(item) {
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
const listDisplayLabel = (list) =>
  list.subJobLabel ? `${list.jobLabel} — ${list.subJobLabel}` : list.jobLabel;

// Default days an item can sit in a given status before it counts as
// stuck and worth flagging — the actual fix for "we lose track of what's
// been sitting around too long." Ordered gets a longer leash since that
// delay is usually out of our hands; Requested and Staged are the two
// spots where something sitting still usually means it just got missed.
// User-adjustable from Love Lists settings — this is just the fallback.
const DEFAULT_STALE_THRESHOLD_DAYS = { requested: 3, ordered: 7, received: 7, staged: 3, sent: null };
const STALE_THRESHOLDS_KEY = "warehub-stale-thresholds";

function daysInCurrentStatus(item) {
  const since = item.statusDates && item.statusDates[item.status];
  if (!since) return 0;
  const ms = Date.now() - new Date(since + "T00:00:00").getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function isStale(item, thresholds = DEFAULT_STALE_THRESHOLD_DAYS) {
  if (item.archived) return false;
  const threshold = thresholds[item.status];
  if (threshold == null) return false;
  return daysInCurrentStatus(item) >= threshold;
}

// Finds other still-pending items (not yet sent, not archived) across every
// Love List with a matching name — the actual fix for the "job never got
// told this was already coming, so they re-requested it" problem.
function findPossibleDuplicates(name, catalogId, catalog = [], allLists = [], { excludeListId, excludeItemId } = {}) {
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

function newLoveListItem(name, qty, extra = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uniqueId(),
    name,
    qty,
    qtyHave: extra.qtyHave || 0,
    qtyUnit: extra.qtyUnit || "",
    status: "requested",
    statusDates: { requested: today, ordered: null, received: null, staged: null, sent: null },
    notes: "",
    catalogId: extra.catalogId || null,
    storage: extra.storage || "",
    storageDetail: extra.storageDetail || "",
    serials: extra.serials || [],
    needsTransfer: !!extra.needsTransfer,
    // Defaults to true (assume it needs ordering) unless explicitly
    // marked as already in inventory.
    needsOrdering: extra.needsOrdering !== false,
    archived: false,
    duplicateOf: extra.duplicateOf || null,
    assignedTaskIds: [],
    sentBatches: [],
    receivedBatches: [],
    stagedBatches: [],
    backorderQty: extra.backorderQty || 0, // still outstanding from a supplier, set/updated via Receiving
    backorderReceiptDate: extra.backorderReceiptDate || null,
  };
}

function LoveListItemEntry({ catalog, allLists = [], currentListId, onLearnAlias, onAdd }) {
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
              {loveStatusMeta(item.status).label}
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

function LoveListScanModal({ catalog, onLearnAlias, onSave, onCancel }) {
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
    </div>
  );
}

function LoveListAddForm({ catalog, allLists, onLearnAlias, onSave, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [jobLabel, setJobLabel] = useState("");
  const [subJobLabel, setSubJobLabel] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [dateReceived, setDateReceived] = useState(todayStr);
  const [items, setItems] = useState([]);

  const canSave = jobLabel.trim() && items.length > 0;

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
            onClick={() => onSave({ jobLabel: jobLabel.trim(), subJobLabel: subJobLabel.trim(), submittedBy: submittedBy.trim(), dateReceived, items })}
            disabled={!canSave}
            className="w-full text-sm rounded-md py-2.5 bg-rose-500 text-slate-950 font-semibold hover:bg-rose-400 disabled:opacity-40"
          >
            Save Love List
          </button>
        </div>
      </div>
    </div>
  );
}

function LoveListPhotosModal({ list, isEditor, onAddPhoto, onRemovePhoto, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [viewingUrl, setViewingUrl] = useState(null);
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

  if (viewingUrl) {
    return (
      <div
        className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center px-4 py-8"
        onClick={() => setViewingUrl(null)}
      >
        <button
          onClick={() => setViewingUrl(null)}
          className="absolute top-4 right-4 text-slate-300 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <ZoomableImage key={viewingUrl} src={viewingUrl} alt="Reference photo" />
      </div>
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
                    onClick={() => setViewingUrl(photo.url)}
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
function MergeLoveListItemModal({ item, items, onConfirm, onClose }) {
  const [search, setSearch] = useState("");
  if (!item) return null;
  const sourceHave = item.qtyHave || 0;
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
            Has {sourceHave} on hand. Whatever's needed to fill the target moves over — anything
            left stays here.
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
              return (
                <button
                  key={c.id}
                  onClick={() => onConfirm(c.id)}
                  disabled={willMoveInTargetUnits <= 0}
                  className="w-full text-left text-sm rounded-md px-3 py-2 border border-slate-800 hover:border-slate-700 mb-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <p className="text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    Have {cHave} of {cNeeded}
                    {willMoveInTargetUnits > 0
                      ? ` — will take ${willMoveInTargetUnits}${unitsDiffer ? ` ${c.qtyUnit || "each"}` : ""}, leaving ${
                          sourceHave - willMoveInSourceUnits
                        } here`
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

function LoveListDetailPage({ list, catalog, allLists = [], isEditor, isOwner, workers = [], workerTasks = [], staleThresholds = DEFAULT_STALE_THRESHOLD_DAYS, onAssignToWorker, onUnassignWorkerTask, onUpdateList, onDeleteList, onLearnAlias, onBack, onGoHome }) {
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
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [assigningItem, setAssigningItem] = useState(null); // single item, or "bulk"
  const [editingSmeFor, setEditingSmeFor] = useState(null); // item, while editing its SME#s
  const [clearBatchesTarget, setClearBatchesTarget] = useState(null); // item, while confirming a batch history reset
  const [relinkingItem, setRelinkingItem] = useState(null); // item, while relinking its catalog match
  const [renamingItem, setRenamingItem] = useState(null); // item, while renaming it
  const [renameDraft, setRenameDraft] = useState("");
  const [editingNoteFor, setEditingNoteFor] = useState(null); // item, while editing its note
  const [noteDraft, setNoteDraft] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [smeDraft, setSmeDraft] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null = off, or a LOVE_STATUSES key
  const [itemSearch, setItemSearch] = useState("");
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

  // What actually shows on the transfer list: only SME-tracked items,
  // since that's the whole point of the record. Includes both items
  // genuinely marked Sent, and partial-send snapshots — each showing the
  // quantity and SME#s that were actually present at the moment that
  // portion went out, not whatever the item's current values happen to
  // be now.
  const transferListEntries = list.items
    .filter((i) => !i.archived && i.needsTransfer)
    .flatMap((i) => {
      const batches = (i.sentBatches || []).filter(
        (b) => b.sentQty > 0 || (b.serials || []).length > 0
      );
      return batches.map((batch, idx) => ({
        item: i,
        qty: batch.sentQty,
        qtyUnit: i.qtyUnit,
        serials: batch.serials || [],
        date: batch.timestamp.slice(0, 10),
        // The final batch is only "not partial" if the item actually
        // reached a genuine, fully-caught-up Sent status.
        partial: idx < batches.length - 1 || i.status !== "sent",
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
      return `Sent on ${formatTransferDate(date)}:\n${lines.join("\n")}`;
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
        const existingWorkerIds = (target.assignedTaskIds || [])
          .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
          .filter(Boolean);
        const newTaskIds = workerIds
          .filter((wid) => !existingWorkerIds.includes(wid)) // already assigned — don't duplicate
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
    const currentWorkerIds = currentTaskIds
      .map((tid) => workerTasks.find((t) => t.id === tid)?.workerId)
      .filter(Boolean);

    const addedWorkerIds = workerIds.filter((wid) => !currentWorkerIds.includes(wid));
    const removedTaskIds = currentTaskIds.filter((tid) => {
      const t = workerTasks.find((task) => task.id === tid);
      return t && !workerIds.includes(t.workerId);
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

  const advanceStatus = (itemId, direction) => {
    if (!isEditor) return;
    playSoftTap();
    onUpdateList({
      ...list,
      items: list.items.map((i) => {
        if (i.id !== itemId) return i;
        const newStatus = direction === "forward" ? nextLoveStatus(i) : prevLoveStatus(i);
        if (!newStatus) return i;
        const today = new Date().toISOString().slice(0, 10);

        if (newStatus === "sent" && direction === "forward") {
          // Every prior batch is a locked, historical record — figure out
          // what's actually NEW since the last one, so the same SME#
          // never gets recorded (and shows on a transfer list) twice.
          // This is what actually prevents double-transferring: once a
          // number's in a batch, it stays there permanently, even if the
          // item's live serials list later gets edited or cleared.
          const priorBatches = i.sentBatches || [];
          const priorSentQty = priorBatches.reduce((sum, b) => sum + b.sentQty, 0);
          const priorSerials = new Set(priorBatches.flatMap((b) => b.serials || []));
          const deltaQty = Math.max(0, (i.qtyHave || 0) - priorSentQty);
          const deltaSerials = (i.serials || []).filter((s) => !priorSerials.has(s));
          // Nothing actually new since the last batch — e.g. tapping
          // forward again after already recording this delivery, or
          // toggling back and forth without the quantity changing. Don't
          // stamp a fresh empty entry just because the button got tapped.
          const hasNewContent = deltaQty > 0 || deltaSerials.length > 0;
          const sentBatches = hasNewContent
            ? [...priorBatches, { sentQty: deltaQty, serials: deltaSerials, timestamp: new Date().toISOString() }]
            : priorBatches;

          if (i.qtyHave < i.qty) {
            // Still short overall — lock this batch in, but keep the
            // stepper active so the remainder can keep moving.
            return { ...i, sentBatches };
          }
          // Fully caught up now — lock the final batch and actually
          // complete the status for real.
          return {
            ...i,
            status: newStatus,
            statusDates: { ...i.statusDates, [newStatus]: today },
            sentBatches,
          };
        }

        if (newStatus === "received" && direction === "forward") {
          // Nothing marked in-hand yet — assume the whole order showed up,
          // since that's the common case and this saves a manual "bump Have
          // to match Qty" step every time. If a partial amount's already
          // sitting there (someone logged some SME#s, or set Have by hand),
          // that's respected instead of getting clobbered.
          const effectiveHave = (i.qtyHave || 0) > 0 ? i.qtyHave : i.qty;

          // Same idea as Sent — supplier deliveries often trickle in
          // partial, and each delivery deserves its own locked, permanent
          // record of exactly how much showed up and when, rather than
          // one number that keeps getting silently overwritten.
          const priorBatches = i.receivedBatches || [];
          const priorReceivedQty = priorBatches.reduce((sum, b) => sum + b.receivedQty, 0);
          const priorSerials = new Set(priorBatches.flatMap((b) => b.serials || []));
          const deltaQty = Math.max(0, effectiveHave - priorReceivedQty);
          const deltaSerials = (i.serials || []).filter((s) => !priorSerials.has(s));
          const hasNewContent = deltaQty > 0 || deltaSerials.length > 0;
          const receivedBatches = hasNewContent
            ? [...priorBatches, { receivedQty: deltaQty, serials: deltaSerials, timestamp: new Date().toISOString() }]
            : priorBatches;

          // Unlike Sent (the final stage), Received sits in the middle of
          // the pipeline — staying "stuck" here would block moving a
          // partial delivery on to Staged/Sent, which genuinely happens
          // (shipping partial amounts to the job before the rest of the
          // order arrives). So this always actually advances the status;
          // the batch history is what keeps an honest record of exactly
          // how much showed up and when, without blocking progress.
          return {
            ...i,
            status: newStatus,
            statusDates: { ...i.statusDates, [newStatus]: today },
            qtyHave: effectiveHave,
            receivedBatches,
          };
        }

        if (newStatus === "staged" && direction === "forward") {
          // Same idea as Received — items often get physically staged as
          // they become ready, before the rest of the order has shown up.
          const priorBatches = i.stagedBatches || [];
          const priorStagedQty = priorBatches.reduce((sum, b) => sum + b.stagedQty, 0);
          const priorSerials = new Set(priorBatches.flatMap((b) => b.serials || []));
          const deltaQty = Math.max(0, (i.qtyHave || 0) - priorStagedQty);
          const deltaSerials = (i.serials || []).filter((s) => !priorSerials.has(s));
          const hasNewContent = deltaQty > 0 || deltaSerials.length > 0;
          const stagedBatches = hasNewContent
            ? [...priorBatches, { stagedQty: deltaQty, serials: deltaSerials, timestamp: new Date().toISOString() }]
            : priorBatches;

          // Staged sits in the middle of the pipeline too — blocking here
          // would stop a partial staging batch from moving on toward
          // Sent, so this always actually advances the status the same
          // way Received does.
          return {
            ...i,
            status: newStatus,
            statusDates: { ...i.statusDates, [newStatus]: today },
            stagedBatches,
          };
        }

        return {
          ...i,
          status: newStatus,
          statusDates: {
            ...i.statusDates,
            [newStatus]: direction === "forward" ? today : i.statusDates[newStatus],
          },
        };
      }),
    });
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
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200 shrink-0">
              <Home className="w-4 h-4" />
            </button>
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
          </div>
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
        </div>
      </header>

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
                  onClick={() => setAssigningItem("bulk")}
                  className="text-xs flex items-center gap-1 bg-amber-500 text-slate-950 font-semibold rounded-md px-2.5 py-1.5 hover:bg-amber-400"
                >
                  <Users className="w-3.5 h-3.5" />
                  Assign {selectedIds.size} selected
                </button>
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
                {item.sourceReceipt && (
                  <button
                    onClick={() => setViewingReceiptFor(item.sourceReceipt)}
                    className="text-xs rounded-full px-2 py-0.5 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 mb-2 inline-flex items-center gap-1"
                  >
                    🧾 Receipt
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
                    Sent on {formatTransferDate(date)}
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
        <SourceReceiptModal sourceReceipt={viewingReceiptFor} onClose={() => setViewingReceiptFor(null)} />
      )}
    </div>
  );
}

function StaleThresholdsModal({ thresholds, onSave, onClose }) {
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

function LoveListsDashboard({ lists, isEditor, staleThresholds = DEFAULT_STALE_THRESHOLD_DAYS, onSaveThresholds, onOpenList, onAddList, onScanList, onOpenWorkerTasks, onGoHome }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active"); // "active" | "ready"
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null = off, or a LOVE_STATUSES key

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
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200">
              <Home className="w-4 h-4" />
            </button>
            <p className="font-semibold text-slate-100 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              Love Lists
              {!isEditor && (
                <span className="text-[10px] font-medium tracking-wide uppercase bg-slate-800 border border-slate-700 text-slate-400 rounded-full px-2 py-0.5">
                  View only
                </span>
              )}
            </p>
          </div>
          {isEditor && (
            <div className="flex gap-2 shrink-0">
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
              <button
                onClick={onAddList}
                className="flex items-center gap-1.5 bg-rose-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-rose-400"
              >
                <Plus className="w-4 h-4" />
                New list
              </button>
            </div>
          )}
        </div>
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
      </header>

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
                <p className="text-sm text-slate-500 text-center py-10">
                  {isEditor
                    ? 'No Love Lists yet — tap "New list" to log one in.'
                    : "No Love Lists yet."}
                </p>
              ) : (
                <div className="space-y-5">
                  {archivedListCount > 0 && (
                    <button
                      onClick={() => setShowArchivedLists((v) => !v)}
                      className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      {showArchivedLists ? "Hide" : "Show"} {archivedListCount} archived list
                      {archivedListCount === 1 ? "" : "s"}
                    </button>
                  )}
                  {jobGroups.map((jobLabel) => (
                    <div key={jobLabel}>
                      <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                      <div className="space-y-2">
                        {visibleLists
                          .filter((l) => l.jobLabel === jobLabel)
                          .sort((a, b) => b.dateReceived.localeCompare(a.dateReceived))
                          .map((list) => {
                            const counts = LOVE_STATUSES.map((s) => ({
                              ...s,
                              n: list.items.filter((i) => i.status === s.key).length,
                            })).filter((s) => s.n > 0);
                            return (
                              <button
                                key={list.id}
                                onClick={() => onOpenList(list)}
                                className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700"
                              >
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
    </div>
  );
}

const WORKER_TASK_STATUSES = [
  { key: "not_started", label: "Not Started", color: "bg-slate-700 text-slate-200 border-slate-600" },
  { key: "in_progress", label: "In Progress", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { key: "completed", label: "Completed", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  { key: "failed", label: "Failed", color: "bg-red-500/15 text-red-300 border-red-500/40" },
];
const workerTaskStatusMeta = (key) =>
  WORKER_TASK_STATUSES.find((s) => s.key === key) || WORKER_TASK_STATUSES[0];

const TASK_URGENCY = {
  low: { label: "Low", color: "bg-slate-800 text-slate-400 border-slate-700" },
  normal: { label: "Normal", color: "bg-slate-800 text-slate-300 border-slate-700" },
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-300 border-red-500/40" },
};

function newWorkerTask(workerId, workerName, title, jobLabel, source = null) {
  return {
    id: uniqueId(),
    workerId,
    workerName, // snapshot at creation time, survives a later worker rename
    // Item-assignment tasks (from a Job List/Love List item card) are
    // always exactly one person — capacity 1, that one person already on
    // it. The open/multi-person pool lives in the standalone Worker Tasks
    // dashboard instead, via newSharedWorkerTask below.
    capacity: 1,
    assignedWorkerIds: workerId ? [workerId] : [],
    title,
    jobLabel: jobLabel || "",
    urgency: "normal",
    dueDate: null,
    status: "not_started",
    failReason: "",
    createdAt: new Date().toISOString().slice(0, 10),
    startedAt: null,
    resolvedAt: null, // set when it becomes Completed or Failed
    completionPhotoUrl: null,
    // When assigned from an item card, links back so the item can show
    // live status and so re-assigning doesn't create duplicate tasks.
    source, // { type: "job_item" | "love_list_item", itemId, containerId? }
    archived: false,
  };
}

// Standalone Worker Tasks dashboard tasks — capacity can be more than 1,
// and assignedWorkers can be anywhere from empty (fully open, first-come)
// to fully staffed (owner assigned everyone directly) to partial (owner
// picked some, the rest is left open for someone else to claim/join).
function newSharedWorkerTask({ title, jobLabel, capacity, assignedWorkers, urgency, dueDate }) {
  const workers = (assignedWorkers || []).slice(0, capacity);
  return {
    id: uniqueId(),
    // workerId/workerName kept as a single-name fallback for any older
    // display code that hasn't been touched — always the first assignee,
    // or null if the task starts fully open.
    workerId: workers[0]?.id || null,
    workerName: workers[0]?.name || null,
    capacity: Math.max(1, capacity || 1),
    assignedWorkerIds: workers.map((w) => w.id),
    title,
    jobLabel: jobLabel || "",
    urgency: urgency || "normal",
    dueDate: dueDate || null,
    status: workers.length > 0 ? "in_progress" : "not_started",
    startedAt: workers.length > 0 ? new Date().toISOString() : null,
    failReason: "",
    createdAt: new Date().toISOString().slice(0, 10),
    resolvedAt: null,
    completionPhotoUrl: null,
    source: null,
    archived: false,
  };
}

// Normalizes tasks saved before capacity/assignedWorkerIds/urgency/dueDate
// existed — every read path runs tasks through this so old and new data
// behave identically without a one-time destructive migration.
function migrateWorkerTask(task) {
  const withCapacity = Array.isArray(task.assignedWorkerIds)
    ? task
    : { ...task, assignedWorkerIds: task.workerId ? [task.workerId] : [], capacity: task.capacity || 1 };
  return {
    ...withCapacity,
    urgency: withCapacity.urgency || "normal",
    dueDate: withCapacity.dueDate || null,
    completionPhotoUrl: withCapacity.completionPhotoUrl || null,
  };
}

// "In Progress · Started 2:14 PM" — the actual display format the
// standalone dashboard and kiosk use for a task's live status line.
function formatTaskTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // old date-only strings, e.g. "2025-01-01"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isTaskOverdue(task) {
  if (!task.dueDate || task.status === "completed") return false;
  return new Date(task.dueDate + "T23:59:59") < new Date();
}

function formatDueDate(dueDate) {
  if (!dueDate) return "";
  const d = new Date(dueDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Small badge row used on task cards everywhere (dashboard, worker detail,
// kiosk) — urgency pill plus a due-date pill that turns red once it's
// actually overdue.
function TaskMetaBadges({ task }) {
  const urgencyMeta = TASK_URGENCY[task.urgency] || TASK_URGENCY.normal;
  const overdue = isTaskOverdue(task);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {task.urgency && task.urgency !== "normal" && (
        <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${urgencyMeta.color}`}>
          {urgencyMeta.label}
        </span>
      )}
      {task.dueDate && (
        <span
          className={`text-[10px] rounded-full px-1.5 py-0.5 border ${
            overdue
              ? "bg-red-500/15 text-red-300 border-red-500/40"
              : "bg-slate-800 text-slate-500 border-slate-700"
          }`}
        >
          {overdue ? "Overdue " : "Due "}
          {formatDueDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}

function WorkerRosterModal({ workers, onAddWorker, onRemoveWorker, onUpdatePin, onClose }) {
  const [name, setName] = useState("");
  const [editingPinFor, setEditingPinFor] = useState(null);
  const [pinDraft, setPinDraft] = useState("");
  const addWorker = () => {
    if (!name.trim()) return;
    onAddWorker(name.trim());
    setName("");
  };
  const savePin = () => {
    if (!editingPinFor) return;
    const digits = pinDraft.replace(/\D/g, "").slice(0, 6);
    onUpdatePin(editingPinFor.id, digits);
    setEditingPinFor(null);
    setPinDraft("");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base">Worker roster</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pt-4 flex gap-2 shrink-0">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWorker()}
            placeholder="Worker name"
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <button
            onClick={addWorker}
            disabled={!name.trim()}
            className="bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-slate-500 px-5 pt-2 shrink-0">
          Set a PIN for anyone who'll use the Worker Kiosk on the shop tablet.
        </p>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {workers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No workers added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {workers.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between bg-slate-800/40 border border-slate-800 rounded-md px-3 py-2"
                >
                  <p className="text-sm text-slate-100">{w.name}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditingPinFor(w);
                        setPinDraft(w.pin || "");
                      }}
                      className="text-xs text-slate-500 hover:text-amber-400"
                    >
                      {w.pin ? "PIN set" : "Set PIN"}
                    </button>
                    <button
                      onClick={() => onRemoveWorker(w.id)}
                      className="text-slate-600 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingPinFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-xs p-5">
            <h3 className="text-slate-100 font-semibold mb-3">PIN for {editingPinFor.name}</h3>
            <input
              autoFocus
              inputMode="numeric"
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && savePin()}
              placeholder="4-6 digits"
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-lg tracking-widest text-center rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingPinFor(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={savePin}
                className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared between Love Lists and Job Lists item cards — assigning an item
// creates a real tracked task for that worker, not just a label, so it
// counts toward their completion rate in Worker Tasks.
function AssignToWorkerModal({ workers, itemLabel, initiallySelectedWorkerIds = [], onConfirm, onCancel }) {
  const [selected, setSelected] = useState(new Set(initiallySelectedWorkerIds));
  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5 max-h-[80vh] flex flex-col">
        <h3 className="text-slate-100 font-semibold mb-1">Assign to worker(s)</h3>
        <p className="text-xs text-slate-500 mb-4 truncate">{itemLabel}</p>
        {workers.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">
            No workers on the roster yet — add one from Worker Tasks first.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-2">
            {workers.map((w) => (
              <label
                key={w.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-slate-800 bg-slate-800/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(w.id)}
                  onChange={() => toggle(w.id)}
                  className="w-4 h-4 rounded accent-amber-500 shrink-0"
                />
                <span className="text-sm text-slate-100">{w.name}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-3 mt-3">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          {workers.length > 0 && (
            <button
              onClick={() => onConfirm([...selected])}
              className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkerTaskEditForm({ task, workers, onSave, onDelete, onCancel }) {
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(
    new Set(task.assignedWorkerIds || [])
  );
  const [capacity, setCapacity] = useState(task.capacity || 1);
  const [title, setTitle] = useState(task.title || "");
  const [jobLabel, setJobLabel] = useState(task.jobLabel || "");
  const [urgency, setUrgency] = useState(task.urgency || "normal");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const toggleWorker = (id) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < capacity) {
        next.add(id);
      }
      return next;
    });
  };

  const setCapacityClamped = (n) => {
    const num = Math.max(1, Math.min(20, n));
    setCapacity(num);
    setSelectedWorkerIds((prev) => new Set([...prev].slice(0, num)));
  };

  const canSave = title.trim().length > 0;
  const openSlots = capacity - selectedWorkerIds.size;

  const save = () => {
    onSave({
      ...task,
      title: title.trim(),
      jobLabel: jobLabel.trim(),
      capacity,
      urgency,
      dueDate: dueDate || null,
      assignedWorkerIds: [...selectedWorkerIds],
      workerId: [...selectedWorkerIds][0] || null,
      workerName: workers.find((w) => w.id === [...selectedWorkerIds][0])?.name || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="px-5 pt-5 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base mb-4">Edit task</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Task</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to get done..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Job (optional)
          </label>
          <input
            value={jobLabel}
            onChange={(e) => setJobLabel(e.target.value)}
            placeholder="e.g. 3052"
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Urgency</label>
          <div className="flex gap-1.5 mb-4">
            {Object.entries(TASK_URGENCY).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setUrgency(key)}
                className={`flex-1 text-xs rounded-md py-2 border ${
                  urgency === key ? meta.color : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {meta.label}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Due date (optional)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            How many people
          </label>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setCapacityClamped(capacity - 1)}
              className="w-8 h-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              −
            </button>
            <input
              type="number"
              onFocus={selectOnFocus}
              onClick={selectOnFocus}
              min="1"
              value={capacity}
              onChange={(e) => setCapacityClamped(Number(e.target.value) || 1)}
              className="w-14 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={() => setCapacityClamped(capacity + 1)}
              className="w-8 h-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              +
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {openSlots > 0
              ? `${openSlots} open slot${openSlots === 1 ? "" : "s"} — anyone can claim it from the kiosk.`
              : "Fully assigned — no open slots left."}
          </p>

          {workers.length === 0 ? (
            <p className="text-sm text-slate-500 mb-3">No one on the roster yet.</p>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Assigned
              </label>
              <div className="space-y-1.5 mb-1">
                {workers.map((w) => {
                  const checked = selectedWorkerIds.has(w.id);
                  const disabled = !checked && selectedWorkerIds.size >= capacity;
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer ${
                        disabled
                          ? "border-slate-800 bg-slate-800/20 opacity-40 cursor-not-allowed"
                          : "border-slate-800 bg-slate-800/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleWorker(w.id)}
                        className="w-4 h-4 rounded accent-amber-500 shrink-0"
                      />
                      <span className="text-sm text-slate-100">{w.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="p-5 pt-3 shrink-0 space-y-2">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="w-full text-xs text-slate-500 hover:text-red-400"
          >
            Delete this task
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDelete
          title="Delete this task?"
          message={`"${task.title}" will be permanently removed for everyone assigned to it.`}
          onConfirm={() => onDelete(task.id)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

function WorkerTaskAddForm({ workers, onSave, onCancel }) {
  const [selectedWorkerIds, setSelectedWorkerIds] = useState(new Set());
  const [capacity, setCapacity] = useState(1);
  const [title, setTitle] = useState("");
  const [jobLabel, setJobLabel] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [dueDate, setDueDate] = useState("");

  const toggleWorker = (id) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < capacity) {
        next.add(id);
      }
      return next;
    });
  };

  const setCapacityClamped = (n) => {
    const num = Math.max(1, Math.min(20, n));
    setCapacity(num);
    // If shrinking capacity drops below however many are already picked,
    // trim the extras off rather than leaving an invalid over-full state.
    setSelectedWorkerIds((prev) => new Set([...prev].slice(0, num)));
  };

  const canSave = title.trim().length > 0;
  const openSlots = capacity - selectedWorkerIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="px-5 pt-5 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base mb-4">New task</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Task</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to get done..."
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Job (optional)
          </label>
          <input
            value={jobLabel}
            onChange={(e) => setJobLabel(e.target.value)}
            placeholder="e.g. 3052"
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Urgency</label>
          <div className="flex gap-1.5 mb-4">
            {Object.entries(TASK_URGENCY).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => setUrgency(key)}
                className={`flex-1 text-xs rounded-md py-2 border ${
                  urgency === key ? meta.color : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                {meta.label}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Due date (optional)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            How many people
          </label>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => setCapacityClamped(capacity - 1)}
              className="w-8 h-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              −
            </button>
            <input
              type="number"
              onFocus={selectOnFocus}
              onClick={selectOnFocus}
              min="1"
              value={capacity}
              onChange={(e) => setCapacityClamped(Number(e.target.value) || 1)}
              className="w-14 bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            />
            <button
              onClick={() => setCapacityClamped(capacity + 1)}
              className="w-8 h-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              +
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {openSlots > 0
              ? `${openSlots} open slot${openSlots === 1 ? "" : "s"} — anyone can claim it from the kiosk.`
              : "Fully assigned — no open slots left."}
          </p>

          {workers.length === 0 ? (
            <p className="text-sm text-slate-500 mb-3">
              No one on the roster yet — you can still leave this fully open for whoever grabs
              it from the kiosk, or add workers first to assign it directly.
            </p>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Assign directly (optional — leave unchecked to keep it open)
              </label>
              <div className="space-y-1.5 mb-1">
                {workers.map((w) => {
                  const checked = selectedWorkerIds.has(w.id);
                  const disabled = !checked && selectedWorkerIds.size >= capacity;
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer ${
                        disabled
                          ? "border-slate-800 bg-slate-800/20 opacity-40 cursor-not-allowed"
                          : "border-slate-800 bg-slate-800/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleWorker(w.id)}
                        className="w-4 h-4 rounded accent-amber-500 shrink-0"
                      />
                      <span className="text-sm text-slate-100">{w.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 p-5 pt-3 shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const assignedWorkers = [...selectedWorkerIds]
                .map((wid) => workers.find((w) => w.id === wid))
                .filter(Boolean);
              const task = newSharedWorkerTask({
                title: title.trim(),
                jobLabel: jobLabel.trim(),
                capacity,
                assignedWorkers,
                urgency,
                dueDate: dueDate || null,
              });
              onSave([task]);
            }}
            disabled={!canSave}
            className="flex-1 text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkerDetailPage({ worker, tasks, allWorkers = [], onUpdateTask, onBulkUpdateTasks, onDeleteTask, onRequestEdit, onBack }) {
  const [failingTask, setFailingTask] = useState(null);
  const [failReasonDraft, setFailReasonDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const nameFor = (id) => allWorkers.find((w) => w.id === id)?.name || "Someone";

  const setStatus = (task, status) => {
    if (status === "failed") {
      setFailingTask(task);
      setFailReasonDraft("");
      return;
    }
    playSoftTap();
    const nowIso = new Date().toISOString();
    onUpdateTask({
      ...task,
      status,
      startedAt: status === "in_progress" && !task.startedAt ? nowIso : task.startedAt,
      resolvedAt: status === "completed" ? nowIso : null,
      failReason: status === "completed" ? "" : task.failReason,
    });
  };

  const confirmFail = () => {
    if (!failingTask || !failReasonDraft.trim()) return;
    playSaveChime();
    onUpdateTask({
      ...failingTask,
      status: "failed",
      resolvedAt: new Date().toISOString(),
      failReason: failReasonDraft.trim(),
    });
    setFailingTask(null);
  };

  const archiveTask = (task) => onUpdateTask({ ...task, archived: true });
  const unarchiveTask = (task) => onUpdateTask({ ...task, archived: false });
  const archiveAllResolved = () => {
    const toArchive = tasks
      .filter((t) => (t.status === "completed" || t.status === "failed") && !t.archived)
      .map((t) => ({ ...t, archived: true }));
    if (toArchive.length === 0) return;
    onBulkUpdateTasks(toArchive);
  };

  // Stats are computed from every task regardless of archived status —
  // archiving only tidies up the visible list, it never changes what
  // actually counts toward this person's completion rate.
  const counts = WORKER_TASK_STATUSES.reduce((acc, s) => {
    acc[s.key] = tasks.filter((t) => t.status === s.key).length;
    return acc;
  }, {});
  const resolvedCount = counts.completed + counts.failed;
  const completionRate =
    resolvedCount > 0 ? Math.round((counts.completed / resolvedCount) * 100) : null;

  const visibleTasks = tasks.filter((t) => showArchived || !t.archived);
  const archivedCount = tasks.filter((t) => t.archived).length;
  const resolvedUnarchivedCount = tasks.filter(
    (t) => (t.status === "completed" || t.status === "failed") && !t.archived
  ).length;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-slate-100 overflow-y-auto">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="font-semibold text-slate-100">{worker.name}</p>
            <p className="text-xs text-slate-500">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
              {completionRate !== null && ` · ${completionRate}% completion rate`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex flex-wrap gap-2 mb-4">
          {WORKER_TASK_STATUSES.map((s) => (
            <span key={s.key} className={`text-xs rounded-full px-2.5 py-1 border ${s.color}`}>
              {counts[s.key]} {s.label}
            </span>
          ))}
        </div>

        {(resolvedUnarchivedCount > 0 || archivedCount > 0) && (
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {resolvedUnarchivedCount > 0 && (
              <button
                onClick={archiveAllResolved}
                className="text-xs flex items-center gap-1 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-2.5 py-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive {resolvedUnarchivedCount} completed/failed
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

        {visibleTasks.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            {tasks.length === 0
              ? `Nothing assigned to ${worker.name} yet.`
              : "Nothing to show — everything's archived."}
          </p>
        ) : (
          <div className="space-y-5">
            {[...new Map(visibleTasks.map((t) => [t.jobLabel || "No job", t.jobLabel || "No job"])).keys()]
              .sort((a, b) => a.localeCompare(b))
              .map((jobLabel) => (
                <div key={jobLabel}>
                  <p className="font-semibold text-slate-100 mb-2">{jobLabel}</p>
                  <div className="space-y-2">
                    {visibleTasks
                      .filter((t) => (t.jobLabel || "No job") === jobLabel)
                      .map((task) => {
                        const meta = workerTaskStatusMeta(task.status);
                        const isResolved = task.status === "completed" || task.status === "failed";
                        const teammates = (task.assignedWorkerIds || [])
                          .filter((id) => id !== worker.id)
                          .map(nameFor);
                        const openSlots = (task.capacity || 1) - (task.assignedWorkerIds || []).length;
                        return (
                          <div key={task.id} className="border border-slate-800 rounded-lg p-3 bg-slate-900">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <p className="text-sm text-slate-100 truncate">{task.title}</p>
                                <p className="text-xs text-slate-500">
                                  created {task.createdAt}
                                  {teammates.length > 0 && ` · with ${teammates.join(", ")}`}
                                  {openSlots > 0 && !isResolved && ` · ${openSlots} open slot${openSlots === 1 ? "" : "s"}`}
                                </p>
                                {task.status === "in_progress" && task.startedAt && (
                                  <p className="text-xs text-amber-400">
                                    In Progress · Started {formatTaskTimestamp(task.startedAt)}
                                  </p>
                                )}
                                <div className="mt-1">
                                  <TaskMetaBadges task={task} />
                                </div>
                                {task.completionPhotoUrl && (
                                  <img
                                    src={task.completionPhotoUrl}
                                    alt=""
                                    className="w-14 h-14 rounded-md object-cover mt-1.5 border border-slate-800"
                                  />
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => onRequestEdit(task)}
                                  className="text-slate-600 hover:text-amber-400"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(task)}
                                  className="text-slate-600 hover:text-red-400"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            {task.status === "failed" && task.failReason && (
                              <p className="text-xs text-red-400 mb-2">⚠ {task.failReason}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {WORKER_TASK_STATUSES.map((s) => (
                                <button
                                  key={s.key}
                                  onClick={() => setStatus(task, s.key)}
                                  className={`text-xs rounded-full px-2.5 py-1 border ${
                                    task.status === s.key
                                      ? s.color
                                      : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                            {task.archived ? (
                              <button
                                onClick={() => unarchiveTask(task)}
                                className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                              >
                                <Archive className="w-3 h-3" />
                                Archived — tap to restore
                              </button>
                            ) : (
                              isResolved && (
                                <button
                                  onClick={() => archiveTask(task)}
                                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                                >
                                  <Archive className="w-3 h-3" />
                                  Archive
                                </button>
                              )
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      {failingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">
              Why did "{failingTask.title}" fail?
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              A quick reason keeps this useful instead of just a number.
            </p>
            <textarea
              autoFocus
              value={failReasonDraft}
              onChange={(e) => setFailReasonDraft(e.target.value)}
              placeholder="e.g. weather, waiting on parts, reassigned..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/60 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setFailingTask(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmFail}
                disabled={!failReasonDraft.trim()}
                className="flex-1 text-sm rounded-md py-2.5 bg-red-500 text-slate-950 font-semibold hover:bg-red-400 disabled:opacity-40"
              >
                Mark Failed
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDelete
          title="Remove this task?"
          message={`"${deleteTarget.title}" will be permanently removed.`}
          onConfirm={() => {
            onDeleteTask(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function WorkerTasksDashboard({ workers, tasks, hasUnreadActivity, onOpenWorker, onAddTask, onManageRoster, onOpenActivity, onRequestEdit, onClose }) {
  const [tab, setTab] = useState("workers"); // "workers" | "today" | "jobs"

  const statsFor = (workerId) => {
    const wTasks = tasks.filter((t) => (t.assignedWorkerIds || []).includes(workerId));
    const completed = wTasks.filter((t) => t.status === "completed").length;
    const failed = wTasks.filter((t) => t.status === "failed").length;
    const resolved = completed + failed;
    return {
      total: wTasks.length,
      completed,
      failed,
      rate: resolved > 0 ? Math.round((completed / resolved) * 100) : null,
    };
  };

  const nameFor = (id) => workers.find((w) => w.id === id)?.name || "Someone";
  const openTasks = tasks.filter(
    (t) => !t.archived && t.status !== "completed" && (t.assignedWorkerIds || []).length < (t.capacity || 1)
  );

  // "Today" — everything currently active across the whole crew, in one
  // flat list, urgent-and-overdue first. This is the one-glance view that
  // per-worker or per-job browsing can't give you.
  const urgencyRank = { urgent: 0, normal: 1, low: 2 };
  const activeTasks = tasks.filter(
    (t) => !t.archived && t.status !== "completed" && t.status !== "failed"
  );
  const todayTasks = [...activeTasks].sort((a, b) => {
    const overdueDiff = Number(isTaskOverdue(b)) - Number(isTaskOverdue(a));
    if (overdueDiff !== 0) return overdueDiff;
    const urgDiff = (urgencyRank[a.urgency] ?? 1) - (urgencyRank[b.urgency] ?? 1);
    if (urgDiff !== 0) return urgDiff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  // "By job" — same active-task set, grouped by jobLabel instead of by
  // person, for "what's going on with Job 3052" at a glance.
  const jobGroups = activeTasks.reduce((acc, t) => {
    const key = t.jobLabel || "No job";
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});
  const jobNames = Object.keys(jobGroups).sort((a, b) => a.localeCompare(b));

  const TaskRow = ({ task }) => {
    const names = (task.assignedWorkerIds || []).map(nameFor);
    const slotsLeft = (task.capacity || 1) - (task.assignedWorkerIds || []).length;
    const meta = workerTaskStatusMeta(task.status);
    return (
      <button
        onClick={() => onRequestEdit(task)}
        className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 hover:border-slate-700"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-100 truncate">{task.title}</p>
          <span className={`text-[10px] rounded-full px-2 py-0.5 border shrink-0 ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {task.jobLabel ? `${task.jobLabel} · ` : ""}
          {names.length > 0 ? names.join(", ") : "Open"}
          {slotsLeft > 0 && ` · ${slotsLeft} open slot${slotsLeft === 1 ? "" : "s"}`}
        </p>
        <div className="mt-1">
          <TaskMetaBadges task={task} />
        </div>
      </button>
    );
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
              <Users className="w-4 h-4 text-amber-400" />
              Worker Tasks
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onOpenActivity}
              title="Activity"
              className="relative flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <Bell className="w-4 h-4" />
              {hasUnreadActivity && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-slate-900" />
              )}
            </button>
            <button
              onClick={onManageRoster}
              className="text-xs flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-md px-3 py-2 hover:bg-slate-700"
            >
              Roster
            </button>
            <button
              onClick={onAddTask}
              className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-sm font-semibold rounded-md px-3.5 py-2 hover:bg-amber-400"
            >
              <Plus className="w-4 h-4" />
              New task
            </button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-1.5">
          {[
            { key: "workers", label: "By worker" },
            { key: "today", label: "Today" },
            { key: "jobs", label: "By job" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs rounded-md px-3 py-1.5 border ${
                tab === t.key
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  : "border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        {openTasks.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-slate-400 mb-2">
              Open on the kiosk ({openTasks.length})
            </p>
            <div className="space-y-1.5">
              {openTasks.map((t) => {
                const claimed = (t.assignedWorkerIds || []).map(nameFor);
                const slotsLeft = (t.capacity || 1) - claimed.length;
                return (
                  <button
                    key={t.id}
                    onClick={() => onRequestEdit(t)}
                    className="w-full text-left bg-slate-900 border border-dashed border-amber-500/30 rounded-lg px-3 py-2 hover:border-amber-500/60"
                  >
                    <p className="text-sm text-slate-100">
                      {t.title}
                      {t.jobLabel && <span className="text-slate-500"> · {t.jobLabel}</span>}
                    </p>
                    <p className="text-xs text-amber-400/80">
                      {claimed.length > 0 ? `${claimed.join(", ")} · ` : ""}
                      {slotsLeft} open slot{slotsLeft === 1 ? "" : "s"} of {t.capacity || 1}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "workers" &&
          (workers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              No workers on the roster yet — tap "Roster" to add one.
            </p>
          ) : (
            <div className="space-y-2">
              {workers.map((w) => {
                const stats = statsFor(w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => onOpenWorker(w)}
                    className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{w.name}</p>
                      {stats.rate !== null && (
                        <span
                          className={`text-xs rounded-full px-2 py-0.5 border ${
                            stats.rate >= 80
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                              : stats.rate >= 50
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                              : "bg-red-500/15 text-red-300 border-red-500/40"
                          }`}
                        >
                          {stats.rate}% completion
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {stats.total} task{stats.total === 1 ? "" : "s"} · {stats.completed} completed ·{" "}
                      {stats.failed} failed
                    </p>
                  </button>
                );
              })}
            </div>
          ))}

        {tab === "today" &&
          (todayTasks.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Nothing active right now — everything's either done or not started yet.
            </p>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          ))}

        {tab === "jobs" &&
          (jobNames.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">Nothing active right now.</p>
          ) : (
            <div className="space-y-5">
              {jobNames.map((job) => (
                <div key={job}>
                  <p className="font-semibold text-slate-100 mb-2">{job}</p>
                  <div className="space-y-2">
                    {jobGroups[job].map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </main>
    </div>
  );
}

const WORKER_TASKS_KEY = "warehub-worker-tasks";
const WORKERS_KEY = "warehub-workers";
const WORKER_ACTIVITY_KEY = "warehub-worker-activity";
const WORKER_ACTIVITY_LAST_SEEN_KEY = "warehub-worker-activity-last-seen";

// Notification pipeline for the kiosk: every claim/join/start/complete/fail
// action happening on the tablet gets logged here, so the owner has one
// place to see everything going on without walking around checking in.
function logWorkerActivity(entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  return getWithRetry(WORKER_ACTIVITY_KEY).then((result) => {
    const prior = result.ok && result.value ? JSON.parse(result.value) : [];
    const next = [...list, ...prior].slice(0, 200);
    return saveWithRetry(WORKER_ACTIVITY_KEY, JSON.stringify(next));
  });
}

function WorkerActivityFeedModal({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await getWithRetry(WORKER_ACTIVITY_KEY);
        if (result.ok && result.value) setEntries(JSON.parse(result.value));
      } catch {}
      setLoading(false);
      // Mark everything as seen the moment this opens — the bell's unread
      // dot is just "is there anything newer than the last time I looked."
      saveWithRetry(WORKER_ACTIVITY_LAST_SEEN_KEY, JSON.stringify(new Date().toISOString())).catch(() => {});
    })();
  }, []);

  const saveEntries = (next) => {
    setEntries(next);
    saveWithRetry(WORKER_ACTIVITY_KEY, JSON.stringify(next)).catch(() => {});
  };

  const archiveEntry = (id) => {
    saveEntries(entries.map((e) => (e.id === id ? { ...e, archived: true } : e)));
  };
  const unarchiveEntry = (id) => {
    saveEntries(entries.map((e) => (e.id === id ? { ...e, archived: false } : e)));
  };
  const deleteEntry = (id) => {
    saveEntries(entries.filter((e) => e.id !== id));
  };
  const clearAll = () => {
    saveEntries([]);
    setConfirmingClearAll(false);
  };

  const visibleEntries = entries.filter((e) => showArchived || !e.archived);
  const archivedCount = entries.filter((e) => e.archived).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h2 className="text-slate-100 font-semibold text-base flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-400" />
            Activity
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center justify-between px-5 pt-3 shrink-0">
            {archivedCount > 0 ? (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                {showArchived ? "Hide" : "Show"} {archivedCount} archived
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => setConfirmingClearAll(true)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Clear all
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : visibleEntries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              {entries.length === 0
                ? "Nothing yet — claims, joins, and status changes from the kiosk show up here."
                : "Nothing to show — everything's archived."}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleEntries.map((e) => (
                <div key={e.id} className="border border-slate-800 rounded-md px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-100">{e.message}</p>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-slate-600 hover:text-red-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-500">{formatTaskTimestamp(e.time)}</p>
                    {e.archived ? (
                      <button
                        onClick={() => unarchiveEntry(e.id)}
                        className="text-xs text-slate-600 hover:text-slate-300"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => archiveEntry(e.id)}
                        className="text-xs text-slate-600 hover:text-slate-300"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmingClearAll && (
        <ConfirmDelete
          title="Clear all activity?"
          message="Every entry in this feed will be permanently deleted. This can't be undone."
          onConfirm={clearAll}
          onCancel={() => setConfirmingClearAll(false)}
        />
      )}
    </div>
  );
}

function WorkerTasksSection({ onClose }) {
  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkerId, setActiveWorkerId] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [hasUnreadActivity, setHasUnreadActivity] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const wResult = await getWithRetry(WORKERS_KEY);
        if (wResult.ok && wResult.value) setWorkers(JSON.parse(wResult.value));
      } catch {}
      try {
        const tResult = await getWithRetry(WORKER_TASKS_KEY);
        if (tResult.ok && tResult.value) setTasks(JSON.parse(tResult.value).map(migrateWorkerTask));
      } catch {}
      try {
        const [activityResult, lastSeenResult] = await Promise.all([
          getWithRetry(WORKER_ACTIVITY_KEY),
          getWithRetry(WORKER_ACTIVITY_LAST_SEEN_KEY),
        ]);
        const latest =
          activityResult.ok && activityResult.value ? JSON.parse(activityResult.value)[0] : null;
        const lastSeen =
          lastSeenResult.ok && lastSeenResult.value ? JSON.parse(lastSeenResult.value) : null;
        if (latest && (!lastSeen || new Date(latest.time) > new Date(lastSeen))) {
          setHasUnreadActivity(true);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveWorkers = (next) => {
    setWorkers(next);
    saveWithRetry(WORKERS_KEY, JSON.stringify(next)).catch(() => {});
  };
  const saveTasks = (next) => {
    setTasks(next);
    saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const addWorker = (name) => {
    playSaveChime();
    saveWorkers([...workers, { id: uniqueId(), name, pin: "" }]);
  };
  const removeWorker = (id) => {
    saveWorkers(workers.filter((w) => w.id !== id));
  };
  const updatePin = (id, pin) => {
    playSaveChime();
    saveWorkers(workers.map((w) => (w.id === id ? { ...w, pin } : w)));
  };
  const addTask = (newTasks) => {
    playSaveChime();
    saveTasks([...tasks, ...newTasks]);
    setShowAddTask(false);
  };
  const updateTask = (updated) => {
    saveTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
  };
  // For updating several tasks at once (e.g. "archive all resolved") —
  // calling updateTask repeatedly in a loop would have each call read the
  // same stale tasks snapshot and overwrite the previous call's change,
  // leaving only the last one actually applied. This does it in one pass.
  const bulkUpdateTasks = (updatedTasks) => {
    const byId = new Map(updatedTasks.map((t) => [t.id, t]));
    saveTasks(tasks.map((t) => byId.get(t.id) || t));
  };
  const deleteTask = (id) => {
    saveTasks(tasks.filter((t) => t.id !== id));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activeWorker = workers.find((w) => w.id === activeWorkerId) || null;

  if (activeWorker) {
    return (
      <>
        <WorkerDetailPage
          worker={activeWorker}
          tasks={tasks.filter((t) => (t.assignedWorkerIds || []).includes(activeWorker.id))}
          allWorkers={workers}
          onUpdateTask={updateTask}
          onBulkUpdateTasks={bulkUpdateTasks}
          onDeleteTask={deleteTask}
          onRequestEdit={(t) => setEditingTask(t)}
          onBack={() => setActiveWorkerId(null)}
        />
        {editingTask && (
          <WorkerTaskEditForm
            task={editingTask}
            workers={workers}
            onSave={(updated) => {
              updateTask(updated);
              setEditingTask(null);
            }}
            onDelete={(id) => {
              deleteTask(id);
              setEditingTask(null);
            }}
            onCancel={() => setEditingTask(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <WorkerTasksDashboard
        workers={workers}
        tasks={tasks}
        hasUnreadActivity={hasUnreadActivity}
        onOpenWorker={(w) => setActiveWorkerId(w.id)}
        onAddTask={() => setShowAddTask(true)}
        onManageRoster={() => setShowRoster(true)}
        onRequestEdit={(t) => setEditingTask(t)}
        onOpenActivity={() => {
          setShowActivity(true);
          setHasUnreadActivity(false);
        }}
        onClose={onClose}
      />
      {editingTask && (
        <WorkerTaskEditForm
          task={editingTask}
          workers={workers}
          onSave={(updated) => {
            updateTask(updated);
            setEditingTask(null);
          }}
          onDelete={(id) => {
            deleteTask(id);
            setEditingTask(null);
          }}
          onCancel={() => setEditingTask(null)}
        />
      )}
      {showAddTask && (
        <WorkerTaskAddForm workers={workers} onSave={addTask} onCancel={() => setShowAddTask(false)} />
      )}
      {showRoster && (
        <WorkerRosterModal
          workers={workers}
          onAddWorker={addWorker}
          onRemoveWorker={removeWorker}
          onUpdatePin={updatePin}
          onClose={() => setShowRoster(false)}
        />
      )}
      {showActivity && <WorkerActivityFeedModal onClose={() => setShowActivity(false)} />}
    </>
  );
}

const LOVE_LISTS_KEY = "warehub-love-lists";

function LoveListsApp({ isEditor, isOwner, onGoHome }) {
  const [lists, setLists] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerTasks, setWorkerTasks] = useState([]);
  const [staleThresholds, setStaleThresholds] = useState(DEFAULT_STALE_THRESHOLD_DAYS);
  const [loading, setLoading] = useState(true);
  const [activeListId, setActiveListId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showWorkerTasks, setShowWorkerTasks] = useState(false);

  useEffect(() => {
    (async () => {
      let loadedLists = [];
      try {
        const result = await getWithRetry(LOVE_LISTS_KEY);
        if (result.ok && result.value) loadedLists = JSON.parse(result.value);
        setLists(loadedLists);
      } catch {
        // corrupted stored data — start empty
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
        const thresholdsResult = await getWithRetry(STALE_THRESHOLDS_KEY);
        if (thresholdsResult.ok && thresholdsResult.value) {
          setStaleThresholds({ ...DEFAULT_STALE_THRESHOLD_DAYS, ...JSON.parse(thresholdsResult.value) });
        }
      } catch {
        // custom thresholds just won't be available this session — defaults still work fine
      }
      setLoading(false);
      if (isEditor) maybeAutoBackupLoveLists(loadedLists);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveStaleThresholds = (updated) => {
    if (!isEditor) return;
    setStaleThresholds(updated);
    saveWithRetry(STALE_THRESHOLDS_KEY, JSON.stringify(updated)).catch(() => {});
  };

  // Assigning an item creates a real task, not just a label — it shows up
  // in Worker Tasks and counts toward that person's completion rate.
  const assignItemToWorker = (worker, itemLabel, jobLabel, source) => {
    if (!isEditor) return null;
    const task = newWorkerTask(worker.id, worker.name, itemLabel, jobLabel, source);
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

  const updateLists = (updater) => {
    if (!isEditor) return;
    setLists((prev) => {
      const next = updater(prev);
      saveWithRetry(LOVE_LISTS_KEY, JSON.stringify(next)).catch(() => {});
      maybeAutoBackupLoveLists(next);
      return next;
    });
  };

  // Every manual catalog link is a real signal: "when someone writes this
  // phrase, they mean this item." Remembering it means next time OCR or
  // auto-match sees the same inconsistent phrasing, it can suggest the
  // right item with real confidence instead of guessing from scratch.
  const learnCatalogAlias = (catalogId, aliasText) => {
    if (!isEditor || !catalogId || !aliasText || !aliasText.trim()) return;
    const normAlias = normalizeText(aliasText.trim());
    setCatalog((prev) => {
      const next = prev.map((c) => {
        if (c.id !== catalogId) return c;
        if (normalizeText(c.name) === normAlias) return c; // matches the real name already
        const existing = c.aliases || [];
        if (existing.some((a) => normalizeText(a) === normAlias)) return c; // already known
        return { ...c, aliases: [...existing, aliasText.trim()] };
      });
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const activeList = lists.find((l) => l.id === activeListId) || null;

  const handleSaveNewList = ({
    jobLabel,
    subJobLabel,
    submittedBy,
    dateReceived,
    items,
    scanImageUrl,
    extraScanImageUrls,
  }) => {
    if (!isEditor) return;
    const list = {
      id: uniqueId(),
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
      createdAt: timeStamp(),
      archived: false,
    };
    playSaveChime();
    updateLists((prev) => [...prev, list]);
    setShowAddForm(false);
    setShowScanModal(false);
  };

  const handleUpdateList = (updated) => {
    if (!isEditor) return;
    updateLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (activeList) {
    return (
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
        onBack={() => setActiveListId(null)}
        onGoHome={onGoHome}
      />
    );
  }

  return (
    <>
      <LoveListsDashboard
        lists={lists}
        isEditor={isEditor}
        staleThresholds={staleThresholds}
        onSaveThresholds={saveStaleThresholds}
        onOpenList={(l) => setActiveListId(l.id)}
        onAddList={() => setShowAddForm(true)}
        onScanList={() => setShowScanModal(true)}
        onOpenWorkerTasks={() => setShowWorkerTasks(true)}
        onGoHome={onGoHome}
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

// The shop-tablet kiosk: no owner/manager login involved at all — a worker
// walks up, taps their name, enters their PIN, and sees only their own
// stuff plus whatever's open for anyone to grab. Every claim/join/status
// change gets logged to the owner's Activity feed with a real timestamp.
function WorkerKioskApp({ onRequestStaffLogin }) {
  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState("");
  const [failingTask, setFailingTask] = useState(null);
  const [failReasonDraft, setFailReasonDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null);
  const photoInputRef = useRef(null);

  const load = async () => {
    try {
      const wResult = await getWithRetry(WORKERS_KEY);
      if (wResult.ok && wResult.value) setWorkers(JSON.parse(wResult.value));
    } catch {}
    try {
      const tResult = await getWithRetry(WORKER_TASKS_KEY);
      if (tResult.ok && tResult.value) setTasks(JSON.parse(tResult.value).map(migrateWorkerTask));
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const nameFor = (id) => workers.find((w) => w.id === id)?.name || "Someone";

  const saveTasks = async (next) => {
    setTasks(next);
    await saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next));
  };

  const tryPin = () => {
    if (!selectedWorker) return;
    if (!selectedWorker.pin) {
      // No PIN set for this person yet — let them straight in rather than
      // locking them out because the owner hasn't gotten to it.
      setPinError("");
      return;
    }
    if (pinDraft === selectedWorker.pin) {
      setPinError("");
    } else {
      setPinError("Wrong PIN — try again.");
      setPinDraft("");
    }
  };

  const loggedIn = selectedWorker && (!selectedWorker.pin || pinDraft === selectedWorker.pin);

  const logOut = () => {
    setSelectedWorker(null);
    setPinDraft("");
    setPinError("");
    load(); // fresh data for whoever's up next
  };

  // Claiming (task had no one yet) and joining (task already has someone,
  // capacity allows one more) are the same action underneath — add this
  // worker to the list, and if they're the very first person on it, that's
  // also the moment it goes "In Progress · Started at <timestamp>".
  const claimTask = async (task) => {
    if ((task.assignedWorkerIds || []).includes(selectedWorker.id)) return;
    const wasEmpty = (task.assignedWorkerIds || []).length === 0;
    const nowIso = new Date().toISOString();
    const updated = {
      ...task,
      assignedWorkerIds: [...(task.assignedWorkerIds || []), selectedWorker.id],
      status: task.status === "not_started" ? "in_progress" : task.status,
      startedAt: task.status === "not_started" && !task.startedAt ? nowIso : task.startedAt,
    };
    playSaveChime();
    await saveTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    logWorkerActivity({
      id: uniqueId(),
      time: nowIso,
      message: `${selectedWorker.name} ${wasEmpty ? "claimed" : "joined"} "${task.title}"${
        task.jobLabel ? ` (${task.jobLabel})` : ""
      }${!wasEmpty ? ` — now In Progress, started at ${formatTaskTimestamp(nowIso)}` : ""}`,
    }).catch(() => {});
  };

  const setStatus = async (task, status) => {
    if (status === "failed") {
      setFailingTask(task);
      setFailReasonDraft("");
      return;
    }
    const nowIso = new Date().toISOString();
    const updated = {
      ...task,
      status,
      startedAt: status === "in_progress" && !task.startedAt ? nowIso : task.startedAt,
      resolvedAt: status === "completed" ? nowIso : null,
      failReason: status === "completed" ? "" : task.failReason,
    };
    playSaveChime();
    await saveTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    logWorkerActivity({
      id: uniqueId(),
      time: nowIso,
      message: `${selectedWorker.name} marked "${task.title}" ${workerTaskStatusMeta(status).label}${
        task.jobLabel ? ` (${task.jobLabel})` : ""
      }`,
    }).catch(() => {});
  };

  const confirmFail = async () => {
    if (!failingTask || !failReasonDraft.trim()) return;
    const nowIso = new Date().toISOString();
    const updated = {
      ...failingTask,
      status: "failed",
      resolvedAt: nowIso,
      failReason: failReasonDraft.trim(),
    };
    playSaveChime();
    await saveTasks(tasks.map((t) => (t.id === failingTask.id ? updated : t)));
    logWorkerActivity({
      id: uniqueId(),
      time: nowIso,
      message: `${selectedWorker.name} marked "${failingTask.title}" Failed — ${failReasonDraft.trim()}`,
    }).catch(() => {});
    setFailingTask(null);
  };

  // Hand-off — a worker giving back a task they claimed but can't finish.
  // Just removes them from the assignee list; if that leaves no one on it
  // at all, it reopens fully (back to not_started, clock reset) since
  // nobody's actually working it anymore. If others are still on it
  // (multi-person task), it just stays in_progress for them.
  const releaseTask = async (task) => {
    const nowIso = new Date().toISOString();
    const remaining = (task.assignedWorkerIds || []).filter((id) => id !== selectedWorker.id);
    const nowEmpty = remaining.length === 0;
    const updated = {
      ...task,
      assignedWorkerIds: remaining,
      workerId: remaining[0] || null,
      workerName: nameFor(remaining[0]) === "Someone" ? null : nameFor(remaining[0]),
      status: nowEmpty ? "not_started" : task.status,
      startedAt: nowEmpty ? null : task.startedAt,
    };
    playSoftTap();
    await saveTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    logWorkerActivity({
      id: uniqueId(),
      time: nowIso,
      message: `${selectedWorker.name} gave back "${task.title}"${
        task.jobLabel ? ` (${task.jobLabel})` : ""
      }${nowEmpty ? " — now open again" : ""}`,
    }).catch(() => {});
  };

  const attachPhoto = async (task, file) => {
    setUploadingPhotoFor(task.id);
    const result = await uploadWorkerTaskPhoto(file);
    setUploadingPhotoFor(null);
    if (!result.ok) return;
    playSaveChime();
    const updated = { ...task, completionPhotoUrl: result.url };
    await saveTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    logWorkerActivity({
      id: uniqueId(),
      time: new Date().toISOString(),
      message: `${selectedWorker.name} attached a photo to "${task.title}"${
        task.jobLabel ? ` (${task.jobLabel})` : ""
      }`,
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Step 1 — tap your name
  if (!selectedWorker) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between">
          <p className="font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4 text-amber-400" />
            Worker Kiosk
          </p>
          <button
            onClick={onRequestStaffLogin}
            className="text-slate-600 hover:text-slate-400 text-xs flex items-center gap-1"
          >
            <Lock className="w-3 h-3" />
            Staff login
          </button>
        </header>
        <main className="flex-1 max-w-md mx-auto w-full px-4 py-10">
          <p className="text-sm text-slate-400 mb-4 text-center">Who's this?</p>
          {workers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center">
              No one's on the roster yet — ask the office to add workers first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {workers.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedWorker(w);
                    setPinDraft("");
                    setPinError("");
                  }}
                  className="bg-slate-900 border-2 border-slate-800 hover:border-amber-500/60 rounded-xl py-6 text-center"
                >
                  <p className="text-base font-semibold text-slate-100">{w.name}</p>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Step 2 — PIN
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4">
        <p className="text-lg font-semibold mb-1">{selectedWorker.name}</p>
        <p className="text-xs text-slate-500 mb-5">Enter your PIN</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && tryPin()}
          className="w-40 bg-slate-800 border border-slate-700 text-slate-100 text-2xl tracking-[0.5em] text-center rounded-md px-3 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        />
        {pinError && <p className="text-xs text-red-400 mb-3">{pinError}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedWorker(null)}
            className="text-sm rounded-md py-2.5 px-4 border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Not you? Go back
          </button>
          <button
            onClick={tryPin}
            className="text-sm rounded-md py-2.5 px-5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  // Step 3 — their account: my tasks + open tasks to claim
  const myTasks = tasks.filter(
    (t) =>
      !t.archived &&
      (t.assignedWorkerIds || []).includes(selectedWorker.id) &&
      t.status !== "completed" &&
      t.status !== "failed"
  );
  const openTasks = tasks.filter(
    (t) =>
      !t.archived &&
      t.status !== "completed" &&
      !(t.assignedWorkerIds || []).includes(selectedWorker.id) &&
      (t.assignedWorkerIds || []).length < (t.capacity || 1)
  );
  const historyTasks = tasks
    .filter(
      (t) =>
        (t.assignedWorkerIds || []).includes(selectedWorker.id) &&
        (t.status === "completed" || t.status === "failed")
    )
    .sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0))
    .slice(0, 15);

  const TaskCard = ({ task, mode }) => {
    const meta = workerTaskStatusMeta(task.status);
    const claimedNames = (task.assignedWorkerIds || []).map(nameFor);
    const slotsLeft = (task.capacity || 1) - (task.assignedWorkerIds || []).length;
    const isResolved = task.status === "completed" || task.status === "failed";
    return (
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm text-slate-100">{task.title}</p>
          <span className={`text-xs rounded-full px-2 py-0.5 border shrink-0 ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        {task.jobLabel && <p className="text-xs text-slate-500 mb-1">{task.jobLabel}</p>}
        <div className="mb-1">
          <TaskMetaBadges task={task} />
        </div>
        {claimedNames.length > 0 && (
          <p className="text-xs text-slate-500 mb-1">With: {claimedNames.join(", ")}</p>
        )}
        {task.status === "in_progress" && task.startedAt && (
          <p className="text-xs text-amber-400 mb-1">
            In Progress · Started {formatTaskTimestamp(task.startedAt)}
          </p>
        )}
        {mode === "history" && task.resolvedAt && (
          <p className="text-xs text-slate-500 mb-1">
            {meta.label} · {formatTaskTimestamp(task.resolvedAt)}
          </p>
        )}
        {task.status === "failed" && task.failReason && (
          <p className="text-xs text-red-400 mb-1">⚠ {task.failReason}</p>
        )}
        {task.completionPhotoUrl && (
          <img
            src={task.completionPhotoUrl}
            alt=""
            className="w-16 h-16 rounded-md object-cover mb-1 border border-slate-800"
          />
        )}
        {mode === "open" ? (
          <button
            onClick={() => claimTask(task)}
            className="w-full mt-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
          >
            {claimedNames.length > 0 ? `Join (${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left)` : "Claim this task"}
          </button>
        ) : mode === "mine" ? (
          <>
            <div className="flex gap-1.5 mt-2">
              {task.status !== "in_progress" && (
                <button
                  onClick={() => setStatus(task, "in_progress")}
                  className="flex-1 text-xs rounded-md py-2 border border-slate-700 text-slate-200 hover:bg-slate-800"
                >
                  Start
                </button>
              )}
              <button
                onClick={() => setStatus(task, "completed")}
                className="flex-1 text-xs rounded-md py-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
              >
                Complete
              </button>
              <button
                onClick={() => setStatus(task, "failed")}
                className="flex-1 text-xs rounded-md py-2 bg-red-500/15 border border-red-500/40 text-red-300 hover:bg-red-500/25"
              >
                Failed
              </button>
            </div>
            <button
              onClick={() => releaseTask(task)}
              className="w-full mt-1.5 text-xs text-slate-500 hover:text-amber-400"
            >
              Give this back
            </button>
          </>
        ) : (
          isResolved && (
            <button
              onClick={() => {
                setUploadingPhotoFor(task);
                photoInputRef.current?.click();
              }}
              disabled={uploadingPhotoFor === task.id}
              className="w-full mt-1 text-xs text-slate-500 hover:text-amber-400 flex items-center justify-center gap-1"
            >
              <Camera className="w-3.5 h-3.5" />
              {uploadingPhotoFor === task.id
                ? "Uploading..."
                : task.completionPhotoUrl
                ? "Replace photo"
                : "Add photo"}
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (file && uploadingPhotoFor) attachPhoto(uploadingPhotoFor, file);
        }}
      />
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <p className="font-semibold">{selectedWorker.name}</p>
        <button onClick={logOut} className="text-slate-400 hover:text-slate-200 text-sm">
          Not you? Switch
        </button>
      </header>
      <main className="max-w-md mx-auto px-4 py-5">
        <p className="text-xs font-medium text-slate-400 mb-2">
          My tasks ({myTasks.length})
        </p>
        <div className="space-y-2 mb-6">
          {myTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Nothing assigned right now.</p>
          ) : (
            myTasks.map((t) => <TaskCard key={t.id} task={t} mode="mine" />)
          )}
        </div>

        <p className="text-xs font-medium text-slate-400 mb-2">
          Open tasks ({openTasks.length})
        </p>
        <div className="space-y-2 mb-6">
          {openTasks.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">Nothing open to grab right now.</p>
          ) : (
            openTasks.map((t) => <TaskCard key={t.id} task={t} mode="open" />)
          )}
        </div>

        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full text-left text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5"
        >
          <History className="w-3.5 h-3.5" />
          My history ({historyTasks.length}) {showHistory ? "▲" : "▼"}
        </button>
        {showHistory && (
          <div className="space-y-2">
            {historyTasks.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">Nothing finished yet.</p>
            ) : (
              historyTasks.map((t) => <TaskCard key={t.id} task={t} mode="history" />)
            )}
          </div>
        )}
      </main>

      {failingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1">
              Why did "{failingTask.title}" fail?
            </h3>
            <textarea
              autoFocus
              value={failReasonDraft}
              onChange={(e) => setFailReasonDraft(e.target.value)}
              placeholder="e.g. weather, waiting on parts..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-md px-3 py-2 mb-4 mt-3 focus:outline-none focus:ring-2 focus:ring-red-500/60 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setFailingTask(null)}
                className="flex-1 text-sm rounded-md py-2.5 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmFail}
                disabled={!failReasonDraft.trim()}
                className="flex-1 text-sm rounded-md py-2.5 bg-red-500 text-slate-950 font-semibold hover:bg-red-400 disabled:opacity-40"
              >
                Mark Failed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const RECEIVING_QUEUE_KEY = "warehub-receiving-queue";
// Separate from the queue above — this is for receipts you just want on
// record and searchable, without ever pulling items out of them into a
// job or Love List. Nothing here ever touches inventory.
const RECEIPT_ARCHIVE_KEY = "warehub-receipt-archive";
// Remembers the exact confirmed name for a specific raw OCR string, once
// you've typed and linked it — separate from catalog matching itself.
// This is what lets a size-specific line ("...4LB SLEDGE...") auto-fill
// correctly next time without ever guessing at a size from the text.
const RECEIVING_NAME_MEMORY_KEY = "warehub-receiving-name-memory";

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
function computeJobItemStatus(qtyHave, qtyNeeded) {
  if (qtyHave >= (Number(qtyNeeded) || 0)) return "green";
  if (qtyHave > 0) return "yellow";
  return "red";
}

// Same idea for the separate "Ordered / Not received / Partially
// received" pill — a merge changes quantity on both the item you're
// folding away and the one it's going into, so both need this
// recalculated, not just the status dot.
function computeJobItemReceived(qtyHave, qtyNeeded) {
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
function computeUsualVendor(vendorHistory) {
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

function poContainsJobNumber(poNumber, jobNumber) {
  if (!poNumber || !jobNumber) return false;
  const normJob = jobNumber.trim().toLowerCase();
  if (!normJob) return false;
  const whole = poNumber.trim().toLowerCase();
  if (whole === normJob) return true;
  const segments = poNumber.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return segments.some((seg) => seg.toLowerCase() === normJob);
}

function convertQtyForUnit(qty, fromUnit, toUnit) {
  const norm = (u) => (u || "each").trim().toLowerCase();
  const from = norm(fromUnit);
  const to = norm(toUnit);
  if (from === to) return qty;
  const isDozen = (u) => ["doz", "dozen", "dz"].includes(u);
  const isEach = (u) => ["each", "ea", "ea.", "pc", "pcs"].includes(u);
  if (isEach(from) && isDozen(to)) return qty / 12;
  if (isDozen(from) && isEach(to)) return qty * 12;
  return qty;
}

// Attaches every page of a receipt to a Job's Reference Documents once any
// of its lines actually get applied there — checked by storage path so a
// receipt spanning multiple approve passes (or multiple lines landing on
// the same job) only ever gets attached once per page, not duplicated.
function attachReceiptPhotoToJob(job, batch) {
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
function attachReceiptPhotoToLoveList(list, batch) {
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
function buildSourceReceiptSnapshot(batch) {
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

function applyReceiptLineToJob(job, line, catalog, batch) {
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

function applyReceiptLineToLoveList(list, line, catalog, batch) {
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

// Lets a Job or Love List pull a receipt straight in, without going
// through the standalone Receiving section at all — same review/approve
// mechanics, same shared apply-logic, just scoped to whichever job/list
// you're already looking at, with the target implied instead of picked.
function PullFromReceivingModal({ targetType, targetLabel, target, onApplyToTarget, onClose }) {
  const [queue, setQueue] = useState([]);
  // Same fix as ReceivingApp's queueRef — keeps every mutation reading
  // the truly latest state instead of whatever a given closure happened
  // to capture, which is what was causing the debounced catalog-match
  // update to silently revert the last character typed.
  const queueRef = useRef([]);
  const [catalog, setCatalog] = useState([]);
  const [nameMemory, setNameMemory] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [relinkingLine, setRelinkingLine] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [qResult, cResult, nResult] = await Promise.all([
          getWithRetry(RECEIVING_QUEUE_KEY),
          getWithRetry(CATALOG_KEY),
          getWithRetry(RECEIVING_NAME_MEMORY_KEY),
        ]);
        if (qResult.ok && qResult.value) {
          const loaded = JSON.parse(qResult.value);
          setQueue(loaded);
          queueRef.current = loaded;
        }
        if (cResult.ok && cResult.value) setCatalog(JSON.parse(cResult.value));
        if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveQueue = (next) => {
    queueRef.current = next;
    setQueue(next);
    saveWithRetry(RECEIVING_QUEUE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const learnAlias = (catalogId, aliasText) => {
    if (!catalogId || !aliasText || !aliasText.trim()) return;
    const normAlias = normalizeText(aliasText.trim());
    setCatalog((prev) => {
      const next = prev.map((c) => {
        if (c.id !== catalogId) return c;
        if (normalizeText(c.name) === normAlias) return c;
        const existing = c.aliases || [];
        if (existing.some((a) => normalizeText(a) === normAlias)) return c;
        return { ...c, aliases: [...existing, aliasText.trim()] };
      });
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  // Same vendor-spend logging as the standalone Receiving screen — see
  // that one for the full explanation.
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

  const pending = queue.filter((b) => b.status === "pending");
  const selectedBatch = queue.find((b) => b.id === selectedBatchId) || null;

  const updateSelectedBatch = (changes) => {
    // Looked up fresh from queueRef rather than closing over the
    // `selectedBatch` derived value — same fix as ReceivingApp's
    // updateBatch, and for the same reason: a debounced callback can
    // hold onto a closure from before the most recent keystroke landed.
    const current = queueRef.current.find((b) => b.id === selectedBatchId);
    if (!current) return;
    const updated = { ...current, ...changes };
    saveQueue(queueRef.current.map((b) => (b.id === updated.id ? updated : b)));
  };
  const updateLine = (lineId, changes) => {
    const current = queueRef.current.find((b) => b.id === selectedBatchId);
    if (!current) return;
    updateSelectedBatch({
      lines: current.lines.map((l) => (l.id === lineId ? { ...l, ...changes } : l)),
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
      const currentBatch = queueRef.current.find((b) => b.id === selectedBatchId);
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
    updateSelectedBatch({ lines: selectedBatch.lines.filter((l) => l.id !== lineId) });
  };
  const cloneLine = (lineId) => {
    const idx = selectedBatch.lines.findIndex((l) => l.id === lineId);
    if (idx === -1) return;
    const clone = { ...selectedBatch.lines[idx], id: uniqueId() };
    const nextLines = [
      ...selectedBatch.lines.slice(0, idx + 1),
      clone,
      ...selectedBatch.lines.slice(idx + 1),
    ];
    updateSelectedBatch({ lines: nextLines });
  };

  // Only lines nobody's already claimed for a different job/list, and
  // that haven't already been processed, show up here — this is a
  // claiming action scoped to whatever job/list you opened this from,
  // not a takeover of the whole receipt.
  const availableLines = selectedBatch ? selectedBatch.lines.filter((l) => !l.targetId && !l.approved) : [];

  const approve = () => {
    const validLines = availableLines.filter((l) => l.name.trim());
    recordVendorPurchases(validLines);
    let updatedTarget = target;
    validLines.forEach((line) => {
      updatedTarget =
        targetType === "job"
          ? applyReceiptLineToJob(updatedTarget, line, catalog, selectedBatch)
          : applyReceiptLineToLoveList(updatedTarget, line, catalog, selectedBatch);
    });
    if (validLines.length > 0) {
      updatedTarget =
        targetType === "job"
          ? attachReceiptPhotoToJob(updatedTarget, selectedBatch)
          : attachReceiptPhotoToLoveList(updatedTarget, selectedBatch);
    }
    onApplyToTarget(updatedTarget);

    const nextMemory = { ...nameMemory };
    validLines.forEach((line) => {
      if (line.rawName) nextMemory[normalizeText(line.rawName)] = line.name.trim();
    });
    saveWithRetry(RECEIVING_NAME_MEMORY_KEY, JSON.stringify(nextMemory)).catch(() => {});

    playSaveChime();
    // Claimed lines stay on the batch, marked done with exactly which
    // target claimed them — an approved receipt keeps its real contents
    // on record this way, instead of the claimed lines just vanishing.
    const updatedLines = selectedBatch.lines.map((l) =>
      validLines.includes(l) ? { ...l, targetType, targetId: target.id, approved: true } : l
    );
    const stillPending = updatedLines.some((l) => l.name.trim() && !l.approved);
    const updatedBatch = stillPending
      ? { ...selectedBatch, lines: updatedLines }
      : { ...selectedBatch, lines: updatedLines, status: "approved", approvedAt: new Date().toISOString() };
    saveQueue(queueRef.current.map((b) => (b.id === selectedBatch.id ? updatedBatch : b)));
    setConfirmingApprove(false);
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Step 1 — pick which pending receipt this is
  if (!selectedBatch) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <h2 className="text-slate-100 font-semibold text-base">Pull from Receiving</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {pending.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Nothing waiting in Receiving right now.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    className="w-full text-left bg-slate-800/40 border border-slate-800 rounded-lg p-3 hover:border-slate-700 flex items-center gap-3"
                  >
                    {b.photoUrl && (
                      <img src={b.photoUrl} alt="" className="w-11 h-11 rounded-md object-cover border border-slate-800 shrink-0" />
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
    );
  }

  // Step 2 — edit lines, then approve straight into this job/list
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 overflow-y-auto">
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button
          onClick={() => setSelectedBatchId(null)}
          className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
          <X className="w-5 h-5" />
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          Adding to <span className="text-slate-300">{targetLabel}</span> — nothing's added
          until you approve below.
        </p>
        {selectedBatch.photoUrl && (
          <button
            onClick={() => setViewingPhoto(selectedBatch.photoUrl)}
            className="w-full mb-4 rounded-lg overflow-hidden border border-slate-800"
          >
            <img src={selectedBatch.photoUrl} alt="Receipt" className="w-full max-h-48 object-cover" />
          </button>
        )}
        <div className="space-y-2 mb-6">
          {availableLines.map((line) => {
            const match = line.catalogId ? catalog.find((c) => c.id === line.catalogId) : null;
            return (
              <div key={line.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    value={line.name}
                    onChange={(e) => handleNameChange(line.id, e.target.value)}
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
                    className="text-[11px] text-emerald-400 hover:underline decoration-dotted"
                  >
                    🔗 linked to "{match.name}" · Change
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setRelinkingLine(line);
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
      </main>

      <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setConfirmingApprove(true)}
            disabled={!availableLines.some((l) => l.name.trim())}
            className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            Approve &amp; add to {targetLabel}
          </button>
        </div>
      </div>

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
                  onClick={() => {
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
                      updateLine(relinkingLine.id, { catalogId: c.id, catalogLinkedManually: true });
                      learnAlias(c.id, relinkingLine.rawName);
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

      {confirmingApprove && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-sm p-5">
            <h3 className="text-slate-100 font-semibold mb-1.5">Approve this receipt?</h3>
            <p className="text-slate-400 text-sm mb-5">
              {availableLines.filter((l) => l.name.trim()).length} item(s) will be added to{" "}
              {targetLabel}. Review carefully — this writes real inventory changes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingApprove(false)}
                className="flex-1 text-sm rounded-md py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={approve}
                className="flex-1 text-sm rounded-md py-2 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Merges an imported item's quantity into an existing one — moves however
// much is needed to fill the target (never overfills it), and leaves
// whatever's left over sitting on the source. If the source empties out
// completely, it's removed outright rather than lingering as a
// zero-quantity leftover. Job items track quantity through a list of
// containers rather than one flat number, so the moved amount specifically
// comes out of (and goes into) each item's "Unassigned" bucket — the same
// place Receiving always drops freshly-shipped stock before it's sorted.
function mergeJobItems(items, sourceId, targetId) {
  const sourceIdx = items.findIndex((i) => i.id === sourceId);
  const targetIdx = items.findIndex((i) => i.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1 || sourceId === targetId) return items;

  const source = items[sourceIdx];
  const target = items[targetIdx];
  const sourceHave = totalHave(source.containers);
  const targetHave = totalHave(target.containers);
  const remainingNeed = Math.max(0, (Number(target.qtyNeeded) || 0) - targetHave);
  // Convert what the source has into the target's unit before comparing —
  // "12 each" and "1 doz" are the same physical amount, but comparing the
  // raw numbers alone would treat them as wildly different quantities.
  const sourceHaveInTargetUnits = convertQtyForUnit(sourceHave, source.qtyUnit, target.qtyUnit);
  const absorbInTargetUnits = Math.min(sourceHaveInTargetUnits, remainingNeed);
  if (absorbInTargetUnits <= 0) return items;
  const absorb = convertQtyForUnit(absorbInTargetUnits, target.qtyUnit, source.qtyUnit);

  let toRemove = absorb;
  const sourceContainers = (source.containers || []).map((c) => ({ ...c }));
  const unassignedIdx = sourceContainers.findIndex((c) => c.name === "Unassigned");
  if (unassignedIdx !== -1) {
    const take = Math.min(sourceContainers[unassignedIdx].qty, toRemove);
    sourceContainers[unassignedIdx].qty -= take;
    toRemove -= take;
  }
  for (let i = 0; i < sourceContainers.length && toRemove > 0; i++) {
    if (i === unassignedIdx) continue;
    const take = Math.min(sourceContainers[i].qty, toRemove);
    sourceContainers[i].qty -= take;
    toRemove -= take;
  }
  const cleanedSourceContainers = sourceContainers.filter((c) => c.qty > 0);

  const targetContainers = (target.containers || []).map((c) => ({ ...c }));
  const targetUnassignedIdx = targetContainers.findIndex((c) => c.name === "Unassigned");
  if (targetUnassignedIdx !== -1) {
    targetContainers[targetUnassignedIdx].qty += absorbInTargetUnits;
  } else {
    targetContainers.push({ name: "Unassigned", qty: absorbInTargetUnits });
  }

  const newSourceHave = totalHave(cleanedSourceContainers);
  const newTargetHave = totalHave(targetContainers);
  let nextItems = items.map((i, idx) => {
    if (idx === targetIdx)
      return {
        ...target,
        containers: targetContainers,
        qtyHave: newTargetHave,
        status: computeJobItemStatus(newTargetHave, target.qtyNeeded),
        ordered: true,
        received: computeJobItemReceived(newTargetHave, target.qtyNeeded),
      };
    if (idx === sourceIdx)
      return {
        ...source,
        containers: cleanedSourceContainers,
        qtyHave: newSourceHave,
        status: computeJobItemStatus(newSourceHave, source.qtyNeeded),
        received: computeJobItemReceived(newSourceHave, source.qtyNeeded),
        importedViaReceiving: newSourceHave > 0 ? source.importedViaReceiving : false,
      };
    return i;
  });
  if (newSourceHave === 0) nextItems = nextItems.filter((i) => i.id !== sourceId);
  return nextItems;
}

// Same idea for Love List items, which just track Have as one flat number
// rather than a list of containers.
function mergeLoveListItems(items, sourceId, targetId) {
  const sourceIdx = items.findIndex((i) => i.id === sourceId);
  const targetIdx = items.findIndex((i) => i.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1 || sourceId === targetId) return items;

  const source = items[sourceIdx];
  const target = items[targetIdx];
  const sourceHave = source.qtyHave || 0;
  const targetHave = target.qtyHave || 0;
  const remainingNeed = Math.max(0, (target.qty || 0) - targetHave);
  const sourceHaveInTargetUnits = convertQtyForUnit(sourceHave, source.qtyUnit, target.qtyUnit);
  const absorbInTargetUnits = Math.min(sourceHaveInTargetUnits, remainingNeed);
  if (absorbInTargetUnits <= 0) return items;
  const absorb = convertQtyForUnit(absorbInTargetUnits, target.qtyUnit, source.qtyUnit);

  const newSourceHave = sourceHave - absorb;
  let nextItems = items.map((i, idx) => {
    if (idx === targetIdx) return { ...target, qtyHave: targetHave + absorbInTargetUnits };
    if (idx === sourceIdx)
      return {
        ...source,
        qtyHave: newSourceHave,
        importedViaReceiving: newSourceHave > 0 ? source.importedViaReceiving : false,
      };
    return i;
  });
  if (newSourceHave === 0) nextItems = nextItems.filter((i) => i.id !== sourceId);
  return nextItems;
}

function newReceiptBatch(photoUrl, path, lines, meta = {}) {
  return {
    id: uniqueId(),
    label: "", // optional placeholder name — "Pallet 2", "Beater Pallet", etc.
    photoUrl,
    photoPath: path,
    // Extra pages absorbed from combining separately-scanned receipts —
    // the first page stays the primary photo/path above, everything else
    // lands here.
    extraPhotoUrls: [],
    extraPhotoPaths: [],
    // Whatever page indicator the receipt itself prints ("Page 2 of 3"),
    // when there is one — 1/1 means no indicator was found, i.e. this
    // is presumed to just be a single-page document.
    pageNumber: meta.pageNumber || 1,
    totalPages: meta.totalPages || 1,
    // When present, the strongest available signal for confirming two
    // pages actually belong to the same document — used only to narrow
    // down multi-page grouping, not surfaced anywhere else.
    orderNumber: meta.orderNumber || "",
    // Header fields used for job-matching suggestions, vendor spend
    // tracking, and protecting backorder numbers from being overwritten
    // by an older, already-superseded receipt processed out of order.
    vendor: meta.vendor || "",
    poNumber: meta.poNumber || "",
    receiptDate: meta.receiptDate || "",
    scannedAt: new Date().toISOString(),
    status: "pending", // "pending" | "approved" | "discarded" — approved once every line's been applied somewhere
    lines,
    approvedAt: null,
  };
}

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
              onClick={() => onViewPhoto(batch.photoUrl)}
              className="w-full rounded-lg overflow-hidden border border-slate-800"
            >
              <img src={batch.photoUrl} alt="Receipt" className="w-full max-h-56 object-cover" />
            </button>
            {(batch.extraPhotoUrls || []).length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {batch.extraPhotoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => onViewPhoto(url)}
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

// Fullscreen stepper for eyeballing a detected group's pages side by
// side without hunting through the whole pending list — arrow keys or
// the on-screen buttons move between them, each still fully zoomable via
// ZoomableImage in case a detail needs a closer look.
function GroupPhotoStepper({ photos, onClose }) {
  const [index, setIndex] = useState(0);
  const current = photos[index];

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photos.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-slate-300">
        <span className="text-sm">
          Page {current.pageNumber} · {index + 1} of {photos.length}
        </span>
        <button onClick={onClose} className="text-slate-300 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0 relative">
        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white disabled:opacity-20 p-2"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <ZoomableImage key={current.url} src={current.url} alt={`Page ${current.pageNumber}`} />
        <button
          onClick={() => setIndex((i) => Math.min(i + 1, photos.length - 1))}
          disabled={index === photos.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white disabled:opacity-20 p-2"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>
      <div className="flex justify-center gap-1.5 pb-4">
        {photos.map((p, i) => (
          <button
            key={p.batchId}
            onClick={() => setIndex(i)}
            className={`w-2 h-2 rounded-full ${i === index ? "bg-amber-400" : "bg-slate-700"}`}
          />
        ))}
      </div>
    </div>
  );
}

// One place to see everything currently on backorder, across every job
// and every Love List at once, sorted by how long it's been waiting.
// Read-only — this is a look-back view, not another place to edit
// inventory; go to the actual job or Love List for that.
function BackorderDashboard({ onGoHome }) {
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

// A simple, searchable photo log for receipts you just want on record —
// no line items, no target, no approval step. Scan it, and it's saved;
// the only thing you can do afterward is search and look back at it.
function ReceiptArchive({ onGoHome }) {
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
  const entriesRef = useRef([]);
  const catalogRef = useRef([]);
  const fileInputRef = useRef(null);
  const nameDebounceTimers = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const [eResult, cResult, nResult] = await Promise.all([
          getWithRetry(RECEIPT_ARCHIVE_KEY),
          getWithRetry(CATALOG_KEY),
          getWithRetry(RECEIVING_NAME_MEMORY_KEY),
        ]);
        if (eResult.ok && eResult.value) {
          const loaded = JSON.parse(eResult.value);
          setEntries(loaded);
          entriesRef.current = loaded;
        }
        if (cResult.ok && cResult.value) {
          const loadedCatalog = JSON.parse(cResult.value);
          setCatalog(loadedCatalog);
          catalogRef.current = loadedCatalog;
        }
        if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveEntries = (next) => {
    entriesRef.current = next;
    setEntries(next);
    saveWithRetry(RECEIPT_ARCHIVE_KEY, JSON.stringify(next)).catch(() => {});
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
    const normAlias = normalizeText(aliasText.trim());
    const next = catalogRef.current.map((c) => {
      if (c.id !== catalogId) return c;
      if (normalizeText(c.name) === normAlias) return c;
      const existing = c.aliases || [];
      if (existing.some((a) => normalizeText(a) === normAlias)) return c;
      return { ...c, aliases: [...existing, aliasText.trim()] };
    });
    saveCatalog(next);
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
      const match = rawName.trim() ? findCatalogMatch(rawName, matchCatalog) : null;
      const remembered = nameMemory[normalizeText(rawName)];
      return {
        id: uniqueId(),
        rawName,
        name: remembered || rawName,
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

  if (loading) {
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
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back</span>
        </button>
        <p className="font-semibold flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-amber-400" />
          Receipt Archive
        </p>
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
      </header>
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
        {filtered.length > 0 && (
          <button
            onClick={() => setConfirmingDeleteAll(true)}
            className="text-xs text-slate-500 hover:text-red-400 mb-4 block"
          >
            Delete all {filtered.length} shown
          </button>
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
                onClick={() => setViewingEntry(e)}
                className="w-full text-left bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3 hover:border-slate-700"
              >
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
                <span
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setDeleteTarget(e);
                  }}
                  className="text-slate-600 hover:text-red-400 shrink-0 p-1"
                >
                  <X className="w-4 h-4" />
                </span>
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
            <button onClick={() => setDeleteTarget(viewingEntry)} className="text-slate-500 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
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
            </div>

            <button
              onClick={() => setConfirmingSendToReceiving(viewingEntry)}
              className="w-full text-left text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-700 rounded-md px-3 py-2 mb-4"
            >
              📥{" "}
              {viewingEntry.sentToReceiving
                ? "Send to Receiving again (creates another pending receipt)"
                : "Send to Receiving — assign these items to a job or Love List"}
            </button>

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
    </div>
  );
}

function ReceivingApp({ onGoHome }) {
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
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmingClearDiscarded, setConfirmingClearDiscarded] = useState(false);
  const [confirmingClearAllHistory, setConfirmingClearAllHistory] = useState(false);
  const [viewingHistoryBatch, setViewingHistoryBatch] = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    try {
      const [qResult, jResult, lResult, cResult, nResult] = await Promise.all([
        getWithRetry(RECEIVING_QUEUE_KEY),
        getWithRetry(JOBS_KEY),
        getWithRetry(LOVE_LISTS_KEY),
        getWithRetry(CATALOG_KEY),
        getWithRetry(RECEIVING_NAME_MEMORY_KEY),
      ]);
      if (qResult.ok && qResult.value) {
        const loaded = JSON.parse(qResult.value);
        setQueue(loaded);
        queueRef.current = loaded;
      }
      if (jResult.ok && jResult.value) setJobs(JSON.parse(jResult.value));
      if (lResult.ok && lResult.value) setLists(JSON.parse(lResult.value));
      if (cResult.ok && cResult.value) setCatalog(JSON.parse(cResult.value));
      if (nResult.ok && nResult.value) setNameMemory(JSON.parse(nResult.value));
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const saveQueue = (next) => {
    queueRef.current = next;
    setQueue(next);
    saveWithRetry(RECEIVING_QUEUE_KEY, JSON.stringify(next)).catch(() => {});
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
      const match = findCatalogMatch(rawName, catalog);
      const remembered = nameMemory[normalizeText(rawName)];
      // The catalog match drives storage/gang/category defaults, but
      // never the display name itself — plenty of catalog entries are
      // shared across multiple real variants (different sizes sharing
      // the same gang/storage) with no reliable flag distinguishing
      // that, so the only safe default is the raw OCR text, unless
      // this exact SKU string has already been confirmed once before.
      const suggestedName = remembered || rawName;
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
    const normAlias = normalizeText(aliasText.trim());
    setCatalog((prev) => {
      const next = prev.map((c) => {
        if (c.id !== catalogId) return c;
        if (normalizeText(c.name) === normAlias) return c;
        const existing = c.aliases || [];
        if (existing.some((a) => normalizeText(a) === normAlias)) return c;
        return { ...c, aliases: [...existing, aliasText.trim()] };
      });
      saveWithRetry(CATALOG_KEY, JSON.stringify(next)).catch(() => {});
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
    if (batch.photoPath) deleteReferenceDocument(batch.photoPath).catch(() => {});
    (batch.extraPhotoPaths || []).forEach((p) => deleteReferenceDocument(p).catch(() => {}));
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
    saveQueue(queueRef.current.filter((b) => b.id !== id));
  };
  const clearDiscarded = () => {
    saveQueue(queueRef.current.filter((b) => b.status !== "discarded"));
  };
  // Wipes the whole history list, approved entries included — this only
  // ever removes Receiving's own queue record. It never touches the
  // actual storage files or the job/Love List photo attachments, since
  // an approved receipt's photo may still be legitimately living on a
  // job's Reference Documents page — deleting the underlying file here
  // would silently break that.
  const clearAllHistory = () => {
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
      const haystack = [b.label, ...b.lines.map((l) => l.name)]
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
    return (
      <>
        <ReceivingBatchReview
          batch={activeBatch}
          jobs={jobs}
          lists={lists}
          catalog={catalog}
          otherPendingBatches={queue.filter((b) => b.status === "pending" && b.id !== activeBatch.id)}
          onUpdateBatch={updateBatch}
          onLearnAlias={learnAlias}
          onApprove={approveBatch}
          onDiscard={discardBatch}
          onCombine={combineBatches}
          onViewPhoto={setViewingPhoto}
          onBack={() => setActiveBatchId(null)}
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
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <button onClick={onGoHome} className="text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="font-semibold flex items-center gap-1.5">
            <Inbox className="w-4 h-4 text-amber-400" />
            Receiving
          </p>
        </div>
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
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
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
                    {b.totalPages > 1 && ` · Page ${b.pageNumber} of ${b.totalPages}`}
                    {b.totalPages > 1 && (b.orderNumber ? ` · Order #${b.orderNumber}` : " · no order # found")}
                  </p>
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
                    <p className="text-xs text-slate-500">{formatTaskTimestamp(b.approvedAt || b.scannedAt)}</p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(b);
                    }}
                    className="text-slate-600 hover:text-red-400 shrink-0 p-1"
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
function ReceivingBatchReview({ batch, jobs, lists, catalog, otherPendingBatches, onUpdateBatch, onLearnAlias, onApprove, onDiscard, onCombine, onViewPhoto, onBack }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [relinkingLine, setRelinkingLine] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
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
      <header className="border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur z-10">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Back — saves automatically</span>
        </button>
        <button onClick={() => setConfirmingDiscard(true)} className="text-xs text-slate-500 hover:text-red-400">
          Discard
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5">
        <p className="text-xs text-slate-500 mb-4">
          Every line picks its own destination — one receipt can split across several jobs and
          Love Lists. Nothing gets added anywhere until you tap Approve, and only lines with a
          destination chosen get applied.
        </p>
        {batch.photoUrl && (
          <div className="mb-4">
            <button
              onClick={() => onViewPhoto(batch.photoUrl)}
              className="w-full rounded-lg overflow-hidden border border-slate-800"
            >
              <img src={batch.photoUrl} alt="Receipt" className="w-full max-h-48 object-cover" />
            </button>
            {(batch.extraPhotoUrls || []).length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                {batch.extraPhotoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => onViewPhoto(url)}
                    className="rounded-md overflow-hidden border border-slate-800"
                  >
                    <img src={url} alt={`Page ${i + 2}`} className="w-full h-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
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
            return (
              <div key={line.id} className="border border-slate-800 rounded-lg p-2.5 bg-slate-900/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    value={line.name}
                    onChange={(e) => handleNameChange(line.id, e.target.value)}
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
    </div>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [showLogin, setShowLogin] = useState(false);
  const [appSection, setAppSection] = useState(null); // null = landing, "jobs" | "love"
  const [pendingJobAction, setPendingJobAction] = useState(null);

  // The app doesn't use real URL routing between sections — moving
  // between Love Lists, Job Lists, Receiving, etc. is all just internal
  // React state, invisible to the browser. That means a phone's
  // edge-swipe "back" gesture (which maps to real browser history) had
  // nothing to actually go back to, and fell through to closing the app
  // entirely. Pushing a history entry on the way into a section, and
  // treating a real back-navigation event the same as tapping that
  // section's own Back button, is what gives the swipe gesture somewhere
  // real to land instead. This only covers top-level sections (landing
  // ↔ Love Lists / Job Lists / Receiving / Backorders) — going back one
  // step at a time *within* a section (e.g. a specific job back to the
  // job list) isn't wired up the same way, and would need proper routing
  // to do throughout the whole app.
  const navigateToSection = (section) => {
    window.history.pushState({ appSection: section }, "", "");
    setAppSection(section);
  };
  useEffect(() => {
    const onPopState = () => setAppSection(null);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  // Tapping a section's own Back/Home button goes through history.back()
  // too, rather than setting state directly — that way it consumes the
  // same history entry the swipe gesture would have, so the two ways of
  // leaving a section can't get out of sync with each other.
  const goToLanding = () => window.history.back();

  // Only the owner's account can create new Supabase Auth users (the app
  // itself never exposes sign-up), so any *other* real, logged-in account
  // is safely assumed to be the manager — no separate roles table needed
  // for a single manager account.
  const OWNER_EMAIL = "muffinbaskt@gmail.com";
  const isOwner = !!session && session.user?.email?.toLowerCase() === OWNER_EMAIL;
  const isManager = !!session && !isOwner;
  const managerName = isManager
    ? session.user?.user_metadata?.name || session.user?.email || "Manager"
    : null;

  // Same pending-suggestion count Job Lists already tracks internally,
  // just fetched here too so the landing screen can show the same
  // notification bubble before you've even opened Job Lists — no need
  // to go in just to find out there's something waiting for review.
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await fetchPendingSuggestions();
      if (!cancelled && result.ok) setPendingSuggestionCount(result.suggestions.length);
    };
    refresh();
    // Also re-checks whenever you land back on the home screen — covers
    // returning here right after approving or denying something inside
    // Job Lists, so the bubble doesn't keep showing a stale count.
    if (appSection === null) refresh();
    return () => {
      cancelled = true;
    };
  }, [isOwner, appSection]);

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
      {appSection === null ? (
        <AppLandingScreen
          isEditor={isOwner}
          isManager={isManager}
          onSelectLove={() => navigateToSection("love")}
          onSelectJobs={(action) => {
            setPendingJobAction(action || null);
            navigateToSection("jobs");
          }}
          onSelectKiosk={async () => {
            // Entering Kiosk mode drops any owner/manager session first —
            // the tablet has no privileged access at all while it's
            // showing the kiosk, not just a UI screen that happens to
            // hide the rest of the app.
            if (session) await supabase.auth.signOut();
            navigateToSection("kiosk");
          }}
          onSelectReceiving={() => navigateToSection("receiving")}
          onSelectBackorders={() => navigateToSection("backorders")}
          onSelectArchive={() => navigateToSection("archive")}
          pendingSuggestionCount={pendingSuggestionCount}
          onRequestLogin={() => setShowLogin(true)}
          onSignOut={() => supabase.auth.signOut()}
        />
      ) : appSection === "receiving" ? (
        <ReceivingApp onGoHome={goToLanding} />
      ) : appSection === "backorders" ? (
        <BackorderDashboard onGoHome={goToLanding} />
      ) : appSection === "archive" ? (
        <ReceiptArchive onGoHome={goToLanding} />
      ) : appSection === "love" ? (
        <LoveListsApp
          isEditor={isOwner || isManager}
          isOwner={isOwner}
          onGoHome={goToLanding}
        />
      ) : appSection === "kiosk" ? (
        <WorkerKioskApp onRequestStaffLogin={() => setShowLogin(true)} />
      ) : (
        <WareHub
          isEditor={isOwner}
          isManager={isManager}
          managerName={managerName}
          onSignOut={() => supabase.auth.signOut()}
          onRequestLogin={() => setShowLogin(true)}
          onGoToLanding={goToLanding}
          initialAction={pendingJobAction}
        />
      )}
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
                // Real credentials just got verified — that's the only way
                // out of Kiosk mode back to the full app.
                if (appSection === "kiosk") goToLanding();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
