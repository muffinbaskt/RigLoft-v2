import { sameInstant } from "./sync";

// The save/merge/refresh loop for one server-stored blob that several
// devices can edit (used by Love Lists). Deliberately not React code, so it
// can be tested against a fake server with two simulated devices.
//
// Rules it enforces:
//  - Every save says "I last saw the server at time T"; the server refuses
//    if it has since changed (write() reports { conflict: true }).
//  - A refused save is merged with the server's copy against `base` (what
//    the server looked like at our last successful sync). Non-overlapping
//    changes combine silently; overlapping ones go to onPrompt for a person.
//  - Only one save runs at a time; edits made meanwhile are picked up on
//    the next pass, since two overlapping saves would conflict with
//    each other.
//  - A failed save stays dirty and is retried, never dropped.
//  - checkRemote() only pulls in a newer server copy when there is no
//    unsaved local work at all, and never swaps in unreadable/empty data.
//  - Data that can't be read is never merged into and then overwritten.
export function createSyncEngine({
  read, // () => Promise<{ ok, value: string|null, updatedAt }>
  write, // (json, expectedUpdatedAt) => Promise<{ ok, updatedAt?, conflict?, error? }>
  peek, // () => Promise<{ ok, updatedAt: string|null }>
  merge, // (base, mine, theirs) => { lists, conflicts }
  applyResolutions, // (mergedLists, conflictsWithResolution) => finalLists
  getLocal, // () => current local array (must be the SAME reference as setLocal last stored)
  setLocal, // (array) => void, stores it so getLocal returns the same reference
  onPrompt = () => {}, // (pending | null) => void
  onNotice = () => {}, // (message) => void
  quietMs = 8000,
  now = () => Date.now(),
}) {
  let base = [];
  let updatedAt = null;
  let saving = false;
  let dirty = false;
  let pending = null; // { lists, conflicts, theirsUpdatedAt, error? } while a person is deciding
  let lastEditAt = 0;
  let submitting = false;

  const hasLocalWork = () =>
    saving || dirty || !!pending || getLocal() !== base || now() - lastEditAt < quietMs;

  // Called after a normal load, or after a refresh replaced the local copy.
  const seed = (lists, serverUpdatedAt) => {
    base = lists;
    updatedAt = serverUpdatedAt || null;
    dirty = false;
  };

  const edited = () => {
    lastEditAt = now();
    dirty = true;
    return runSave();
  };

  async function runSave() {
    if (saving || pending) return;
    saving = true;
    try {
      while (dirty && !pending) {
        dirty = false;
        const mine = getLocal();
        const saved = await write(JSON.stringify(mine), updatedAt);
        if (saved.ok) {
          updatedAt = saved.updatedAt;
          base = mine;
          continue;
        }
        if (saved.conflict) {
          if (!(await resolveConflict())) break;
          continue;
        }
        dirty = true; // network/server failure — keep it for the next retry
        break;
      }
    } finally {
      saving = false;
    }
  }

  // Returns true if the save loop should carry on.
  async function resolveConflict() {
    const theirsRes = await read();
    if (!theirsRes.ok) {
      dirty = true;
      return false;
    }
    let theirLists = [];
    try {
      if (theirsRes.value) theirLists = JSON.parse(theirsRes.value);
    } catch {
      dirty = true;
      return false;
    }
    if (!Array.isArray(theirLists)) {
      dirty = true;
      return false;
    }
    const result = merge(base, getLocal(), theirLists);
    if (result.conflicts.length === 0) {
      const saved = await write(JSON.stringify(result.lists), theirsRes.updatedAt);
      setLocal(result.lists);
      if (saved.ok) {
        updatedAt = saved.updatedAt;
        base = result.lists;
        onNotice("Merged changes from another device");
        return true;
      }
      // Changed again while merging, or a network failure. Either way the
      // merged result is now "mine", and the server copy we just merged
      // against is the new common starting point — otherwise the next
      // merge would mistake their earlier changes (already inside "mine")
      // for changes I made, and raise conflicts nobody actually caused.
      base = theirLists;
      updatedAt = theirsRes.updatedAt;
      dirty = true;
      return !!saved.conflict;
    }
    pending = {
      lists: result.lists,
      conflicts: result.conflicts.map((c) => ({ ...c, resolution: "mine" })),
      theirsUpdatedAt: theirsRes.updatedAt,
      serverLists: theirLists,
    };
    onPrompt(pending);
    return false;
  }

  // The user's choices for the prompt. `conflicts` carries each one's
  // `resolution` ("mine" | "theirs").
  async function submitResolutions(conflicts) {
    if (!pending || submitting) return; // ignore a double-tap while a submit is in flight
    submitting = true;
    try {
      const finalLists = applyResolutions(pending.lists, conflicts);
      const saved = await write(JSON.stringify(finalLists), pending.theirsUpdatedAt);
      if (saved.ok) {
        pending = null;
        onPrompt(null);
        setLocal(finalLists);
        updatedAt = saved.updatedAt;
        base = finalLists;
        return;
      }
      if (saved.conflict) {
        // Yet another change landed while deciding — fold the choices in and
        // merge again, starting from the server copy the person just decided
        // against so the same conflict isn't raised a second time.
        base = pending.serverLists;
        updatedAt = pending.theirsUpdatedAt;
        pending = null;
        onPrompt(null);
        setLocal(finalLists);
        dirty = true;
        await runSave();
        return;
      }
      // Keep the prompt open with the person's choices intact and say why.
      pending = {
        ...pending,
        conflicts,
        error: saved.error || "Couldn't save — check your connection and try again.",
      };
      onPrompt(pending);
    } finally {
      submitting = false;
    }
  }

  // Background check: retry a failed save, or pull in a newer server copy.
  async function checkRemote() {
    if (dirty && !saving && !pending) {
      await runSave();
      return;
    }
    if (hasLocalWork()) return;
    const probe = await peek();
    if (!probe.ok || !probe.updatedAt) return;
    if (sameInstant(probe.updatedAt, updatedAt)) return;
    const result = await read();
    if (!result.ok || !result.value) return;
    if (hasLocalWork()) return; // edited while that request was in flight
    let parsed;
    try {
      parsed = JSON.parse(result.value);
    } catch {
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    setLocal(parsed);
    seed(parsed, result.updatedAt);
    onNotice("Updated from another device");
  }

  return {
    seed,
    edited,
    runSave,
    submitResolutions,
    checkRemote,
    hasLocalWork,
    isDirty: () => dirty,
    getPending: () => pending,
    getUpdatedAt: () => updatedAt,
  };
}

// Applies a person's choices from the Love Lists conflict prompt to the
// already-merged lists. Only ever patches what was contested, never replaces
// a whole list with a partial one.
export function applyLoveListResolutions(mergedLists, conflicts) {
  let lists = mergedLists;
  conflicts.forEach((c) => {
    const winner = c.resolution === "mine" ? c.mine : c.theirs;
    const sameId = (x) => String(x.id) === String(c.id);
    if (c.kind === "item") {
      lists = lists.map((l) => {
        if (String(l.id) !== String(c.listId)) return l;
        if (!winner) return { ...l, items: l.items.filter((i) => !sameId(i)) };
        const exists = l.items.some(sameId);
        return {
          ...l,
          items: exists ? l.items.map((i) => (sameId(i) ? winner : i)) : [...l.items, winner],
        };
      });
    } else if (c.subtype === "deletion") {
      if (!winner) lists = lists.filter((l) => !sameId(l));
      else if (lists.some(sameId)) lists = lists.map((l) => (sameId(l) ? winner : l));
      else lists = [...lists, winner];
    } else {
      lists = lists.map((l) => (sameId(l) ? { ...l, ...winner } : l));
    }
  });
  return lists;
}
