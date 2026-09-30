import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmounts whatever the previous component test rendered, so one test's
// leftover DOM never leaks into the next one's queries/assertions.
afterEach(() => {
  cleanup();
});
