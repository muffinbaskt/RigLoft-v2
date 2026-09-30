import { describe, it, expect } from "vitest";
import { combineNotes } from "./utils";

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
