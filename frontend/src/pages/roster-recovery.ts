import {
  repairCharacterApply,
  repairCharacterPreview,
  repairCrewApply,
  repairCrewPreview,
} from "../api/client.js";
import { el } from "../lib/dom.js";
import { mountDegradedControls } from "../components/degraded-row.js";
import type { EntityKind } from "../api/import-repair.js";
import type { CharacterSummary, CrewSummary } from "../schema/campaign.js";

/**
 * Roster recovery domain (ARCH-02): the E11 total-collections degraded-row
 * rendering extracted from the roster page — unreadable/repairable rows stay
 * listed, reachable, and deletable instead of vanishing.
 */

/**
 * E11 total collections: an unreadable row (bytes that cannot be parsed) is
 * listed with canonical empties and a deleteToken; a repairable row is
 * degraded but recoverable. Both render without a detail link (direct GET
 * would 422) and get the degraded repair/delete controls instead.
 */
export const NOUN: Record<EntityKind, string> = { character: "character", crew: "crew" };
export type RecoveryClass = "repairable" | "needs-input" | "unreadable";

/**
 * RECOVERY-01: one line of visible, class-specific recovery copy per
 * degraded state. Rendered into the row's existing label span so the
 * PERF-02 DOM budget never grows with per-row explanation nodes.
 */
function recoveryNote(kind: EntityKind, state: RecoveryClass): string {
  const noun = NOUN[kind];
  switch (state) {
    case "repairable":
      return `Repairable ${noun} — stored data can be normalized once you preview and confirm Repair below.`;
    case "needs-input":
      return `Repairable ${noun} (needs input) — this repair waits for values. Fill in the fields below to continue.`;
    case "unreadable":
      return `Unreadable ${noun} — bytes cannot be parsed or normalized. Delete below, then use the Import ${noun}s action above to re-import.`;
  }
}

function classifyRow(row: Pick<CharacterSummary | CrewSummary, "isRepairable">): RecoveryClass {
  return row.isRepairable ? "repairable" : "unreadable";
}

/**
 * Degraded rows carry a `data-recovery-class` attribute plus matching copy:
 * repairable at rest; needs-input while its mounted controls await caller
 * values; unreadable otherwise.
 */
export function renderDegradedRow(
  kind: EntityKind,
  row: Pick<CharacterSummary | CrewSummary, "id" | "isRepairable" | "deleteToken">,
  onChanged: () => void,
): HTMLElement {
  const attr = kind === "character" ? "data-character-id" : "data-crew-id";
  const labelEl = el("span", { className: "unnamed" });
  const controlsEl = el("div", { className: "degraded-controls-container" });
  const li = el(
    "li",
    { [attr]: row.id, "data-degraded": "", className: "degraded-row" },
    labelEl,
    controlsEl,
  );
  let state = classifyRow(row);
  const applyState = (next: RecoveryClass) => {
    state = next;
    li.setAttribute("data-recovery-class", next);
    labelEl.textContent = recoveryNote(kind, next);
  };
  applyState(state);

  // The needs-input state emerges inside the mounted controls when a repair
  // preview demands caller values (a .norm-inputs block) and ends when those
  // controls are cleared. Watch the container and keep the row's visible
  // class in step — including Cancel, stale-token failures, or re-preview.
  new MutationObserver(() => {
    const waitingForValues = !!controlsEl.querySelector(".norm-inputs");
    if (state === (waitingForValues ? "needs-input" : classifyRow(row))) return;
    applyState(waitingForValues ? "needs-input" : classifyRow(row));
  }).observe(controlsEl, { childList: true, subtree: true });

  mountDegradedControls(controlsEl, {
    kind,
    id: row.id,
    isRepairable: row.isRepairable,
    deleteToken: row.deleteToken,
    onChanged,
    preview: kind === "character" ? repairCharacterPreview : repairCrewPreview,
    apply: kind === "character" ? repairCharacterApply : repairCrewApply,
  });
  return li;
}
