import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Pure src/lib/*.test.js files run in plain Node (fast, no DOM needed).
// Component tests (src/**/*.component.test.jsx) opt into jsdom via this
// same config's environmentMatchGlobs, so rendering a screen doesn't slow
// down every other test file that doesn't need a browser environment.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    environmentMatchGlobs: [["**/*.component.test.jsx", "jsdom"]],
    setupFiles: ["./src/test-setup.js"],
  },
});
