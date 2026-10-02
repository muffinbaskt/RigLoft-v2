import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Deliberately narrow, not a full "recommended" preset — scoped to exactly
// the bug classes actually hit in this codebase (see commit history):
//  - no-undef: a plain undefined-identifier reference (a missed import
//    after moving a component between files) isn't a module-resolution
//    error, so Vite/esbuild's own build step never catches it. This is
//    the automatic, in-editor version of the custom AST scope-analysis
//    script that had to be hand-written to find three of these during the
//    Love Lists extraction.
//  - react-hooks/rules-of-hooks: catches "Rendered more hooks than during
//    the previous render" before it reaches a test or a user — hit once
//    already (a useRef landed after an early conditional return).
//  - react-hooks/exhaustive-deps (warn, not error): the codebase already
//    has a dozen pre-existing `eslint-disable-next-line
//    react-hooks/exhaustive-deps` comments, each with its own explanation
//    — meaning this rule was already anticipated and deliberately worked
//    around, just never actually turned on to enforce it everywhere else.
//  - no-unused-vars: exactly what a half-finished extraction leaves
//    behind (several dead imports were found and cleaned up by hand
//    during yesterday's extractions) — also already has pre-existing
//    suppressions in the codebase for the same reason.
// The full eslint-plugin-react-hooks v7 rule set (React Compiler's static
// analysis rules — purity, immutability, set-state-in-render, etc.) is
// intentionally NOT enabled here: turning that on wholesale against a
// long-lived, pre-Compiler codebase would surface a large volume of
// findings unrelated to anything actually hit in practice, trading a
// quick, trustworthy safety net for a big new triage project.
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    // Test files have their own, already-verified safety net (they're run
    // on every change) and use vitest's describe/it/expect/vi globals
    // instead of browser ones — excluded here rather than teaching this
    // config a second global set just for that.
    ignores: ["src/**/*.test.js", "src/**/*.test.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __BUILD_TIME__ is a real compile-time constant injected by
      // vite.config.js's `define` block, not a missing import.
      globals: { ...globals.browser, __BUILD_TIME__: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // The service worker runs in its own global scope (ServiceWorkerGlobalScope),
    // not a browser window — `clients`, `self`, `caches`, etc. are real globals
    // there, not missing imports.
    files: ["src/sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.serviceworker },
    },
    rules: { "no-undef": "error" },
  },
  {
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
