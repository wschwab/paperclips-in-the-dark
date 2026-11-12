import { beforeAll, describe, expect } from "vitest";
import { assertTestHooksEnabled, requireTarget } from "../../scripts/target-guard.mjs";
import { testCase } from "../../src/test-case.js";

// Run with the normal built frontend through the managed Ada launcher:
// node conformance/scripts/managed-run.mjs --build -- --run suites/contract/stale-client-headers.test.ts
// No entity fixtures or writes are needed: deep links serve the application shell.
describe("STALE-CLIENT-01 HTML revalidation", () => {
  const target = requireTarget().replace(/\/+$/, "");
  let indexHtml: string;
  let assetPath: string;

  beforeAll(async () => {
    await assertTestHooksEnabled(target);
    const response = await fetch(`${target}/index.html`);
    expect(response.status).toBe(200);
    indexHtml = await response.text();
    const script = indexHtml.match(/<script\b[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["']/i);
    expect(script, "built frontend must reference its JavaScript asset").not.toBeNull();
    assetPath = script![1]!;
  });

  for (const [name, path] of [
    ["root", "/"],
    ["index", "/index.html"],
    ["character", "/character/00000000-0000-4000-8000-000000000001"],
    ["crew", "/crew/00000000-0000-4000-8000-000000000002"],
    ["roster", "/roster"],
  ] as const) {
    for (const method of ["GET", "HEAD"] as const) {
      testCase(`STALE-CLIENT-HTML-${name}-${method}`, `${method} ${path} revalidates the application shell`, async () => {
        const response = await fetch(`${target}${path}`, { method });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(await response.text()).toBe(method === "HEAD" ? "" : indexHtml);
        expect(response.headers.get("cache-control")).toBe("no-cache");
      });
    }
  }

  for (const method of ["GET", "HEAD"] as const) {
    testCase(`STALE-CLIENT-ASSET-${method}`, `${method} leaves the built asset response unchanged`, async () => {
      const response = await fetch(`${target}${assetPath}`, { method });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/javascript/);
      expect(response.headers.get("cache-control")).toBeNull();
      if (method === "HEAD") expect(await response.text()).toBe("");
      else expect((await response.text()).length).toBeGreaterThan(0);
    });
  }

  for (const path of ["/assets/stale-client-missing.js", "/stale-client-missing.txt"]) {
    testCase(`STALE-CLIENT-STATIC-404-${path}`, `${path} remains a plain static 404`, async () => {
      const response = await fetch(`${target}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await response.text()).toBe("Not found");
      expect(response.headers.get("cache-control")).toBeNull();
    });
  }

  testCase("STALE-CLIENT-API-404", "an unknown API route stays JSON without the HTML policy", async () => {
    const response = await fetch(`${target}/api/stale-client-missing`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBeNull();
  });

  testCase("STALE-CLIENT-METHOD-405", "POST does not serve the application shell", async () => {
    const response = await fetch(`${target}/`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
