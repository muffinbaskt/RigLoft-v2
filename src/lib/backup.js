// Offline persistence and local backup — none of this touches Supabase.
// The offline queue (localStorage) is what survives closing the tab
// entirely while genuinely offline; the backup functions write a plain
// JSON export either to a folder the user picked once (Chrome-family
// desktop, via the File System Access API) or as a regular downloaded
// file everywhere else, triggered both automatically (hourly, one entry
// point per data type) and from explicit conflict-safety saves.

// Changes made while offline are kept here so they survive closing the
// app/tab entirely, not just losing network mid-session. This is separate
// from the main Supabase-backed storage, since it needs to work with zero
// connectivity.
export const OFFLINE_QUEUE_KEY = "warehub-offline-queue";

export function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false; // localStorage full or unavailable — best effort only
  }
}

export function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearOfflineQueue() {
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
export const FS_ACCESS_SUPPORTED = typeof window !== "undefined" && "showDirectoryPicker" in window;
export const BACKUP_DIR_DB = "riggy-backup-prefs";
export const BACKUP_DIR_STORE = "handles";
export const BACKUP_DIR_KEY = "backupDirectory";

export function openBackupPrefsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DIR_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BACKUP_DIR_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBackupDirectoryHandle(handle) {
  const db = await openBackupPrefsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_DIR_STORE, "readwrite");
    tx.objectStore(BACKUP_DIR_STORE).put(handle, BACKUP_DIR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadBackupDirectoryHandle() {
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

export async function clearBackupDirectoryHandle() {
  try {
    const db = await openBackupPrefsDB();
    const tx = db.transaction(BACKUP_DIR_STORE, "readwrite");
    tx.objectStore(BACKUP_DIR_STORE).delete(BACKUP_DIR_KEY);
  } catch {
    // nothing more to do
  }
}

export async function chooseBackupFolder() {
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

export async function downloadBackupFile(jobs, catalog, label, { force = false } = {}) {
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

export function downloadOfflineBackup(queue) {
  return downloadBackupFile(queue.jobs, queue.catalog, "offline-conflict-backup");
}

// Quietly saves a backup file on its own, no button needed — these are
// tiny (plain JSON), so there's no real cost to keeping this frequent.
export const AUTO_BACKUP_KEY = "warehub-last-auto-backup";
export const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // once an hour

let autoBackupInFlight = false; // in-memory guard against a same-tab burst

export async function maybeAutoBackup(jobs, catalog) {
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
export const AUTO_BACKUP_LOVE_LISTS_KEY = "warehub-last-auto-backup-lovelists";
let loveListsAutoBackupInFlight = false;

export async function downloadLoveListsBackupFile(loveLists, { force = false } = {}) {
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

export async function maybeAutoBackupLoveLists(loveLists) {
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
