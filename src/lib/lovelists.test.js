import { describe, it, expect } from "vitest";
import { describeListChange, findPossibleDuplicates, loveItemDisplayMeta } from "./lovelists";

const baseList = {
  id: 1,
  jobLabel: "3097",
  subJobLabel: "",
  archived: false,
  items: [
    { id: 10, name: "Gloves", qty: 5, status: "requested", archived: false },
    { id: 11, name: "Helmet", qty: 2, status: "requested", archived: false },
  ],
};

describe("describeListChange", () => {
  it("describes a single item being added", () => {
    const after = {
      ...baseList,
      items: [...baseList.items, { id: 12, name: "Radio", qty: 1, status: "requested" }],
    };
    expect(describeListChange(baseList, after)).toBe("Added Radio");
  });

  it("describes multiple items being added", () => {
    const after = {
      ...baseList,
      items: [
        ...baseList.items,
        { id: 12, name: "Radio", qty: 1, status: "requested" },
        { id: 13, name: "Beacon", qty: 1, status: "requested" },
      ],
    };
    expect(describeListChange(baseList, after)).toBe("Added 2 items");
  });

  it("describes a single item being removed", () => {
    const after = { ...baseList, items: baseList.items.slice(0, 1) };
    expect(describeListChange(baseList, after)).toBe("Removed Helmet");
  });

  it("describes a status change", () => {
    const after = {
      ...baseList,
      items: [{ ...baseList.items[0], status: "ordered" }, baseList.items[1]],
    };
    expect(describeListChange(baseList, after)).toBe("Gloves: Requested → Ordered");
  });

  it("describes an item being archived", () => {
    const after = {
      ...baseList,
      items: [{ ...baseList.items[0], archived: true }, baseList.items[1]],
    };
    expect(describeListChange(baseList, after)).toBe("Archived Gloves");
  });

  it("describes a quantity change", () => {
    const after = {
      ...baseList,
      items: [{ ...baseList.items[0], qty: 8 }, baseList.items[1]],
    };
    expect(describeListChange(baseList, after)).toBe("Gloves qty updated");
  });

  it("describes a list rename", () => {
    const after = { ...baseList, subJobLabel: "Part 2" };
    expect(describeListChange(baseList, after)).toBe("Renamed list");
  });

  it("describes a list being archived", () => {
    const after = { ...baseList, archived: true };
    expect(describeListChange(baseList, after)).toBe("Archived list");
  });

  it("falls back to a generic label for anything else", () => {
    const after = { ...baseList, dateReceived: "2026-01-01" };
    expect(describeListChange(baseList, after)).toBe("List updated");
  });

  it("labels an inventory item's jump straight to Received as 'In Stock'", () => {
    const after = {
      ...baseList,
      items: [
        { ...baseList.items[0], status: "received", needsOrdering: false },
        baseList.items[1],
      ],
    };
    expect(describeListChange(baseList, after)).toBe("Gloves: Requested → In Stock");
  });
});

describe("loveItemDisplayMeta", () => {
  it("shows 'In Stock' for an item pulled from inventory that reached Received", () => {
    const item = { status: "received", needsOrdering: false, qty: 3 };
    expect(loveItemDisplayMeta(item).label).toBe("In Stock");
  });

  it("still shows 'Received' for an item that was actually ordered", () => {
    const item = { status: "received", needsOrdering: true, qty: 3 };
    expect(loveItemDisplayMeta(item).label).toBe("Received");
  });
});

describe("findPossibleDuplicates", () => {
  const listA = { id: "a", jobLabel: "3052", items: [{ id: "a1", name: "Shims 1/4\"" }] };
  const listB = { id: "b", jobLabel: "3097", items: [{ id: "b1", name: "Shims, 1/4 inch" }] };

  it("finds a same-named item on another list", () => {
    const result = findPossibleDuplicates('Shims 1/4"', null, [], [listA, listB]);
    expect(result.map((r) => r.list.id)).toContain("b");
  });

  it("excludeListId actually excludes that list (regression - was accepted but ignored)", () => {
    const result = findPossibleDuplicates('Shims 1/4"', null, [], [listA, listB], {
      excludeListId: "a",
    });
    expect(result.map((r) => r.list.id)).not.toContain("a");
    expect(result.map((r) => r.list.id)).toContain("b");
  });

  it("excludeItemId excludes just that one item", () => {
    const result = findPossibleDuplicates('Shims 1/4"', null, [], [listA], {
      excludeItemId: "a1",
    });
    expect(result.length).toBe(0);
  });
});
