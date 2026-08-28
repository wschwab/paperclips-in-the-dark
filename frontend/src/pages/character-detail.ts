import { Effect } from "effect";
import { installMutationContinuity } from "../lib/mutation-continuity.js";
import {
  failMutation,
  runMutation,
  type MutationTransport,
} from "../lib/mutation-transport.js";
import {
  activeHarms,
  buildDossierPayload,
  clockOpErrorText,
  coinOpErrorText,
  describeRestore,
  extractExperienceCondition,
  extractGearMenu,
  gameDataDescription,
  gameDataOptions,
  gearOpErrorText,
  getDossierValue,
  getNamedValue,
  healOpErrorText,
  playbookOpErrorText,
  type DossierField,
} from "./character-domain.js";
import {
  ApiError,
  OpError,
  DecodeError,
  opErrorFriendlyText,
  transportErrorText,
  decodeErrorText,
  getCharacter,
  getGame,
  getPlaybook,
  getCharacterCapabilities,
  stressAdd,
  stressClear,
  stressFix,
  traumaAdd,
  traumaRemove,
  dossierUpdate,
  undoCharacter,
  endScore,
  endDowntime,
  retireCharacter,
  deleteCharacter,
  StaleRevisionError,
  harmAdd,
  harmHeal,
  harmRemove,
  harmHealingClock,
  armorSet,
  actionSetRating,
  attributeXpAdd,
  attributeXpClear,
  attributeLevelup,
  sessionSet,
  playbookXpAdd,
  playbookXpClear,
  abilityTake,
  abilityRemove,
  gearAdd,
  gearRemove,
  gearCommit,
  gearUncommit,
  gearLock,
  gearUnlock,
  gearSetCommitment,
  gearClearCommitments,
  fundGain,
  fundSpend,
  fundLiquidate,
  listClocks,
  getClock,
  createClock,
  clockProgress,
  clockReset,
  deleteClock,
  noteAdd,
  noteRemove,
  notebookSet,
  contactAdd,
  contactCloseness,
  contactRemove,
  listCrews,
  type SessionFields,
  type FundOpResult,
} from "../api/client.js";
import type { CharacterCapabilities } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { captureFocusTarget, applyFocusTarget, type FocusTarget } from "../lib/focus.js";
import { completionCues, type CompletionCue } from "../lib/completion-cues.js";
import { errorCard } from "../components/error-card.js";
import type { Character } from "../schema/character.js";
import type { ContactCloseness } from "../schema/common.js";
import type { CrewSummary } from "../schema/campaign.js";
import type { Clock, ClockSummary } from "../schema/clock.js";
import {
  DEFAULT_RECOVERY,
  SECTION_RECOVERY,
  formatErrorSummary,
  type EditingState,
  type NamedEditorState,
  type RenderState,
  type SectionKey,
  type SheetError,
} from "./character-sheet.js";
import { sectionCtx } from "./character-sections/context.js";
import { renderHeaderSection } from "./character-sections/header.js";
import { renderPersonalSection } from "./character-sections/personal.js";
import { renderStressSection } from "./character-sections/stress.js";
import { renderTraumasSection } from "./character-sections/traumas.js";
import { renderHealthSection } from "./character-sections/health.js";
import { renderTalentsSection } from "./character-sections/talents.js";
import { renderPlaybookSection } from "./character-sections/playbook.js";
import { renderGearSection } from "./character-sections/gear.js";
import { renderCoinSection } from "./character-sections/coin.js";
import { renderProjectsSection } from "./character-sections/projects.js";
import { renderLifecycleSection } from "./character-sections/lifecycle.js";
import { renderHighImpactSection } from "./character-sections/highImpact.js";
import { renderActionsSection } from "./character-sections/actions.js";
import { renderNotesSection } from "./character-sections/notes.js";
import { renderContactsSection } from "./character-sections/contacts.js";
import { renderNotebookSection } from "./character-sections/notebook.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * CHAR-03 scroll guard: scroll the routed alert into view only when it is
 * fully off screen; otherwise preserve the user's scroll position. Layout-
 * less environments (unit tests) report zero rects — skipped there.
 */
