import { uniqueId } from "./utils";
import { getWithRetry, saveWithRetry } from "./api";

// Pure Worker Tasks domain logic — status/urgency metadata, task-factory
// functions for both the single-assignee (item-card) and shared/pooled
// (dashboard) task shapes, the old-data migration, and small display
// formatters. Nothing here touches React.

export const WORKER_TASK_STATUSES = [
  { key: "not_started", label: "Not Started", color: "bg-slate-700 text-slate-200 border-slate-600" },
  { key: "in_progress", label: "In Progress", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  { key: "completed", label: "Completed", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  { key: "failed", label: "Failed", color: "bg-red-500/15 text-red-300 border-red-500/40" },
];
export const workerTaskStatusMeta = (key) =>
  WORKER_TASK_STATUSES.find((s) => s.key === key) || WORKER_TASK_STATUSES[0];

export const TASK_URGENCY = {
  low: { label: "Low", color: "bg-slate-800 text-slate-400 border-slate-700" },
  normal: { label: "Normal", color: "bg-slate-800 text-slate-300 border-slate-700" },
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-300 border-red-500/40" },
};

export function newWorkerTask(workerId, workerName, title, jobLabel, source = null) {
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
export function newSharedWorkerTask({ title, jobLabel, capacity, assignedWorkers, urgency, dueDate }) {
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
export function migrateWorkerTask(task) {
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
export function formatTaskTimestamp(iso) {
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

export function isTaskOverdue(task) {
  if (!task.dueDate || task.status === "completed") return false;
  return new Date(task.dueDate + "T23:59:59") < new Date();
}

export function formatDueDate(dueDate) {
  if (!dueDate) return "";
  const d = new Date(dueDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const WORKER_TASKS_KEY = "warehub-worker-tasks";
export const WORKERS_KEY = "warehub-workers";
export const WORKER_ACTIVITY_KEY = "warehub-worker-activity";
export const WORKER_ACTIVITY_LAST_SEEN_KEY = "warehub-worker-activity-last-seen";

// Notification pipeline for the kiosk: every claim/join/start/complete/fail
// action happening on the tablet gets logged here, so the owner has one
// place to see everything going on without walking around checking in.
export function logWorkerActivity(entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  return getWithRetry(WORKER_ACTIVITY_KEY).then((result) => {
    const prior = result.ok && result.value ? JSON.parse(result.value) : [];
    const next = [...list, ...prior].slice(0, 200);
    return saveWithRetry(WORKER_ACTIVITY_KEY, JSON.stringify(next));
  });
}
