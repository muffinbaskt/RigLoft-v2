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
    serialNumber: null,
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

// Phase 3 — Backfill. Finds SME#s that are already sitting on job items
// from before this registry existed, so they can be pulled in without a
// second data-entry pass. Only looks at items that are (a) genuine tool
// candidates per the catalog link (needsTransfer, not excluded) and (b)
// actually have an SME# typed in — a Transfer-tagged item with no SME#
// is one of the legitimate exceptions (angle wings, weld lead, air
// arcs...) and correctly isn't a tool. Any SME# already known to the
// registry is skipped entirely — a prior Phase 2 sync already caught
// it, so there's nothing to backfill there.
//
// Status is decided per item, not assumed: if the item's own
// transferredContainers has anything in it, a real transfer has already
// been locked for it on this job, so the tool is genuinely on_job, not
// merely staged. Everything else lands as staged — same as a fresh
// SME# typed into an ItemForm — since it hasn't actually been confirmed
// transferred.
//
// Returns candidates for review before anything is committed (see
// applyToolsBackfill) — this only reads, never mutates the registry.
export function findBackfillCandidates(jobs, catalog, existingTools) {
  const known = new Set(existingTools.map((t) => t.sme));
  const seen = new Set(); // guards the same SME# showing up twice across jobs/items in one scan
  const candidates = [];

  (jobs || []).forEach((job) => {
    (job.items || []).forEach((item) => {
      const catalogEntry = item.catalogId ? catalog.find((c) => c.id === item.catalogId) : null;
      if (!isToolCandidate(catalogEntry)) return;
      const smeNumbers = [...new Set((item.serials || []).map((s) => (s || "").trim()).filter(Boolean))];
      if (smeNumbers.length === 0) return;
      const status = (item.transferredContainers || []).length > 0 ? "on_job" : "staged";
      smeNumbers.forEach((sme) => {
        if (known.has(sme) || seen.has(sme)) return;
        seen.add(sme);
        candidates.push({
          sme,
          itemName: item.name || "",
          jobId: job.id,
          jobName: job.name || "",
          status,
        });
      });
    });
  });

  return candidates;
}

// Commits a reviewed batch of backfill candidates to the registry.
// Always creates brand-new tool records — a candidate whose SME# was
// already known was already filtered out by findBackfillCandidates, so
// this never needs to merge into an existing one.
export function applyToolsBackfill(currentTools, candidates) {
  let tools = [...currentTools];
  candidates.forEach((c) => {
    const tool = logToolEvent(
      {
        ...newTool({ sme: c.sme, name: c.itemName, status: c.status }),
        currentJobId: c.jobId || null,
        currentJobName: c.jobName || null,
      },
      "backfilled",
      c.status === "on_job"
        ? `Backfilled — already on "${c.jobName}"`
        : `Backfilled — staged in "${c.jobName}"`
    );
    tools = [...tools, tool];
  });
  return tools;
}

// Turns a flat list of text lines (from extractPdfRows flattened, or a
// pasted CSV/text block) into {sme, serial, nameGuess} rows. The SME#
// and Serial# extraction is exact and doesn't need explaining: the
// FIRST number on the line is the SME#, the LAST is the Serial# — that
// holds regardless of how many words sit between them, so it's not
// thrown off by column layouts this parser never tries to understand. A
// line with no leading/trailing number (a header row, a blank line) is
// silently skipped rather than surfaced as an error, since a table
// export commonly has exactly one such row and it's not a mistake.
//
// The name guess is a softer, best-effort cleanup — worth being honest
// about its limits, unlike the two numbers above. These exports
// typically read SME / Item / Category / Serial, and the Category word
// often just restates part of the Item name (a "Grinder" whose Category
// is "Grinders", say) — so if the trailing word(s) of the combined
// middle text share a stem with something earlier in it, they're
// assumed to be that Category tag and dropped, leaving just the actual
// item name. This is a text-pattern guess, not a real understanding of
// the file's columns (an earlier attempt at genuine column-position
// detection turned out not to survive real files — pdf.js can merge
// closely-spaced columns into one run of text, so there's often no
// reliable position data to reconstruct columns from at all) — it's
// always editable in review before anything saves, same as everywhere
// else a guess like this shows up in the app.
function stripLikelyCategoryTag(words) {
  for (const trailCount of [2, 1]) {
    if (words.length <= trailCount) continue;
    const trailing = words.slice(-trailCount);
    const earlier = words.slice(0, -trailCount);
    const earlierStems = new Set(earlier.filter((w) => w.length >= 4).map((w) => w.toLowerCase().slice(0, 4)));
    if (trailing.some((w) => w.length >= 4 && earlierStems.has(w.toLowerCase().slice(0, 4)))) {
      return words.slice(0, -trailCount);
    }
  }
  return words;
}

