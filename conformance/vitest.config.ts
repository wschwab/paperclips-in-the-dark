import { defineConfig } from "vitest/config";

// Vite reserves BASE_URL for its own browser base path. Capture the user's
// target before Vitest/Vite can replace it and let the client use the stable
// process variable thereafter.
process.env.CONFORMANCE_BASE_URL =
  process.env.CONFORMANCE_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:9657";

export default defineConfig({
  test: {
    include: ["suites/**/*.test.ts"],
    reporters: ["verbose"],
    passWithNoTests: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    sequence: { concurrent: false },
  },
});
