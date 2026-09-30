import { describe, it, expect } from "vitest";
import {
  attachSerialNumbers,
  awaitingSmeNamesMatch,
  learnToolNameAlias,
  newTool,
  parseSmeItemSerialCsv,
  resolveToolNameAlias,
} from "./tools";

describe("attachSerialNumbers", () => {
  it("matches an unrecognized SME# to an awaiting_sme tool by name instead of creating a new one", () => {
    const tools = [
      { ...newTool({ name: "Ramset Gun", status: "awaiting_sme" }), id: "t1" },
      { ...newTool({ name: "Ramset Gun", status: "awaiting_sme" }), id: "t2" },
      { ...newTool({ name: "Impact Wrench", status: "awaiting_sme" }), id: "t3" },
    ];
    const rows = [
      { sme: "10001", serial: "SN-AAA", name: "Ramset Gun", nameGuess: "Ramset Gun" },
      { sme: "10002", serial: "SN-BBB", name: "Ramset Gun", nameGuess: "Ramset Gun" },
      { sme: "10003", serial: "SN-CCC", name: "Brand New Thing", nameGuess: "Brand New Thing" },
    ];

    const result = attachSerialNumbers(tools, rows);

    // t1/t2/t3 stay, plus exactly one genuinely new tool for the unmatched row.
    expect(result.length).toBe(4);

    const t1 = result.find((t) => t.id === "t1");
    const t2 = result.find((t) => t.id === "t2");
    const t3 = result.find((t) => t.id === "t3");

    // Each identically-named awaiting_sme tool claims its own distinct SME#,
    // not both matched to the same record.
    expect(t1.sme).toBe("10001");
    expect(t1.status).toBe("needs_engraving");
    expect(t2.sme).toBe("10002");
    expect(t1.sme).not.toBe(t2.sme);

    // An unrelated awaiting_sme tool is untouched.
    expect(t3.sme).toBeNull();
    expect(t3.status).toBe("awaiting_sme");

    // No unmatched name means no false match — a real new tool gets created.
    const brandNew = result.find((t) => t.name === "Brand New Thing");
    expect(brandNew).toBeTruthy();
    expect(brandNew.sme).toBe("10003");

    // No leftover awaiting_sme duplicates for the name that got matched.
    const leftover = result.filter((t) => t.name === "Ramset Gun" && t.status === "awaiting_sme");
    expect(leftover.length).toBe(0);
  });

  it("just updates the serial when the SME# already exists, without creating a duplicate", () => {
    const tools = [{ ...newTool({ name: "Chain Hoist", sme: "20001" }), id: "t1", serialNumber: null }];
    const result = attachSerialNumbers(tools, [{ sme: "20001", serial: "SN-NEW" }]);
    expect(result.length).toBe(1);
    expect(result[0].serialNumber).toBe("SN-NEW");
  });

  it("skips rows with no SME#", () => {
    const tools = [];
    const result = attachSerialNumbers(tools, [{ sme: "", serial: "SN-X", name: "Whatever" }]);
    expect(result.length).toBe(0);
  });

  // Regression test using the real names that failed to match: only "Die
  // Grinder" (worded identically on both sides) matched; ladders, the
  // porta ram, and the air manifold/pig all didn't, purely because the
  // wording differed (or, for air pig/manifold, because it's a genuine
  // synonym no amount of reordering can bridge).
  it("matches word-order and superset name variations end to end", () => {
    const tools = [
      { ...newTool({ name: "Extension Ladder, 24'", status: "awaiting_sme" }), id: "ladder" },
      { ...newTool({ name: 'Porta Ram, 4"', status: "awaiting_sme" }), id: "ram" },
      { ...newTool({ name: "Porta Pump, Large", status: "awaiting_sme" }), id: "pump" },
      { ...newTool({ name: "Air Pig", status: "awaiting_sme" }), id: "airpig" },
    ];
    const rows = [
      { sme: "1001", serial: "", nameGuess: "24 Foot Extension Ladder" },
      { sme: "1002", serial: "", nameGuess: 'Ram, 4"' },
      { sme: "1003", serial: "", nameGuess: "Porta Pump" },
      { sme: "1004", serial: "", nameGuess: "Air Manifold" },
    ];

    const result = attachSerialNumbers(tools, rows);

    expect(result.find((t) => t.id === "ladder").sme).toBe("1001");
    expect(result.find((t) => t.id === "ram").sme).toBe("1002");
    expect(result.find((t) => t.id === "pump").sme).toBe("1003");
    // Air Pig/Air Manifold share no real words — correctly NOT matched,
    // so a brand-new tool gets created instead of silently guessing.
    expect(result.find((t) => t.id === "airpig").sme).toBeNull();
    const newAirManifold = result.find((t) => t.name === "Air Manifold");
    expect(newAirManifold).toBeTruthy();
    expect(newAirManifold.sme).toBe("1004");
  });

  it("uses a learned alias to bridge a genuine synonym automatically", () => {
    const tools = [{ ...newTool({ name: "Air Pig", status: "awaiting_sme" }), id: "airpig" }];
    const rows = [{ sme: "2001", serial: "", nameGuess: "Air Manifold" }];
    const nameAliases = { "air manifold": "Air Pig" };

    const result = attachSerialNumbers(tools, rows, nameAliases);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("airpig");
    expect(result[0].sme).toBe("2001");
  });

  it("a manual row.linkedName wins even without a saved alias yet", () => {
    const tools = [{ ...newTool({ name: "Air Pig", status: "awaiting_sme" }), id: "airpig" }];
    const rows = [{ sme: "2001", serial: "", nameGuess: "Air Manifold", linkedName: "Air Pig" }];

    const result = attachSerialNumbers(tools, rows);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("airpig");
    expect(result[0].sme).toBe("2001");
  });
});

