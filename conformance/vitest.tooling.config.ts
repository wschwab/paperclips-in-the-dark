import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    reporters: ["verbose"],
    testTimeout: 60_000,
    sequence: { concurrent: false },
    fileParallelism: false,
  },
});
