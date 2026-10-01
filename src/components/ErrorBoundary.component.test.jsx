import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb() {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows a recoverable screen instead of crashing when a child throws", () => {
    // React logs the error to console itself on top of componentDidCatch —
    // silence it here so the test output isn't noise, same reasoning
    // React's own docs give for testing error boundaries this way.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something broke")).toBeInTheDocument();
    expect(screen.getByText("Reload")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("the Reload button reloads the page", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Reload"));
    expect(reloadSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
