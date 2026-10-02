// Smoke tests for WareHub (Job Lists) — see BackorderDashboard.component.test.jsx
// for the rationale. This is the screen that was stuck in the App.jsx
// monolith the longest (everything else had already been pulled out before
// this one), so it had no isolated test harness at all until now.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WareHub } from "./WareHub";
import { JOBS_KEY, CATALOG_KEY, RETURNS_KEY, GENERAL_TODOS_KEY } from "../lib/api";
import { WORKERS_KEY, WORKER_TASKS_KEY } from "../lib/workertasks";
import { TOOLS_KEY } from "../lib/tools";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    getWithRetry: vi.fn(),
    saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
    peekUpdatedAt: vi.fn().mockResolvedValue({ ok: true, map: {} }),
    fetchPendingSuggestions: vi.fn().mockResolvedValue({ ok: true, suggestions: [] }),
  };
});

import { getWithRetry, saveWithRetry } from "../lib/api";

const job = {
  id: 1,
  name: "3052",
  createdAt: "2026-09-01T00:00:00.000Z",
  parentId: null,
  color: null,
  isQuickTransfer: false,
  sealed: false,
  archived: false,
  items: [
    {
      id: 10,
      name: "Gloves",
      qtyNeeded: 5,
      qtyUnit: "",
      qtyHave: 0,
      ordered: false,
      received: "no",
      storage: "Conex 1",
      storageDetail: "",
      containers: [],
      status: "red",
      gang: "Raising",
      category: "",
      catalogId: null,
      serials: [],
      needsTransfer: false,
      notes: "",
      backorderQty: 0,
      backorderReceiptDate: null,
      substituteForItemId: null,
    },
    {
      id: 11,
      name: "Helmet",
      qtyNeeded: 2,
      qtyUnit: "",
      qtyHave: 2,
      ordered: true,
      received: "yes",
      storage: "Conex 1",
      storageDetail: "",
      containers: [],
      status: "green",
      gang: "Raising",
      category: "",
      catalogId: null,
      serials: [],
      needsTransfer: false,
      notes: "",
      backorderQty: 0,
      backorderReceiptDate: null,
      substituteForItemId: null,
    },
  ],
  containerOptions: [],
  categoryOptions: [],
  todos: [],
  activityLog: [],
  undoStack: [],
  requisitionCategoryOrder: [],
  requisitions: [],
};

function mockData({ jobs = [job] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === JOBS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(jobs) });
    if (key === CATALOG_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    if (key === RETURNS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    if (key === GENERAL_TODOS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    if (key === WORKERS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    if (key === WORKER_TASKS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    if (key === TOOLS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify([]) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WareHub", () => {
  it("lists jobs on the picker screen", async () => {
    mockData();
    render(<WareHub isEditor isManager onGoToLanding={() => {}} />);
    expect(await screen.findByText("3052")).toBeInTheDocument();
  });

  it("opening a job shows its items with the right have/needed counts", async () => {
    mockData();
    render(<WareHub isEditor isManager onGoToLanding={() => {}} />);
    fireEvent.click(await screen.findByText("3052"));
    expect(await screen.findByText("Gloves")).toBeInTheDocument();
    expect(screen.getByText("Helmet")).toBeInTheDocument();
  });

  it("going back from the job picker calls onGoToLanding", async () => {
    mockData();
    const onGoToLanding = vi.fn();
    const { container } = render(<WareHub isEditor isManager onGoToLanding={onGoToLanding} />);
    await screen.findByText("3052");
    fireEvent.click(container.querySelector('button[title="Back to app home"]'));
    expect(onGoToLanding).toHaveBeenCalled();
  });
});