// A loose "this token looks like an identifier, not a descriptive word"
// check — used wherever a row has to be found by scanning for
// number-like tokens rather than reading an exact known column (the PDF
// path, and CSV's own fallback when no header is recognized). Real SME#s
// and serials aren't always pure digits — a serial with a manufacturer's
// letter prefix ("P053751") is common — so this allows a handful of
// leading/trailing letters around a run of digits, rather than requiring
// digits-only, while still correctly rejecting an ordinary word like
// "Comealong" or "Category" that has no digits in it at all.
const ID_LIKE_PATTERN = /^[A-Za-z]{0,4}\d+[A-Za-z]{0,4}$/;

export function parseSmeSerialLines(lines) {
  const rows = [];
  lines.forEach((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return;
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (!ID_LIKE_PATTERN.test(first) || !ID_LIKE_PATTERN.test(last)) return;
    if (first === last) return; // a lone number on its own line, not a real SME+Serial pair
    rows.push({
      sme: first,
      serial: last,
      nameGuess: stripLikelyCategoryTag(tokens.slice(1, -1)).join(" "),
    });
  });
  return rows;
}

// A small dependency-free CSV parser rather than pulling in a library —
// handles the one thing a naive split(",") gets wrong: a quoted field
// containing its own commas (an item name like "4 1/2\", Chrome" would
// otherwise get torn into extra columns) and doubled "" as an escaped
// quote inside a quoted field, both standard CSV. Returns an array of
// rows, each an array of cell strings.
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

// Unlike the PDF path, a real CSV has actual delimited columns — no
// guessing needed at all here, unlike stripLikelyCategoryTag above. The
// header row is matched by column name (case-insensitive, a few
// reasonable variants allowed per column) to find which column is
// which, then every value is read straight from its own real column.
export function parseSmeItemSerialCsv(csvText) {
  const table = parseCsvText(csvText);
  if (table.length === 0) return [];

  const COLUMN_PATTERNS = {
    sme: /^sme#?$/i,
    item: /^item$/i,
    serial: /^serial#?$/i,
  };

  let headerIndex = -1;
  let colIndex = null;
  for (let i = 0; i < table.length; i++) {
    const found = {};
    table[i].forEach((cell, idx) => {
      const text = cell.trim();
      const matched = Object.entries(COLUMN_PATTERNS).find(([, pattern]) => pattern.test(text));
      if (matched) found[matched[0]] = idx;
    });
    if (found.sme !== undefined && found.item !== undefined && found.serial !== undefined) {
      headerIndex = i;
      colIndex = found;
      break;
    }
  }

  // No recognizable header — fall back to the same first/last-number
  // heuristic the PDF path uses, on each row joined back into one line,
  // so an unusually-labeled export still produces something.
  if (!colIndex) {
    return parseSmeSerialLines(table.map((row) => row.join(" ")));
  }

  return table
    .slice(headerIndex + 1)
    .map((row) => ({
      sme: (row[colIndex.sme] || "").trim(),
      serial: (row[colIndex.serial] || "").trim(),
      nameGuess: (row[colIndex.item] || "").trim(),
    }))
    .filter((r) => r.sme && r.serial); // exact columns are known here, so just require both aren't blank
}


