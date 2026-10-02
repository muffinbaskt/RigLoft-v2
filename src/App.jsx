import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useAppUpdate } from "./lib/useAppUpdate";
import { supabase } from "./supabaseClient";
import {
  Package,
  Plus,
  X,
  Lock,
  Briefcase,
  Heart,
  Users,
  Truck,
  BookOpen,
  LogOut,
  Inbox,
  ClipboardList,
  RotateCcw,
  QrCode,
  AlertTriangle,
  Wrench,
} from "lucide-react";
import { uniqueId, playSaveChime, playSoftTap } from "./lib/utils";
import { TaskMetaBadges } from "./components/WorkerTasks";
// Lazy-loaded: each of these only downloads once someone actually opens
// that section, instead of every visit shipping all of Receiving/Receipt
// Archive/Tools/Backorders/Love Lists/Job Lists whether or not that session
// ever touches them. Named exports (not default), so React.lazy's import()
// needs the .then remap - lazy() itself only understands a module's
// default export.
const BackorderDashboard = lazy(() =>
  import("./screens/BackorderDashboard").then((m) => ({ default: m.BackorderDashboard }))
);
const ReceiptArchive = lazy(() =>
  import("./screens/ReceiptArchive").then((m) => ({ default: m.ReceiptArchive }))
);
const ToolsApp = lazy(() => import("./screens/ToolsApp").then((m) => ({ default: m.ToolsApp })));
const ReceivingApp = lazy(() =>
  import("./screens/ReceivingApp").then((m) => ({ default: m.ReceivingApp }))
);
const LoveListsApp = lazy(() =>
  import("./screens/LoveListsApp").then((m) => ({ default: m.LoveListsApp }))
);
const WareHub = lazy(() => import("./screens/WareHub").then((m) => ({ default: m.WareHub })));

// Predictive preloading: calling the same dynamic import() ahead of time
// (e.g. on hover/touch-start, before the actual click) lets the browser's
// module cache satisfy React.lazy's own import() for free once it fires -
// so by the time someone finishes clicking a tile, the chunk's often
// already there instead of showing the loading spinner.
const preloadBackorderDashboard = () => import("./screens/BackorderDashboard");
const preloadReceiptArchive = () => import("./screens/ReceiptArchive");
const preloadToolsApp = () => import("./screens/ToolsApp");
const preloadReceivingApp = () => import("./screens/ReceivingApp");
const preloadLoveListsApp = () => import("./screens/LoveListsApp");
const preloadWareHub = () => import("./screens/WareHub");
import {
  workerTaskStatusMeta,
  migrateWorkerTask,
  formatTaskTimestamp,
  WORKER_TASKS_KEY,
  WORKERS_KEY,
  logWorkerActivity,
  taskTitleDisplay,
} from "./lib/workertasks";
import { saveWithRetry, getWithRetry, fetchPendingSuggestions } from "./lib/api";
import { TOOLS_KEY } from "./lib/tools";

// Fallback shown for the brief moment a lazy-loaded screen's chunk is still
// downloading. Matches the app's existing full-screen spinner styling.
function SectionLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}

