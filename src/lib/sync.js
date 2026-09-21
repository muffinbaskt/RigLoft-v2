// Generic multi-device conflict resolution: comparing two versions of the
// same data against a shared "base" snapshot to tell apart three
// situations per record — only one side touched it (auto-merge, no
// conflict), neither touched it (unchanged), or both sides changed it
// differently (a real conflict needing a human choice). threeWayMergeList
// works on any list of objects with a stable `.id`; threeWayMergeJobs
// layers job-level metadata merging (name/color/parentId) and the
// additive fields (todos, activity log, reference documents) on top of
// that for the specific shape of a job. Nothing here is Riggy-specific
// beyond that one shape assumption.

// Compares two timestamps by actual moment in time rather than raw string
// equality, since the same instant can come back formatted differently
// depending on its source (browser-generated vs. Postgres-returned).
export function sameInstant(a, b) {
  if (!a || !b) return a === b;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
}

// Deterministic stringify (sorted keys) so two objects with the same
// content but different key order still compare as equal.
export function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export function deepEqualExcept(a, b, excludeKeys) {
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
export function threeWayMergeList(baseList, mineList, theirList) {
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
export const JOB_META_KEYS = ["name", "color", "parentId"];

export function pickKeys(obj, keys) {
  const out = {};
  keys.forEach((k) => (out[k] = obj ? obj[k] : undefined));
  return out;
}

export function unionById(theirsList, mineList) {
  const byId = new Map();
  (theirsList || []).forEach((x) => byId.set(String(x.id), x));
  (mineList || []).forEach((x) => byId.set(String(x.id), x)); // mine wins ties
  return [...byId.values()];
}

export function threeWayMergeJobs(baseJobs, mineJobs, theirJobs) {
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

// Love Lists version of the merge above. A Love List is a record with its
// own fields (labels, archived flag, ...) plus `items`, `referenceImages`
// and `referenceDocuments`, so it can't reuse threeWayMergeJobs (which
// assumes a job's specific fields). Same rules: only one side touched
// something → take it; both touched it the same → fine; both touched it
// differently → a real conflict for a person to decide.
//
//  - items: item-level three-way merge (threeWayMergeList).
//  - referenceImages / referenceDocuments: attachments. Kept if either side
//    added them; dropped if either side deleted them, so a photo removed on
//    one device doesn't reappear from the other's stale copy.
//  - every other field: merged one field at a time, so one device
//    archiving a list while the other edits its label isn't a conflict —
//    only the same field changed to different values is.
//  - a whole list deleted on one side but changed on the other is a conflict.
const LOVE_LIST_ATTACHMENT_KEYS = ["referenceImages", "referenceDocuments"];
const LOVE_LIST_NON_META_KEYS = ["items", ...LOVE_LIST_ATTACHMENT_KEYS];

function attachmentKey(x) {
  return x && typeof x === "object" ? `id:${String(x.id)}` : `v:${String(x)}`;
}

export function mergeAttachmentList(baseArr, mineArr, theirArr) {
  const keyed = (arr) => new Map((arr || []).map((x) => [attachmentKey(x), x]));
  const base = keyed(baseArr);
  const mine = keyed(mineArr);
  const theirs = keyed(theirArr);
  const out = [];
  const seen = new Set();
  const consider = (k, x) => {
    if (seen.has(k)) return;
    seen.add(k);
    const inBase = base.has(k);
    const inMine = mine.has(k);
    const inTheirs = theirs.has(k);
    if (inMine && inTheirs) out.push(mine.get(k));
    else if (!inBase) out.push(x); // added on one side only
    // else: existed at base and one side removed it → removal wins
  };
  mine.forEach((x, k) => consider(k, x));
  theirs.forEach((x, k) => consider(k, x));
  return out;
}

export function threeWayMergeLoveLists(baseLists, mineLists, theirLists) {
  const baseById = new Map((baseLists || []).map((l) => [String(l.id), l]));
  const mineById = new Map((mineLists || []).map((l) => [String(l.id), l]));
  const theirById = new Map((theirLists || []).map((l) => [String(l.id), l]));
  // My order first (keeps the screen stable), then lists only they have.
  const ids = [...new Set([...mineById.keys(), ...theirById.keys(), ...baseById.keys()])];

  const lists = [];
  const listConflicts = [];
  const itemConflicts = [];

  for (const id of ids) {
    const base = baseById.get(id) || null;
    const mine = mineById.get(id) || null;
    const theirs = theirById.get(id) || null;
    if (!mine && !theirs) continue;

    if (!mine || !theirs) {
      const present = mine || theirs;
      if (!base) {
        lists.push(present); // added on one side only
        continue;
      }
      const presentChanged = !deepEqual(base, present);
      if (!presentChanged) continue; // the other side deleted it and this side never touched it
      lists.push(present); // deleted on one side but changed on the other — keep it, ask
      listConflicts.push({
        id,
        kind: "list",
        subtype: "deletion",
        mine,
        theirs,
        base,
      });
      continue;
    }

    const itemMerge = threeWayMergeList(base ? base.items : [], mine.items, theirs.items);
    itemMerge.conflicts.forEach((c) =>
      itemConflicts.push({ listId: id, listName: loveListName(mine), ...c })
    );

    const merged = { ...mine };
    const metaKeys = new Set([
      ...Object.keys(base || {}),
      ...Object.keys(mine),
      ...Object.keys(theirs),
    ]);
    LOVE_LIST_NON_META_KEYS.forEach((k) => metaKeys.delete(k));
    const conflictKeys = [];
    for (const k of metaKeys) {
      const b = base ? base[k] : undefined;
      const m = mine[k];
      const t = theirs[k];
      const mineChanged = !deepEqual(b, m);
      const theirsChanged = !deepEqual(b, t);
      if (!theirsChanged) continue; // keep mine (already in `merged`)
      if (!mineChanged || deepEqual(m, t)) {
        if (t === undefined) delete merged[k];
        else merged[k] = t;
        continue;
      }
      conflictKeys.push(k); // both changed it, differently — mine stays tentatively
    }
    if (conflictKeys.length > 0) {
      listConflicts.push({
        id,
        kind: "list",
        subtype: "metadata",
        keys: conflictKeys,
        base: pickKeys(base, conflictKeys),
        mine: pickKeys(mine, conflictKeys),
        theirs: pickKeys(theirs, conflictKeys),
        listName: loveListName(mine),
      });
    }

    merged.items = itemMerge.merged;
    LOVE_LIST_ATTACHMENT_KEYS.forEach((k) => {
      const out = mergeAttachmentList(base && base[k], mine[k], theirs[k]);
      if (out.length > 0 || mine[k] !== undefined || theirs[k] !== undefined) merged[k] = out;
    });
    lists.push(merged);
  }

  return { lists, listConflicts, itemConflicts };
}

function loveListName(list) {
  if (!list) return "list";
  return list.subJobLabel ? `${list.jobLabel} — ${list.subJobLabel}` : list.jobLabel || "list";
}