// The real column-aware parser — reconstructs actual table columns from
// positioned text (see extractPdfRows) instead of treating a whole line
// as one blob of text. Finds the header row by matching "SME"/"Item"/
// "Serial" labels (case-insensitive, trailing # optional), uses every
// header cell's X position — including ones like "Category" that aren't
// being kept — as a column boundary, then assigns each data row's text
// to whichever column it falls under. Tracking every header's boundary,
// not just the three being kept, is what actually fixes the
// Item/Category bleed-together: without a boundary for Category, its
// text would get silently absorbed into Item instead of being dropped.
// Only sme/item/serial values are kept; anything else is discarded.
export function parseSmeItemSerialTable(rows) {
  if (!rows || rows.length === 0) return [];
  const HEADER_PATTERNS = { sme: /^sme#?$/i, item: /^item$/i, serial: /^serial#?$/i };

  let headerRowIndex = -1;
  let headerCells = null;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((cell) => {
      const text = cell.str.trim();
      const matched = Object.entries(HEADER_PATTERNS).find(([, pattern]) => pattern.test(text));
      return { x: cell.x, key: matched ? matched[0] : "_ignore" };
    });
    const found = new Set(cells.filter((c) => c.key !== "_ignore").map((c) => c.key));
    if (found.has("sme") && found.has("item") && found.has("serial")) {
      headerRowIndex = i;
      headerCells = cells.sort((a, b) => a.x - b.x);
      break;
    }
  }

  // No recognizable header at all (a differently-formatted export, say)
  // — fall back to the simpler first-number/last-number heuristic on
  // each row's flattened text, so an unusual layout still produces
  // something rather than nothing.
  if (!headerCells) {
    const flatLines = rows.map((row) => row.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim());
    return parseSmeSerialLines(flatLines);
  }

  const results = [];
  rows.slice(headerRowIndex + 1).forEach((row) => {
    const colTexts = {};
    row.forEach((cell) => {
      // The column whose boundary is the closest one at-or-before this
      // cell's X — iterating boundaries in ascending order and always
      // overwriting with the latest qualifying one lands on exactly
      // that, without needing a separate "look ahead to the next
      // boundary" step.
      let assigned = null;
      for (const header of headerCells) {
        if (cell.x >= header.x - 5) assigned = header.key;
      }
      if (!assigned || assigned === "_ignore") return;
      (colTexts[assigned] = colTexts[assigned] || []).push(cell.str);
    });
    const sme = (colTexts.sme || []).join(" ").trim();
    const serial = (colTexts.serial || []).join(" ").trim();
    const nameGuess = (colTexts.item || []).join(" ").trim();
    if (!sme || !serial) return; // an exact column is known here, so just require it isn't blank
    results.push({ sme, serial, nameGuess });
  });
  return results;
}

// Applies a batch of {sme, serial, nameGuess} rows (already reviewed by
// a human — see JobSheetScanModal's own review-before-commit pattern,
// used the same way here) to the registry. A row whose SME# already
// exists gets its serialNumber attached in place, logged; a row whose
// SME# has never been seen gets a brand-new tool created from it (using
// nameGuess as a starting name, since these files can predate the
// registry itself — an older tool that was never typed into any SME#
// field elsewhere in the app shouldn't be left permanently unregistrable
// just because this happens to be the first time its number shows up
// anywhere).
export function attachSerialNumbers(currentTools, rows) {
  let tools = [...currentTools];
  rows.forEach((row) => {
    const sme = (row.sme || "").trim();
    if (!sme) return;
    const idx = tools.findIndex((t) => t.sme === sme);
    if (idx === -1) {
      const tool = logToolEvent(
        { ...newTool({ sme, name: row.name || row.nameGuess || "", status: "storage" }), serialNumber: row.serial || null },
        "serial_attached",
        row.serial ? `Serial# ${row.serial} attached (new tool, imported)` : "Imported from file"
      );
      tools = [...tools, tool];
      return;
    }
    const existing = tools[idx];
    if (existing.serialNumber === (row.serial || null)) return;
    tools[idx] = logToolEvent(
      { ...existing, serialNumber: row.serial || null },
      "serial_attached",
      `Serial# ${row.serial} attached`
    );
  });
  return tools;
}
