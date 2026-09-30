// Regression test for the exact bug reported live: linking one row's name
// to an existing awaiting-SME# tool only applied to that single row, so a
// file with several identically-named rows ("Air Manifold" x4, matching
// "Air Pig" in the registry) needed the same manual link repeated once per
// row. See ToolsApp.jsx's applyLinkToAllMatching.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportSerialNumbersModal } from "./ToolsApp";

vi.mock("../lib/api", () => ({
  getWithRetry: vi.fn().mockResolvedValue({ ok: true, value: null }),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
  extractPdfRows: vi.fn(),
}));

// 3 separate physical tools, same name — matches the real registry shape
// (several distinct "Air Pig" records, not one record reused 3 times).
const airPigs = [1, 2, 3].map((n) => ({
  id: `airpig${n}`,
  name: "Air Pig",
  status: "awaiting_sme",
  sme: null,
  history: [],
}));

function csvFile(text) {
  return new File([text], "sheet.csv", { type: "text/csv" });
}

describe("ImportSerialNumbersModal", () => {
  it("linking one row applies to every other row sharing that same raw name", async () => {
    const onSave = vi.fn();
    const { container } = render(
      <ImportSerialNumbersModal tools={airPigs} onSave={onSave} onClose={() => {}} />
    );

    const csv = [
      "SME,Item,Serial",
      "22641,Air Manifold,",
      "22642,Air Manifold,",
      "22643,Air Manifold,",
    ].join("\n");
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [csvFile(csv)] } });

    await screen.findByText(/3 rows found/);
    // All 3 start out unmatched.
    expect(screen.getAllByText("No existing tool — will create:").length).toBe(3);

    // Link just the first row's name...
    fireEvent.click(screen.getAllByText(/Actually, this is the same tool as an existing name/)[0]);
    fireEvent.click(await screen.findByText("Air Pig"));

    // ...and all 3 should now show as linked, not just the one clicked.
    await waitFor(() => {
      expect(screen.getAllByText(/Linked to "Air Pig"/).length).toBe(3);
    });
    expect(screen.queryByText("No existing tool — will create:")).not.toBeInTheDocument();
  });
});
