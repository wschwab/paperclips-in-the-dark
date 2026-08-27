import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Exercising the real child-side loader. The loader is extracted into
// browser-journeys.mjs so tests can run it without launching the suite.
import { loadJourneys, suitesBrowserDir } from "../scripts/browser-journeys.mjs";

// NOTE: journey modules below are imported dynamically on purpose — the file
// list comes from readdir at runtime (the module-loading boundary under test);
// static imports cannot express "every *.journey.mjs on disk".
// MUT-02 / M28 catcher: the browser-suite child must execute every journey
// module present in conformance/suites-browser. A journey that silently
// fails to load (renamed off the enumeration filter, moved, or filtered
// out) is an untested safety contract — the loader's REQUIRED_IDS registry
// and this FS-vs-loaded equality both fail when the sets diverge.
describe("browser journey enumeration completeness", () => {
  it("[TOOLING-BROWSER-009] the loader enumerates exactly the journey modules present on disk", async () => {
    const moduleFiles = (await readdir(suitesBrowserDir))
      .filter((name) => name.endsWith(".journey.mjs"))
      .sort();
    expect(moduleFiles.length).toBeGreaterThan(0);

    const importedIds: string[] = [];
    for (const file of moduleFiles) {
      const mod = await import(`${suitesBrowserDir}/${file}`);
      importedIds.push(mod.id);
    }

    const loaded = await loadJourneys();
    expect(loaded.map((j) => j.id).sort()).toEqual(importedIds.sort());
  });
});
