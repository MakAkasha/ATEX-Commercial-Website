"use strict";

/**
 * ESLint 9 flat config.
 *
 * Scope is deliberately narrow for this first pass: server/, tools/ and test/ —
 * the CommonJS Node code. The browser bundles (assets/js, admin/*.js) and the
 * legacy static index.html are ignored for now so this config can be a passing
 * gate today rather than a wall of pre-existing findings. The browser-globals
 * override below is kept ready for when those directories are un-ignored.
 */

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  queueMicrotask: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  AbortController: "readonly",
  fetch: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  structuredClone: "readonly",
  globalThis: "readonly",
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  fetch: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  IntersectionObserver: "readonly",
  ResizeObserver: "readonly",
  MutationObserver: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
  FormData: "readonly",
  matchMedia: "readonly",
  getComputedStyle: "readonly",
  alert: "readonly",
  confirm: "readonly",
};

const rules = {
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-undef": "error",
  eqeqeq: ["warn", "smart"],
  "no-var": "error",
};

module.exports = [
  {
    ignores: [
      "node_modules/",
      "assets/",
      "admin/",
      "public/",
      "index.html",
      "content-src/",
      "perf/",
      ".claude/",
      "index-reports/",
      "uploads/",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules,
  },
  {
    // Browser bundles. Currently unreachable because both directories are in the
    // ignore list above; kept so un-ignoring them is a one-line change.
    files: ["assets/js/*.js", "admin/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules,
  },
];
