#!/usr/bin/env node
// EVIDENCE-RULE-01: a task card MUST NOT cite browser evidence under the
// gitignored scratch folder agent-docs/test-audit/browser-evidence/. Cited
// evidence lives under docs/public/evidence/<card-lowercase>/.
//
// Usage: node conformance/scripts/validate-evidence-paths.mjs [tasksDir]
// Default tasksDir is <repo>/tasks. Exits 1 on any violation.

import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const tasksDir = resolve(process.argv[2] ?? join(repoRoot, "tasks"));

const SCRATCH = "agent-docs/test-audit/browser-evidence";

// Task cards closed before EVIDENCE-RULE-01 that still cite scratch evidence.
// They are historical records; their citations are kept as-is.
const HISTORICAL_EXEMPT = new Set([
  "A11Y-01.md",
  "ARCH-01.md",
  "ARCH-02.md",
  "BROWSER-02.md",
  "CREW-ALIGN-01.md",
  "CREW-WORLD-01.md",
  "CREW-XP-INFO-01.md",
  "DESPERATE-LOG-01.md",
  "GAME-MODE-03.md",
  "LAYOUT-01.md",
  "LOADOUT-ATOMIC-01.md",
  "MODE-PANEL-ALIGN-01.md",
  "MUT-02.md",
  "PERF-02.md",
  "PERF-04.md",
  "PLAYBOOK-BLURBS-01.md",
  "PLAYTEST-UI-01.md",
  "PLAYTEST-UI-02.md",
  "REVIEW-02.md",
  "THEME-01.md",
  "THEME-02.md",
  "UI-CREATE-01.md",
  "XP-TRACKER-01.md",
  "XP-TRACKER-04.md",
]);

export function checkTasksDir(dir, exempt = HISTORICAL_EXEMPT) {
  const violations = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    if (exempt.has(name)) continue;
    const lines = readFileSync(join(dir, name), "utf8").split("\n");
    lines.forEach((line, idx) => {
      if (line.includes(SCRATCH)) {
        violations.push(`${name}:${idx + 1}: cites scratch evidence path (${SCRATCH}); move it to docs/public/evidence/<card>/`);
      }
    });
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = checkTasksDir(tasksDir);
  if (violations.length > 0) {
    for (const v of violations) console.error(v);
    console.error(`validate-evidence-paths: ${violations.length} violation(s) in ${basename(tasksDir)}/`);
    process.exit(1);
  }
  console.log(`validate-evidence-paths: OK (${basename(tasksDir)}/, ${HISTORICAL_EXEMPT.size} historical exemptions)`);
}
