// Smoke test for ReceivingBatchReview — see
// BackorderDashboard.component.test.jsx for the rationale. This component
// takes its data as plain props (no internal fetch), so no API mocking is
// needed at all. Worth having its own file specifically because this is
// the screen behind this session's save-race and stale-closure bugs
// (src/App.jsx's own comments on batchRef explain the stale-closure one) —
// a future refactor reintroducing either would be caught here.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReceivingBatchReview } from "./ReceivingApp";

const batch = {
  id: 1,
  status: "pending",
  label: "Acme Supply",
  lines: [{ id: 10, name: "Gloves", rawName: "gloves", shippedQty: 5, backorderQty: 0, unitPrice: 0 }],
};

function baseProps(overrides = {}) {
  return {
    batch,
    jobs: [],
    lists: [],
    catalog: [],
    otherPendingBatches: [],
    onUpdateBatch: vi.fn(),
    onLearnAlias: vi.fn(),
    onApprove: vi.fn(),
    onDiscard: vi.fn(),
    onCombine: vi.fn(),
    onViewPhoto: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

describe("ReceivingBatchReview", () => {
  it("renders the batch's lines", () => {
    render(<ReceivingBatchReview {...baseProps()} />);
    expect(screen.getByDisplayValue("Gloves")).toBeInTheDocument();
  });

  it("editing a line's name calls onUpdateBatch with the new value immediately, not debounced", () => {
    const onUpdateBatch = vi.fn();
    render(<ReceivingBatchReview {...baseProps({ onUpdateBatch })} />);

    fireEvent.change(screen.getByDisplayValue("Gloves"), { target: { value: "Work Gloves" } });

    expect(onUpdateBatch).toHaveBeenCalledTimes(1);
    const updated = onUpdateBatch.mock.calls[0][0];
    expect(updated.lines[0].name).toBe("Work Gloves");
  });

  it("back button calls onBack", () => {
    const onBack = vi.fn();
    const { container } = render(<ReceivingBatchReview {...baseProps({ onBack })} />);
    fireEvent.click(container.querySelector("header button"));
    expect(onBack).toHaveBeenCalled();
  });

  it("discarding asks for confirmation, then calls onDiscard with the batch", () => {
    const onDiscard = vi.fn();
    render(<ReceivingBatchReview {...baseProps({ onDiscard })} />);

    fireEvent.click(screen.getByText("Discard"));
    expect(screen.getByText("Discard this receipt?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDiscard).toHaveBeenCalledWith(batch);
  });

  it("shows the PO# when the batch has one", () => {
    render(<ReceivingBatchReview {...baseProps({ batch: { ...batch, poNumber: "1112-2998-1234" } })} />);
    expect(screen.getByText("PO#1112-2998-1234")).toBeInTheDocument();
  });

  it("shows nothing PO-related when the batch has no PO#", () => {
    render(<ReceivingBatchReview {...baseProps()} />);
    expect(screen.queryByText(/^PO#/)).not.toBeInTheDocument();
  });

  it("arrow-down from one line's name field moves focus to the next line's", () => {
    const twoLineBatch = {
      ...batch,
      lines: [
        { id: 10, name: "Gloves", rawName: "gloves", shippedQty: 5, backorderQty: 0 },
        { id: 11, name: "Hammers", rawName: "hammers", shippedQty: 2, backorderQty: 0 },
      ],
    };
    render(<ReceivingBatchReview {...baseProps({ batch: twoLineBatch })} />);

    const glovesInput = screen.getByDisplayValue("Gloves");
    glovesInput.focus();
    fireEvent.keyDown(glovesInput, { key: "ArrowDown" });

    expect(document.activeElement).toBe(screen.getByDisplayValue("Hammers"));

    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(glovesInput);
  });

  it("left/right arrow keys call onNavigateBatch, respecting the boundary flags", () => {
    const onNavigateBatch = vi.fn();
    render(
      <ReceivingBatchReview
        {...baseProps({ onNavigateBatch, canNavigatePrev: false, canNavigateNext: true })}
      />
    );

    fireEvent.keyDown(window, { key: "ArrowLeft" }); // blocked — no previous
    expect(onNavigateBatch).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNavigateBatch).toHaveBeenCalledWith(1);
  });

  it("doesn't hijack arrow keys while actually typing in a line's name field", () => {
    const onNavigateBatch = vi.fn();
    render(
      <ReceivingBatchReview
        {...baseProps({ onNavigateBatch, canNavigatePrev: true, canNavigateNext: true })}
      />
    );

    const nameInput = screen.getByDisplayValue("Gloves");
    nameInput.focus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(onNavigateBatch).not.toHaveBeenCalled();
  });
});
