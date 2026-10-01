// Smoke tests for LoveListsApp — see BackorderDashboard.component.test.jsx
// for the rationale. Specifically worth having now that this screen is
// extracted: the bulk status-change feature (walkLoveItemToStatus) could
// previously only be verified as a pure function, since LoveListDetailPage
// was stuck inside the App.jsx monolith with no isolated test harness.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoveListsApp } from "./LoveListsApp";
import { LOVE_LISTS_KEY } from "../lib/lovelists";

vi.mock("../lib/api", () => ({
  CATALOG_KEY: "warehub-catalog",
  getWithRetry: vi.fn(),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
  peekUpdatedAt: vi.fn().mockResolvedValue({ ok: true, map: {} }),
}));

import { getWithRetry, saveWithRetry } from "../lib/api";

const list = {
  id: 1,
  jobLabel: "3052",
  subJobLabel: "",
  archived: false,
  dateReceived: "2026-09-01",
  items: [
    { id: 10, name: "Gloves", qty: 5, qtyUnit: "", qtyHave: 0, status: "requested", statusDates: {}, needsOrdering: true },
    { id: 11, name: "Helmet", qty: 2, qtyUnit: "", qtyHave: 0, status: "requested", statusDates: {}, needsOrdering: true },
  ],
};

function mockData({ lists = [list] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === LOVE_LISTS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(lists) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoveListsApp", () => {
  it("lists Love Lists grouped by job on the dashboard", async () => {
    mockData();
    render(<LoveListsApp isEditor isOwner onGoHome={() => {}} />);
    expect(await screen.findByText("3052")).toBeInTheDocument();
  });

  it("opening a list shows its items", async () => {
    mockData();
    render(<LoveListsApp isEditor isOwner onGoHome={() => {}} />);
    await screen.findByText("3052");
    fireEvent.click(screen.getByText("2 items"));
    expect(await screen.findByText("Gloves")).toBeInTheDocument();
    expect(screen.getByText("Helmet")).toBeInTheDocument();
  });

  it("bulk-changes the status of every selected item at once via walkLoveItemToStatus", async () => {
    const onGoHome = vi.fn();
    mockData();
    render(<LoveListsApp isEditor isOwner onGoHome={onGoHome} />);
    await screen.findByText("3052");
    fireEvent.click(screen.getByText("2 items"));
    await screen.findByText("Gloves");

    fireEvent.click(screen.getByText("Select items"));
    fireEvent.click(screen.getByText("Gloves"));
    // Helmet deliberately left unselected.

    fireEvent.click(screen.getByText("Change status..."));
    fireEvent.click(screen.getByText("Ordered"));

    await waitFor(() => expect(saveWithRetry).toHaveBeenCalled());
    const [savedKey, savedValue] = saveWithRetry.mock.calls.at(-1);
    expect(savedKey).toBe(LOVE_LISTS_KEY);
    const savedLists = JSON.parse(savedValue);
    const savedList = savedLists.find((l) => l.id === 1);
    expect(savedList.items.find((i) => i.id === 10).status).toBe("ordered");
    // Not selected — untouched.
    expect(savedList.items.find((i) => i.id === 11).status).toBe("requested");
  });

  it("back button from the dashboard calls onGoHome", async () => {
    mockData();
    const onGoHome = vi.fn();
    const { container } = render(<LoveListsApp isEditor isOwner onGoHome={onGoHome} />);
    await screen.findByText("3052");
    fireEvent.click(container.querySelector("header button"));
    expect(onGoHome).toHaveBeenCalled();
  });
});