export function ensureSectionAlertVisible(scope: ParentNode): boolean {
  const alert = scope.querySelector(".section-error");
  if (!(alert instanceof HTMLElement)) return false;
  let rect: DOMRect;
  try {
    rect = alert.getBoundingClientRect();
  } catch {
    return false;
  }
  if (rect.width === 0 && rect.height === 0) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!vw || !vh) return false;
  const fullyOffScreen =
    rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw;
  if (!fullyOffScreen) return false;
  try {
    alert.scrollIntoView({ block: "nearest" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCompletionCues(
  cues: readonly CompletionCue[],
  dismissed: ReadonlySet<string>,
  onDismiss: (key: string) => void,
): HTMLElement | null {
  const active = cues.filter((cue) => !dismissed.has(cue.key));
  if (active.length === 0) return null;
  const rows = active.map((cue) => {
    const btn = el(
      "button",
      {
        type: "button",
        className: "completion-cue-dismiss",
        title: "Dismiss",
        "aria-label": `Dismiss: ${cue.label}`,
      },
      "×",
    );
    btn.addEventListener("click", () => onDismiss(cue.key));
    return el(
      "p",
      { className: "completion-cue", "data-cue": cue.key },
      el("span", { className: "completion-cue-label" }, cue.label),
      btn,
    );
  });
  return el(
    "div",
    { className: "completion-cues", role: "status", "aria-label": "Completion prompts" },
    el("h2", {}, "Complete your character"),
    ...rows,
  );
}

function renderDetail(state: RenderState): HTMLElement {
  const ctx = sectionCtx(state);
  const { c, retired, pendingTrauma } = ctx;
  // -- Assemble -------------------------------------------------------------

  const sheet = el(
    "section",
    { className: "character-detail" },

    renderHeaderSection(ctx),
    // F4: retired banner — RETIRED copy. Retirement clears stress, harm, and
    // armor but preserves dossier, playbook, trauma history, notes, gear, and
    // fund; only allow-list edits (dossier/notes, trauma.remove, undo, delete,
    // reads) remain. Undo is the recovery path to un-retire by mistake.
    retired
      ? el("div", { className: "character-lifecycle-banner", role: "status" },
          el("p", { className: "notice", style: "margin: 0; width: 100%;" },
            "This character has retired. Gameplay is no longer available, but you can keep editing the dossier and notes, and Undo can restore the character if retirement was a mistake."),
        )
      : null,
    // F4: pending-trauma banner — pending blocks gameplay and end-score until
    // the trauma is resolved (TRAUMA_REQUIRED).
    pendingTrauma && !retired
      ? el("div", { className: "character-lifecycle-banner", role: "status" },
          el("p", { className: "notice", style: "margin: 0; width: 100%;" },
            "A trauma is pending — resolve it before continuing. Gameplay and ending the score are blocked until then."),
        )
      : null,

    // CONTRACT-01 stage 3: completion cues — visible, dismissible per
    // section, non-blocking. Derived from the DTO, never a checklist file;
    // renders nothing when the character is complete or all dismissed.
    renderCompletionCues(completionCues(c), state.dismissedCues, state.handlers.onDismissCue),

    renderPersonalSection(ctx),
    renderStressSection(ctx),
    renderTraumasSection(ctx),
    renderHealthSection(ctx),
    renderTalentsSection(ctx),
    renderPlaybookSection(ctx),
    renderGearSection(ctx),
    renderCoinSection(ctx),
    renderProjectsSection(ctx),
    // CHAR-03: sectioned operation errors render inside their card; only
    // sheet-level problems (no originating control) keep this bottom alert.
    state.error && !state.error.section
      ? el("p", { className: "error", style: "margin-top: 1em;", role: "alert" }, state.error.text)
      : null,
    state.noticeMsg
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
      : null,
    state.undoNotice
      ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
      : null,

    renderLifecycleSection(ctx),
    renderHighImpactSection(ctx),
    renderActionsSection(ctx),
    renderNotesSection(ctx),
    renderContactsSection(ctx),
    renderNotebookSection(ctx),

  );

  // CHAR-03: route the operation error into the card whose control initiated
  // the failed mutation — alert + recovery copy live where the user acted,
  // and the scroll only moves when the alert is fully off screen. Sheet-level
  // problems (no originating control) keep the legacy bottom alert above.
  // The AT summary is a single concise role=status line naming the section;
  // it is the only global announcement and never duplicates the visual error
  // at the sheet bottom (sectioned errors render no bottom copy at all).
  const error = state.error;
  if (error && error.section) {
    const host = sheet.querySelector(`[data-section="${error.section}"]`);
    if (host instanceof HTMLElement) {
      host.append(
        el("p", { className: "error section-error", style: "margin-top: 0.5em;", role: "alert" }, error.text),
        el("p", { className: "error-recovery", style: "margin-top: 0.25em;" }, error.recovery),
      );
      // Scroll guard runs post-attach (renderDetailWrapper) — geometry is
      // unavailable while the sheet tree is detached.
    } else {
      sheet.append(
        el("p", { className: "error", style: "margin-top: 1em;", role: "alert" }, error.text),
        el("p", { className: "error-recovery", style: "margin-top: 0.25em;" }, error.recovery),
      );
    }
    sheet.append(
      el("p", {
        className: "sheet-live-summary visually-hidden",
        role: "status",
      }, formatErrorSummary(error)),
    );
  }
  return sheet;
 }

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "character-detail-loading" },
    el("h1", {}, "Character"),
    el("p", {}, "Loading…"),
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount the character detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCharacterDetailPage(
  root: HTMLElement,
  characterId: string,
): () => void {
  // CHAR-03/PERF-03 diagnostics: every page handler invocation opens a
  // mutation-continuity span; the live recorder is exposed on window for
  // browser probes (`records()` / `drain()`). A prior mount's install is
  // disposed first so remounts never double-install.
  window.__paperclipsContinuity?.dispose();
  const continuity = installMutationContinuity({ root });

  let cancelled = false;
  let currentCharacter: Character | null = null;
  let gameData: Record<string, unknown> | null = null;

  // State
  let isStressLoading = false;
  let isStressClearLoading = false;
  let isStressFixLoading = false;
  // CONTRACT-03: session-local corrections edit mode (never persisted).
  let correctionsMode = false;
  let isTraumaLoading = false;
  let isDossierLoading = false;
  let isUndoLoading = false;
  let error: SheetError | null = null;

  /** CHAR-03: record an operation failure routed to its initiating card. */
  const failSection = (
    section: SectionKey | null,
    err: unknown,
    onOpError?: (err: OpError) => string,
  ): void => {
    error = {
      section,
      text: opErrorText(err, onOpError),
      recovery: SECTION_RECOVERY[section ?? "header"] ?? DEFAULT_RECOVERY,
    };
  };
  let noticeMsg: string | null = null;
  let undoNotice: string | null = null;
  let harmSpillNotice: string | null = null;
  // CONTRACT-02: set when a vice indulgence returns the overindulged
  // sideEffect; clearable by the user (SRD §Overindulgence consequences).
  let overindulgedNotice: boolean = false;
  let editing: EditingState | null = null;
  // CONTRACT-01 stage 3: per-section cue dismissal (session-scoped).
  const dismissedCues = new Set<string>();

  // F4 lifecycle state
  let isEndScoreLoading = false;
  let isDowntimeLoading = false;
  let isRetireLoading = false;
  let isDeleteLoading = false;
  let canUndoState: boolean | null = null;
  let historyCountState: number | null = null;

  // F2n Health state
  let isHarmLoading = false;
  let isArmorLoading = false;
  let isHealLoading = false;
  let isClockLoading = false;

  // F2o Talents state
  let isTalentsLoading = false;
  let isSessionLoading = false;
  let clampNotice: string | null = null;
  let experienceCondition: string | null = null;
  let playbookData: Record<string, unknown> | null = null;
  let caps: CharacterCapabilities | null = null;

  // F2p Playbook state
  let isPlaybookLoading = false;
  let abilityNotice: string | null = null;

  // F2r Gear state
  let isGearLoading = false;
  let isGearCommitmentLoading = false;
  let isGearLockLoading = false;

  // F2s Coin + Projects state
  let clocks: readonly ClockSummary[] | null = null;
  let isCoinLoading = false;
  let isClocksLoading = false;
  let coinNotice: string | null = null;
  let clocksNotice: string | null = null;

  // F2ab state
  let crews: readonly CrewSummary[] | null = null;
  let isCrewsLoading = false;
  let crewNotice: string | null = null;
  let isNotesLoading = false;
  let notesNotice: string | null = null;
  let isNotebookLoading = false;
  let notebookNotice: string | null = null;
  // CONTRACT-05 Contacts state
  let isContactsLoading = false;
  let contactsNotice: string | null = null;
  let namedEditor: NamedEditorState | null = null;
  let isTraumaPickerLoading = false;
  let healNotice: string | null = null;

  const clearNotices = () => {
    error = null;
    noticeMsg = null;
    undoNotice = null;
    harmSpillNotice = null;
    clampNotice = null;
    overindulgedNotice = false;
    abilityNotice = null;
    coinNotice = null;
    clocksNotice = null;
    crewNotice = null;
    contactsNotice = null;
    notesNotice = null;
    notebookNotice = null;
    healNotice = null;
  };

  /**
   * Friendly inline error copy per error class (FV-023/FV-024): typed
   * operation errors map known codes to user copy (per-op override first,
   * shared fallback otherwise); HTTP/network and decode failures get their
   * own distinct copy. Never renders raw body/parser text.
   */
  const opErrorText = (err: unknown, onOpError?: (err: OpError) => string): string => {
    if (err instanceof OpError) {
      return onOpError ? onOpError(err) : opErrorFriendlyText(err);
    }
    if (err instanceof ApiError) {
      return transportErrorText(err);
    }
    if (err instanceof DecodeError) {
      return decodeErrorText(err);
    }
    return String(err);
  };

  const refreshAndShowNotice = () => {
    if (!currentCharacter) return;
    const recoverProgram = getCharacter(characterId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          failSection(null, recoverErr);
          renderDetailWrapper();
        },
        onSuccess: (character) => {
          if (cancelled) return;
          currentCharacter = character;
          refreshCaps();
          noticeMsg = "Sheet refreshed because it changed elsewhere";
          renderDetailWrapper();
          setTimeout(() => {
            if (!cancelled) {
              noticeMsg = null;
              renderDetailWrapper();
            }
          }, 3000);
        },
      }),
    );
  };

  // ARCH-02: shared mutation transport (lib/mutation-transport.js). The
  // page's error routing (CHAR-03 section cards) and stale-recovery refetch
  // (F2h rule) ride the hooks; the Effect wiring lives in the shared module.
  const transport: MutationTransport = {
    isCancelled: () => cancelled,
    rerender: () => renderDetailWrapper(),
    fail: (section, err, onOpError) => failSection(section as SectionKey | null, err, onOpError),
    onStale: () => refreshAndShowNotice(),
  };

  /** Shared F2o mutation runner: standard error paths + stale-revision recovery (F2h rule). */
  const runCharacterMutate = (
    section: SectionKey,
    program: Effect.Effect<Character, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (character: Character) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    runMutation(transport, section, program, onSuccess, clearLoading, onApiError);
  };
  /** Re-fetch the character capability projection after a mutation so the
   * capability-driven controls never keep stale limits (SC-F3). Advisory and
   * best-effort: keep the last good projection on failure. */
  const refreshCaps = () => {
    if (cancelled || !currentCharacter) return;
    void Effect.runPromise(
      Effect.match(getCharacterCapabilities(characterId), {
        onFailure: () => undefined,
        onSuccess: (projection) => {
          if (cancelled) return;
          caps = projection;
          renderDetailWrapper();
        },
      }),
    );
  };

  /**
   * Standard failure path for a character mutation: clears the loading flag,
   * recovers from stale revisions, and surfaces API/decode errors (F2ab).
   * CHAR-03: failures route to `section`'s card.
   */
  const failMutate = (section: SectionKey, err: unknown, clearLoading: () => void) => {
    failMutation(transport, err, clearLoading, section);
  };
  const runFundMutate = (
    section: SectionKey,
    program: Effect.Effect<FundOpResult, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (result: FundOpResult) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    runMutation(transport, section, program, onSuccess, clearLoading, onApiError);
  };
  /** F2s clock mutation runner: same standard error paths + stale-revision recovery (refetches the clock list). */
  const runClockMutate = (
    section: SectionKey,
    program: Effect.Effect<Clock, ApiError | DecodeError | StaleRevisionError>,
    onSuccess: (clock: Clock) => void,
    clearLoading: () => void,
    onApiError?: (err: OpError) => string,
  ) => {
    runMutation(transport, section, program, onSuccess, clearLoading, onApiError, refreshClocksAndNotice);
  };
  /** Refetch the campaign clock list (clock state lives server-side, not in the character DTO). */
  const refreshClocksAndNotice = () => {
    void Effect.runPromise(
      Effect.match(listClocks(), {
        onFailure: (err) => {
          if (cancelled) return;
          clocksNotice = `Clock refresh failed — ${opErrorText(err)}`;
          renderDetailWrapper();
        },
        onSuccess: (list) => {
          if (cancelled) return;
          clocks = list;
          clocksNotice = "Clocks refreshed because they changed elsewhere";
          renderDetailWrapper();
          setTimeout(() => {
            if (!cancelled) {
              clocksNotice = null;
              renderDetailWrapper();
            }
          }, 3000);
        },
      }),
    );
  };

  /** Insert or replace a clock in the local list by id. The op results carry
   *  the full Clock DTO; the list state keeps clockSummary rows, so the DTO
   *  is projected down to the row shape (readable by construction). */
  const upsertClock = (updated: Clock) => {
    const row: ClockSummary = {
      kind: "clock",
      id: updated.id,
      name: updated.name,
      ownerKind: updated.ownerKind,
      ownerId: updated.ownerId,
      purpose: updated.purpose,
      behavior: updated.behavior,
      segments: updated.segments,
      size: updated.size,
      rollover: updated.rollover,
      relatedClockIds: updated.relatedClockIds,
      isReadable: true,
      isRepairable: true,
      isComplete: true,
      deleteToken: "",
    };
    const list = clocks ?? [];
    const idx = list.findIndex((x) => x.id === row.id);
    clocks = idx >= 0
      ? list.map((x, i) => (i === idx ? row : x))
      : [...list, row];
  };

  const handlers = {
    onStressTrack: (next: number) => {
      if (!currentCharacter || isStressLoading) return;
      const delta = next - currentCharacter.monitor.stress.current;
      if (delta === 0) return;
      isStressLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressAdd(characterId, delta, currentCharacter.revision);
      runMutation(
        transport,
        "stress",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isStressLoading = false; },
      );
    },

    onStressDelta: (delta: number) => {
      if (!currentCharacter || isStressLoading) return;
      // Compute clamped delta
      const newVal = currentCharacter.monitor.stress.current + delta;
      if (newVal < 0 || newVal > currentCharacter.monitor.stress.max) return;
      isStressLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressAdd(characterId, delta, currentCharacter.revision);
      runMutation(
        transport,
        "stress",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isStressLoading = false; },
      );
    },

    onStressClear: (amountInput: HTMLInputElement) => {
      if (!currentCharacter || isStressClearLoading) return;
      if (currentCharacter.monitor.stress.current === 0) return;
      // CONTRACT-02: the amount is caller-supplied and must be an integer
      // >= 0 (the contract rejects anything else with VALIDATION). A blank
      // or non-integer field ("1.5", "-2") falls back to all currently
      // marked stress rather than silently truncating. The server clamps to
      // the marked stress and reports applied.effective — the client never
      // enforces game maxima.
      const parsed = Number(amountInput.value);
      const amount = Number.isInteger(parsed) && parsed >= 0
        ? parsed
        : currentCharacter.monitor.stress.current;
      isStressClearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressClear(characterId, amount, currentCharacter.revision);
      runMutation(
        transport,
        "stress",
        program,
        ({ character, overindulged }) => {
          currentCharacter = character;
          overindulgedNotice = overindulged;
          renderDetailWrapper();
        },
        () => { isStressClearLoading = false; },
      );
    },

    // CONTRACT-03 (DEC-03 ruling, 2026-08-24): the corrections toggle is
    // session-local component state only — never persisted server-side.
    onCorrectionsToggle: () => {
      correctionsMode = !correctionsMode;
      renderDetailWrapper();
    },

    onStressFix: (valueInput: HTMLInputElement) => {
      if (!currentCharacter || isStressFixLoading) return;
      // CONTRACT-03: the contract rejects anything but an integer >= 0 with
      // VALIDATION; a blank or non-integer field does nothing rather than
      // guessing a replacement. The server clamps into [0, StressMax] and
      // reports applied.effective — the client never enforces game maxima.
      const parsed = Number(valueInput.value);
      if (!Number.isInteger(parsed) || parsed < 0) return;
      isStressFixLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = stressFix(characterId, parsed, currentCharacter.revision);
      runMutation(
        transport,
        "stress",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isStressFixLoading = false; },
      );
    },

    onOverindulgedDismiss: () => {
      overindulgedNotice = false;
      renderDetailWrapper();
    },

    onTraumaAdd: () => {
      if (!currentCharacter || isTraumaLoading) return;
      // Read selected trauma from DOM at call time
      const sel = root.querySelector('select[aria-label="Add trauma"]') as HTMLSelectElement;
      const trauma = sel?.value || null;
      if (!trauma) return;
      isTraumaLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaAdd(characterId, trauma, currentCharacter.revision);
      runMutation(
        transport,
        "traumas",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTraumaLoading = false; },
      );
    },

    onTraumaRemove: (name: string) => {
      if (!currentCharacter || isTraumaLoading) return;
      isTraumaLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaRemove(characterId, name, currentCharacter.revision);
      runMutation(
        transport,
        "traumas",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTraumaLoading = false; },
      );
    },

    onDossierEdit: (field: DossierField) => {
      if (!currentCharacter || editing !== null) return;
      editing = { field, value: getDossierValue(currentCharacter, field) };
      renderDetailWrapper();
    },

    onDossierSave: () => {
      if (!currentCharacter || !editing || isDossierLoading) return;
      isDossierLoading = true;
      clearNotices();
      const field = editing.field;
      const value = editing.value;
      editing = null;
      renderDetailWrapper();

      const payload = buildDossierPayload(field, value);
      const program = dossierUpdate(characterId, payload, currentCharacter.revision);
      runMutation(
        transport,
        "personal",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isDossierLoading = false; },
      );
    },

    onDossierCancel: () => {
      editing = null;
      renderDetailWrapper();
    },

    // -- F2ab: heritage/background/vice dropdowns --------------------------

    onNamedEdit: (key: "heritage" | "background" | "vice") => {
      if (!currentCharacter || editing !== null || namedEditor !== null) return;
      const name = getNamedValue(currentCharacter, key, "name");
      const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
      const entry = gameDataOptions(gameData, key).find((o) => o.Name === name);
      namedEditor = {
        key,
        option: optionNames.includes(name) ? name : "__custom__",
        customName: name,
        customDesc: key === "vice"
          ? (entry && typeof entry.Description === "string"
              ? entry.Description
              : currentCharacter.dossier.vice.description)
          : "",
        purveyorName: key === "vice" ? currentCharacter.dossier.vice.purveyor.name : "",
        purveyorDesc: key === "vice" ? currentCharacter.dossier.vice.purveyor.description : "",
      };
      renderDetailWrapper();
    },

    onNamedSave: () => {
      if (!currentCharacter || !namedEditor || isDossierLoading) return;
      const editor = namedEditor;
      const key = editor.key;
      // Read the current control values from the DOM so a direct select
      // change (without an intermediate re-render) is still saved correctly.
      const keyLabel = key === "heritage" ? "Heritage" : key === "background" ? "Background" : "Vice";
      const select = root.querySelector(`select[aria-label="${keyLabel} (choose)"]`) as HTMLSelectElement | null;
      const option = select?.value ?? editor.option;
      const customName = (root.querySelector(`input[aria-label="${keyLabel} custom name"]`) as HTMLInputElement | null)
        ?.value ?? editor.customName;
      let payload: Record<string, unknown>;
      if (key === "vice") {
        const optionNames = gameDataOptions(gameData, "vice").map((o) => String(o.Name));
        const isCustom = option === "__custom__" || !optionNames.includes(option);
        const name = isCustom ? customName.trim() : option;
        const entry = gameDataOptions(gameData, "vice").find((o) => o.Name === option);
        const customDesc = (root.querySelector('input[aria-label="Vice custom description"]') as HTMLInputElement | null)
          ?.value ?? editor.customDesc;
        const description = isCustom
          ? customDesc.trim()
          : (entry && typeof entry.Description === "string"
              ? entry.Description
              : customDesc.trim());
        const purveyorName = (root.querySelector('input[aria-label="Vice purveyor name"]') as HTMLInputElement | null)
          ?.value ?? editor.purveyorName;
        const purveyorDesc = (root.querySelector('input[aria-label="Vice purveyor description"]') as HTMLInputElement | null)
          ?.value ?? editor.purveyorDesc;
        payload = {
          vice: {
            name,
            description,
            purveyor: {
              name: purveyorName.trim(),
              description: purveyorDesc.trim(),
            },
          },
        };
      } else {
        const optionNames = gameDataOptions(gameData, key).map((o) => String(o.Name));
        const isCustom = option === "__custom__" || !optionNames.includes(option);
        const name = isCustom ? customName.trim() : option;
        const description = isCustom ? "" : (gameDataDescription(gameData, key, option) ?? "");
        payload = { [key]: { name, description } };
      }
      isDossierLoading = true;
      clearNotices();
      namedEditor = null;
      renderDetailWrapper();

      const program = dossierUpdate(characterId, payload, currentCharacter.revision);
      runCharacterMutate(
        "personal",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isDossierLoading = false; },
      );
    },

    onNamedCancel: () => {
      namedEditor = null;
      renderDetailWrapper();
    },

    // -- F4: pending-trauma resolution (Q42, lifecycle-matrix §8) ----------
    // Resolving records the trauma and marks the character out-of-action for
    // the remainder of the score. CONTRACT-02 (DEC-02 ruling, 2026-08-24):
    // resolution also clears stress to 0 in the same apply; end-score
    // remains the release from out-of-action.
    onTraumaFromStress: () => {
      if (!currentCharacter || isTraumaPickerLoading) return;
      const sel = root.querySelector('select[aria-label="Trauma when stressed"]') as HTMLSelectElement;
      const trauma = sel?.value || null;
      if (!trauma) return;
      isTraumaPickerLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = traumaAdd(characterId, trauma, currentCharacter.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            failMutate("stress", err, () => { isTraumaPickerLoading = false; });
          },
          onSuccess: (withTrauma) => {
            if (cancelled) return;
            isTraumaPickerLoading = false;
            currentCharacter = withTrauma;
            noticeMsg = `${trauma} taken — stress cleared to 0; out of action until the score ends`;
            setTimeout(() => {
              if (!cancelled) {
                noticeMsg = null;
                renderDetailWrapper();
              }
            }, 4000);
            renderDetailWrapper();
          },
        }),
      );
    },

    // -- F2ab: notes (C4 list) ---------------------------------------------

    onNoteAdd: () => {
      if (!currentCharacter || isNotesLoading) return;
      const input = root.querySelector('input[aria-label="New note"]') as HTMLInputElement;
      const text = input?.value?.trim() ?? "";
      if (!text) return;
      isNotesLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = noteAdd(characterId, text, currentCharacter.revision);
      runCharacterMutate(
        "notes",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isNotesLoading = false; },
      );
    },

    onNoteRemove: (index: number) => {
      if (!currentCharacter || isNotesLoading) return;
      isNotesLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = noteRemove(characterId, index, currentCharacter.revision);
      runCharacterMutate(
        "notes",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isNotesLoading = false; },
      );
    },

    onNotebookSave: () => {
      if (!currentCharacter || isNotebookLoading) return;
      const notebookEl = root.querySelector('textarea[aria-label="Notebook"]') as HTMLTextAreaElement;
      const text = notebookEl?.value ?? "";
      isNotebookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = notebookSet(characterId, text, currentCharacter.revision);
      runCharacterMutate(
        "notebook",
        program,
        (character) => {
          currentCharacter = character;
          notebookNotice = "Notebook saved.";
          renderDetailWrapper();
        },
        () => { isNotebookLoading = false; },
      );
    },

    // -- CONTRACT-05: per-scoundrel contacts -------------------------------

    onContactAdd: () => {
      if (!currentCharacter || isContactsLoading) return;
      const input = root.querySelector('input[aria-label="New contact"]') as HTMLInputElement;
      const name = input?.value?.trim() ?? "";
      if (!name) return;
      isContactsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = contactAdd(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "contacts",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isContactsLoading = false; },
      );
    },

    onContactCycle: (name: string, current: ContactCloseness) => {
      if (!currentCharacter || isContactsLoading) return;
      const next: ContactCloseness =
        current === "contact" ? "friend" : current === "friend" ? "rival" : "contact";
      isContactsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = contactCloseness(characterId, name, next, currentCharacter.revision);
      runCharacterMutate(
        "contacts",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isContactsLoading = false; },
      );
    },

    onContactRemove: (name: string) => {
      if (!currentCharacter || isContactsLoading) return;
      isContactsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = contactRemove(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "contacts",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isContactsLoading = false; },
      );
    },

    // -- F2ab: crew membership ---------------------------------------------

    onCrewJoin: () => {
      if (!currentCharacter || isCrewsLoading) return;
      const sel = root.querySelector('select[aria-label="Join crew"]') as HTMLSelectElement;
      const crewId = sel?.value ?? "";
      if (!crewId) return;
      isCrewsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = dossierUpdate(characterId, { crewId }, currentCharacter.revision);
      runCharacterMutate(
        "personal",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isCrewsLoading = false; },
      );
    },

    onCrewLeave: () => {
      if (!currentCharacter || isCrewsLoading) return;
      if (!currentCharacter.dossier.crewId) return;
      isCrewsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = dossierUpdate(characterId, { crewId: "" }, currentCharacter.revision);
      runCharacterMutate(
        "personal",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isCrewsLoading = false; },
      );
    },

    onDismissCue: (key: string) => {
      if (!dismissedCues.has(key)) {
        dismissedCues.add(key);
        renderDetailWrapper();
      }
    },

    onUndo: () => {
      if (!currentCharacter || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetailWrapper();

      const program = undoCharacter(characterId, currentCharacter.revision);
      const before = currentCharacter;

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              renderDetailWrapper();
              refreshAndShowNotice();
            } else if (err instanceof OpError && err.error.code === "NO_HISTORY") {
              undoNotice = "Nothing to undo — no history available";
              renderDetailWrapper();
            } else {
              failSection("actions", err);
              renderDetailWrapper();
            }
          },
          onSuccess: ({ character, canUndo, historyCount }) => {
            if (cancelled) return;
            isUndoLoading = false;
            error = null;
            noticeMsg = null;
            currentCharacter = character;
            canUndoState = canUndo;
            historyCountState = historyCount;
            // FV-028: positive feedback that names the restored state, distinct
            // from the NO_HISTORY error copy above.
            undoNotice = `Undone — restored ${describeRestore(before, character)}.`;
            renderDetailWrapper();
          },
        }),
      );
    },

    // -- F4: end-score / retire / delete -----------------------------------

    onEndScore: () => {
      if (!currentCharacter || isEndScoreLoading) return;
      const confirmed = window.confirm(
        "End the score? This clears stress, takes the character out of action, " +
        "and (optionally) resets armor and loadout — in one snapshotted change " +
        "you can undo.",
      );
      if (!confirmed) return;
      isEndScoreLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = endScore(characterId, currentCharacter.revision);
      runCharacterMutate(
        "lifecycle",
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = "Score ended — stress cleared.";
          renderDetailWrapper();
        },
        () => { isEndScoreLoading = false; },
      );
    },

    onEndDowntime: () => {
      if (!currentCharacter || isDowntimeLoading) return;
      const confirmed = window.confirm(
        "End downtime? This clears the playbook, character, and struggle " +
        "expression tracks. Undo can restore them.",
      );
      if (!confirmed) return;
      isDowntimeLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = endDowntime(characterId, currentCharacter.revision, { clearSessionExpressions: true });
      runCharacterMutate(
        "lifecycle",
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = "Downtime ended — session expressions cleared.";
          renderDetailWrapper();
        },
        () => { isDowntimeLoading = false; },
      );
    },

    onRetire: () => {
      if (!currentCharacter || isRetireLoading) return;
      const confirmed = window.confirm(
        "Retire this character? This is independent of trauma — it heals harm, " +
        "clears stress and armor, and keeps the dossier/notes, but disables " +
        "gameplay. If it's a mistake, Undo restores the character.",
      );
      if (!confirmed) return;
      isRetireLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = retireCharacter(characterId, currentCharacter.revision);
      runCharacterMutate(
        "high-impact",
        program,
        (character) => {
          currentCharacter = character;
          noticeMsg = `${character.dossier.name || "This character"} has retired. Undo can restore it.`;
          renderDetailWrapper();
        },
        () => { isRetireLoading = false; },
      );
    },

    onDeleteCharacter: () => {
      if (!currentCharacter || isDeleteLoading) return;
      const confirmed = window.confirm(
        "Delete this character permanently? This is not undoable and removes " +
        "their history. Retired characters can also be deleted.",
      );
      if (!confirmed) return;
      isDeleteLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = deleteCharacter(characterId, String(currentCharacter.revision));
      runMutation(
        transport,
        null,
        program,
        () => {
          // The entity is gone — leave the page via history navigation.
          window.location.assign("/roster");
        },
        () => { isDeleteLoading = false; },
      );
    },

    // -- F2n: Health handlers -----------------------------------------------

    onHarmAdd: () => {
      if (!currentCharacter || isHarmLoading) return;
      const intensitySelect = root.querySelector('select[aria-label="Harm intensity"]') as HTMLSelectElement;
      const descInput = root.querySelector('input[aria-label="Harm description"]') as HTMLInputElement;
      const intensity = intensitySelect?.value;
      const description = descInput?.value?.trim();
      if (!intensity || !description) return;
      isHarmLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmAdd(characterId, description, intensity, currentCharacter.revision);
      runMutation(
        transport,
        "health",
        program,
        (result) => {
          currentCharacter = result.character;
          if (result.landedIntensity && result.landedIntensity !== intensity) {
            harmSpillNotice = `spilled to ${result.landedIntensity}`;
            setTimeout(() => {
              if (!cancelled) {
                harmSpillNotice = null;
                renderDetailWrapper();
              }
            }, 5000);
          }
          renderDetailWrapper();
        },
        () => { isHarmLoading = false; },
      );
    },

    onHarmRemove: (description: string, intensity: string) => {
      if (!currentCharacter || isHarmLoading) return;
      isHarmLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmRemove(characterId, description, intensity, currentCharacter.revision);
      runMutation(
        transport,
        "health",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isHarmLoading = false; },
      );
    },

    onHarmHeal: () => {
      if (!currentCharacter || isHealLoading) return;
      if (currentCharacter.monitor.harm.healingClock.segments < currentCharacter.monitor.harm.healingClock.size) return;
      // F2ab: the heal picker targets one specific currently-active harm.
      const sel = root.querySelector('select[aria-label="Harm to heal"]') as HTMLSelectElement;
      const harms = activeHarms(currentCharacter);
      const idx = sel ? Number(sel.value) : -1;
      const harm = idx >= 0 ? harms[idx] : undefined;
      if (!harm) return;
      isHealLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHeal(characterId, harm.intensity, harm.description, currentCharacter.revision);
      runCharacterMutate(
        "health",
        program,
        (character) => {
          currentCharacter = character;
          healNotice = `Healed ${harm.intensity} — ${harm.description}; clock reset`;
          setTimeout(() => {
            if (!cancelled) {
              healNotice = null;
              renderDetailWrapper();
            }
          }, 4000);
          renderDetailWrapper();
        },
        () => { isHealLoading = false; },
        healOpErrorText,
      );
    },

    onHarmHealingClock: () => {
      if (!currentCharacter || isClockLoading) return;
      // FV-007/P07: the healing clock is a rollover clock and the +1 control
      // sends a DELTA (the clock-progress family), never an absolute segment
      // count — so a clock at 5/6 sends {segments:1}. The server accepts
      // overflow into rollover and applies it on reset.
      const delta = 1;
      isClockLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = harmHealingClock(characterId, delta, currentCharacter.revision);
      runMutation(
        transport,
        "health",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isClockLoading = false; },
      );
    },

    onArmorSet: (armor: string, used: boolean) => {
      if (!currentCharacter || isArmorLoading) return;
      isArmorLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = armorSet(characterId, armor, used, currentCharacter.revision);
      runMutation(
        transport,
        "health",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isArmorLoading = false; },
      );
    },

    // -- F2o: Talents + XP + Score XP handlers ------------------------------

    onActionSetRating: (attribute: string, action: string, next: number) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = actionSetRating(characterId, action, next, currentCharacter.revision);
      runCharacterMutate(
        "talents",
        program,
        (character) => {
          currentCharacter = character;
          // Server clamps to the action's maxRating; surface a notice when it did.
          const attr = character.talent.attributes.find((a) => a.name === attribute);
          const act = attr?.actions.find((a) => a.name === action);
          if (act && act.rating < next) {
            clampNotice = `Server clamped ${action} rating to ${act.rating} (max ${act.maxRating})`;
            setTimeout(() => {
              if (!cancelled) {
                clampNotice = null;
                renderDetailWrapper();
              }
            }, 5000);
          }
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeXpDelta: (attribute: string, delta: number) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeXpAdd(characterId, attribute, delta, currentCharacter.revision);
      runCharacterMutate(
        "talents",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeXpClear: (attribute: string) => {
      if (!currentCharacter || isTalentsLoading) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeXpClear(characterId, attribute, currentCharacter.revision);
      runCharacterMutate(
        "talents",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onAttributeLevelup: (attribute: string) => {
      if (!currentCharacter || isTalentsLoading) return;
      const sel = root.querySelector(
        `select[aria-label="Level up action (${attribute})"]`,
      ) as HTMLSelectElement;
      const action = sel?.value || null;
      if (!action) return;
      isTalentsLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = attributeLevelup(characterId, attribute, action, currentCharacter.revision);
      runCharacterMutate(
        "talents",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isTalentsLoading = false; },
      );
    },

    onSessionTrack: (field: keyof SessionFields, next: number) => {
      if (!currentCharacter || isSessionLoading) return;
      if (next < 0 || next > currentCharacter.session.max) return;
      isSessionLoading = true;
      clearNotices();
      renderDetailWrapper();

      // Contract: partial update, send only the changed field
      const program = sessionSet(characterId, { [field]: next }, currentCharacter.revision);
      runCharacterMutate(
        "talents",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isSessionLoading = false; },
      );
    },

    onSessionDelta: (field: keyof SessionFields, delta: number) => {
      if (!currentCharacter || isSessionLoading) return;
      const next = currentCharacter.session[field] + delta;
      if (next < 0 || next > currentCharacter.session.max) return;
      handlers.onSessionTrack(field, next);
    },

    // -- F2p: Playbook handlers --------------------------------------------

    onPlaybookXpDelta: (delta: number) => {
      if (!currentCharacter || isPlaybookLoading) return;
      const next = currentCharacter.playbook.experience.points + delta;
      if (next < 0 || next > currentCharacter.playbook.experience.max) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = playbookXpAdd(characterId, delta, currentCharacter.revision);
      runCharacterMutate(
        "playbook",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
      );
    },

    onPlaybookXpClear: () => {
      if (!currentCharacter || isPlaybookLoading) return;
      if (currentCharacter.playbook.experience.points === 0) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = playbookXpClear(characterId, currentCharacter.revision);
      runCharacterMutate(
        "playbook",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
      );
    },

    onAbilityTake: () => {
      if (!currentCharacter || isPlaybookLoading) return;
      const sel = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = abilityTake(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "playbook",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
        playbookOpErrorText,
      );
    },

    onAbilityRemove: (name: string) => {
      if (!currentCharacter || isPlaybookLoading) return;
      isPlaybookLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = abilityRemove(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "playbook",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isPlaybookLoading = false; },
        playbookOpErrorText,
      );
    },

    onGearAdd: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Add gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      // Bulk comes from the game-data menu (never hardcoded); server validates.
      const menu = extractGearMenu(playbookData, gameData, currentCharacter.playbook.name);
      const item = menu.find((m) => m.name === name);
      if (!item) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearAdd(characterId, item.name, item.bulk, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearRemove: (name: string) => {
      if (!currentCharacter || isGearLoading) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearRemove(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearCommit: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearCommit(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearUncommit: () => {
      if (!currentCharacter || isGearLoading) return;
      const sel = root.querySelector('select[aria-label="Select gear item"]') as HTMLSelectElement;
      const name = sel?.value || null;
      if (!name) return;
      isGearLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearUncommit(characterId, name, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLoading = false; },
        gearOpErrorText,
      );
    },

    onGearSetCommitment: () => {
      if (!currentCharacter || isGearCommitmentLoading) return;
      const sel = root.querySelector('select[aria-label="Set commitment"]') as HTMLSelectElement;
      const commitment = sel?.value || null;
      if (!commitment) return;
      isGearCommitmentLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearSetCommitment(characterId, commitment, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearCommitmentLoading = false; },
        gearOpErrorText,
      );
    },

    onGearToggleLock: () => {
      if (!currentCharacter || isGearLockLoading) return;
      isGearLockLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = currentCharacter.gear.isCommitmentLocked
        ? gearUnlock(characterId, currentCharacter.revision)
        : gearLock(characterId, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearLockLoading = false; },
        gearOpErrorText,
      );
    },

    onGearClearCommitments: () => {
      if (!currentCharacter || isGearCommitmentLoading) return;
      isGearCommitmentLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = gearClearCommitments(characterId, currentCharacter.revision);
      runCharacterMutate(
        "gear",
        program,
        (character) => {
          currentCharacter = character;
          renderDetailWrapper();
        },
        () => { isGearCommitmentLoading = false; },
        gearOpErrorText,
      );
    },

    // -- F2s: Coin handlers ------------------------------------------------

    onFundDelta: (delta: number) => {
      if (!currentCharacter || isCoinLoading || delta === 0) return;
      // Spend is always attempted: the server draws from the satchel first,
      // liquidates stash at 2:1 as needed, and rejects with INSUFFICIENT_FUNDS
      // when nothing can cover it (surfaced as an op-level notice).
      isCoinLoading = true;
      clearNotices();
      renderDetailWrapper();

      // − spends from the satchel (server liquidates stash at 2:1 when needed),
      // + gains into the satchel with overflow to stash.
      const program = delta > 0
        ? fundGain(characterId, delta, currentCharacter.revision)
        : fundSpend(characterId, -delta, currentCharacter.revision);
      runFundMutate(
        "coin",
        program,
        (result) => {
          currentCharacter = result.character;
          // gain overflow: server stores what fits and reports applied.effective
          if (delta > 0 && result.effective < result.requested) {
            coinNotice = `Stored ${result.effective} of ${result.requested} coins — satchel and stash are full`;
            setTimeout(() => {
              if (!cancelled) {
                coinNotice = null;
                renderDetailWrapper();
              }
            }, 5000);
          }
          renderDetailWrapper();
        },
        () => { isCoinLoading = false; },
        coinOpErrorText,
      );
    },



    onFundLiquidate: () => {
      if (!currentCharacter || isCoinLoading) return;
      const input = root.querySelector('input[aria-label="Coins to liquidate"]') as HTMLInputElement;
      const coins = input ? Number(input.value) : NaN;
      if (!Number.isFinite(coins) || coins < 1) return;
      isCoinLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = fundLiquidate(characterId, coins, currentCharacter.revision);
      runFundMutate(
        "coin",
        program,
        (result) => {
          currentCharacter = result.character;
          renderDetailWrapper();
        },
        () => { isCoinLoading = false; },
        coinOpErrorText,
      );
    },

    // -- F2s: Projects (clocks) handlers -----------------------------------

    onCreateClock: () => {
      if (isClocksLoading) return;
      const nameInput = root.querySelector('input[aria-label="Clock name"]') as HTMLInputElement;
      const kindSelect = root.querySelector('select[aria-label="Clock kind"]') as HTMLSelectElement;
      const sizeInput = root.querySelector('input[aria-label="Clock size"]') as HTMLInputElement;
      const name = nameInput?.value?.trim() || null;
      const behavior = kindSelect?.value as "bounded" | "rollover" | undefined;
      const size = sizeInput ? Number(sizeInput.value) : NaN;
      if (!name || !behavior || !Number.isInteger(size) || size < 1) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = createClock(name, behavior, size);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isClocksLoading = false;
            failSection("projects", err, clockOpErrorText);
            renderDetailWrapper();
          },
          onSuccess: (created) => {
            if (cancelled) return;
            isClocksLoading = false;
            upsertClock(created);
            renderDetailWrapper();
          },
        }),
      );
    },

    onClockProgress: (clockId: string, segments: number) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      //  clockSummary rows carry the row's If-Match value in deleteToken
      //  ("" for readable rows → the header is omitted and the server skips
      //  the check; a degraded row's token would pass and the op then 422s
      //  at admission).
      const program = clockProgress(clockId, segments, clk.deleteToken);
      runClockMutate(
        "projects",
        program,
        (updated) => {
          upsertClock(updated);
          renderDetailWrapper();
        },
        () => { isClocksLoading = false; },
        clockOpErrorText,
      );
    },

    onClockReset: (clockId: string) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      const program = clockReset(clockId, clk.deleteToken);
      runClockMutate(
        "projects",
        program,
        (updated) => {
          upsertClock(updated);
          renderDetailWrapper();
        },
        () => { isClocksLoading = false; },
        clockOpErrorText,
      );
    },

    onClockDelete: (clockId: string) => {
      if (isClocksLoading) return;
      const clk = (clocks ?? []).find((x) => x.id === clockId);
      if (!clk) return;
      isClocksLoading = true;
      clearNotices();
      renderDetailWrapper();

      //  A degraded row deletes via its deleteToken (sha256 content token);
      //  a readable row's token is "" and the delete requires the current
      //  revision, so the full DTO is fetched for the revision first.
      const program = clk.deleteToken
        ? deleteClock(clockId, clk.deleteToken)
        : Effect.gen(function* () {
            const full = yield* getClock(clockId);
            return yield* deleteClock(clockId, String(full.revision));
          });
      runMutation(
        transport,
        "projects",
        program,
        () => {
          clocks = (clocks ?? []).filter((x) => x.id !== clockId);
          renderDetailWrapper();
        },
        () => { isClocksLoading = false; },
        clockOpErrorText,
        refreshClocksAndNotice,
      );
    },
  };

  // CHAR-03/PERF-03: wrap the page handlers so each invocation opens a
  // measurement span (initiator rect, focus-before, scroll-before); spans
  // complete at the first non-GET fetch response and settle when DOM is quiet.
  const wrappedHandlers = continuity.wrapHandlers(handlers);

  // FV-012: wholesale re-renders destroy the focused control; capture the
  // focused control's position before rendering and restore it after. The
  // request stays pending while the target is disabled (in-flight loading
  // render) so the post-mutation render fulfils it.
  let pendingFocus: FocusTarget | null = null;

  const renderDetailWrapper = () => {
    if (!currentCharacter) return;
    if (!pendingFocus) pendingFocus = captureFocusTarget(root);
    setChildren(root, renderDetail({
      c: currentCharacter,
      gameData,
      playbookData,
      caps,
      crews,
      isCrewsLoading,
      crewNotice,
      isNotesLoading,
      notesNotice,
      isNotebookLoading,
      notebookNotice,
      isContactsLoading,
      contactsNotice,
      isTraumaPickerLoading,
      healNotice,
      isEndScoreLoading,
      isDowntimeLoading,
      isRetireLoading,
      isDeleteLoading,
      canUndo: canUndoState,
      historyCount: historyCountState,
      isStressLoading,
      isStressClearLoading,
      isStressFixLoading,
      correctionsMode,
      isTraumaLoading,
      isDossierLoading,
      isUndoLoading,
      isHarmLoading,
      isArmorLoading,
      isHealLoading,
      isClockLoading,
      isTalentsLoading,
      isSessionLoading,
      clampNotice,
      experienceCondition,
      isPlaybookLoading,
      abilityNotice,
      isGearLoading,
      isGearCommitmentLoading,
      isGearLockLoading,
      dismissedCues,
      clocks,
      isCoinLoading,
      isClocksLoading,
      coinNotice,
      clocksNotice,
      error,
      noticeMsg,
      undoNotice,
      harmSpillNotice,
      overindulgedNotice,
      editing,
      namedEditor,
      rerender: renderDetailWrapper,
      handlers: wrappedHandlers,
    }));
    if (pendingFocus && applyFocusTarget(root, pendingFocus)) pendingFocus = null;
    // CHAR-03: the routed section alert must be visible when it fully sits
    // off screen; run the guard here where the sheet is attached and layout
    // is measurable. On-screen alerts never move (scroll preserved).
    if (error?.section) ensureSectionAlertVisible(root);
    // CHAR-03/PERF-03: inform the recorder a render cycle completed so
    // render-to-stable windows close naturally (no span open → no-op).
    continuity.noteRender();
  };

  // CHAR-03: no broad `aria-live` on the mount root. The sheet's concise
  // `role="status"` summary (sheet-live-summary) announces routed errors once;
  // a live root would also announce every wholesale sheet replacement, duplicating
  // the alert and summary for assistive technology.

  const startLoad = () => {
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    // Fetch character + game data + playbook settings in parallel
    const loadProgram = Effect.gen(function* () {
      const character = yield* getCharacter(characterId);
      const game = yield* Effect.either(getGame(character.gameStem));
      // Playbook settings carry the ExperienceCondition for the Score XP track;
      // failures degrade gracefully (fall back to game-data Playbooks lookup).
      const playbook = yield* Effect.either(
        getPlaybook(character.gameStem, character.playbook.name),
      );
      // Campaign clocks for the Projects section; failures degrade gracefully
      // (the section renders "(no clocks)" until a successful fetch).
      const clockList = yield* Effect.either(listClocks());
      // Crew list for the membership selector; failures degrade gracefully
      // (the selector renders disabled until a successful fetch).
      const crewList = yield* Effect.either(listCrews());
      // SC-F3: server-computed capability projection (effective action caps,
      // harm capacities, load limits). Advisory — degrade gracefully.
      const capProjection = yield* Effect.either(getCharacterCapabilities(characterId));
      return { character, game, playbook, clockList, crewList, capProjection };
    });

    void Effect.runPromise(
      Effect.match(loadProgram, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to reach /api/characters/${characterId} (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid character response: ${err.message}`
                : String(err);
          setChildren(
            root,
            errorCard({
              headline: "This character sheet could not be loaded.",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: ({ character, game, playbook, clockList, crewList, capProjection }) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          currentCharacter = character;
          if (capProjection._tag === "Right") {
            caps = capProjection.right;
          }
          if (game._tag === "Right") {
            gameData = game.right;
          }
          if (playbook._tag === "Right") {
            playbookData = playbook.right;
          }
          if (clockList._tag === "Right") {
            clocks = clockList.right;
          }
          if (crewList._tag === "Right") {
            crews = crewList.right;
          }
          experienceCondition = extractExperienceCondition(playbookData, gameData, character.playbook.name);
          renderDetailWrapper();
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
    continuity.dispose();
  };
}
