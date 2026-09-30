import { describe, it, expect } from "vitest";
import { attachSerialNumbers, newTool, parseSmeItemSerialCsv } from "./tools";

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
});