function AppLandingScreen({ isEditor, isManager, onSelectLove, onSelectJobs, onSelectKiosk, onSelectReceiving, onSelectBackorders, onSelectArchive, onSelectTools, onCheckForUpdate, pendingSuggestionCount = 0, toolsAlertCount = 0, onRequestLogin, onSignOut }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
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
            onMouseEnter={preloadLoveListsApp}
            onTouchStart={preloadLoveListsApp}
            className="bg-slate-900 border-2 border-slate-800 hover:border-rose-500/60 hover:bg-rose-500/5 rounded-xl p-8 text-center transition-colors"
          >
            <Heart className="w-9 h-9 text-rose-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-100">Love Lists</p>
            <p className="text-xs text-slate-500 mt-1">Daily field requests, across every job</p>
          </button>
          <button
            onClick={() => onSelectJobs()}
            onMouseEnter={preloadWareHub}
            onTouchStart={preloadWareHub}
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
                onMouseEnter={preloadReceivingApp}
                onTouchStart={preloadReceivingApp}
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
            onMouseEnter={preloadBackorderDashboard}
            onTouchStart={preloadBackorderDashboard}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-300">Backorders</span>
          </button>
        )}
        {isEditor && (
          <button
            onClick={onSelectArchive}
            onMouseEnter={preloadReceiptArchive}
            onTouchStart={preloadReceiptArchive}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
          >
            <BookOpen className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-300">Receipt Archive</span>
          </button>
        )}
        {isEditor && (
          <button
            onClick={onSelectTools}
            onMouseEnter={preloadToolsApp}
            onTouchStart={preloadToolsApp}
            className="relative w-full mt-3 flex items-center justify-center gap-2 bg-slate-900 border-2 border-slate-800 hover:border-slate-600 rounded-xl p-4 text-center transition-colors"
          >
            {toolsAlertCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-rose-500 text-slate-950 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-slate-950">
                {toolsAlertCount > 9 ? "9+" : toolsAlertCount}
              </span>
            )}
            <Wrench className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-300">Tools</span>
          </button>
        )}
      </main>
    </div>
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
  const TaskCard = ({ task, mode }) => {
    const meta = workerTaskStatusMeta(task.status);
    const claimedNames = (task.assignedWorkerIds || []).map(nameFor);
    const slotsLeft = (task.capacity || 1) - (task.assignedWorkerIds || []).length;
    return (
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm text-slate-100">{taskTitleDisplay(task, selectedWorker)}</p>
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
        {task.status === "failed" && task.failReason && (
          <p className="text-xs text-red-400 mb-1">⚠ {task.failReason}</p>
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
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
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

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [showLogin, setShowLogin] = useState(false);
  // Lets a QR code (or any shared link) open the app straight into a
  // specific record instead of the landing screen — e.g. a pallet's QR
  // pointing at its Love List. Deliberately generic (section + id) rather
  // than Love-List-specific, so the same ?section=jobs&id=... shape can
  // later deep-link into a specific job without touching this parsing.
  const initialDeepLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const rawId = params.get("id");
    const validSections = ["jobs", "love", "receiving", "backorders", "archive", "tools"];
    if (!section || !rawId || !validSections.includes(section)) return null;
    // Every id in this app comes from uniqueId() (a number), but a URL
    // query param is always a string — comparing the two with === (as the
    // list/job lookup does) silently never matches without this coercion.
    const id = Number(rawId);
    return Number.isFinite(id) ? { section, id } : null;
  }, []);
  const [appSection, setAppSection] = useState(initialDeepLink?.section ?? null); // null = landing, "jobs" | "love"
  const [pendingDeepLinkId, setPendingDeepLinkId] = useState(initialDeepLink?.id ?? null);
  const [pendingJobAction, setPendingJobAction] = useState(null);
  const { updateAvailable, applyingUpdate, updateCheckMessage, checkForUpdateNow, applyUpdate } =
    useAppUpdate();

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
  // A deep link opens straight into its section, but still needs a
  // landing-screen history entry underneath it — otherwise Home/back on a
  // freshly-opened link (no prior history in this tab) has nowhere to go.
  // Waits for session to resolve before deciding what to do with the URL
  // itself: a logged-in viewer gets it cleared once consumed, same as
  // before, but an anonymous one keeps the link's query string in the
  // address bar. Without that, refreshing mid-visit reloads with no deep
  // link at all and drops straight onto the open landing screen — the
  // "locked" view in LoveListDetailPage/JobInventory only holds up for as
  // long as this one page load lasts, so a refresh was a real way around
  // it, not just a cosmetic gap.
  const deepLinkHistorySetup = useRef(false);
  useEffect(() => {
    if (!initialDeepLink || session === undefined || deepLinkHistorySetup.current) return;
    deepLinkHistorySetup.current = true;
    const authenticated = !!session;
    // Captured before replaceState touches window.location — otherwise
    // the search string read for the pushState just below is already
    // gone by the time this runs.
    const currentUrl = window.location.pathname + window.location.search;
    window.history.replaceState({ appSection: null }, "", window.location.pathname);
    window.history.pushState(
      { appSection: initialDeepLink.section },
      "",
      authenticated ? window.location.pathname : currentUrl
    );
  }, [initialDeepLink, session]);
  // pendingDeepLinkId is cleared once the section that actually uses it
  // reports back that it has (see LoveListsApp's onDeepLinkConsumed) —
  // NOT from a plain mount effect here. The section it feeds sits behind
  // the session-loading spinner below and can take a moment (an async
  // supabase.auth.getSession() round trip) to mount for the first time;
  // an effect firing unconditionally on this component's first render
  // was clearing the id before that section ever got to read it, so every
  // scanned QR silently landed on the dashboard instead of the list.
  const consumeDeepLink = () => setPendingDeepLinkId(null);
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

  // Same idea as pendingSuggestionCount above, for tools flagged
  // needs_transfer (shipped without ever going through Transfer) — the
  // whole point of that status is to surface something that needs
  // action, so it should be visible from the home screen, not just
  // something you'd only notice by opening Tools and looking.
  const [toolsAlertCount, setToolsAlertCount] = useState(0);
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await getWithRetry(TOOLS_KEY);
      if (cancelled || !result.ok || !result.value) return;
      try {
        const tools = JSON.parse(result.value);
        setToolsAlertCount(tools.filter((t) => t.status === "needs_transfer").length);
      } catch {
        // Malformed tools data shouldn't crash the landing screen — the
        // badge just stays at whatever it last was.
      }
    };
    refresh();
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
      {updateAvailable && appSection !== "kiosk" && (
        <button
          onClick={applyUpdate}
          disabled={applyingUpdate}
          className="fixed top-0 inset-x-0 z-[80] w-full bg-amber-500 text-slate-950 text-sm font-medium shadow-lg text-left disabled:opacity-80"
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span>{applyingUpdate ? "Updating..." : "A new version of Riggy is ready"}</span>
            <span className="bg-slate-950 text-amber-400 text-xs font-semibold rounded-md px-4 py-2.5 shrink-0 flex items-center gap-1.5">
              {applyingUpdate && (
                <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              )}
              {applyingUpdate ? "Applying" : "Update now"}
            </span>
          </div>
        </button>
      )}
      {updateCheckMessage && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-full px-4 py-2 shadow-lg">
          {updateCheckMessage}
        </div>
      )}
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
          onSelectTools={() => navigateToSection("tools")}
          onCheckForUpdate={checkForUpdateNow}
          pendingSuggestionCount={pendingSuggestionCount}
          toolsAlertCount={toolsAlertCount}
          onRequestLogin={() => setShowLogin(true)}
          onSignOut={() => supabase.auth.signOut()}
        />
      ) : appSection === "receiving" ? (
        <Suspense fallback={<SectionLoadingFallback />}>
          <ReceivingApp
            onGoHome={goToLanding}
            onQuickNav={isOwner ? navigateToSection : undefined}
            isOwner={isOwner}
          />
        </Suspense>
      ) : appSection === "backorders" ? (
        <Suspense fallback={<SectionLoadingFallback />}>
          <BackorderDashboard onGoHome={goToLanding} />
        </Suspense>
      ) : appSection === "archive" ? (
        <Suspense fallback={<SectionLoadingFallback />}>
          <ReceiptArchive
            onGoHome={goToLanding}
            onQuickNav={isOwner ? navigateToSection : undefined}
            isOwner={isOwner}
          />
        </Suspense>
      ) : appSection === "tools" ? (
        <Suspense fallback={<SectionLoadingFallback />}>
          <ToolsApp onGoHome={goToLanding} isOwner={isOwner} />
        </Suspense>
      ) : appSection === "love" ? (
        <Suspense fallback={<SectionLoadingFallback />}>
          <LoveListsApp
            isEditor={isOwner || isManager}
            isOwner={isOwner}
            onGoHome={goToLanding}
            initialListId={pendingDeepLinkId}
            onDeepLinkConsumed={consumeDeepLink}
            onQuickNav={isOwner || isManager ? navigateToSection : undefined}
          />
        </Suspense>
      ) : appSection === "kiosk" ? (
        <WorkerKioskApp onRequestStaffLogin={() => setShowLogin(true)} />
      ) : (
        <Suspense fallback={<SectionLoadingFallback />}>
          <WareHub
            isEditor={isOwner}
            isManager={isManager}
            managerName={managerName}
            onSignOut={() => supabase.auth.signOut()}
            onRequestLogin={() => setShowLogin(true)}
            onGoToLanding={goToLanding}
            onCheckForUpdate={checkForUpdateNow}
            initialAction={pendingJobAction}
            initialJobId={pendingDeepLinkId}
            onDeepLinkConsumed={consumeDeepLink}
            onQuickNav={isOwner || isManager ? navigateToSection : undefined}
          />
        </Suspense>
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
