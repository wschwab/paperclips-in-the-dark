import type { DossierField } from "./character-domain.js";
import type { Character } from "../schema/character.js";
import type { CrewSummary } from "../schema/campaign.js";
import type { ClockSummary } from "../schema/clock.js";
import type { CharacterCapabilities, SessionFields } from "../api/client.js";
import type { ContactCloseness } from "../schema/common.js";

/**
 * Character sheet model (ARCH-02): the page's shared types and CHAR-03
 * error-routing copy, extracted from the character-detail page module so
 * the per-section controllers can import them without reaching into the
 * page. No DOM and no Effect transport here.
 */

export interface EditingState {
  field: DossierField;
  value: string;
}

/**
 * F2ab: editor state for the game-data dropdowns (heritage / background /
 * vice). `option` is the selected game-data option name, or "__custom__" for
 * the Custom… entry ("" when the current value matches nothing and the
 * editor opened on the custom branch). customName/description carry the
 * free-text values; purveyor fields apply to vice only.
 */
export interface NamedEditorState {
  key: "heritage" | "background" | "vice";
  option: string;
  customName: string;
  customDesc: string;
  purveyorName: string;
  purveyorDesc: string;
}

/**
 * CHAR-03: identity of a sheet card (`data-section` attribute). Operation
 * failures route their error to the section whose control initiated the
 * mutation, so the alert appears (and is announced) where the user acted.
 */
export type SectionKey =
  | "header" | "personal" | "stress" | "traumas" | "health" | "talents"
  | "playbook" | "gear" | "coin" | "projects" | "lifecycle" | "high-impact"
  | "actions" | "notes" | "contacts" | "notebook";

/**
 * CHAR-03: a routed operation error. `section` is the initiating card, or
 * null for sheet-level problems that have no originating control (e.g. a
 * background refresh failure) — those keep the legacy sheet-bottom alert.
 */
export interface SheetError {
  section: SectionKey | null;
  text: string;
  recovery: string;
}

/** Recovery copy shown under a routed error, per section family. */
export const DEFAULT_RECOVERY = "Nothing was changed — you can safely retry.";

export const SECTION_RECOVERY: Partial<Record<SectionKey, string>> = {
  personal: "Fix the field and save again.",
  stress: "The sheet is unchanged — adjust the amount and try again.",
  traumas: "The sheet is unchanged — choose a different removal.",
  health: "The sheet is unchanged — adjust the harm entry and try again.",
  talents: "The sheet is unchanged — pick a different action or value.",
  playbook: "The sheet is unchanged — pick another ability.",
  gear: "Free up load or commitments, then try again.",
  coin: "Check your coins and try again.",
  projects: "Adjust the clock values and try again.",
  lifecycle: "Resolve pending conditions and try again.",
  "high-impact": DEFAULT_RECOVERY,
  actions: "Nothing was undone — you can retry.",
  notes: "Retry the change.",
  notebook: "Retry the change.",
  contacts: "Retry the change.",
};

export const SECTION_LABELS: Record<SectionKey, string> = {
  header: "Sheet header",
  personal: "Personal",
  stress: "Stress",
  traumas: "Traumas",
  health: "Health",
  talents: "Talents",
  playbook: "Playbook",
  gear: "Gear",
  coin: "Coin",
  projects: "Projects",
  lifecycle: "Lifecycle",
  "high-impact": "Permanent actions",
  actions: "Actions",
  notes: "Notes",
  contacts: "Contacts",
  notebook: "Notebook",
};

/**
 * CHAR-03: the one concise assistive-technology summary of a routed error.
 * Rendered into a persistent visually-hidden role=status region so a text
 * change announces exactly once; it never duplicates the visual bottom
 * error (sectioned errors render no second visual copy anywhere).
 */
export function formatErrorSummary(error: SheetError): string {
  const label = error.section ? SECTION_LABELS[error.section] : "Sheet";
  return `${label}: ${error.text}. ${error.recovery}`.replace(/\s+/g, " ").trim();
}

