// Worker Tasks: assign work, track status, run the roster — shared by
// Job Lists and Love Lists (both open it from their own landing/header),
// which is exactly why this lives in its own module rather than inside
// either screen's own file. Extracted from App.jsx; nothing here is
// specific to either caller.
import { useState, useEffect } from "react";
import { Archive, Bell, ChevronLeft, Pencil, Plus, Printer, Users, X } from "lucide-react";
import { getWithRetry, saveWithRetry } from "../lib/api";
import { uniqueId, selectOnFocus, playSoftTap, playSaveChime } from "../lib/utils";
import {
  WORKER_TASK_STATUSES,
  workerTaskStatusMeta,
  TASK_URGENCY,
  newSharedWorkerTask,
  migrateWorkerTask,
  formatTaskTimestamp,
  isTaskOverdue,
  formatDueDate,
  taskMatchesTimeframe,
  WORKER_TASKS_KEY,
  WORKERS_KEY,
  WORKER_ACTIVITY_KEY,
  WORKER_ACTIVITY_LAST_SEEN_KEY,
  taskTitleDisplay,
  workerSpeaksSpanish,
} from "../lib/workertasks";
import {
  maybeAutoBackupWorkerTasks,
  downloadWorkerTasksBackupFile,
  parseWorkerTasksBackup,
} from "../lib/backup";
import { BackupRestoreBar, ConfirmDelete } from "./shared";

