import { defineConfig } from "vitest/config";

// BUGFIX-1111 (bug report item 1): tooling tests must never reach a guessed
// server either. The caller's target is captured into CONFORMANCE_BASE_URL
// (empty when none was named); any tooling test that drives the API through
// src/api.ts then fails with the shared guard's explicit refusal instead of
// silently defaulting to a campaign port.
process.env.CONFORMANCE_BASE_URL = (
  process.env.CONFORMANCE_BASE_URL ??
  process.env.BASE_URL ??
  ""
).trim();

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    reporters: ["verbose"],
    testTimeout: 60_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
