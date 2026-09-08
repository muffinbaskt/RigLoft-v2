// Lets the Receipt Archive watch a folder you pick once (e.g. wherever
// your desktop scanner/printer drops new scans) and automatically run
// any new image/PDF that shows up through the same scan pipeline as
// tapping "Scan" by hand. Same File System Access API technique the
// backup folder feature already uses, in reverse — reading a folder
// instead of writing to one — and completely separate storage from it,
// since watching for scans and picking a backup destination are
// unrelated choices someone could make independently.
//
// Real limitation, same as backups: only Chrome-family desktop browsers
// support this API at all, and there's no true background/OS-level
// watching — this only checks the folder while the Archive screen is
// open and polling on a timer. Close the tab, and it stops, same as any
// other in-page JavaScript would.
export const FS_ACCESS_SUPPORTED = typeof window !== "undefined" && "showDirectoryPicker" in window;
export const WATCH_DIR_DB = "riggy-scan-watch-prefs";
export const WATCH_DIR_STORE = "handles";
export const WATCH_DIR_KEY = "scanWatchDirectory";
export const WATCH_SEEN_KEY = "scanWatchSeenFiles";
// Only these — a scanner's output folder can easily also contain other
// junk (a .DS_Store, an in-progress temp file, an unrelated document)
// that would otherwise get "scanned" as a garbled, useless receipt.
const WATCHABLE_EXTENSIONS = /\.(jpe?g|png|heic|heif|pdf)$/i;
// Caps how much processed-file history accumulates in IndexedDB over
// time — old entries age out first, since a folder that's been watched
// for months could otherwise grow this without bound.
const MAX_SEEN_ENTRIES = 1000;

function openWatchPrefsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WATCH_DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(WATCH_DIR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openWatchPrefsDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(WATCH_DIR_STORE, "readonly");
      const req = tx.objectStore(WATCH_DIR_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key, value) {
  const db = await openWatchPrefsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WATCH_DIR_STORE, "readwrite");
    tx.objectStore(WATCH_DIR_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  try {
    const db = await openWatchPrefsDB();
    const tx = db.transaction(WATCH_DIR_STORE, "readwrite");
    tx.objectStore(WATCH_DIR_STORE).delete(key);
  } catch {
    // nothing more to do
  }
}

export function loadWatchDirectoryHandle() {
  return idbGet(WATCH_DIR_KEY);
}

export function clearWatchDirectoryHandle() {
  return Promise.all([idbDelete(WATCH_DIR_KEY), idbDelete(WATCH_SEEN_KEY)]);
}

export async function chooseWatchFolder() {
  if (!FS_ACCESS_SUPPORTED) {
    return { ok: false, error: "Not supported in this browser." };
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    await idbSet(WATCH_DIR_KEY, handle);
    await idbSet(WATCH_SEEN_KEY, []);
    return { ok: true, name: handle.name };
  } catch (err) {
    if (err && err.name === "AbortError") return { ok: false, canceled: true };
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Re-granting folder access after the browser's been closed a while
// needs an actual click — queryPermission alone can't silently regain
// access, only report whether it's still there. Callers use this to
// decide whether to show a "tap to resume watching" prompt instead of
// polling.
export async function checkWatchFolderPermission() {
  const handle = await loadWatchDirectoryHandle();
  if (!handle) return "none";
  try {
    return await handle.queryPermission({ mode: "read" });
  } catch {
    return "none";
  }
}

// Must be called from a real click/tap — this is what's allowed to
// actually re-prompt for permission, unlike the check above.
export async function requestWatchFolderPermission() {
  const handle = await loadWatchDirectoryHandle();
  if (!handle) return false;
  try {
    const result = await handle.requestPermission({ mode: "read" });
    return result === "granted";
  } catch {
    return false;
  }
}

// Lists whatever's in the watched folder right now, returns the File
// objects for anything not already processed (by name+size+modified
// time, so a re-scan under the same filename — a scanner overwriting
// "scan001.jpg" — is still picked up), and records those as seen so the
// next poll doesn't pick them up again. Also reports total counts
// (every entry seen, and how many matched the watchable extensions)
// so a caller can tell "genuinely nothing new" apart from "couldn't
// actually read the folder's contents at all" — the two look identical
// from the outside otherwise, which matters a lot for an unusual folder
// (a network share, say) where silently reading zero of everything is a
// real possibility.
export async function pollWatchFolderForNewFiles() {
  const handle = await loadWatchDirectoryHandle();
  if (!handle) return { ok: false, reason: "no-folder", files: [] };
  const permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted") return { ok: false, reason: "no-permission", files: [] };

  const seenList = (await idbGet(WATCH_SEEN_KEY)) || [];
  const seen = new Set(seenList);
  const newFiles = [];
  const newlySeen = [];
  let totalEntries = 0;
  let totalMatchingExtension = 0;
  try {
    for await (const entry of handle.values()) {
      totalEntries++;
      if (entry.kind !== "file") continue;
      if (!WATCHABLE_EXTENSIONS.test(entry.name)) continue;
      totalMatchingExtension++;
      const file = await entry.getFile();
      const identity = `${entry.name}:${file.size}:${file.lastModified}`;
      if (seen.has(identity)) continue;
      newFiles.push(file);
      newlySeen.push(identity);
    }
  } catch (err) {
    return { ok: false, reason: "error", error: err && err.message, files: [] };
  }

  if (newlySeen.length > 0) {
    const merged = [...seenList, ...newlySeen].slice(-MAX_SEEN_ENTRIES);
    await idbSet(WATCH_SEEN_KEY, merged);
  }

  return { ok: true, files: newFiles, totalEntries, totalMatchingExtension };
}