// Small badge row used on task cards everywhere (dashboard, worker detail,
// kiosk) — urgency pill plus a due-date pill that turns red once it's
// actually overdue.
export function TaskMetaBadges({ task }) {
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

export function WorkerRosterModal({ workers, onAddWorker, onRemoveWorker, onUpdatePin, onUpdateLanguage, onClose }) {
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
                      onClick={() => onUpdateLanguage(w.id, workerSpeaksSpanish(w) ? "en" : "es")}
                      title="Tasks show bilingual (English / Spanish) for this person on the Kiosk and printed lists"
                      className={`text-xs rounded-full px-2 py-0.5 border ${
                        workerSpeaksSpanish(w)
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                          : "border-slate-700 text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {workerSpeaksSpanish(w) ? "Español" : "English"}
                    </button>
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
export function AssignToWorkerModal({ workers, itemLabel, initiallySelectedWorkerIds = [], onConfirm, onCancel }) {
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
          <>
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
            {selected.size === 0 && (
              <p className="text-xs text-slate-500 mb-2">
                Nobody checked — this goes to Open Tasks for anyone to pick up.
              </p>
            )}
          </>
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

export function WorkerTaskEditForm({ task, workers, onSave, onDelete, onCancel }) {
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

export function WorkerTaskAddForm({ workers, onSave, onCancel }) {
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

export function WorkerDetailPage({ worker, tasks, allWorkers = [], onUpdateTask, onBulkUpdateTasks, onDeleteTask, onRequestEdit, onBack }) {
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

export function WorkerTasksDashboard({
  workers,
  tasks,
  hasUnreadActivity,
  onOpenWorker,
  onAddTask,
  onManageRoster,
  onOpenActivity,
  onRequestEdit,
  onClose,
  onBackUp,
  onRestoreFileChosen,
  backupNotice,
  restoreError,
  onDismissRestoreError,
  restorePending,
  onCancelRestore,
  onConfirmRestore,
}) {
  const [tab, setTab] = useState("workers"); // "workers" | "today" | "jobs"
  const [preparingPrintList, setPreparingPrintList] = useState(false);
  const [printSpec, setPrintSpec] = useState(null); // { timeframe, workerIds, includeOpen } once confirmed

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
    // print:static matters even though this whole screen is hidden at print
    // time — a "fixed" ancestor becomes the containing block for the print
    // modal's position:absolute print area (nested inside it below), and
    // the print stylesheet forces every element to height:0/overflow:hidden.
    // Left as "fixed", that turns THIS div into a zero-height clipping box
    // around the print area, which is exactly what printed as a blank page.
    // "static" removes it as a containing block, so the print area's
    // position:absolute resolves against the page itself instead.
    <div className="fixed inset-0 z-40 bg-slate-950 text-slate-100 overflow-y-auto print:static">
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
              onClick={() => setPreparingPrintList(true)}
              title="Prepare a printable task list"
              className="flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-200 rounded-md p-2 hover:bg-slate-700"
            >
              <Printer className="w-4 h-4" />
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
        {onBackUp && (
          <div className="mb-4">
            <BackupRestoreBar
              onBackUp={onBackUp}
              backupDisabled={workers.length === 0 && tasks.length === 0}
              backupTitle="Saves the worker roster and every task to a file"
              onRestoreFileChosen={onRestoreFileChosen}
              backupNotice={backupNotice}
              restoreError={restoreError}
              onDismissRestoreError={onDismissRestoreError}
              restorePending={
                restorePending && {
                  summary: `This file has ${restorePending.workers.length} worker${
                    restorePending.workers.length === 1 ? "" : "s"
                  } and ${restorePending.workerTasks.length} task${
                    restorePending.workerTasks.length === 1 ? "" : "s"
                  }${restorePending.exportedAt ? `, backed up ${new Date(restorePending.exportedAt).toLocaleString()}` : ""}.`,
                  warning: `This replaces the whole roster and task list currently in place (${workers.length} worker${
                    workers.length === 1 ? "" : "s"
                  }, ${tasks.length} task${tasks.length === 1 ? "" : "s"} right now). Everything current is saved to a file first, so you can undo this.`,
                  onCancel: onCancelRestore,
                  onConfirm: onConfirmRestore,
                }
              }
            />
          </div>
        )}
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

      {preparingPrintList && (
        <PrepareTaskListModal
          workers={workers}
          tasks={tasks}
          onClose={() => setPreparingPrintList(false)}
          onConfirm={(spec) => {
            setPrintSpec(spec);
            setPreparingPrintList(false);
          }}
        />
      )}

      {printSpec && (
        <PrintableTaskListModal
          workers={workers}
          tasks={tasks}
          spec={printSpec}
          onClose={() => setPrintSpec(null)}
        />
      )}
    </div>
  );
}

// Options step — timeframe, which workers to include, and whether to
// include still-open (unclaimed) tasks — before the actual printable
// sheet gets built. Split from the print preview itself so the controls
// never end up in the printed output (window.print() prints whatever's
// on screen at the time).
export function PrepareTaskListModal({ workers, tasks, onClose, onConfirm }) {
  const [timeframe, setTimeframe] = useState("today");
  const [workerIds, setWorkerIds] = useState(() => new Set(workers.map((w) => w.id)));
  const [includeOpen, setIncludeOpen] = useState(true);
  const [onePagePerPerson, setOnePagePerPerson] = useState(true);

  const activeTasks = tasks.filter((t) => !t.archived && t.status !== "completed" && t.status !== "failed");
  const inTimeframe = activeTasks.filter((t) => taskMatchesTimeframe(t, timeframe));
  const matchCount = inTimeframe.filter(
    (t) =>
      (t.assignedWorkerIds || []).some((id) => workerIds.has(id)) ||
      (includeOpen && (t.assignedWorkerIds || []).length === 0)
  ).length;

  const toggleWorker = (id) =>
    setWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const TIMEFRAMES = [
    { key: "today", label: "Today" },
    { key: "this_week", label: "This Week" },
    { key: "whenever", label: "Whenever" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <h3 className="text-slate-100 font-semibold text-sm">Prepare task list</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Timeframe</p>
            <div className="flex flex-wrap gap-1.5">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTimeframe(t.key)}
                  className={`text-xs rounded-full px-3 py-1.5 border ${
                    timeframe === t.key
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">
              {timeframe === "today"
                ? "Due today, plus anything already overdue."
                : timeframe === "this_week"
                ? "Due in the next 7 days (not counting today or overdue)."
                : timeframe === "whenever"
                ? "No due date set at all."
                : "Every open task, regardless of due date."}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-400">Workers</p>
              <button
                onClick={() =>
                  setWorkerIds((prev) =>
                    prev.size === workers.length ? new Set() : new Set(workers.map((w) => w.id))
                  )
                }
                className="text-[11px] text-amber-400 hover:underline"
              >
                {workerIds.size === workers.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            {workers.length === 0 ? (
              <p className="text-sm text-slate-500">No one on the roster yet.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {workers.map((w) => (
                  <label
                    key={w.id}
                    className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={workerIds.has(w.id)}
                      onChange={() => toggleWorker(w.id)}
                      className="accent-amber-500"
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOpen}
              onChange={(e) => setIncludeOpen(e.target.checked)}
              className="accent-amber-500"
            />
            Include open tasks nobody's claimed yet
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={onePagePerPerson}
              onChange={(e) => setOnePagePerPerson(e.target.checked)}
              className="accent-amber-500"
            />
            One page per person (uncheck to print everyone on the same page)
          </label>
        </div>
        <div className="px-5 py-4 border-t border-slate-800 shrink-0">
          <button
            onClick={() => onConfirm({ timeframe, workerIds, includeOpen, onePagePerPerson })}
            disabled={matchCount === 0}
            className="w-full text-sm rounded-md py-2.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 disabled:opacity-40"
          >
            {matchCount === 0
              ? "Nothing matches these filters"
              : `Preview & print (${matchCount} task${matchCount === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// The actual printable sheet — grouped by worker (each gets every task
// they're on, so two people sharing a task both see it on their own
// section), with a separate "Open" section for anything nobody's claimed,
// same print-preview pattern as the Love List and Receipt print modals.
export function PrintableTaskListModal({ workers, tasks, spec, onClose }) {
  const activeTasks = tasks.filter((t) => !t.archived && t.status !== "completed" && t.status !== "failed");
  const inTimeframe = activeTasks.filter((t) => taskMatchesTimeframe(t, spec.timeframe));

  const selectedWorkers = workers.filter((w) => spec.workerIds.has(w.id));
  const tasksFor = (workerId) =>
    inTimeframe
      .filter((t) => (t.assignedWorkerIds || []).includes(workerId))
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const openTasks = spec.includeOpen
    ? inTimeframe
        .filter((t) => (t.assignedWorkerIds || []).length === 0)
        .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
    : [];

  const timeframeLabel =
    { today: "Today", this_week: "This Week", whenever: "Whenever", all: "All open tasks" }[spec.timeframe] ||
    "Tasks";

  // Each person's section defaults to starting on its own page — a printed
  // sheet like this is meant to be torn apart and handed to individuals,
  // not read as one continuous list. Built as one ordered array (rather
  // than rendering workers and Open separately) so "first" can mean
  // whichever section actually has something in it, and Open only breaks
  // onto its own page too when it isn't the very first section printed.
  const sections = [
    ...selectedWorkers
      // worker carried through per section (not just id/name) so each
      // person's own page can print bilingually if they're marked Español.
      .map((w) => ({ key: w.id, heading: w.name, items: tasksFor(w.id), worker: w }))
      .filter((sec) => sec.items.length > 0),
    ...(openTasks.length > 0
      ? // Open has no single worker to key off, and anyone on the crew —
        // English or Spanish speaking — might be the one who picks this
        // page up, so it defaults to bilingual rather than English-only.
        [
          {
            key: "__open__",
            heading: "Open — anyone can take these",
            items: openTasks,
            worker: { language: "es" },
          },
        ]
      : []),
  ];

  const TaskLine = ({ task, worker }) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-200 last:border-0">
      <span className="inline-block w-4 h-4 border border-slate-500 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm">
          {taskTitleDisplay(task, worker)}
          {task.urgency === "urgent" && <span className="text-red-600 font-semibold"> · Urgent</span>}
        </p>
        <p className="text-xs text-slate-600">
          {[task.jobLabel, task.dueDate ? `Due ${formatDueDate(task.dueDate)}` : null]
            .filter(Boolean)
            .join(" · ") || " "}
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center px-4 py-8 print:static print:block print:bg-white print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            height: 0 !important;
            overflow: hidden !important;
          }
          #worker-task-print-area, #worker-task-print-area * {
            visibility: visible;
            height: auto !important;
            overflow: visible !important;
          }
          #worker-task-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 0.5in;
          }
          .worker-task-print-section {
            break-inside: avoid;
          }
          .worker-task-print-pagebreak {
            break-before: page;
          }
        }
      `}</style>
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-lg max-h-full flex flex-col print:static print:block print:max-w-none print:rounded-none print:max-h-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 print:hidden">
          <h3 className="font-semibold text-base">Print preview</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-sm rounded-md px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div id="worker-task-print-area" className="p-6 overflow-y-auto print:overflow-visible">
          <h2 className="text-xl font-bold mb-1">Task List — {timeframeLabel}</h2>
          <p className="text-sm text-slate-600 mb-5">
            Printed {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {sections.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing matches these filters.</p>
          ) : (
            <div className="space-y-5">
              {sections.map((sec, idx) => (
                <div
                  key={sec.key}
                  className={`worker-task-print-section${
                    idx > 0 && spec.onePagePerPerson ? " worker-task-print-pagebreak" : ""
                  }`}
                >
                  <h3 className="text-base font-bold border-b-2 border-slate-900 pb-1 mb-1">{sec.heading}</h3>
                  {sec.items.map((t) => (
                    <TaskLine key={t.id} task={t} worker={sec.worker} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkerActivityFeedModal({ onClose }) {
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

export function WorkerTasksSection({ onClose }) {
  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkerId, setActiveWorkerId] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [hasUnreadActivity, setHasUnreadActivity] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [backupNotice, setBackupNotice] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restorePending, setRestorePending] = useState(null); // { workers, workerTasks, exportedAt }

  useEffect(() => {
    (async () => {
      let loadedWorkers = null;
      let loadedTasks = null;
      try {
        const wResult = await getWithRetry(WORKERS_KEY);
        if (wResult.ok && wResult.value) {
          loadedWorkers = JSON.parse(wResult.value);
          setWorkers(loadedWorkers);
        }
      } catch {}
      try {
        const tResult = await getWithRetry(WORKER_TASKS_KEY);
        if (tResult.ok && tResult.value) {
          loadedTasks = JSON.parse(tResult.value).map(migrateWorkerTask);
          setTasks(loadedTasks);
        }
      } catch {}
      try {
        const [activityResult, lastSeenResult] = await Promise.all([
          getWithRetry(WORKER_ACTIVITY_KEY),
          getWithRetry(WORKER_ACTIVITY_LAST_SEEN_KEY),
        ]);
        const activity =
          activityResult.ok && activityResult.value ? JSON.parse(activityResult.value) : [];
        setActivityLog(activity);
        const latest = activity[0] || null;
        const lastSeen =
          lastSeenResult.ok && lastSeenResult.value ? JSON.parse(lastSeenResult.value) : null;
        if (latest && (!lastSeen || new Date(latest.time) > new Date(lastSeen))) {
          setHasUnreadActivity(true);
        }
      } catch {}
      if (loadedWorkers || loadedTasks) {
        maybeAutoBackupWorkerTasks(loadedWorkers || [], loadedTasks || []);
      }
      setLoading(false);
    })();
  }, []);

  const saveWorkers = (next) => {
    setWorkers(next);
    saveWithRetry(WORKERS_KEY, JSON.stringify(next)).catch(() => {});
    maybeAutoBackupWorkerTasks(next, tasks);
  };
  const saveTasks = (next) => {
    setTasks(next);
    saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next)).catch(() => {});
    maybeAutoBackupWorkerTasks(workers, next);
  };

  const backUpNow = async () => {
    const ok = await downloadWorkerTasksBackupFile(workers, tasks, activityLog, { force: true });
    setBackupNotice(
      ok
        ? `✅ Backup saved (${workers.length} worker${workers.length === 1 ? "" : "s"}, ${tasks.length} task${tasks.length === 1 ? "" : "s"})`
        : "Couldn't create the backup file"
    );
    setTimeout(() => setBackupNotice(null), 4000);
  };
  const handleRestoreFileChosen = (file) => {
    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseWorkerTasksBackup(e.target.result);
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      setRestorePending({ workers: result.workers, workerTasks: result.workerTasks, exportedAt: result.exportedAt });
    };
    reader.onerror = () => setRestoreError("Couldn't read that file off the device.");
    reader.readAsText(file);
  };
  const confirmRestore = async () => {
    if (!restorePending) return;
    const { workers: incomingWorkers, workerTasks: incomingTasks } = restorePending;
    setRestorePending(null);
    if (workers.length > 0 || tasks.length > 0) {
      await downloadWorkerTasksBackupFile(workers, tasks, activityLog, {
        force: true,
        label: "worker-tasks-before-restore",
      });
    }
    saveWorkers(incomingWorkers);
    saveTasks(incomingTasks);
    setBackupNotice(
      `✅ Restored ${incomingWorkers.length} worker${incomingWorkers.length === 1 ? "" : "s"}, ${incomingTasks.length} task${incomingTasks.length === 1 ? "" : "s"}`
    );
    setTimeout(() => setBackupNotice(null), 4000);
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
  const updateLanguage = (id, language) => {
    saveWorkers(workers.map((w) => (w.id === id ? { ...w, language } : w)));
  };

  // Fire-and-forget: a task saves and shows immediately in English, then
  // this patches in the cached Spanish translation once it comes back —
  // translation should never block or delay creating/editing a task. The
  // `t.title === title` guard means a translation that arrives after the
  // title's already been edited AGAIN doesn't overwrite the newer title's
  // (still-pending) slot with a translation of the stale one.
  const translateAndPatchTitle = async (taskId, title) => {
    if (!title.trim()) return;
    let translated = null;
    try {
      const res = await fetch(
        "https://vwvppivdpxjvmaazcmmg.supabase.co/functions/v1/translate-task",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: title }),
        }
      );
      const data = await res.json();
      if (data.ok && data.translated) translated = data.translated;
    } catch {
      // Offline, or the function isn't deployed yet — the task just stays
      // English-only until a later edit tries again.
    }
    if (!translated) return;
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === taskId && t.title === title ? { ...t, titleEs: translated } : t));
      saveWithRetry(WORKER_TASKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const addTask = (newTasks) => {
    playSaveChime();
    saveTasks([...tasks, ...newTasks]);
    setShowAddTask(false);
    newTasks.forEach((t) => translateAndPatchTitle(t.id, t.title));
  };
  const updateTask = (updated) => {
    const previous = tasks.find((t) => t.id === updated.id);
    const titleChanged = !previous || previous.title !== updated.title;
    // Also retries whenever there's no cached translation yet, even if the
    // title itself didn't change — otherwise a task that never got
    // translated (created offline, the function briefly failed, or any
    // task saved from before this feature existed) only ever picks one up
    // by being edited into something different and back, which is exactly
    // the workaround this replaces: a plain re-save now retries it too.
    const needsTranslation = titleChanged || !updated.titleEs;
    // Clear the old Spanish text immediately on a title change — showing a
    // stale translation of the PREVIOUS title while the new one is still
    // being translated would be actively misleading, not just incomplete.
    const next = titleChanged ? { ...updated, titleEs: null } : updated;
    saveTasks(tasks.map((t) => (t.id === next.id ? next : t)));
    if (needsTranslation) translateAndPatchTitle(next.id, next.title);
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
        onBackUp={backUpNow}
        onRestoreFileChosen={handleRestoreFileChosen}
        backupNotice={backupNotice}
        restoreError={restoreError}
        onDismissRestoreError={() => setRestoreError(null)}
        restorePending={restorePending}
        onCancelRestore={() => setRestorePending(null)}
        onConfirmRestore={confirmRestore}
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
          onUpdateLanguage={updateLanguage}
          onClose={() => setShowRoster(false)}
        />
      )}
      {showActivity && <WorkerActivityFeedModal onClose={() => setShowActivity(false)} />}
    </>
  );
}
