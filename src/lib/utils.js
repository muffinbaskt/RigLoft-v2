// Pure helpers and constants with no React/JSX and no component-scoped
// state — extracted from App.jsx so the main file doesn't have to carry
// them alongside every screen's markup. Nothing in this file depends on
// anything else in the app; everything here is a plain data transform
// or a small piece of module-scoped state (the audio context, the
// catalog-match cache) that only these functions touch.

export const STORAGE_OPTIONS = [
  "Red conex",
  "Inside",
  "Outside",
  "Covered",
  "Conex row",
  "Other",
  "Unassigned",
];
export const DEFAULT_CONTAINER_OPTIONS = ["Gangbox 12345", "Printshack 67891", "Pallet", "Conex 20-01"];
export const GANG_OPTIONS = ["Raising", "Bolt Up", "Plumb up", "Welding", "Safety", "Misc", "Unassigned"];
export const STATUS_OPTIONS = [
  { value: "green", label: "Complete" },
  { value: "yellow", label: "Partial" },
  { value: "red", label: "None" },
];

export const STATUS_DOT = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
};

export const GANG_COLOR = {
  Raising: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Bolt Up": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "Plumb up": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Welding: "bg-red-500/15 text-red-300 border-red-500/30",
  Safety: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Misc: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  Unassigned: "bg-amber-500/10 text-amber-400 border-amber-600/40 border-dashed",
};

export const JOB_COLORS = [
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

export const JOB_COLOR_BORDER = {
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
export function uniqueId() {
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
export function selectOnFocus(e) {
  e.target.select();
}

export function timeStamp() {
  return new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function seedJob() {
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

export function newReturn(jobId, jobName, date) {
  return {
    id: uniqueId(),
    jobId,
    jobName,
    date,
    items: [],
    createdAt: timeStamp(),
  };
}

export function newJob(name, parentId = null, color = null, isQuickTransfer = false) {
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

export function diffItems(before, after) {
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

export function parseSerials(text) {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// SME#s that already belong to a locked Received/Staged/Sent batch on a
// Love List item — permanent historical record, never editable again.
// Used to keep the SME# entry box showing only what's new/unrecorded,
// rather than mixing fresh entries in with numbers that already shipped.
export function lockedLoveSerials(item) {
  return [
    ...new Set([
      ...((item.receivedBatches || []).flatMap((b) => b.serials || [])),
      ...((item.stagedBatches || []).flatMap((b) => b.serials || [])),
      ...((item.sentBatches || []).flatMap((b) => b.serials || [])),
    ]),
  ];
}

export function emptyItem(defaultStorage) {
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
export function getAudioCtx() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playSaveChime() {
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
export function playSoftTap() {
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

export function totalHave(containers) {
  return (containers || []).reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
}

// A container counts as "fully transferred" — physically gone from the yard —
// once every item portion that was ever placed in it has been locked as
// transferred, and at least one item actually referenced it. Containers with
// no history at all (e.g. freshly created, never used) are NOT transferred,
// so they stay available for new items.
export function isContainerTransferred(containerName, items) {
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
export function migrateItemContainers(item) {
  if (Array.isArray(item.containers)) return item;
  const containers =
    item.container && Number(item.qtyHave) > 0
      ? [{ name: item.container, qty: Number(item.qtyHave) }]
      : [];
  return { ...item, containers, qtyHave: totalHave(containers) };
}

export function singularize(word) {
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
export function normalizeReceived(r) {
  if (r === true || r === "yes") return "yes";
  if (r === "partial") return "partial";
  return "no";
}

export function normalizeText(str) {
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

export function tokenSet(str) {
  return new Set(normalizeText(str).split(" ").filter(Boolean));
}

export function findCatalogMatch(name, catalog) {
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
export function getEffectiveCatalogMatch(item, catalog) {
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

export function getCachedCatalogMatch(item, catalog) {
  if (catalog !== catalogMatchCacheCatalogRef) {
    catalogMatchCache = new WeakMap();
    catalogMatchCacheCatalogRef = catalog;
  }
  if (catalogMatchCache.has(item)) return catalogMatchCache.get(item);
  const match = getEffectiveCatalogMatch(item, catalog);
  catalogMatchCache.set(item, match);
  return match;
}

export function parseImportText(text, catalog) {
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

export function findOptionMatch(value, options) {
  if (!value) return null;
  const norm = normalizeText(value);
  return options.find((opt) => normalizeText(opt) === norm) || null;
}

export function parseCatalogBulkText(text) {
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
