// Smoke tests for ReceiptArchive — see BackorderDashboard.component.test.jsx
// for the rationale (a before/after baseline for the eventual component
// split). Also directly guards the owner-only access-control fix: if a
// future refactor accidentally drops the isOwner check, the "blocks a
// non-owner" test here fails immediately instead of waiting for someone to
// notice in production.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReceiptArchive } from "./ReceiptArchive";
import { RECEIPT_ARCHIVE_KEY } from "../lib/receiving";

vi.mock("../lib/api", () => ({
  JOBS_KEY: "warehub-jobs",
  CATALOG_KEY: "warehub-catalog",
  getWithRetry: vi.fn(),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
  deleteReferenceDocument: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getWithRetry, saveWithRetry } from "../lib/api";

const entry = {
  id: 1,
  vendor: "Acme Supply",
  poNumber: "PO-100",
  receiptDate: "2026-09-01",
  archivedAt: "2026-09-01T12:00:00.000Z",
  fullText: "Acme Supply receipt",
  items: [{ id: 10, name: "Gloves", rawName: "gloves" }],
  photoUrl: null,
  photoPath: null,
};

function mockData({ entries = [entry] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === RECEIPT_ARCHIVE_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(entries) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReceiptArchive", () => {
  it("blocks anyone who isn't the owner, without loading any data", async () => {
    mockData();
    render(<ReceiptArchive onGoHome={() => {}} isOwner={false} />);

    expect(await screen.findByText("Owner only")).toBeInTheDocument();
    expect(screen.getByText("Receipt Archive isn't available on this account.")).toBeInTheDocument();
    expect(getWithRetry).not.toHaveBeenCalled();
  });

  it("lists archived receipts for the owner", async () => {
    mockData();
    render(<ReceiptArchive onGoHome={() => {}} isOwner />);

    expect(await screen.findByText("Acme Supply")).toBeInTheDocument();
    expect(screen.getByText(/PO#PO-100/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing is archived", async () => {
    mockData({ entries: [] });
    render(<ReceiptArchive onGoHome={() => {}} isOwner />);

    expect(await screen.findByText("Nothing archived yet — tap Scan to get started.")).toBeInTheDocument();
  });

  it("filters by the search box", async () => {
    mockData({
      entries: [entry, { ...entry, id: 2, vendor: "Other Vendor", fullText: "other vendor receipt", items: [] }],
    });
    render(<ReceiptArchive onGoHome={() => {}} isOwner />);
    await screen.findByText("Acme Supply");

    fireEvent.change(
      screen.getByPlaceholderText("Search item names, vendor, or anything printed on a receipt..."),
      { target: { value: "acme" } }
    );

    expect(screen.getByText("Acme Supply")).toBeInTheDocument();
    expect(screen.queryByText("Other Vendor")).not.toBeInTheDocument();
  });

  it("deleting an entry removes it and saves", async () => {
    mockData();
    const { container } = render(<ReceiptArchive onGoHome={() => {}} isOwner />);
    await screen.findByText("Acme Supply");

    // The row's delete affordance is a <span> (not a button, so it doesn't
    // also trigger the row's own onClick) marked out by its border classes.
    fireEvent.click(container.querySelector(".border-l.border-slate-800"));
    expect(screen.getByText("Delete this archived receipt?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(saveWithRetry).toHaveBeenCalled());
    const [savedKey, savedValue] = saveWithRetry.mock.calls[0];
    expect(savedKey).toBe(RECEIPT_ARCHIVE_KEY);
    expect(JSON.parse(savedValue)).toEqual([]);
  });

  it("back button calls onGoHome", async () => {
    mockData();
    const onGoHome = vi.fn();
    const { container } = render(<ReceiptArchive onGoHome={onGoHome} isOwner />);
    await screen.findByText("Acme Supply");

    // The header's back button has no accessible text (icon-only) — the
    // header's first <button> is the most reliable way to reach it.
    fireEvent.click(container.querySelector("header button"));
    expect(onGoHome).toHaveBeenCalled();
  });
});
