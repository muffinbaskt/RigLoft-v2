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

// The actual "does this look like a tool" heuristic — a catalog item
// counts as a Tools candidate only if it's Transfer-tagged AND hasn't
// been explicitly excluded. excludeFromTools is deliberately separate
// from needsTransfer itself: some Transfer-tagged items (angle wings,
// weld lead, air arcs...) genuinely need transfer tracking but are never
// individually engraved with an SME#, so they should never show up as a
// tool candidate on an incoming receipt — without that meaning they stop
// needing transfer tracking generally, which is what actually toggling
// needsTransfer off would do.
export function isToolCandidate(catalogEntry) {
  return !!catalogEntry && !!catalogEntry.needsTransfer && !catalogEntry.excludeFromTools;
}

// Order matters here — this is the real lifecycle a tool moves through
// (awaiting its SME# → needs the number physically engraved on it →
// sits in storage → gets its SME# typed onto a job, staged there but not
// yet actually shipped → confirmed transferred, now genuinely on that
// job), not an arbitrary list. Retired sits outside that flow as a
// terminal state a tool can be marked from anywhere, rather than
// something every tool passes through.
export const TOOL_STATUSES = {
  awaiting_sme: { label: "Awaiting SME#", color: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
  needs_engraving: { label: "Needs engraving", color: "bg-sky-500/15 border-sky-500/40 text-sky-300" },
  storage: { label: "Storage", color: "bg-slate-700/40 border-slate-600 text-slate-300" },
  staged: { label: "Staged", color: "bg-violet-500/15 border-violet-500/40 text-violet-300" },
  on_job: { label: "On a job", color: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" },
  retired: { label: "Retired", color: "bg-red-500/15 border-red-500/40 text-red-300" },
};

// The status badge everywhere in the UI should show, not just the bare
// TOOL_STATUSES label — "staged" and "on_job" both mean nothing on their
// own without which job, so those two read as "Staged in 3052" / "On Job
// 3052" once a current job is actually known. Every other status stays
// exactly its plain label, since they're not job-specific.
export function toolStatusLabel(tool) {
  const base = TOOL_STATUSES[tool.status]?.label || tool.status;
  if ((tool.status === "staged" || tool.status === "on_job") && tool.currentJobName) {
    return `${tool.status === "staged" ? "Staged in" : "On Job"} ${tool.currentJobName}`;
  }
  return base;
}

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
//   "job"      — its SME# just got typed onto a job's item (ItemForm,
//                Import, Love Lists all land here). This is deliberately
//                NOT the same as actually being on the job yet — typing
//                a number in just means it's staged there; status lands
//                on "staged", not "on_job". Only an actual confirmed
//                transfer (markToolsTransferred below) advances it the
//                rest of the way. context.jobId/jobName describe which
//                job.
//   "returned" — sent back rather than staying on a job (Returns);
//                status becomes "storage" and it's cleared off any job.
//
// Only ever moves a tool TOWARD its new context — never invents a
// status transition backward (e.g. never bumps something already past
// "needs_engraving" back down, and never demotes an already-"on_job"
// tool back to "staged" just because its SME# got re-typed/re-saved
// somewhere), since typing an SME# somewhere doesn't tell us anything
// about a transfer that's already been confirmed.
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
        status: context.type === "job" ? "staged" : "storage",
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
      const sameJob = existing.currentJobName === (context.jobName || null);
      // Don't downgrade a tool that's already confirmed on_job for this
      // exact job back to merely "staged" just because its SME# field
      // got saved again — only a genuine change in status or job is
      // worth logging/acting on.
      if (sameJob && existing.status === "on_job") return;
      const changed = !sameJob || existing.status !== "staged";
      if (changed) {
        tools[idx] = logToolEvent(
          {
            ...existing,
            currentJobId: context.jobId || null,
            currentJobName: context.jobName || null,
            status: "staged",
          },
          "staged",
          context.jobName ? `Staged in "${context.jobName}"` : "Staged, awaiting a transfer to a job"
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

// The other half of the staged→on_job step — called specifically when a
// transfer actually gets confirmed (Job Lists' "mark as transferred"
// action), not just whenever an SME# gets typed somewhere. Only ever
// touches tools already known to the registry (a confirmed transfer
// isn't the moment to register a brand-new tool — syncSmesIntoRegistry
// already would have, back when its SME# was first typed in) and only
// advances tools that were actually staged for this same job, so
// confirming an unrelated transfer can't accidentally bump something
// staged elsewhere.
export function markToolsTransferred(currentTools, smeNumbers, jobId, jobName) {
  let tools = [...currentTools];
  const cleanNumbers = [...new Set(smeNumbers.map((s) => (s || "").trim()).filter(Boolean))];

  cleanNumbers.forEach((sme) => {
    const idx = tools.findIndex((t) => t.sme === sme);
    if (idx === -1) return;
    const existing = tools[idx];
    if (existing.status === "on_job" && existing.currentJobName === (jobName || null)) return;
    tools[idx] = logToolEvent(
      { ...existing, status: "on_job", currentJobId: jobId || null, currentJobName: jobName || null },
      "transferred",
      jobName ? `Transfer confirmed — now on "${jobName}"` : "Transfer confirmed"
    );
  });

  return tools;
}

