import { Effect } from "effect";
import {
  ApiError,
  OpError,
  DecodeError,
  getCrew,
  undoCrew,
  deleteCrew,
  crewContactAdd,
  crewContactRemove,
  factionSetStatus,
  factionSetStarting,
  getGame,
  factionRemove,
  crewFieldsUpdate,
  crewRepAdd,
  crewHeatAdd,
  crewWantedAdd,
  crewTierAdd,
  crewHoldSet,
  crewCoinAdd,
  crewStashAdd,
  crewAbilityTake,
  crewAbilityRemove,
  crewClaimSet,
  crewClaimCustomize,
  crewClaimReset,
  upgradeMark,
  upgradeUnmark,
  getCrewType,
  getCrewGameData,
  cohortAdd,
  cohortRemove,
  cohortUpdate,
  crewXpAdd,
  crewXpClear,
  crewNoteAdd,
  crewNoteRemove,
  crewTurfAdd,
  getCrewCapabilities,
  StaleRevisionError,
} from "../api/client.js";
import type { CrewCapabilities, CrewTrackOpResult } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import { failMutation, type MutationTransport } from "../lib/mutation-transport.js";
import { captureFocusTarget, applyFocusTarget, type FocusTarget } from "../lib/focus.js";
import { errorCard } from "../components/error-card.js";
import {
  describeCrewRestore,
  formatTier,
  opErrorText,
} from "./crew-domain.js";
import type { CrewField } from "./crew-domain.js";
import { claimsGraph, effectiveClaim, extractCrewClaims } from "./crew-domain.js";
import { renderCrewProfileSection } from "./crew-sections/profile.js";
import { renderCrewNotesSection } from "./crew-sections/notes.js";
import { crewRepTurf, renderCrewTrackersSection } from "./crew-sections/trackers.js";
import { renderCrewFundSection } from "./crew-sections/fund.js";
import { renderCrewClaimsSection } from "./crew-sections/claims.js";
import { renderCrewPlaybookSection } from "./crew-sections/playbook.js";
import { renderCrewCohortsSection, readCohortAddBody } from "./crew-sections/cohorts.js";
import { renderCrewXpSection } from "./crew-sections/xp.js";
import { renderCrewContactsSection } from "./crew-sections/contacts.js";
import { renderCrewActionsSection } from "./crew-sections/actions.js";
import type { Crew } from "../schema/crew.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileEditingState {
  field: CrewField;
  value: string;
}


