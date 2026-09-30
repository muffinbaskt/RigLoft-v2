// Smoke tests for BackorderDashboard. Written ahead of splitting this
// screen out of App.jsx as a before/after baseline; now living alongside
// the extracted component. Not full coverage — renders with fake data and
// asserts real behavior (list rendering, search, empty state, clear/back
// actions) so a future change here can't silently break any of it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackorderDashboard } from "./BackorderDashboard";
import { JOBS_KEY } from "../lib/api";
import { LOVE_LISTS_KEY } from "../lib/lovelists";

vi.mock("../lib/api", () => ({
  JOBS_KEY: "warehub-jobs",
  getWithRetry: vi.fn(),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
}));

import { getWithRetry, saveWithRetry } from "../lib/api";

const job = {
  id: 1,
  name: "3052",
  archived: false,
  items: [
    { id: 10, name: "Beam Clamp", backorderQty: 4, qtyUnit: "", backorderReceiptDate: "2026-09-01" },
    { id: 11, name: "Shackle", backorderQty: 0 },
  ],
};

const loveList = {
  id: 2,
  jobLabel: "3097",
  archived: false,
  items: [{ id: 20, name: "Rain Suit", backorderQty: 2, qtyUnit: "", backorderReceiptDate: "2026-09-15" }],
};

function mockData({ jobs = [job], lists = [loveList] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === JOBS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(jobs) });
    if (key === LOVE_LISTS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(lists) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BackorderDashboard", () => {
  it("lists backordered items pulled from both jobs and Love Lists", async () => {
    mockData();
    render(<BackorderDashboard onGoHome={() => {}} />);

    expect(await screen.findByText("Beam Clamp")).toBeInTheDocument();
    expect(screen.getByText("Rain Suit")).toBeInTheDocument();
    // Shackle has backorderQty 0 — shouldn't show up at all.
    expect(screen.queryByText("Shackle")).not.toBeInTheDocument();
    expect(screen.getByText("Backorders (2)")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is on backorder", async () => {
    mockData({ jobs: [], lists: [] });
    render(<BackorderDashboard onGoHome={() => {}} />);

    expect(await screen.findByText("Nothing on backorder anywhere right now.")).toBeInTheDocument();
  });

  it("filters rows with the search box", async () => {
    mockData();
    render(<BackorderDashboard onGoHome={() => {}} />);
    await screen.findByText("Beam Clamp");

    fireEvent.change(screen.getByPlaceholderText("Search by item or job/list name..."), {
      target: { value: "rain" },
    });

    expect(screen.queryByText("Beam Clamp")).not.toBeInTheDocument();
    expect(screen.getByText("Rain Suit")).toBeInTheDocument();
  });

  it("clearing a single backorder zeroes it out and saves", async () => {
    mockData();
    render(<BackorderDashboard onGoHome={() => {}} />);
    await screen.findByText("Beam Clamp");

    // Oldest-first is the default sort, so Beam Clamp (2026-09-01) sorts
    // ahead of Rain Suit (2026-09-15) — this is its row's Clear button.
    fireEvent.click(screen.getAllByTitle("Clear this backorder")[0]);
    expect(screen.getByText("Clear this backorder?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(saveWithRetry).toHaveBeenCalled());
    const [savedKey, savedValue] = saveWithRetry.mock.calls[0];
    expect(savedKey).toBe(JOBS_KEY);
    const savedJobs = JSON.parse(savedValue);
    expect(savedJobs[0].items[0].backorderQty).toBe(0);
  });

  it("back button calls onGoHome", async () => {
    mockData();
    const onGoHome = vi.fn();
    render(<BackorderDashboard onGoHome={onGoHome} />);
    await screen.findByText("Beam Clamp");

    fireEvent.click(screen.getByText("Back"));
    expect(onGoHome).toHaveBeenCalled();
  });
});
