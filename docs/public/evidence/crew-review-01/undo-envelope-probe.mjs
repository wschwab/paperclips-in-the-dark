// CREW-REVIEW-01 B1: crew operation envelopes must carry the derived history metadata at the top level.
// Sequence on a fresh Assassins crew: rep.add, rep.add, crew.undo. After each response the top-level
// canUndo and historyCount must equal the retained snapshot count (the create baseline is excluded):
//   after rep.add #1 -> canUndo true,  historyCount 1
//   after rep.add #2 -> canUndo true,  historyCount 2
//   after undo       -> canUndo true,  historyCount 1
// The frontend reads these envelope fields (client.ts crewMutate / undoCrew); when they are missing it
// defaults to false/0 and the Undo control disables itself while history remains.
// Writes undo-envelope.json next to this file. Run under the managed launcher (BASE_URL):
//   node conformance/scripts/managed-browser-smoke.mjs --seed-defaults -- node docs/public/evidence/crew-review-01/undo-envelope-probe.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE_URL;
const post = (p, b, h = {}) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }).then((r) => r.json());

const crew = (await post("/api/crews", { gameStem: "blades-in-the-dark", crewType: "Assassins" })).crew;
const steps = [];
const record = (label, res, expectCanUndo, expectCount) => {
  const ok = res.ok === true && res.canUndo === expectCanUndo && res.historyCount === expectCount;
  steps.push({ label, ok, canUndo: res.canUndo ?? null, historyCount: res.historyCount ?? null, expectCanUndo, expectCount, error: res.error ?? null });
  return ok;
};

const r1 = await post(`/api/crews/${crew.id}/ops/rep.add`, { delta: 1 }, { "If-Match": String(crew.revision) });
record("rep.add #1", r1, true, 1);
const r2 = await post(`/api/crews/${crew.id}/ops/rep.add`, { delta: 1 }, { "If-Match": String(r1.crew.revision) });
record("rep.add #2", r2, true, 2);
const u = await post(`/api/crews/${crew.id}/undo`, {}, { "If-Match": String(r2.crew.revision) });
record("crew.undo", u, true, 1);

const failures = steps.filter((s) => !s.ok).map((s) => s.label);
writeFileSync(join(here, "undo-envelope.json"), JSON.stringify({ steps, failures }, null, 2) + "\n");
console.log(`undo envelope: ${steps.length} steps, ${failures.length} failures`);
for (const s of steps) console.log(JSON.stringify(s));
if (failures.length > 0) process.exit(1);