export interface FactionDrafts {
  add: { name: string; tier: string; status: string };
  rows: Map<string, { tier: string; status: string }>;
  starting: { ally: string; rival: string } | null;
  error: string | null;
}
export interface RenderState {
  c: Crew;
  anyLoading: boolean;
  crewTypeData: Record<string, unknown> | null;
  crewTypesData: readonly Record<string, unknown>[] | null;
  crewGameData: Record<string, unknown> | null;
  /** Core-game TurfMax for the manual counter; never guessed from the crew catalog. */
  manualTurfMax: number | null;
  /** Server-computed crew capability projection (SC-F3); null until loaded or on fetch failure. */
  crewCaps: CrewCapabilities | null;
  isUndoLoading: boolean;
  isDeleteLoading: boolean;
  isAbilityLoading: boolean;
  isUpgradeLoading: boolean;
  isCohortLoading: boolean;
  isXpLoading: boolean;
  isContactLoading: boolean;
  isFactionLoading: boolean;
  factionBounds: { min: number; max: number } | null;
  factionDrafts: FactionDrafts;
  isProfileLoading: boolean;
  isRepLoading: boolean;
  isHeatLoading: boolean;
  isWantedLoading: boolean;
  isTierLoading: boolean;
  isHoldLoading: boolean;
  isCoinLoading: boolean;
  isStashLoading: boolean;
  isTurfLoading: boolean;
  isNoteLoading: boolean;
  isDevelopLoading: boolean;
  /** CREW-04: session-local advancement-edit mode — ability-remove /
   * upgrade-unmark controls only exist while it's on. Component state only,
   * never persisted server-side. */
  advancementEdit: boolean;
  editingProfile: ProfileEditingState | null;
  editingCohortId: string | null;
  /** CREW-CLAIMS-EDIT-01: session-local claim editor; closed on every fresh mount. */
  claimEditor: ClaimEditor | null;
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  refreshNotice: string | null;
  /** Derived undo state from the last operation result (null = unknown before any op). */
  canUndo: boolean | null;
  historyCount: number | null;
  handlers: {
    onUndo: () => void;
    onDeleteCrew: () => void;
    onContactAdd: () => void;
    onContactRemove: (name: string) => void;
    onFactionSetStatus: (name: string, status: number, tier?: number | null, adding?: boolean) => void;
    onFactionSetStarting: (ally: string, rival: string) => void;
    onFactionRemove: (name: string) => void;
    onProfileEdit: (field: CrewField) => void;
    onProfileSave: () => void;
    onProfileCancel: () => void;
    onRepDelta: (delta: number) => void;
    onRepTrack: (next: number) => void;
    onReputationSet: () => void;
    onTurfDelta: (delta: number) => void;
    onDevelop: () => void;
    onNoteAdd: () => void;
    onNoteRemove: (index: number) => void;
    onHeatDelta: (delta: number) => void;
    onHeatTrack: (next: number) => void;
    onWantedDelta: (delta: number) => void;
    onWantedTrack: (next: number) => void;
    onTierDelta: (delta: number) => void;
    onHoldSet: (hold: string) => void;
    onCoinDelta: (delta: number) => void;
    onStashDelta: (delta: number) => void;
    onAbilityTake: () => void;
    onAbilityRemove: (name: string) => void;
    onUpgradeMark: (name: string) => void;
    onUpgradeMarkMenu: () => void;
    onUpgradeUnmark: (name: string) => void;
    onChartBox: (name: string, index: number) => void;
    onCohortAdd: () => void;
    onCohortEdit: (cohortId: string) => void;
    onCohortUpdate: (cohortId: string, fields: Record<string, unknown>) => void;
    onCohortRemove: (cohortId: string) => void;
    onCohortCancel: () => void;
    onXpDelta: (delta: number) => void;
    onXpTrack: (next: number) => void;
    onXpClear: () => void;
    onClaimEditStart: () => void;
    onClaimEditSelect: (claimId: string) => void;
    onClaimEditCancel: () => void;
    onClaimSave: () => void;
    onAdvancementEditToggle: () => void;
    onClaimToggle: (claimId: string, claimed: boolean) => void;
    onClaimReset: (claimId: string) => void;
  };
}

/** CREW-CLAIMS-EDIT-01: session-local claim editor. `choose` waits for a claim click; `edit` holds the draft for one claim. */
export type ClaimEditor =
  | { kind: "choose" }
  | { kind: "edit"; claimId: string; name: string; description: string };

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderCrewDetail(state: RenderState): HTMLElement {
  const { c } = state;

  // -- Playbook (F2v) --------------------------------------------------------

  // -- Crew Claims (2026-08-10) ----------------------------------------------
  // Renders the canonical 5x3 claim map from game data with acquire/
  // relinquish toggles and per-claim customization (override merge + reset).
  return el(
    "section",
    { className: "crew-detail" },
    el(
      "div",
      { className: "crew-header torn-foot torn-foot-lg", "data-section": "header" },
      el("p", { className: "crew-kicker" }, c.gameName),
      el("h1", {}, c.name || `Unnamed ${c.crewTypeName}`),
      el("p", { className: "crew-type uneven" }, c.crewTypeName),
      el("p", { className: "crew-tier-badge", title: "Tier" }, `Tier ${formatTier(c.tier, state.crewCaps?.tierMax)}`),
      el(
        "nav",
        { className: "crew-nav" },
        el("a", { href: `/crew/${c.id}/history` }, "History"),
      ),
    ),
    renderCrewProfileSection(state),
    renderCrewNotesSection(state),
    renderCrewTrackersSection(state),
    renderCrewFundSection(state),
    renderCrewClaimsSection(state),
    renderCrewPlaybookSection(state),
    renderCrewCohortsSection(state),
    renderCrewXpSection(state),
    renderCrewContactsSection(state),
    renderCrewActionsSection(state),
    el(
      "div",
      { className: "crew-notices", "data-section": "notices", style: "margin-top: 1em;" },
      state.refreshNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.refreshNotice)
        : null,
      state.undoNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
        : null,
      state.errorMsg
        ? el("p", { className: "error", style: "margin-top: 1em;", role: "alert" }, state.errorMsg)
        : null,
      state.noticeMsg
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
        : null,
    ),
  );
}


