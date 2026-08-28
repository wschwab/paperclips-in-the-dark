import type { CharacterCapabilities } from "../../api/client.js";
import type { Character } from "../../schema/character.js";
import type { RenderState } from "../character-sheet.js";

/**
 * Shared context for the character sheet's per-section controllers
 * (ARCH-02): the derived flags and capability maps renderDetail used to
 * compute inline, now derived once and passed to every section. Pure
 * derivation — same expressions, same values, no behavior change.
 */

export type EffectiveActionCap = CharacterCapabilities["effectiveActionCaps"][number];
export type HarmCapacity = CharacterCapabilities["harmCapacities"][number];
export type LoadLimit = CharacterCapabilities["loadLimits"][number];

export interface SectionCtx {
  state: RenderState;
  c: Character;
  handlers: RenderState["handlers"];
  gameData: Record<string, unknown> | null;
  playbookData: Record<string, unknown> | null;
  editing: RenderState["editing"];
  namedEditor: RenderState["namedEditor"];
  status: string;
  availableTraumas: string[];
  retired: boolean;
  pendingTrauma: boolean;
  outOfAction: boolean;
  anyLoading: boolean;
  gameplayDisabled: boolean;
  stressDisabled: boolean;
  endScoreTitle: string;
  effCapByName: Map<string, EffectiveActionCap>;
  harmCapByLevel: Map<string, HarmCapacity>;
  loadLimitByCommitment: Map<string, LoadLimit>;
}

/** Derive the section context from the render state (renderDetail's former
 * inline head — see the F4 lifecycle-matrix and SC-F3 comments there). */
export function sectionCtx(state: RenderState): SectionCtx {
  const { c, gameData } = state;
  const status = c.isRetired ? " (retired)" : c.isDeadish ? " (deadish)" : "";
  const traumaList: string[] = Array.isArray(gameData?.Traumas) ? gameData.Traumas as string[] : [];
  const currentTraumas = new Set(c.monitor.trauma.traumas);
  const availableTraumas = traumaList.filter((t) => !currentTraumas.has(t));

  // F4 lifecycle flags (lifecycle-matrix §2): retired (deny-list gated),
  // pending trauma (gameplay/end-score blocked), out-of-action (stress ops
  // blocked). The page must explain each state rather than clear it.
  const retired = c.isRetired;
  const pendingTrauma = !!c.traumaPending;
  const outOfAction = !!c.isOutOfAction;

  const anyLoading = state.isStressLoading || state.isStressClearLoading ||
    state.isTraumaLoading || state.isDossierLoading || state.isUndoLoading ||
    state.isHarmLoading || state.isArmorLoading || state.isHealLoading || state.isClockLoading ||
    state.isTalentsLoading || state.isSessionLoading || state.isPlaybookLoading ||
    state.isGearLoading || state.isGearCommitmentLoading || state.isGearLockLoading ||
    state.isCoinLoading || state.isClocksLoading ||
    state.isCrewsLoading || state.isNotesLoading || state.isNotebookLoading ||
    state.isContactsLoading ||
    state.isTraumaPickerLoading || state.isEndScoreLoading || state.isDowntimeLoading ||
    state.isRetireLoading || state.isDeleteLoading || state.isStressFixLoading;

  // Retired: every gameplay mutation is on the deny-list (→ RETIRED); the
  // allow-list (dossier/notes/notebook/trauma.remove/undo/delete/reads) stays
  // enabled. stressDisabled layers the pending / out-of-action gates on top
  // (stress.add + stress.clear are the ops those flags block).
  const gameplayDisabled = anyLoading || retired;
  const stressDisabled = anyLoading || retired || pendingTrauma || outOfAction;
  // End-score is the only sanctioned release from out-of-action, so its title
  // explains the inherent stress clear + flag resets (lifecycle-matrix §4).
  const endScoreTitle = pendingTrauma
    ? "Resolve the pending trauma before ending the score"
    : "End the score — clears stress and takes the character out of action";

  // SC-F3: derived limits come from the server-computed capability projection
  // (effective action caps, harm capacities, load limits) — the client never
  // joins settings + cross-entity state to find an enforced cap. Gracefully
  // fall back to the raw DTO values when the projection is unavailable.
  const effCapByName = new Map(
    (state.caps?.effectiveActionCaps ?? []).map((cap) => [cap.action, cap]),
  );
  const harmCapByLevel = new Map(
    (state.caps?.harmCapacities ?? []).map((h) => [h.level, h]),
  );
  const loadLimitByCommitment = new Map(
    (state.caps?.loadLimits ?? []).map((l) => [l.commitment, l]),
  );

  return {
    state,
    c,
    handlers: state.handlers,
    gameData: state.gameData,
    playbookData: state.playbookData,
    editing: state.editing,
    namedEditor: state.namedEditor,
    status,
    availableTraumas,
    retired,
    pendingTrauma,
    outOfAction,
    anyLoading,
    gameplayDisabled,
    stressDisabled,
    endScoreTitle,
    effCapByName,
    harmCapByLevel,
    loadLimitByCommitment,
  };
}
