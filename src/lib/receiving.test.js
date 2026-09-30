import { describe, it, expect } from "vitest";
import { mergeJobItems, mergeLoveListItems } from "./receiving";

describe("mergeJobItems", () => {
  const target = {
    id: "target",
    name: "Widget",
    qtyNeeded: "10",
    qtyUnit: "",
    containers: [{ name: "Unassigned", qty: 3 }],
    qtyHave: 3,
    status: "yellow",
    ordered: true,
    received: "partial",
    backorderQty: 0,
    backorderReceiptDate: null,
  };

  it("merges an entirely-backordered imported item (0 on hand) instead of no-op'ing", () => {
    const source = {
      id: "source",
      name: "Widget",
      qtyNeeded: "5",
      qtyUnit: "",
      containers: [],
      qtyHave: 0,
      status: "red",
      ordered: true,
      received: "partial",
      backorderQty: 5,
      backorderReceiptDate: "2026-09-30",
      importedViaReceiving: true,
    };

    const result = mergeJobItems([target, source], "source", "target");

    // The duplicate is gone entirely — nothing left at 0 qty.
    expect(result.find((i) => i.id === "source")).toBeUndefined();
    const merged = result.find((i) => i.id === "target");
    expect(merged.backorderQty).toBe(5);
    expect(merged.backorderReceiptDate).toBe("2026-09-30");
    expect(merged.received).toBe("partial");
    // No physical quantity actually moved — the target's on-hand count
    // is untouched, only the backorder note came across.
    expect(merged.qtyHave).toBe(3);
  });

  it("still merges physical quantity normally when there's something to absorb", () => {
    const source = {
      id: "source",
      name: "Widget",
      qtyNeeded: "5",
      qtyUnit: "",
      containers: [{ name: "Unassigned", qty: 4 }],
      qtyHave: 4,
      status: "yellow",
      ordered: true,
      received: "partial",
      backorderQty: 0,
      backorderReceiptDate: null,
      importedViaReceiving: true,
    };

    const result = mergeJobItems([target, source], "source", "target");
    const merged = result.find((i) => i.id === "target");
    expect(merged.qtyHave).toBe(7);
    expect(result.find((i) => i.id === "source")).toBeUndefined();
  });

  it("doesn't let a stale backorder note overwrite a newer one already on the target", () => {
    const newerTarget = { ...target, backorderQty: 2, backorderReceiptDate: "2026-09-29" };
    const staleSource = {
      id: "source",
      name: "Widget",
      qtyNeeded: "5",
      qtyUnit: "",
      containers: [],
      qtyHave: 0,
      backorderQty: 9,
      backorderReceiptDate: "2026-09-01",
      importedViaReceiving: true,
    };

    const result = mergeJobItems([newerTarget, staleSource], "source", "target");
    const merged = result.find((i) => i.id === "target");
    expect(merged.backorderQty).toBe(2);
    expect(merged.backorderReceiptDate).toBe("2026-09-29");
  });

  it("still no-ops when there's genuinely nothing to merge (no qty, no backorder)", () => {
    const emptySource = {
      id: "source",
      name: "Widget",
      qtyNeeded: "5",
      qtyUnit: "",
      containers: [],
      qtyHave: 0,
      backorderQty: 0,
      backorderReceiptDate: null,
      importedViaReceiving: true,
    };
    const items = [target, emptySource];
    expect(mergeJobItems(items, "source", "target")).toBe(items);
  });
});

describe("mergeLoveListItems", () => {
  const target = {
    id: "target",
    name: "Widget",
    qty: 10,
    qtyUnit: "",
    qtyHave: 3,
    backorderQty: 0,
    backorderReceiptDate: null,
  };

  it("merges an entirely-backordered imported item (0 on hand) instead of no-op'ing", () => {
    const source = {
      id: "source",
      name: "Widget",
      qty: 5,
      qtyUnit: "",
      qtyHave: 0,
      backorderQty: 5,
      backorderReceiptDate: "2026-09-30",
      importedViaReceiving: true,
    };

    const result = mergeLoveListItems([target, source], "source", "target");

    expect(result.find((i) => i.id === "source")).toBeUndefined();
    const merged = result.find((i) => i.id === "target");
    expect(merged.backorderQty).toBe(5);
    expect(merged.backorderReceiptDate).toBe("2026-09-30");
    expect(merged.qtyHave).toBe(3);
  });
});
