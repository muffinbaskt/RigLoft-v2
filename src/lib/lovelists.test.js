import { describe, it, expect } from "vitest";
import {
  describeListChange,
  findPossibleDuplicates,
  loveItemDisplayMeta,
  stepLoveItemStatus,
  walkLoveItemToStatus,
} from "./lovelists";

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

function baseItem(overrides = {}) {
  return {
    id: "i1",
    name: "Widget",
    qty: 10,
    qtyUnit: "",
    qtyHave: 0,
    status: "requested",
    statusDates: { requested: "2026-09-01", ordered: null, received: null, staged: null, sent: null },
    needsOrdering: true,
    serials: [],
    sentBatches: [],
    receivedBatches: [],
    stagedBatches: [],
    ...overrides,
  };
}

describe("stepLoveItemStatus", () => {
  it("requested -> ordered defaults qtyOrdered to the full qty", () => {
    const result = stepLoveItemStatus(baseItem(), "forward");
    expect(result.status).toBe("ordered");
    expect(result.qtyOrdered).toBe(10);
    expect(result.statusDates.ordered).toBeTruthy();
  });

  it("respects an already-set qtyOrdered instead of overwriting it", () => {
    const item = baseItem({ status: "requested", qtyOrdered: 4 });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.qtyOrdered).toBe(4);
  });

  it("an in-stock item (needsOrdering: false) skips Ordered entirely", () => {
    const item = baseItem({ needsOrdering: false });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.status).toBe("received");
    expect(result.qtyHave).toBe(10); // assumed fully received since nothing was in hand
  });

  it("ordered -> received assumes the full qty showed up when nothing was in hand yet", () => {
    const item = baseItem({ status: "ordered", qtyOrdered: 10 });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.status).toBe("received");
    expect(result.qtyHave).toBe(10);
    expect(result.receivedBatches.length).toBe(1);
    expect(result.receivedBatches[0].receivedQty).toBe(10);
  });

  it("respects a partial qtyHave already set by hand instead of clobbering it", () => {
    const item = baseItem({ status: "ordered", qtyHave: 3 });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.qtyHave).toBe(3);
    expect(result.receivedBatches[0].receivedQty).toBe(3);
  });

  it("received -> staged records a stagedBatches entry for the delta", () => {
    const item = baseItem({ status: "received", qtyHave: 10 });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.status).toBe("staged");
    expect(result.stagedBatches.length).toBe(1);
    expect(result.stagedBatches[0].stagedQty).toBe(10);
  });

  it("staged -> sent does NOT complete the status while short of the full qty", () => {
    const item = baseItem({ status: "staged", qty: 10, qtyHave: 6 });
    const result = stepLoveItemStatus(item, "forward");
    // Still "staged" — only a partial batch got locked in.
    expect(result.status).toBe("staged");
    expect(result.sentBatches.length).toBe(1);
    expect(result.sentBatches[0].sentQty).toBe(6);
  });

  it("staged -> sent completes once qtyHave has fully caught up", () => {
    const item = baseItem({ status: "staged", qty: 10, qtyHave: 10 });
    const result = stepLoveItemStatus(item, "forward");
    expect(result.status).toBe("sent");
    expect(result.sentBatches[0].sentQty).toBe(10);
  });

  it("a second forward tap with nothing new doesn't duplicate the batch entry", () => {
    const item = baseItem({ status: "ordered", qtyHave: 5 });
    const once = stepLoveItemStatus(item, "forward");
    const twice = stepLoveItemStatus(once, "backward"); // back to ordered
    const again = stepLoveItemStatus(twice, "forward"); // forward again, nothing changed
    expect(again.receivedBatches.length).toBe(1);
  });

  it("returns the exact same reference when there's nowhere left to go", () => {
    const item = baseItem({ status: "sent" });
    const result = stepLoveItemStatus(item, "forward");
    expect(result).toBe(item);
  });

  it("stepping backward doesn't overwrite the date already recorded for that status", () => {
    const item = baseItem({
      status: "ordered",
      statusDates: { requested: "2026-09-01", ordered: "2026-09-02", received: null, staged: null, sent: null },
    });
    const result = stepLoveItemStatus(item, "backward");
    expect(result.status).toBe("requested");
    // Going backward shouldn't touch the ordered date that's already there.
    expect(result.statusDates.ordered).toBe("2026-09-02");
  });
});

describe("walkLoveItemToStatus", () => {
  it("walks all the way from requested to sent when the full qty is available", () => {
    const item = baseItem({ qty: 10, qtyHave: 10 });
    const result = walkLoveItemToStatus(item, "sent");
    expect(result.status).toBe("sent");
    expect(result.qtyOrdered).toBe(10);
    expect(result.receivedBatches.length).toBe(1);
    expect(result.stagedBatches.length).toBe(1);
    expect(result.sentBatches.length).toBe(1);
  });

  it("does not loop forever and goes as far as it honestly can when short of qty", () => {
    const item = baseItem({ qty: 10, qtyHave: 4 });
    const result = walkLoveItemToStatus(item, "sent");
    // Short of the full qty — can get to Staged, but Sent can't complete.
    expect(result.status).toBe("staged");
  });

  it("skips an in-stock item entirely when the target is Ordered", () => {
    const item = baseItem({ needsOrdering: false });
    const result = walkLoveItemToStatus(item, "ordered");
    expect(result).toBe(item);
  });

  it("walks backward from sent to requested", () => {
    const item = baseItem({
      status: "sent",
      qty: 10,
      qtyHave: 10,
      sentBatches: [{ sentQty: 10, serials: [], timestamp: "2026-09-05T00:00:00.000Z" }],
    });
    const result = walkLoveItemToStatus(item, "requested");
    expect(result.status).toBe("requested");
  });

  it("does nothing when already at the target status", () => {
    const item = baseItem({ status: "received" });
    const result = walkLoveItemToStatus(item, "received");
    expect(result).toBe(item);
  });
});