export interface RenderState {
  c: Character;
  gameData: Record<string, unknown> | null;
  playbookData: Record<string, unknown> | null;
  /** Server-computed character capability projection (SC-F3); null until loaded or on fetch failure. */
  caps: CharacterCapabilities | null;
  // Loading flags
  isStressLoading: boolean;
  isStressClearLoading: boolean;
  isStressFixLoading: boolean;
  // CONTRACT-03: session-local corrections edit mode (never persisted
  // server-side); when false no fix controls render at all.
  correctionsMode: boolean;
  isTraumaLoading: boolean;
  isDossierLoading: boolean;
  isUndoLoading: boolean;
  isHarmLoading: boolean;
  isArmorLoading: boolean;
  isHealLoading: boolean;
  isClockLoading: boolean;
  // F2o Talents state
  isTalentsLoading: boolean;
  isSessionLoading: boolean;
  clampNotice: string | null;
  experienceCondition: string | null;
  // F2p Playbook state
  isPlaybookLoading: boolean;
  abilityNotice: string | null;
  // F2r Gear state
  isGearLoading: boolean;
  isGearCommitmentLoading: boolean;
  isGearLockLoading: boolean;
  // F2s Coin + Projects state
  clocks: readonly ClockSummary[] | null;
  isCoinLoading: boolean;
  isClocksLoading: boolean;
  coinNotice: string | null;
  clocksNotice: string | null;
  // F2ab state
  crews: readonly CrewSummary[] | null;
  isCrewsLoading: boolean;
  crewNotice: string | null;
  isNotesLoading: boolean;
  notesNotice: string | null;
  // CONTRACT-05 Contacts state
  isContactsLoading: boolean;
  contactsNotice: string | null;
  isNotebookLoading: boolean;
  notebookNotice: string | null;
  isTraumaPickerLoading: boolean;
  healNotice: string | null;
  // F4 lifecycle state
  isEndScoreLoading: boolean;
  isDowntimeLoading: boolean;
  isRetireLoading: boolean;
  isDeleteLoading: boolean;
  /** Derived undo state from the last operation result (null = unknown before any op). */
  canUndo: boolean | null;
  historyCount: number | null;
  // Error / notice
  /** CHAR-03: routed operation error (section=null keeps the legacy sheet-level alert). */
  error: SheetError | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  harmSpillNotice: string | null;
  /** CONTRACT-02: a vice indulgence returned the overindulged sideEffect. */
  overindulgedNotice: boolean;
  /** CONTRACT-01 stage 3: dismissed completion-cue section keys. */
  dismissedCues: ReadonlySet<string>;
  // Editing
  editing: EditingState | null;
  namedEditor: NamedEditorState | null;
  /** Re-render the page (used by nested editors after DOM-driven state changes). */
  rerender: () => void;
  // Handlers
  handlers: {
    onStressTrack: (next: number) => void;
    onStressDelta: (delta: number) => void;
    /** CONTRACT-02: reads the amount input from the Vice panel. */
    onStressClear: (amountInput: HTMLInputElement) => void;
    /** CONTRACT-03: toggles the session-local corrections edit mode. */
    onCorrectionsToggle: () => void;
    /** CONTRACT-03: reads the corrected-value input and posts stress.fix. */
    onStressFix: (valueInput: HTMLInputElement) => void;
    onTraumaAdd: () => void;
    onTraumaRemove: (name: string) => void;
    onDossierEdit: (field: DossierField) => void;
    onDossierSave: () => void;
    onDossierCancel: () => void;
    /** CONTRACT-02: dismisses the clearable OVERINDULGED notice. */
    onOverindulgedDismiss: () => void;
    onNamedEdit: (key: "heritage" | "background" | "vice") => void;
    onNamedSave: () => void;
    onNamedCancel: () => void;
    onTraumaFromStress: () => void;
    onNoteAdd: () => void;
    onNoteRemove: (index: number) => void;
    onNotebookSave: () => void;
    onCrewJoin: () => void;
    /** CONTRACT-05: per-scoundrel contacts. */
    onContactAdd: () => void;
    onContactCycle: (name: string, current: ContactCloseness) => void;
    onContactRemove: (name: string) => void;
    onCrewLeave: () => void;
    /** Dismiss one completion-cue section (CONTRACT-01 stage 3). */
    onDismissCue: (key: string) => void;
    onUndo: () => void;
    onEndScore: () => void;
    onEndDowntime: () => void;
    onRetire: () => void;
    onDeleteCharacter: () => void;
    onHarmAdd: () => void;
    onHarmRemove: (description: string, intensity: string) => void;
    onHarmHeal: () => void;
    onHarmHealingClock: () => void;
    onArmorSet: (armor: string, used: boolean) => void;
    onActionSetRating: (attribute: string, action: string, next: number) => void;
    onAttributeXpDelta: (attribute: string, delta: number) => void;
    onAttributeXpClear: (attribute: string) => void;
    onAttributeLevelup: (attribute: string) => void;
    onSessionTrack: (field: keyof SessionFields, next: number) => void;
    onSessionDelta: (field: keyof SessionFields, delta: number) => void;
    onPlaybookXpDelta: (delta: number) => void;
    onPlaybookXpClear: () => void;
    onAbilityTake: () => void;
    onAbilityRemove: (name: string) => void;
    onGearAdd: () => void;
    onGearRemove: (name: string) => void;
    onGearCommit: () => void;
    onGearUncommit: () => void;
    onGearSetCommitment: () => void;

    onGearToggleLock: () => void;
    onGearClearCommitments: () => void;
    onFundDelta: (delta: number) => void;
    onFundLiquidate: () => void;
    onCreateClock: () => void;
    onClockProgress: (clockId: string, segments: number) => void;
    onClockReset: (clockId: string) => void;
    onClockDelete: (clockId: string) => void;
  };
}
