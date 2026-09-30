// Smoke test for ToolsApp — see BackorderDashboard.component.test.jsx for
// the rationale. Kept intentionally light (list rendering, search, empty
// state, navigation) rather than covering every sub-modal (Add tool,
// Backfill, Serial import, Transfer tags) — this is a baseline against
// accidental breakage from moving the file, not full feature coverage.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolsApp } from "./ToolsApp";
import { TOOLS_KEY } from "../lib/tools";

vi.mock("../lib/api", () => ({
  JOBS_KEY: "warehub-jobs",
  CATALOG_KEY: "warehub-catalog",
  getWithRetry: vi.fn(),
  saveWithRetry: vi.fn().mockResolvedValue({ ok: true, updatedAt: new Date().toISOString() }),
}));

import { getWithRetry } from "../lib/api";

const tool = {
  id: 1,
  name: "Ramset Gun",
  sme: "10001",
  status: "storage",
  serialNumber: "SN-AAA",
  history: [],
};

function mockData({ tools = [tool] } = {}) {
  getWithRetry.mockImplementation((key) => {
    if (key === TOOLS_KEY) return Promise.resolve({ ok: true, value: JSON.stringify(tools) });
    return Promise.resolve({ ok: true, value: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ToolsApp", () => {
  it("blocks anyone who isn't the owner, without loading any data", async () => {
    mockData();
    render(<ToolsApp onGoHome={() => {}} isOwner={false} />);

    expect(await screen.findByText("Owner only")).toBeInTheDocument();
    expect(screen.getByText("Tools isn't available on this account.")).toBeInTheDocument();
    expect(getWithRetry).not.toHaveBeenCalled();
  });

  it("lists tools with their name and SME# for the owner", async () => {
    mockData();
    render(<ToolsApp onGoHome={() => {}} isOwner />);

    expect(await screen.findByText("Ramset Gun")).toBeInTheDocument();
    expect(screen.getByText("SME# 10001")).toBeInTheDocument();
  });

  it("shows the empty state when the registry is empty", async () => {
    mockData({ tools: [] });
    render(<ToolsApp onGoHome={() => {}} isOwner />);

    expect(
      await screen.findByText('No tools in the registry yet — tap "Add tool" to start tracking one.')
    ).toBeInTheDocument();
  });

  it("filters tools with the search box", async () => {
    mockData({
      tools: [tool, { id: 2, name: "Impact Wrench", sme: "10002", status: "storage", history: [] }],
    });
    render(<ToolsApp onGoHome={() => {}} isOwner />);
    await screen.findByText("Ramset Gun");

    fireEvent.change(screen.getByPlaceholderText("Search SME #, item name, or job..."), {
      target: { value: "ramset" },
    });

    expect(screen.getByText("Ramset Gun")).toBeInTheDocument();
    expect(screen.queryByText("Impact Wrench")).not.toBeInTheDocument();
  });

  it("back button calls onGoHome", async () => {
    mockData();
    const onGoHome = vi.fn();
    const { container } = render(<ToolsApp onGoHome={onGoHome} isOwner />);
    await screen.findByText("Ramset Gun");

    fireEvent.click(container.querySelector("header button"));
    expect(onGoHome).toHaveBeenCalled();
  });
});
