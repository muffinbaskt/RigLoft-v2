// Smoke tests for ReceivingApp — see BackorderDashboard.component.test.jsx
// for the rationale. Also guards the owner-only access-control fix the
// same way ReceiptArchive's does.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReceivingApp } from "./ReceivingApp";
import { RECEIVING_QUEUE_KEY } from "../lib/receiving";

vi.mock("../lib/api", () => ({
  JOBS_KEY: "warehub-jobs",
  CATALOG_KEY: "warehub-catalog",
  getWithRetry: vi.fn(),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
}));

import { getWithRetry } from "../lib/api";

const pendingBatch = {
  id: 1,
  status: "pending",
  label: "Acme Supply",
  lines: [{ id: 10, name: "Gloves", rawName: "gloves" }],
  scannedAt: "2026-09-01T12:00:00.000Z",
  photoUrl: null,
  totalPages: 1,
};

function mockData({ queue = [pendingBatch] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === RECEIVING_QUEUE_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(queue) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReceivingApp", () => {
  it("blocks anyone who isn't the owner, without loading any data", async () => {
    mockData();
    render(<ReceivingApp onGoHome={() => {}} isOwner={false} />);

    expect(await screen.findByText("Owner only")).toBeInTheDocument();
    expect(screen.getByText("Receiving isn't available on this account.")).toBeInTheDocument();
    expect(getWithRetry).not.toHaveBeenCalled();
  });

  it("lists pending receipts for the owner", async () => {
    mockData();
    render(<ReceivingApp onGoHome={() => {}} isOwner />);

    expect(await screen.findByText("Acme Supply")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review (1)")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is pending", async () => {
    mockData({ queue: [] });
    render(<ReceivingApp onGoHome={() => {}} isOwner />);

    expect(
      await screen.findByText("Nothing waiting on you — scan a receipt to get started.")
    ).toBeInTheDocument();
  });

  it("filters pending receipts with the search box", async () => {
    mockData({
      queue: [pendingBatch, { ...pendingBatch, id: 2, label: "Other Vendor", lines: [] }],
    });
    render(<ReceivingApp onGoHome={() => {}} isOwner />);
    await screen.findByText("Acme Supply");

    fireEvent.change(screen.getByPlaceholderText("Search pending receipts — item, label..."), {
      target: { value: "acme" },
    });

    expect(screen.getByText("Acme Supply")).toBeInTheDocument();
    expect(screen.queryByText("Other Vendor")).not.toBeInTheDocument();
  });

  it("opening a pending receipt switches to the batch review screen", async () => {
    mockData();
    render(<ReceivingApp onGoHome={() => {}} isOwner />);
    await screen.findByText("Acme Supply");

    fireEvent.click(screen.getByText("Acme Supply"));

    // ReceivingBatchReview's header shows the batch's own label as its title.
    expect(await screen.findByText("Saves automatically")).toBeInTheDocument();
  });

  it("back button calls onGoHome", async () => {
    mockData();
    const onGoHome = vi.fn();
    const { container } = render(<ReceivingApp onGoHome={onGoHome} isOwner />);
    await screen.findByText("Acme Supply");

    fireEvent.click(container.querySelector("header button"));
    expect(onGoHome).toHaveBeenCalled();
  });
});
