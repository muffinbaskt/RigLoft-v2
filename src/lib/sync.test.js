import { describe, it, expect } from "vitest";
import { wouldWipeAnyJobItems } from "./sync";

describe("wouldWipeAnyJobItems", () => {
  it("flags a job that had items and would come back with none", () => {
    const current = [{ id: 1, items: [{ id: 1, name: "Beam" }] }];
    const incoming = [{ id: 1, items: [] }];
    expect(wouldWipeAnyJobItems(current, incoming)).toBe(true);
  });

  it("does not flag a job that was already empty", () => {
    const current = [{ id: 1, items: [] }];
    const incoming = [{ id: 1, items: [] }];
    expect(wouldWipeAnyJobItems(current, incoming)).toBe(false);
  });

  it("does not flag a job that still has items", () => {
    const current = [{ id: 1, items: [{ id: 1, name: "Beam" }] }];
    const incoming = [{ id: 1, items: [{ id: 1, name: "Beam" }] }];
    expect(wouldWipeAnyJobItems(current, incoming)).toBe(false);
  });

  it("does not flag a job that only exists in the incoming set (a genuinely new job)", () => {
    const current = [];
    const incoming = [{ id: 1, items: [] }];
    expect(wouldWipeAnyJobItems(current, incoming)).toBe(false);
  });

  it("catches the wipe even when it's just one job among several unaffected ones", () => {
    const current = [
      { id: 1, items: [{ id: 1, name: "Beam" }] },
      { id: 2, items: [{ id: 2, name: "Bolt" }] },
    ];
    const incoming = [
      { id: 1, items: [{ id: 1, name: "Beam" }] },
      { id: 2, items: [] },
    ];
    expect(wouldWipeAnyJobItems(current, incoming)).toBe(true);
  });
});