function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-detail-loading" },
    el("h1", {}, "Crew"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the crew detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCrewDetailPage(
  root: HTMLElement,
  crewId: string,
): () => void {
  let cancelled = false;
  let currentCrew: Crew | null = null;
  let isUndoLoading = false;
  let isDeleteLoading = false;
  let canUndoState: boolean | null = null;
  let historyCountState: number | null = null;
  let isContactLoading = false;
  let isFactionLoading = false;
  let isProfileLoading = false;
  let isRepLoading = false;
  let isHeatLoading = false;
  let isWantedLoading = false;
  let isTierLoading = false;
  let isHoldLoading = false;
  let isCoinLoading = false;
  let isStashLoading = false;
  let isAbilityLoading = false;
  let isUpgradeLoading = false;
  let isCohortLoading = false;
  let isXpLoading = false;
  let isTurfLoading = false;
  let isNoteLoading = false;
  let isDevelopLoading = false;
  let crewTypeData: Record<string, unknown> | null = null;
  let crewTypesData: readonly Record<string, unknown>[] | null = null;
  let crewGameData: Record<string, unknown> | null = null;
  let manualTurfMax: number | null = null;
  let crewCaps: CrewCapabilities | null = null;
  let factionBounds: { min: number; max: number } | null = null;
  const factionDrafts: FactionDrafts = {
    add: { name: "", tier: "", status: "0" },
    rows: new Map(),
    starting: null,
    error: null,
  };
  let editingProfile: ProfileEditingState | null = null;
  let editingCohortId: string | null = null;
  // CREW-04: advancement-edit mode gates ability removal / upgrade unmarking;
  // session-local, starts off on every fresh mount.
  let advancementEditMode = false;
  // CREW-CLAIMS-EDIT-01: the claim editor is session-local and starts closed.
  let claimEditor: ClaimEditor | null = null;
  let errorMsg: string | null = null;
  let noticeMsg: string | null = null;
  let undoNotice: string | null = null;
  let refreshNotice: string | null = null;

  const clearNotices = () => {
    errorMsg = null;
    noticeMsg = null;
    undoNotice = null;
    refreshNotice = null;
  };
  /** CREW-04 fix (surfaced by the browser journey): rapid mutations each
   * trigger a capability refresh; a slow in-flight GET must never overwrite a
   * newer projection — the last ISSUED refresh wins, not the last delivered. */
  let capsRefreshSeq = 0;
  const refreshCaps = () => {
    if (cancelled || !currentCrew) return;
    const seq = ++capsRefreshSeq;
    void Effect.runPromise(
      Effect.match(getCrewCapabilities(crewId), {
        onFailure: () => undefined,
        onSuccess: (caps) => {
          if (cancelled || seq !== capsRefreshSeq) return;
          crewCaps = caps;
          renderDetail();
        },
      }),
    );
  };

  const refreshAndShowNotice = () => {
    if (!currentCrew) return;
    const recoverProgram = getCrew(crewId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          errorMsg = `Sheet refresh failed — ${opErrorText(recoverErr)}`;
          renderDetail();
        },
        onSuccess: (crew) => {
          if (cancelled) return;
          currentCrew = crew;
          refreshCaps();
          refreshNotice = "Sheet refreshed because it changed elsewhere";
          renderDetail();
          setTimeout(() => {
            if (!cancelled) {
              refreshNotice = null;
              renderDetail();
            }
          }, 3000);
        },
      }),
    );
  };

  // ARCH-02: shared mutation transport (lib/mutation-transport.js) — the
  // standard failure plumbing (cancel-check, stale-revision refetch, notice
  // routing) shared with character-detail.
  const transport: MutationTransport = {
    isCancelled: () => cancelled,
    rerender: () => renderDetail(),
    fail: (_section, err) => { errorMsg = opErrorText(err); },
    onStale: () => refreshAndShowNotice(),
  };

  /** Shared failure path for the mutation ops (mirrors character-detail). */
  const onOpFailure = (err: unknown, setLoadingFalse: () => void) => {
    failMutation(transport, err, setLoadingFalse);
  };

  /** Type guard: a tracker op result (updated crew + requested/effective) vs a bare crew. */
  const isCrewTrackResult = (r: Crew | CrewTrackOpResult): r is CrewTrackOpResult =>
    typeof r === "object" && r !== null && "crew" in r;

  /**
   * Shared runner for the F2u mutation ops: set the per-op loading flag,
   * clear notices, re-render, run the program, and on success adopt the
   * updated crew. Failure goes through onOpFailure (STALE_REVISION refetch,
   * op-level error notices). Tracker ops report requested/effective clamps
   * (P29/FV-029) when they applied less than requested.
   */
  const runCrewOp = (
    setLoading: (v: boolean) => void,
    program: Effect.Effect<Crew | CrewTrackOpResult, ApiError | DecodeError | StaleRevisionError>,
    successNotice?: string,
    clampLabel?: string,
    afterSuccess?: () => void,
  ) => {
    setLoading(true);
    clearNotices();
    renderDetail();
    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => onOpFailure(err, () => setLoading(false)),
        onSuccess: (result) => {
          if (cancelled) return;
          setLoading(false);
          const crew = isCrewTrackResult(result) ? result.crew : result;
          currentCrew = crew;
          if (isCrewTrackResult(result) && result.effective !== result.requested) {
            noticeMsg = `${clampLabel ?? "Value"} clamped to ${result.effective} (requested ${result.requested})`;
            setTimeout(() => {
              if (!cancelled) {
                noticeMsg = null;
                renderDetail();
              }
            }, 5000);
          }
          if (successNotice) noticeMsg = successNotice;
          afterSuccess?.();
          refreshCaps();
          renderDetail();
        },
      }),
    );
  };

  // FV-012: wholesale re-renders destroy the focused control; capture the
  // focused control's position before rendering and restore it after. The
  // request stays pending while the target is disabled (in-flight loading
  // render) so the post-mutation render fulfils it.
  let pendingFocus: FocusTarget | null = null;

  const renderDetail = () => {
    if (!currentCrew) return;
    if (!pendingFocus) pendingFocus = captureFocusTarget(root);
    setChildren(root, renderCrewDetail({
      c: currentCrew,
      anyLoading:
        isUndoLoading ||
        isDeleteLoading ||
        isContactLoading ||
        isFactionLoading ||
        isProfileLoading ||
        isRepLoading ||
        isHeatLoading ||
        isWantedLoading ||
        isTierLoading ||
        isHoldLoading ||
        isCoinLoading ||
        isStashLoading ||
        isAbilityLoading ||
        isUpgradeLoading ||
        isCohortLoading ||
        isXpLoading ||
        isTurfLoading ||
        isNoteLoading ||
        isDevelopLoading,
      isUndoLoading,
      isDeleteLoading,
      isContactLoading,
      isFactionLoading,
      factionBounds,
      factionDrafts,
      isProfileLoading,
      isRepLoading,
      isHeatLoading,
      isWantedLoading,
      isTierLoading,
      isHoldLoading,
      isCoinLoading,
      isStashLoading,
      isAbilityLoading,
      isUpgradeLoading,
      isCohortLoading,
      isXpLoading,
      isTurfLoading,
      isNoteLoading,
      isDevelopLoading,
      crewTypeData,
      crewTypesData,
      crewGameData,
      manualTurfMax,
      crewCaps,
      editingProfile,
      claimEditor,
      advancementEdit: advancementEditMode,
      editingCohortId,
      errorMsg,
      noticeMsg,
      undoNotice,
      refreshNotice,
      canUndo: canUndoState,
      historyCount: historyCountState,
      handlers,
    }));
    if (pendingFocus && applyFocusTarget(root, pendingFocus)) pendingFocus = null;
  };

  const handlers = {
    onUndo: () => {
      if (!currentCrew || isUndoLoading) return;
      isUndoLoading = true;
      undoNotice = null;
      renderDetail();

      const program = undoCrew(crewId, currentCrew.revision);
      const before = currentCrew;

      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => {
            if (cancelled) return;
            isUndoLoading = false;
            if (err instanceof StaleRevisionError) {
              refreshNotice = null;
              renderDetail();
              refreshAndShowNotice();
            } else if (err instanceof OpError && err.error.code === "NO_HISTORY") {
              undoNotice = "Nothing to undo — no history available";
              renderDetail();
            } else {
              errorMsg = opErrorText(err);
              renderDetail();
            }
          },
          onSuccess: ({ crew, canUndo, historyCount }) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            undoNotice = null;
            refreshNotice = null;
            currentCrew = crew;
            canUndoState = canUndo;
            historyCountState = historyCount;
            // FV-028: positive feedback naming the restored state, distinct
            // from the NO_HISTORY error copy above.
            undoNotice = `Undone — restored ${describeCrewRestore(before, crew)}.`;
            renderDetail();
          },
        }),
      );
    },

    onDeleteCrew: () => {
      if (!currentCrew || isDeleteLoading) return;
      const confirmed = window.confirm(
        "Delete this crew permanently? This is not undoable and removes " +
        "their history. Member scoundrels are unlinked and standalone " +
        "crew-owned clocks move to the campaign.",
      );
      if (!confirmed) return;
      isDeleteLoading = true;
      clearNotices();
      renderDetail();

      const program = deleteCrew(crewId, String(currentCrew.revision));
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isDeleteLoading = false; }),
          onSuccess: () => {
            if (cancelled) return;
            // The entity is gone — leave the page via history navigation.
            window.location.assign("/roster");
          },
        }),
      );
    },

    // -- F2y: Contacts & Factions -------------------------------------------

    onContactAdd: () => {
      if (!currentCrew || isContactLoading) return;
      const nameInput = root.querySelector('input[aria-label="Contact name"]') as HTMLInputElement;
      const profInput = root.querySelector('input[aria-label="Contact profession"]') as HTMLInputElement;
      const name = nameInput?.value?.trim() ?? "";
      const profession = profInput?.value?.trim() ?? "";
      if (!name) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactAdd(crewId, name, profession, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onContactRemove: (name: string) => {
      if (!currentCrew || isContactLoading) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onFactionSetStatus: (name: string, status: number, tier?: number | null, adding = false) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionSetStatus(crewId, name, status, currentCrew.revision, tier);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (result) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = result.crew;
            factionDrafts.rows.delete(name);
            if (adding) factionDrafts.add = { name: "", tier: "", status: "0" };
            factionDrafts.error = null;
            if (result.effective !== result.requested) {
              noticeMsg = `Faction status clamped to ${result.effective} (requested ${result.requested})`;
              setTimeout(() => {
                if (!cancelled) {
                  noticeMsg = null;
                  renderDetail();
                }
              }, 5000);
            }
            renderDetail();
          },
        }),
      );
    },

    onFactionSetStarting: (ally: string, rival: string) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();
      void Effect.runPromise(
        Effect.match(factionSetStarting(crewId, ally, rival, currentCrew.revision), {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = crew;
            factionDrafts.starting = null;
            renderDetail();
          },
        }),
      );
    },

    onFactionRemove: (name: string) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = crew;
            factionDrafts.rows.delete(name);
            renderDetail();
          },
        }),
      );
    },

    // -- F2u: Profile -------------------------------------------------------

    onProfileEdit: (field: CrewField) => {
      if (!currentCrew || editingProfile !== null) return;
      editingProfile = {
        field,
        value: currentCrew[field],
      };
      renderDetail();
    },

    onProfileSave: () => {
      if (!currentCrew || !editingProfile || isProfileLoading) return;
      const field = editingProfile.field;
      const value = editingProfile.value;
      isProfileLoading = true;
      editingProfile = null;
      clearNotices();
      renderDetail();

      // fields.update takes partial fields — send only the changed one.
      const program = crewFieldsUpdate(crewId, { [field]: value }, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isProfileLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isProfileLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onProfileCancel: () => {
      editingProfile = null;
      renderDetail();
    },

    onReputationSet: () => {
      if (!currentCrew || isProfileLoading) return;
      const select = root.querySelector('select[aria-label="Reputation"]') as HTMLSelectElement | null;
      const value = select?.value;
      if (!value || value === currentCrew.reputation) return;
      runCrewOp(
        (v) => { isProfileLoading = v; },
        crewFieldsUpdate(crewId, { reputation: value }, currentCrew.revision),
      );
    },

    // -- F2ac: Notes ---------------------------------------------------------

    onNoteAdd: () => {
      if (!currentCrew || isNoteLoading) return;
      const textarea = root.querySelector('textarea[aria-label="New note"]') as HTMLTextAreaElement | null;
      const text = textarea?.value?.trim() ?? "";
      if (!text) return;
      runCrewOp(
        (v) => { isNoteLoading = v; },
        crewNoteAdd(crewId, text, currentCrew.revision),
      );
    },

    onNoteRemove: (index: number) => {
      if (!currentCrew || isNoteLoading) return;
      runCrewOp(
        (v) => { isNoteLoading = v; },
        crewNoteRemove(crewId, index, currentCrew.revision),
      );
    },

    // -- F2ac: Rep & Turf tracker + Develop -----------------------------------

    onTurfDelta: (delta: number) => {
      if (!currentCrew || isTurfLoading) return;
      runCrewOp(
        (v) => { isTurfLoading = v; },
        crewTurfAdd(crewId, delta, currentCrew.revision),
        undefined,
        "Turf",
      );
    },

    // SRD develop flow: rep >= threshold (rep.max − turf) unlocks Develop.
    // Weak hold → hold.set strong + rep reset. Strong hold → pay
    // (tier+1)×8 coin, tier.add +1, rep reset, hold.set weak; when the coin
    // is unaffordable the flow stops with an INSUFFICIENT_FUNDS notice
    // before any op is sent.
    onDevelop: () => {
      if (!currentCrew || isDevelopLoading) return;
      const crew = currentCrew;
      const { repThreshold: threshold } = crewRepTurf({ c: crew, crewCaps, crewTypeData, crewTypesData });
      if (crew.rep.current < threshold) return;

      if (crew.hold === "weak") {
        const program = Effect.gen(function* () {
          const strong = yield* crewHoldSet(crewId, "strong", crew.revision);
          const reset = yield* crewRepAdd(
            crewId,
            -strong.rep.current,
            strong.revision,
          );
          return reset;
        });
        runCrewOp(
          (v) => { isDevelopLoading = v; },
          program,
          "Hold strengthened — rep reset to 0",
        );
        return;
      }

      const cost = (crew.tier + 1) * 8;
      if (crew.coin < cost) {
        clearNotices();
        noticeMsg = `INSUFFICIENT_FUNDS: developing to Tier ${formatTier(crew.tier + 1, crewCaps?.tierMax ?? null)} costs ${cost} coin (have ${crew.coin})`;
        renderDetail();
        return;
      }
      const program = Effect.gen(function* () {
        const paid = yield* crewCoinAdd(crewId, -cost, crew.revision);
        const raised = yield* crewTierAdd(crewId, 1, paid.crew.revision);
        const reset = yield* crewRepAdd(
          crewId,
          -raised.crew.rep.current,
          raised.crew.revision,
        );
        const weakened = yield* crewHoldSet(crewId, "weak", reset.crew.revision);
        return weakened;
      });
      runCrewOp(
        (v) => { isDevelopLoading = v; },
        program,
        `Tier advanced to ${formatTier(crew.tier + 1, crewCaps?.tierMax ?? null)} — hold weakened, rep reset`,
      );
    },

    // -- F2u: Trackers ------------------------------------------------------

    onRepDelta: (delta: number) => {
      if (!currentCrew || isRepLoading) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision), undefined, "Rep");
    },

    onRepTrack: (next: number) => {
      if (!currentCrew || isRepLoading) return;
      const delta = next - currentCrew.rep.current;
      if (delta === 0) return;
      runCrewOp((v) => { isRepLoading = v; }, crewRepAdd(crewId, delta, currentCrew.revision), undefined, "Rep");
    },

    onHeatDelta: (delta: number) => {
      if (!currentCrew || isHeatLoading) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision), undefined, "Heat");
    },

    onHeatTrack: (next: number) => {
      if (!currentCrew || isHeatLoading) return;
      const delta = next - currentCrew.heat.current;
      if (delta === 0) return;
      runCrewOp((v) => { isHeatLoading = v; }, crewHeatAdd(crewId, delta, currentCrew.revision), undefined, "Heat");
    },

    onWantedDelta: (delta: number) => {
      if (!currentCrew || isWantedLoading) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision), undefined, "Wanted");
    },

    onWantedTrack: (next: number) => {
      if (!currentCrew || isWantedLoading) return;
      const delta = next - currentCrew.wanted.current;
      if (delta === 0) return;
      runCrewOp((v) => { isWantedLoading = v; }, crewWantedAdd(crewId, delta, currentCrew.revision), undefined, "Wanted");
    },

    onTierDelta: (delta: number) => {
      if (!currentCrew || isTierLoading) return;
      runCrewOp((v) => { isTierLoading = v; }, crewTierAdd(crewId, delta, currentCrew.revision), undefined, "Tier");
    },

    onHoldSet: (hold: string) => {
      if (!currentCrew || isHoldLoading) return;
      if (!hold) return;
      runCrewOp((v) => { isHoldLoading = v; }, crewHoldSet(crewId, hold, currentCrew.revision));
    },

    onCoinDelta: (delta: number) => {
      if (!currentCrew || isCoinLoading) return;
      runCrewOp((v) => { isCoinLoading = v; }, crewCoinAdd(crewId, delta, currentCrew.revision), undefined, "Coin");
    },

    onStashDelta: (delta: number) => {
      if (!currentCrew || isStashLoading) return;
      runCrewOp((v) => { isStashLoading = v; }, crewStashAdd(crewId, delta, currentCrew.revision), undefined, "Stash");
    },

    // -- F2v: Playbook (abilities + upgrades + lair chart) -------------------

    onAbilityTake: () => {
      if (!currentCrew || isAbilityLoading) return;
      const sel = root.querySelector('select[aria-label="Take ability"]') as HTMLSelectElement | null;
      const name = sel?.value || null;
      if (!name) return;
      runCrewOp((v) => { isAbilityLoading = v; }, crewAbilityTake(crewId, name, currentCrew.revision));
    },

    onAbilityRemove: (name: string) => {
      if (!currentCrew || isAbilityLoading) return;
      runCrewOp((v) => { isAbilityLoading = v; }, crewAbilityRemove(crewId, name, currentCrew.revision));
    },

    onUpgradeMark: (name: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
    },

    onUpgradeMarkMenu: () => {
      if (!currentCrew || isUpgradeLoading) return;
      const sel = root.querySelector('select[aria-label="Mark upgrade"]') as HTMLSelectElement | null;
      const name = sel?.value || null;
      if (!name) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
    },

    onUpgradeUnmark: (name: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, upgradeUnmark(crewId, name, currentCrew.revision));
    },

    // Crew Claims: acquire/relinquish, customize, reset.
    onClaimToggle: (claimId: string, claimed: boolean) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, crewClaimSet(crewId, claimId, claimed, currentCrew.revision));
    },
    onClaimEditStart: () => {
      if (isUpgradeLoading) return;
      claimEditor = { kind: "choose" };
      renderDetail();
    },
    onClaimEditSelect: (claimId: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      const claims = extractCrewClaims(crewTypeData, crewTypesData, currentCrew.crewTypeName);
      const node = claims ? claimsGraph(claims).nodes.find((n) => n.id === claimId) : undefined;
      if (!node) return;
      const shown = effectiveClaim(node, currentCrew.claimOverrides);
      claimEditor = { kind: "edit", claimId, name: shown.name, description: shown.description };
      renderDetail();
    },
    onClaimEditCancel: () => {
      claimEditor = null;
      renderDetail();
    },
    onClaimSave: () => {
      if (!currentCrew || isUpgradeLoading || claimEditor?.kind !== "edit") return;
      const { claimId, name, description } = claimEditor;
      const fields: { name?: string; description?: string } = {};
      if (name.trim() !== "") fields.name = name.trim();
      if (description.trim() !== "") fields.description = description.trim();
      if (Object.keys(fields).length === 0) {
        errorMsg = "Enter a name or benefit text, or use Reset to default.";
        renderDetail();
        return;
      }
      runCrewOp(
        (v) => { isUpgradeLoading = v; },
        crewClaimCustomize(crewId, claimId, fields, currentCrew.revision),
        "Claim updated",
        undefined,
        () => { claimEditor = null; },
      );
    },
    onClaimReset: (claimId: string) => {
      if (!currentCrew || isUpgradeLoading) return;
      runCrewOp((v) => { isUpgradeLoading = v; }, crewClaimReset(crewId, claimId, currentCrew.revision), undefined, undefined, () => { claimEditor = null; });
    },

    onAdvancementEditToggle: () => {
      advancementEditMode = !advancementEditMode;
      renderDetail();
    },
    // Chart boxes are sugar over the same +1/−1 ops (no set-to-N op exists):
    // clicking an empty box marks one box, clicking a filled box unmarks one.
    onChartBox: (name: string, index: number) => {
      if (!currentCrew || isUpgradeLoading) return;
      const marked = currentCrew.upgrades.find((u) => u.name === name)?.boxesMarked ?? 0;
      if (index > marked) {
        runCrewOp((v) => { isUpgradeLoading = v; }, upgradeMark(crewId, name, currentCrew.revision));
      } else {
        runCrewOp((v) => { isUpgradeLoading = v; }, upgradeUnmark(crewId, name, currentCrew.revision));
      }
    },

    // -- F2w: Cohorts --------------------------------------------------------

    onCohortAdd: () => {
      if (!currentCrew || isCohortLoading) return;
      const body = readCohortAddBody(root, currentCrew.tier ?? 0);
      if (!body) return;

      isCohortLoading = true;
      clearNotices();
      renderDetail();

      const program = cohortAdd(crewId, body, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortEdit: (cohortId: string) => {
      if (!currentCrew || editingCohortId !== null) return;
      editingCohortId = cohortId;
      renderDetail();
    },

    onCohortUpdate: (cohortId: string, fields: Record<string, unknown>) => {
      if (!currentCrew || isCohortLoading) return;
      isCohortLoading = true;
      editingCohortId = null;
      clearNotices();
      renderDetail();

      const program = cohortUpdate(crewId, { cohortId, ...fields }, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortRemove: (cohortId: string) => {
      if (!currentCrew || isCohortLoading) return;
      isCohortLoading = true;
      clearNotices();
      renderDetail();

      const program = cohortRemove(crewId, cohortId, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isCohortLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isCohortLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onCohortCancel: () => {
      editingCohortId = null;
      renderDetail();
    },

    // -- F2x: Crew XP --------------------------------------------------------

    onXpDelta: (delta: number) => {
      if (!currentCrew || isXpLoading) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpAdd(crewId, delta, currentCrew.revision), undefined, "XP");
    },

    onXpTrack: (next: number) => {
      if (!currentCrew || isXpLoading) return;
      const delta = next - currentCrew.experience.points;
      if (delta === 0) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpAdd(crewId, delta, currentCrew.revision), undefined, "XP");
    },

    onXpClear: () => {
      if (!currentCrew || isXpLoading) return;
      runCrewOp((v) => { isXpLoading = v; }, crewXpClear(crewId, currentCrew.revision));
    },
  };

  root.setAttribute("aria-live", "polite");

  const startLoad = () => {
    root.setAttribute("aria-busy", "true");
    setChildren(root, renderLoading());

    const program = Effect.gen(function* () {
      const crew = yield* getCrew(crewId);
      // Crew-type game data drives the Playbook menus, the reputation
      // dropdown, and the cohort type lists. The per-crew-type endpoint is
      // preferred; failures degrade gracefully to the whole game-data object
      // (CrewTypes find-by-name), mirroring the character sheet's getPlaybook
      // + game-data fallback. F2ac: getCrewGameData (the raw {stem}-crews.json
      // object) replaces getCrewTypes so the top-level CohortGangTypes /
      // CohortExpertTypes keys are available for the cohort dropdowns.
      const crewType = yield* Effect.either(
        getCrewType(crew.gameStem, crew.crewTypeName),
      );
      const gameData = yield* Effect.either(getCrewGameData(crew.gameStem));
      // SC-F3: the server-computed capability projection (upgrade/ability
      // catalogs, effective turf, develop threshold). Advisory — degrade
      // gracefully when it's unavailable.
      const caps = yield* Effect.either(getCrewCapabilities(crewId));
      const coreGame = yield* Effect.either(getGame(crew.gameStem));
      return { crew, crewType, gameData, caps, coreGame };
    });

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          const msg =
            err instanceof ApiError
              ? `Failed to reach /api/crews/${crewId} (${err.status}): ${err.body}`
              : err instanceof DecodeError
                ? `Invalid crew response: ${err.message}`
                : String(err);
          setChildren(
            root,
            errorCard({
              headline: "This crew sheet could not be loaded.",
              detail: msg,
              onRetry: startLoad,
            }),
          );
        },
        onSuccess: ({ crew, crewType, gameData, caps, coreGame }) => {
          if (cancelled) return;
          root.setAttribute("aria-busy", "false");
          currentCrew = crew;
          if (coreGame._tag === "Right") {
            const turfLimit = coreGame.right.TurfMax;
            manualTurfMax = typeof turfLimit === "number" && Number.isSafeInteger(turfLimit) && turfLimit >= 0 ? turfLimit : null;
            const range = coreGame.right.FactionStatus;
            if (typeof range === "object" && range !== null && !Array.isArray(range)) {
              const { Min, Max } = range as Record<string, unknown>;
              if (typeof Min === "number" && typeof Max === "number" &&
                  Number.isSafeInteger(Min) && Number.isSafeInteger(Max) && Min <= Max) {
                factionBounds = { min: Min, max: Max };
              }
            }
          }
          if (caps._tag === "Right") {
            crewCaps = caps.right;
          }
          if (crewType._tag === "Right") {
            crewTypeData = crewType.right;
          }
          if (gameData._tag === "Right") {
            crewGameData = gameData.right;
            const crewTypes = gameData.right.CrewTypes;
            if (Array.isArray(crewTypes)) {
              crewTypesData = crewTypes.filter(
                (ct): ct is Record<string, unknown> =>
                  typeof ct === "object" && ct !== null,
              );
            }
          }
          renderDetail();
        },
      }),
    );
  };

  startLoad();

  return () => {
    cancelled = true;
  };
}
