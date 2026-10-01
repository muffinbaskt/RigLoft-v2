import { describe, it, expect } from "vitest";
import { combineNotes, looseNameMatch, newJob, REQUISITION_TEMPLATES, DEFAULT_REQUISITION_CATEGORIES } from "./utils";

describe("combineNotes", () => {
  it("uses the addition when there's no existing note", () => {
    expect(combineNotes("", "check for rust")).toBe("check for rust");
    expect(combineNotes(null, "check for rust")).toBe("check for rust");
  });

  it("keeps the existing note when there's no addition", () => {
    expect(combineNotes("already damaged", "")).toBe("already damaged");
    expect(combineNotes("already damaged", undefined)).toBe("already damaged");
  });

  it("appends the addition onto the existing note, newline-separated", () => {
    expect(combineNotes("already damaged", "field says corner bent")).toBe(
      "already damaged\nfield says corner bent"
    );
  });

  it("treats a whitespace-only addition as nothing to add", () => {
    expect(combineNotes("already damaged", "   ")).toBe("already damaged");
  });

  it("returns an empty string when both are empty", () => {
    expect(combineNotes("", "")).toBe("");
  });
});

describe("newJob", () => {
  it("seeds the default requisition categories, pre-filled from their templates", () => {
    const job = newJob("Test Job");
    expect(job.requisitionCategoryOrder).toEqual(DEFAULT_REQUISITION_CATEGORIES);
    DEFAULT_REQUISITION_CATEGORIES.forEach((cat) => {
      const specs = job.requisitions.filter((r) => r.category === cat).map((r) => r.spec);
      expect(specs).toEqual(REQUISITION_TEMPLATES[cat]);
    });
    // Every seeded entry starts at qty 0, same as manually adding a
    // templated category does.
    expect(job.requisitions.every((r) => r.qty === 0)).toBe(true);
  });

  it("gives every seeded requisition entry a unique id", () => {
    const job = newJob("Test Job");
    const ids = job.requisitions.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("doesn't seed requisitions for a Quick Transfer job", () => {
    const job = newJob("Transfer", null, null, true);
    expect(job.requisitionCategoryOrder).toEqual([]);
    expect(job.requisitions).toEqual([]);
  });
});

describe("looseNameMatch", () => {
  it("matches identical names", () => {
    expect(looseNameMatch("Die Grinder", "Die Grinder")).toBe(true);
  });

  it("matches regardless of word order", () => {
    expect(looseNameMatch("Extension Ladder, 24'", "24 Foot Extension Ladder")).toBe(true);
  });

  it("matches a superset by default (allowSubset defaults on)", () => {
    expect(looseNameMatch("Porta Pump, Large", "Porta Pump")).toBe(true);
  });

  it("does not match a superset when allowSubset is off", () => {
    expect(looseNameMatch("Porta Pump, Large", "Porta Pump", { allowSubset: false })).toBe(false);
  });

  it("still matches word-order-only variations when allowSubset is off", () => {
    expect(looseNameMatch("Extension Ladder, 24'", "24 Foot Extension Ladder", { allowSubset: false })).toBe(true);
  });

  it("does not match a true synonym sharing only one generic word", () => {
    expect(looseNameMatch("Air Pig", "Air Manifold")).toBe(false);
  });

  it("handles blank names safely", () => {
    expect(looseNameMatch("", "Die Grinder")).toBe(false);
  });
});
