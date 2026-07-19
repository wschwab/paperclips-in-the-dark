import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startHttpStdioShim } from "./stdio-shim.js";

describe("HTTP to stdio shim", () => {
  it("[TOOLING-SHIM-001] translates one HTTP request and response over JSONL", async () => {
    const shim = await startHttpStdioShim({
      command: process.execPath,
      args: [fileURLToPath(new URL("./mock-stdio.mjs", import.meta.url))],
      port: 0,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${shim.port}/api/health`, {
        headers: { accept: "application/json" },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        method: "GET",
        path: "/api/health",
      });
    } finally {
      await shim.close();
    }
  });
});
