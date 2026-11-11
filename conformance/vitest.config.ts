import { defineConfig } from "vitest/config";

// BUGFIX-1111 (bug report item 1): the suite has no default target. Vite
// reserves BASE_URL for its own browser base path, so the user's target is
// captured here, before Vite can replace it, into the canonical
// CONFORMANCE_BASE_URL. When the caller named no target the variable is set
// to the empty string, and the shared target guard refuses to run — a test
// run must never guess a server (the previous default, `http://localhost:9657`,
// wrote hundreds of fixture entities into a live campaign's data directory).
process.env.CONFORMANCE_BASE_URL = (
  process.env.CONFORMANCE_BASE_URL ??
  process.env.BASE_URL ??
  ""
).trim();

export default defineConfig({
  test: {
    include: ["suites/**/*.test.ts"],
    reporters: ["verbose"],
    passWithNoTests: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
