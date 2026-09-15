// The Tools registry: a permanent record per physical tool (keyed by
// its SME#, not by whichever job it happens to sit on right now), so
// "have I seen this number before, and where's it been" is a lookup
// instead of a dig through old receipt photos. Phase 1 was the registry
// itself — manual add, browse, search, hand-logged history. Phase 2
// (syncSmesIntoRegistry below) auto-links SME#s typed anywhere they're
// actually entered in the app — a job item's SME# field, a Return, an
// Import row, a Love List item — into this same registry, so it builds
// itself from what's already being typed rather than needing a second,
// separate data-entry pass. Backfilling everything already sitting on
// current jobs from before this existed is its own later phase, still
// not part of this one.
export const TOOLS_KEY = "warehub-tools";

// Order matters here — this is the real lifecycle a tool moves through
// (awaiting its SME# → needs the number physically engraved on it →
// sits in storage → goes out on a job), not an arbitrary list. Retired
// sits outside that flow as a terminal state a tool can be marked from
// anywhere, rather than something every tool passes through.
export const TOOL_STATUSES = {
  awaiting_sme: { label: "Awaiting SME#", color: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
  needs_engraving: { label: "Needs engraving", color: "bg-sky-500/15 border-sky-500/40 text-sky-300" },
  storage: { label: "Storage", color: "bg-slate-700/40 border-slate-600 text-slate-300" },
  on_job: { label: "On a job", color: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" },
  retired: { label: "Retired", color: "bg-red-500/15 border-red-500/40 text-red-300" },
};

// sme is deliberately nullable — a tool can exist in "awaiting_sme"
// status (receipt's in, the number just hasn't come back from the boss
// yet) before it has a real SME# to be keyed by at all. Once the real
// number arrives, the same record gets updated in place rather than
// replaced, so its history carries forward instead of starting over.
export function newTool({ sme = null, name = "", status = "awaiting_sme" } = {}) {
  const now = new Date().toISOString();
  return {
    id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sme,
    name,
    status,
    currentJobId: null,
    currentJobName: null,
    receiptPath: null,
    receiptUrl: null,
    notes: "",
    history: [
      {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        time: now,
        event: "created",
        note: sme ? `Added to registry with SME# ${sme}` : "Added to registry — awaiting SME#",
      },
    ],
    createdAt: now,
  };
}

// Appends one history entry without disturbing the rest — every mutation
// to a tool's tracked state (status change, job move, SME# assigned)
// should go through this so the history stays a complete, ordered
// record rather than something that has to be pieced together from
// diffing the record's own current fields.
export function logToolEvent(tool, event, note) {
  return {
    ...tool,
    history: [
      ...(tool.history || []),
      {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        time: new Date().toISOString(),
        event,
        note,
      },
    ],
  };
}

// The core of phase 2 — given the tools registry as it currently stands
// and a list of SME#s that just got typed/confirmed somewhere in the
// app, returns an updated registry: an SME# never seen before gets a
// brand-new tool record; one that already exists gets updated in place
// (with a logged history entry) rather than duplicated, so the same
// physical tool moving between jobs stays one continuous record instead
// of fragmenting into a new row every time it moves.
//
// context.type distinguishes what kind of event this typing represents:
//   "job"      — now sitting on a job (ItemForm, Import, Love Lists all
//                land here). context.jobId/jobName describe which one.
//   "returned" — sent back rather than staying on a job (Returns);
//                status becomes "storage" and it's cleared off any job.
//
// Only ever moves a tool TOWARD its new context — never invents a
// status transition backward (e.g. never bumps something already past
// "needs_engraving" back down), since typing an SME# somewhere doesn't
// tell us anything about engraving/awaiting stages that already happened.
export function syncSmesIntoRegistry(currentTools, smeNumbers, itemName, context) {
  let tools = [...currentTools];
  const cleanNumbers = [...new Set(smeNumbers.map((s) => (s || "").trim()).filter(Boolean))];

  cleanNumbers.forEach((sme) => {
    const idx = tools.findIndex((t) => t.sme === sme);

    if (idx === -1) {
      // Never seen this SME# before — register it fresh, already
      // wherever context says it currently is.
      let tool = newTool({
        sme,
        name: itemName || "",
        status: context.type === "job" ? "on_job" : "storage",
      });
      if (context.type === "job") {
        tool = { ...tool, currentJobId: context.jobId || null, currentJobName: context.jobName || null };
      }
      tools = [...tools, tool];
      return;
    }

    // Already known — update its location/status in place and log the
    // move, but only if something actually changed (retyping the same
    // SME# into the same job on every re-save shouldn't spam the
    // history with identical "moved" entries).
    const existing = tools[idx];
    if (context.type === "job") {
      const changed = existing.currentJobName !== (context.jobName || null) || existing.status !== "on_job";
      if (changed) {
        tools[idx] = logToolEvent(
          {
            ...existing,
            currentJobId: context.jobId || null,
            currentJobName: context.jobName || null,
            status: "on_job",
          },
          "moved",
          context.jobName ? `Moved to "${context.jobName}"` : "Assigned to a job"
        );
      }
    } else if (context.type === "returned") {
      if (existing.status !== "storage" || existing.currentJobName) {
        tools[idx] = logToolEvent(
          { ...existing, status: "storage", currentJobId: null, currentJobName: null },
          "returned",
          "Returned — back in storage"
        );
      }
    }
  });

  return tools;
}
