
// Phase 1 of the Tools registry: a permanent record per physical tool
// (keyed by its SME#, not by whichever job it happens to sit on right
// now), so "have I seen this number before, and where's it been" is a
// lookup instead of a dig through old receipt photos. This phase is the
// registry itself — manual add, browse, search, and a hand-logged
// history. Auto-linking new SME# entries typed elsewhere in the app
// (ItemForm, Returns, the job sheet scanner) into this registry
// automatically, and backfilling everything already sitting on current
// jobs, are their own later phases — deliberately not part of this one.
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