describe("resolveToolNameAlias", () => {
  it("returns the taught canonical name when one exists", () => {
    const aliases = { "air manifold": "Air Pig" };
    expect(resolveToolNameAlias(aliases, "Air Manifold")).toBe("Air Pig");
  });

  it("falls back to the raw name unchanged when nothing's taught", () => {
    expect(resolveToolNameAlias({}, "Die Grinder")).toBe("Die Grinder");
  });

  it("matches regardless of the raw name's exact casing/punctuation", () => {
    const aliases = { "air manifold": "Air Pig" };
    expect(resolveToolNameAlias(aliases, "  AIR   MANIFOLD  ")).toBe("Air Pig");
  });
});

describe("learnToolNameAlias", () => {
  it("adds a new alias", () => {
    const result = learnToolNameAlias({}, "Air Manifold", "Air Pig");
    expect(result).toEqual({ "air manifold": "Air Pig" });
  });

  it("returns the same reference when there's nothing new to learn", () => {
    const aliases = { "air manifold": "Air Pig" };
    expect(learnToolNameAlias(aliases, "Air Manifold", "Air Pig")).toBe(aliases);
  });

  it("doesn't learn a no-op alias (raw name already matches the canonical one)", () => {
    const aliases = {};
    expect(learnToolNameAlias(aliases, "Die Grinder", "Die Grinder")).toBe(aliases);
  });
});

describe("awaitingSmeNamesMatch", () => {
  it("matches identical names", () => {
    expect(awaitingSmeNamesMatch("Die Grinder", "Die Grinder")).toBe(true);
  });

  it("matches regardless of word order", () => {
    expect(awaitingSmeNamesMatch("Extension Ladder, 24'", "24 Foot Extension Ladder")).toBe(true);
    expect(awaitingSmeNamesMatch("Extension Ladder, 32'", "32 Foot Extension Ladder")).toBe(true);
    expect(awaitingSmeNamesMatch("Step Ladder, 8'", "8 Foot Step Ladder")).toBe(true);
  });

  it("matches when one name is a superset of the other's words", () => {
    expect(awaitingSmeNamesMatch('Porta Ram, 4"', 'Ram, 4"')).toBe(true);
    expect(awaitingSmeNamesMatch("Porta Pump, Large", "Porta Pump")).toBe(true);
  });

  it("does not match a different-size ladder", () => {
    expect(awaitingSmeNamesMatch("Extension Ladder, 24'", "32 Foot Extension Ladder")).toBe(false);
  });

  it("does not match a true synonym sharing only one generic word", () => {
    expect(awaitingSmeNamesMatch("Air Pig", "Air Manifold")).toBe(false);
  });

  it("does not match a single generic word against anything containing it", () => {
    expect(awaitingSmeNamesMatch("Air", "Air Pig")).toBe(false);
    expect(awaitingSmeNamesMatch("Air Pig", "Air")).toBe(false);
  });

  it("handles blank names safely", () => {
    expect(awaitingSmeNamesMatch("", "Die Grinder")).toBe(false);
    expect(awaitingSmeNamesMatch("Die Grinder", "")).toBe(false);
  });
});

describe("parseSmeItemSerialCsv", () => {
  // Regression test for a real file: a tool-tagging sheet that has SME#s
  // and names assigned but no serial numbers recorded yet at all. Used to
  // produce zero rows (silently rejected by a filter requiring both sme
  // AND serial to be non-blank), so the whole file failed to import.
  it("still imports rows whose Serial column is entirely blank", () => {
    const csv = ["SME,Item,Category,Serial", "22640,Air Manifold,Air Manifolds,", "22641,Air Manifold,Air Manifolds,"].join(
      "\n"
    );
    const rows = parseSmeItemSerialCsv(csv);
    expect(rows).toEqual([
      { sme: "22640", serial: "", nameGuess: "Air Manifold" },
      { sme: "22641", serial: "", nameGuess: "Air Manifold" },
    ]);
  });

  it("still requires an SME# — a row missing that is dropped", () => {
    const csv = ["SME,Item,Category,Serial", ",Air Manifold,Air Manifolds,"].join("\n");
    expect(parseSmeItemSerialCsv(csv)).toEqual([]);
  });

  it("handles a quoted item name containing its own comma", () => {
    const csv = ['SME,Item,Category,Serial', '22661,"Ram, 4""",Porta Power Ram,'].join("\n");
    const rows = parseSmeItemSerialCsv(csv);
    expect(rows).toEqual([{ sme: "22661", serial: "", nameGuess: 'Ram, 4"' }]);
  });

  // A natural follow-up file once serials are actually in hand: just SME
  // and Serial, no Item column at all (the tool already exists, matched
  // by SME#, so a name isn't needed). Item used to be required too, which
  // would have rejected a file shaped exactly like this.
  it("imports a header with just SME and Serial columns, no Item", () => {
    const csv = ["SME,Serial", "22640,SN-111", "22641,SN-112"].join("\n");
    const rows = parseSmeItemSerialCsv(csv);
    expect(rows).toEqual([
      { sme: "22640", serial: "SN-111", nameGuess: "" },
      { sme: "22641", serial: "SN-112", nameGuess: "" },
    ]);
  });
});
