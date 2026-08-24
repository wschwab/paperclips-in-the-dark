// Shared Chromium executable resolution, extracted verbatim from BROWSER-01
// (conformance/scripts/browser-suite.mjs) so PERF-01's benchmark reuses the
// exact same resolution order instead of a divergent copy:
//   1. PITD_BROWSER_EXECUTABLE override (must exist),
//   2. newest ~/.cache/ms-playwright/chromium-<rev> install,
//   3. well-known system Chromium/Chrome paths.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function resolveChromiumExecutable() {
  const override = process.env.PITD_BROWSER_EXECUTABLE;
  if (override) {
    if (!existsSync(override)) throw new Error(`PITD_BROWSER_EXECUTABLE does not exist: ${override}`);
    return override;
  }
  const msPlaywright = join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (existsSync(msPlaywright)) {
    const candidates = readdirSync(msPlaywright)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.slice("chromium-".length)) - Number(a.slice("chromium-".length)));
    for (const dir of candidates) {
      for (const layout of ["chrome-linux64", "chrome-linux"]) {
        const exe = join(msPlaywright, dir, layout, "chrome");
        if (existsSync(exe)) return exe;
      }
    }
  }
  for (const systemPath of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(systemPath)) return systemPath;
  }
  throw new Error(
    "no Chromium executable found; set PITD_BROWSER_EXECUTABLE or install playwright browsers",
  );
}
