import { renderXpAllocation, type XpDraft } from "./xp-allocation.js";
import { renderXpTrackerPanel, renderXpTrackerTab } from "./xp-tracker.js";
/**
 * Per-scoundrel game mode UI (GAME-MODE-03). Assistance only: nothing here
 * disables an operation because of mode. Score popups and the Resolution step
 * are read from the stored cursor (`modeFlow`), so they survive reloads.
 */
import { el } from "../../lib/dom.js";
import type { Crew } from "../../schema/crew.js";
import type { SectionCtx } from "./context.js";
import {
  type ScoreStartStep,
  DOWNTIME_ACTIVITIES,
  LOAD_CHOICES,
  ONE_PLAYER_WARNING,
  PLAN_APPROACHES,
  RESOLUTION_LABELS,
  RESOLUTION_STEPS,
  type ResolutionStep,
  SCORE_START_STEPS,
  SRD,
  choiceForCommitment,
  commitmentFor,
  downtimeRemaining,
  entanglementCurrent,
  loadLimitFor,
  stepAfter,
  stepBefore,
  type LoadChoice,
  type LoadoutProposal,
} from "../game-mode.js";
import { ENTANGLEMENT_ROWS, entanglementsInBand, ENTANGLEMENT_DESCRIPTIONS, ENTANGLEMENTS_SRD_URL } from "../../data/entanglements.js";
import {
  CREW_ADVANCE_ORIGIN_TEXT,
  CREW_ADVANCE_TEXT,
  CREW_ADVANCEMENT_ATTRIBUTION,
  CREW_ADVANCEMENT_SRD_URL,
  CREW_PROFITS_TEXT,
  CREW_XP_CATEGORIES,
  CREW_XP_INTRO,
  CREW_XP_LEADIN,
  CREW_XP_MAX_NOTE,
} from "../../data/crew-advancement.js";

export interface GameModeUi {
  /** The linked crew, loaded for the Resolution editors; null when unlinked or not loaded. */
  linkedCrew: Crew | null;
  /** The linked crew type's own XP trigger from the crew game data; null when unknown. */
  crewXpTrigger: string | null;
  /** Show the full entanglement table (Show all disclosure). */
  /** A proposed loadout replacement awaiting Confirm change (Back / Leave flow cancels). */
  loadoutChange: LoadoutProposal | null;
  /** The last gear rejection while the confirmation is open (the reason and recovery); null otherwise. */
  loadoutError: string | null;
  /** The last refused Desperate action XP mark, shown inside the XP Tracker; null otherwise. */
  desperateError: string | null;
  /** Planning approach picked in the popup (assistance only; not persisted). */
  planApproach: string | null;
  crewNotice: string | null;
  /** Scoundrel XP draft (split, GM total, Adjust). Assistance only; completion goes through xp.resolve. */
  xpDraft: XpDraft;
  /** The compact XP Tracker bottom sheet is open. */
  xpTrackerOpen: boolean;
}

export interface GameModeHandlers {
  onMode: (mode: "free-play" | "score" | "downtime") => void;
  onFlowSet: (kind: "none" | "score-start" | "resolution", step: string) => void;
  onPlanApproach: (approach: string) => void;
  /** Open (non-null) or cancel (null) the loadout replacement proposal. */
  onLoadoutChange: (proposal: LoadoutProposal | null) => void;
  onLoadoutProposalChoice: (choice: LoadChoice) => void;
  onLoadoutProposalItem: (name: string, committed: boolean) => void;
  onLoadoutConfirm: () => void;
  onLoadoutCommitment: (choice: LoadChoice) => void;
  onLoadoutToggle: (name: string, commit: boolean) => void;
  onDesperate: (attribute: string) => void;
  onXpDraft: (draft: XpDraft) => void;
  onXpTrackerOpen: (open: boolean) => void;
  onXpResolve: (total: number, allocations: Record<string, number>) => void;
  onDowntimeAdjust: (delta: number, reason: "coin" | "gift" | "correction") => void;
  onDowntimeSpend: (activity: string, description: string) => void;
  onCrewDelta: (track: "rep" | "coin" | "heat" | "xp", delta: number) => void;
  onMyShare: (delta: number) => void;
}

const h = el;

function section(title: string, ...children: Array<HTMLElement | null>): HTMLElement {
  return h("div", { className: "game-mode-block" }, h("h3", { className: "lbl" }, title), ...children);
}

function srdLink(href: string): HTMLElement {
  return h("a", { className: "srd-link", href, target: "_blank", rel: "noopener noreferrer" }, "SRD ↗");
}

function amountInput(label: string): HTMLInputElement {
  return h("input", { type: "number", step: "1", "aria-label": label, value: "1", style: "width: 5em;" }) as HTMLInputElement;
}

/** Crew editor: current total, an amount to add, the one-player warning. `button` is the approved update label. */
function crewEditor(
  label: string,
  current: number | null,
  track: "rep" | "coin" | "heat" | "xp",
  button: string,
  ctx: SectionCtx,
  gm: GameModeHandlers,
  linked: boolean,
): HTMLElement {
  const input = amountInput(`${label} amount`);
  const apply = h("button", {
    type: "button",
    disabled: ctx.anyLoading || !linked,
    title: `${button} (${label.toLowerCase()})`,
  }, button);
  apply.addEventListener("click", () => gm.onCrewDelta(track, Number(input.value) || 0));
  return h("div", { className: "game-mode-crew-editor", "data-crew-track": track },
    h("p", { className: "lbl", style: "margin: 0;" }, `${label} · current ${current ?? "—"}`),
    h("p", { className: "small", style: "margin: 0 0 0.25em;" },
      "Enter the amount to add (use a minus to subtract). The number on the left is the current total; your entry is added to it."),
    h("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" }, input, apply),
    h("p", { className: "small notice", role: "note", style: "margin: 0.25em 0 0;" }, ONE_PLAYER_WARNING),
  );
}

function renderModeSwitch(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const modes: Array<["free-play" | "score" | "downtime", string]> = [
    ["free-play", "Free Play"],
    ["score", "Score"],
    ["downtime", "Downtime"],
  ];
  const current = ctx.c.mode;
  return h("nav", { "aria-label": "Scoundrel game mode", className: "mode-switch" },
    ...modes.map(([mode, label]) => {
      const btn = h("button", {
        type: "button",
        className: current === mode ? "active" : "",
        "aria-pressed": current === mode ? "true" : "false",
        disabled: ctx.anyLoading,
      }, label);
      btn.addEventListener("click", () => gm.onMode(mode));
      return btn;
    }),
  );
}

/** Downtime budget and soft adjustments (panel). The activity menu is in the sheet (see renderDowntimeActivities). */
function renderDowntimeBudget(ctx: SectionCtx, gm: GameModeHandlers, variant: "panel" | "sheet"): HTMLElement {
  const d = ctx.c.downtime;
  const remaining = downtimeRemaining(d);
  const total = d.free + d.paid;
  const dots = "●".repeat(Math.max(0, Math.min(remaining, total))) + "○".repeat(Math.max(0, total - Math.max(0, remaining)));
  const adjust = (delta: number, reason: "coin" | "gift" | "correction", label: string) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading, title: label }, label);
    b.addEventListener("click", () => gm.onDowntimeAdjust(delta, reason));
    return b;
  };
  // One copy per layout (CSS): the panel on wide screens, the activities card on narrow (approved 07-downtime).
  return h("div", { className: `game-mode-budget-${variant}` }, section("Downtime budget",
    h("p", { className: "serif", style: "margin: 0.25em 0;", "data-downtime-remaining": String(remaining) },
      `${dots} ${remaining} of ${total} left`),
    remaining < 0
      ? h("p", { className: "notice small" }, "Over the soft budget. Add a coin or gift extra, or record a correction. Nothing is blocked.")
      : null,
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" },
      adjust(1, "coin", "+1 (coin)"),
      adjust(1, "gift", "+1 (gift)"),
      adjust(-1, "correction", "−1"),
    ),
  ));
}

/**
 * Downtime activity menu. Two copies share one behaviour: the panel copy shows on
 * wide screens (approved panel), the sheet copy above the fixed footer on narrow
 * screens (approved narrow mockup). CSS shows exactly one per layout.
 */
export function renderDowntimeActivities(ctx: SectionCtx, gm: GameModeHandlers, variant: "panel" | "sheet"): HTMLElement {
  const desc = h("input", { type: "text", "aria-label": "Activity description", placeholder: "what you did" }) as HTMLInputElement;
  const activityButtons = DOWNTIME_ACTIVITIES.map(({ value, label }) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading, title: `Record activity: ${label}` }, label);
    b.addEventListener("click", () => gm.onDowntimeSpend(value, desc.value.trim()));
    return b;
  });
  const body = [
    h("p", { className: "small" }, "Each explicit activity pick spends one unit. Helping someone is their Recover, not yours. Over-budget spending is allowed."),
    desc,
    h("div", { className: "activity-menu" }, ...activityButtons),
    h("p", { className: "small" }, srdLink(SRD.downtime)),
  ];
  if (variant === "panel") {
    return h("div", { className: "game-mode-block game-mode-activities-panel", "data-section": "downtime-activities-panel" },
      h("h3", { className: "lbl" }, "Downtime activities"), ...body);
  }
  return h("section", { className: "sheet-card game-mode-activities game-mode-activities-sheet", "data-section": "downtime-activities", style: "grid-column: 1 / -1;" },
    h("h2", {}, "Downtime activities"), renderDowntimeBudget(ctx, gm, "sheet"), ...body);
}

function renderScorePanel(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const endScore = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading || ctx.retired || ctx.pendingTrauma, title: ctx.endScoreTitle }, "End Score");
  endScore.addEventListener("click", ctx.handlers.onEndScore);
  const steps = SCORE_START_STEPS.map((s) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading }, s.charAt(0).toUpperCase() + s.slice(1));
    b.addEventListener("click", () => gm.onFlowSet("score-start", s));
    return b;
  });
  return section("Score in progress",
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" }, ...steps),
    h("hr", {}),
    endScore,
    h("p", { className: "small" }, "End Score opens Resolution. Undo can restore the score."),
    ui.crewNotice ? h("p", { className: "notice small" }, ui.crewNotice) : null,
  );
}

/** The mode panel: sticky left gutter on wide screens, footer on narrow (see CSS). */
export function renderGameModePanel(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const c = ctx.c;
  const body = c.mode === "score"
    ? renderScorePanel(ctx, gm, ui)
    : c.mode === "downtime"
      ? h("div", {}, renderDowntimeBudget(ctx, gm, "panel"), renderDowntimeActivities(ctx, gm, "panel"))
      : section("Free Play", h("p", { className: "serif", style: "margin: 0.25em 0;" },
          "The sheet works as usual. Pick Score or Downtime when you want guided assistance."));
  return h("aside", { className: "mode-panel", "data-section": "game-mode", "aria-label": "Game mode" },
    h("h2", {}, "Game mode"),
    h("p", { className: "small scope" }, `For ${c.dossier.name || "this scoundrel"} only`),
    renderModeSwitch(ctx, gm),
    c.mode === "score" ? renderXpTrackerTab(ctx, gm, ui) : null,
    h("div", { className: "panel-content" }, body),
    c.mode === "score" ? renderXpTrackerPanel(ctx, gm, ui) : null,
    h("p", { className: "small", style: "margin-top: 0.5em;" }, "A table aid, not a rules engine. Nothing here blocks your sheet."),
  );
}

/** Overlay dialog frame for the Score popups (approved surface: aria-modal over the sheet). */
/** Footer split as approved: Back on the left; Leave flow and Next on the right (mockups 02, 03, 06a-f). */
type OverlayFooter = { left: HTMLElement[]; right: HTMLElement[] };
/** Score popup header (approved 02/03/04): "Start a Score · N of 3" beside the title, Close on the right. */
type PopupHeader = { subtitle: string; close: HTMLElement };

function overlay(label: string, dataSection: string, extraClass: string, title: string, body: HTMLElement[], footer: OverlayFooter, header?: PopupHeader): HTMLElement {
  return h("section", {
    className: `game-mode-popup ${extraClass}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": label,
    "data-section": dataSection,
  },
    h("div", { className: "game-mode-popup-card" },
      header
        ? h("div", { className: "popup-header" }, h("div", {}, h("h2", {}, title), h("span", { className: "flow-label" }, header.subtitle)), header.close)
        : h("h2", {}, title),
      ...body,
      h("div", { className: "game-mode-popup-footer" },
        h("div", { className: "left" }, ...footer.left),
        h("div", { className: "right" }, ...footer.right)),
    ));
}

/** Score popup: Planning → Loadout → Engagement, read from the stored cursor. Rendered as an overlay outside the sheet. */
export function renderScorePopup(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ctx.c.modeFlow;
  if (flow.kind !== "score-start") return null;
  const step = flow.step;
  const back = stepBefore("score-start", step);
  const next = stepAfter("score-start", step);
  const title = step === "planning" ? "Planning" : step === "loadout" ? "Loadout" : "Engagement";
  const body: HTMLElement[] = [];
  if (step === "planning") {
    body.push(
      h("p", { className: "serif" }, "Choose the plan your scoundrel is joining, then choose your loadout."),
      // Each approach is one selectable card: its title and description are inside the button (approved 02-planning).
      h("div", { className: "approach-grid" },
        ...PLAN_APPROACHES.map((p) => {
          const card = h("button", { type: "button", className: "approach-card", "aria-pressed": ui.planApproach === p.value ? "true" : "false", disabled: ctx.anyLoading },
            h("strong", {}, p.value),
            h("span", { className: "small" }, p.description));
          card.addEventListener("click", () => gm.onPlanApproach(p.value));
          return card;
        })),
      h("p", { className: "small" }, srdLink(SRD.planning)),
    );
  } else if (step === "loadout") {
    body.push(renderLoadoutChoices(ctx, gm));
    body.push(h("p", { className: "small" }, "Choose items now or declare more during the score. This suggests a load limit; it never blocks play."));
    body.push(h("p", { className: "small" }, srdLink(SRD.planning)));
  } else {
    body.push(
      h("p", { className: "serif" }, "The crew makes the engagement roll, then cuts straight to the first obstacle."),
      h("ul", { className: "small" },
        h("li", {}, "Start with 1d for sheer luck."),
        h("li", {}, "+1d for each major advantage."),
        h("li", {}, "−1d for each major disadvantage.")),
      engagementFactors(),
      h("p", { className: "small", "data-starting-position": "" },
        "Starting position: Critical: past the first obstacle, controlled next · 6: controlled · 4/5: risky · 1–3: desperate. Roll at the table. This reminder doesn’t roll dice or require a result."),
      h("p", { className: "small" }, srdLink(SRD.planning)),
    );
  }
  // Back on Planning returns to the score sheet (cursor cleared; mode stays Score).
  const backBtn = h("button", { type: "button", disabled: ctx.anyLoading }, "Back");
  backBtn.addEventListener("click", () => (back ? gm.onFlowSet("score-start", back) : gm.onFlowSet("none", "")));
  const leave = h("button", { type: "button", disabled: ctx.anyLoading }, "Leave flow");
  leave.addEventListener("click", () => gm.onFlowSet("none", ""));
  const nextLabel = next === "engagement" ? "Next: Engagement" : next === "loadout" ? "Next: Loadout" : "Enter Score";
  const nextBtn = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading }, nextLabel);
  nextBtn.addEventListener("click", () => (next ? gm.onFlowSet("score-start", next) : gm.onFlowSet("none", "")));
  const close = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading }, "Close");
  close.addEventListener("click", () => gm.onFlowSet("none", ""));
  const position = SCORE_START_STEPS.indexOf(step as ScoreStartStep) + 1;
  return overlay(`Score ${step}`, "game-mode-popup", "", title, body,
    { left: [backBtn], right: [leave, nextBtn] },
    { subtitle: `Start a Score · ${position} of ${SCORE_START_STEPS.length}`, close });
}

/** Approved reference rows (mockups 06b-payoff and 06c-heat). */
const PAYOFF_GUIDE: ReadonlyArray<readonly [string, string]> = [
  ["2", "A minor job; several full purses"],
  ["4", "A small job; a strongbox"],
  ["6", "A standard score; decent loot"],
  ["8", "A big score; serious loot"],
  ["10+", "A major score; impressive loot"],
];
const HEAT_EXPOSURE: ReadonlyArray<readonly [string, string]> = [
  ["0", "Smooth & quiet; low exposure"],
  ["2", "Contained; standard exposure"],
  ["4", "Loud & chaotic; high exposure"],
  ["6", "Wild; devastating exposure"],
];

/** A two-column reference table: a header row, then one row per approved entry. */
function referenceTable(head: readonly [string, string], rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  return h("table", { className: "rule-table reference-table" },
    h("tbody", {},
      h("tr", {}, h("th", { scope: "col" }, head[0]), h("th", { scope: "col" }, head[1])),
      ...rows.map(([a, b]) => h("tr", {}, h("th", { scope: "row" }, a), h("td", {}, b)))));
}

/** Entanglement result table (approved mockup 06d). Head rows then body rows. */
function entanglementTable(head: HTMLElement[], body: HTMLElement[]): HTMLElement {
  return h("table", { className: "rule-table ent-table" }, h("tbody", {}, ...head, ...body));
}

/** The approved engagement factor table (mockup 04-engagement wording). */
const ENGAGEMENT_FACTORS: Array<{ factor: string; advantage: string; disadvantage: string }> = [
  { factor: "Operation", advantage: "Particularly bold or daring", disadvantage: "Overly complex; contingent on many factors" },
  { factor: "Plan’s detail", advantage: "Exposes a vulnerability; hits the target where they’re weakest", disadvantage: "The target is strongest here; special defenses or preparations" },
  { factor: "People", advantage: "Friends or contacts provide aid or insight", disadvantage: "Enemies or rivals interfere" },
  { factor: "Other elements", advantage: "A lower-Tier target; a helpful district situation", disadvantage: "A higher-Tier target; a harmful district situation" },
];

function engagementFactors(): HTMLElement {
  return h("table", { className: "engagement-factors" },
    h("thead", {}, h("tr", {}, h("th", {}, "Consider"), h("th", {}, "Advantage · +1d"), h("th", {}, "Disadvantage · −1d"))),
    h("tbody", {},
      ...ENGAGEMENT_FACTORS.map((row) =>
        h("tr", {}, h("th", { scope: "row" }, row.factor), h("td", {}, row.advantage), h("td", {}, row.disadvantage)))));
}

function renderLoadoutChoices(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const current = ctx.c.gear.commitment;
  const choices = LOAD_CHOICES.map((choice) => {
    const limit = loadLimitFor(ctx.gameData, choice);
    const pressed = commitmentFor(choice) === current;
    const b = h("button", { type: "button", "aria-pressed": pressed ? "true" : "false", disabled: ctx.anyLoading || ctx.c.gear.isCommitmentLocked },
      limit === null ? choice : `${choice} · ${limit}`);
    b.addEventListener("click", () => gm.onLoadoutCommitment(choice));
    return b;
  });
  return h("div", {},
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" }, ...choices),
    h("p", { className: "small" }, "Choose the load and items for this scoundrel. Limits come from the game settings."),
    renderGearChecklist(ctx, gm),
  );
}

/**
 * Every owned item, once. The server's availableGear lists all owned items and a
 * committed item also appears in loadout, so the checklist keys on name.
 */
function ownedItems(g: SectionCtx["c"]["gear"]): Array<{ name: string; bulk: number }> {
  const byName = new Map<string, { name: string; bulk: number }>();
  for (const item of [...g.availableGear, ...g.loadout]) {
    if (!byName.has(item.name)) byName.set(item.name, { name: item.name, bulk: item.bulk });
  }
  return [...byName.values()];
}

function renderGearChecklist(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const g = ctx.c.gear;
  const committed = new Set(g.loadout.map((i) => i.name));
  const row = (item: { name: string; bulk: number }) => {
    const on = committed.has(item.name);
    const cb = h("input", { type: "checkbox", checked: on, disabled: ctx.anyLoading }) as HTMLInputElement;
    cb.addEventListener("change", () => gm.onLoadoutToggle(item.name, cb.checked));
    return h("label", { className: "gear" }, cb, ` ${item.name} `, h("span", { className: "small" }, `${item.bulk} load`));
  };
  const used = g.loadout.reduce((sum, i) => sum + i.bulk, 0);
  return h("div", { className: "game-mode-loadout" },
    h("p", { className: "lbl" }, loadTotalText(used, loadLimitFor(ctx.gameData, g.commitment), "committed")),
    ...ownedItems(g).map(row),
  );
}

/**
 * "N of L load <verb>" with L the commitment's settings-derived allowance. Without
 * an allowance from settings the total stands alone; no maximum is invented.
 */
function loadTotalText(total: number, allowance: number | null, verb: "committed" | "proposed"): string {
  return allowance === null ? `${total} load ${verb}` : `${total} of ${allowance} load ${verb}`;
}

/** Replacement checklist: every known item, checked when the proposal includes it. Nothing commits until Confirm. */
function renderProposalChecklist(ctx: SectionCtx, gm: GameModeHandlers, proposal: LoadoutProposal): HTMLElement {
  const g = ctx.c.gear;
  const all = ownedItems(g);
  const row = (item: { name: string; bulk: number }) => {
    const on = proposal.items.includes(item.name);
    const cb = h("input", { type: "checkbox", checked: on, disabled: ctx.anyLoading }) as HTMLInputElement;
    cb.addEventListener("change", () => gm.onLoadoutProposalItem(item.name, cb.checked));
    return h("label", { className: "gear" }, cb, ` ${item.name} `, h("span", { className: "small" }, `${item.bulk} load`));
  };
  const load = all.filter((i) => proposal.items.includes(i.name)).reduce((s, i) => s + i.bulk, 0);
  return h("div", { className: "game-mode-loadout" },
    h("p", { className: "lbl" }, loadTotalText(load, proposal.commitment ? loadLimitFor(ctx.gameData, commitmentFor(proposal.commitment)) : null, "proposed")),
    ...all.map(row),
  );
}

/** Committed loadout card (Score sheet). Change loadout opens the replacement proposal; nothing changes until Confirm. */
export function renderCommittedLoadout(ctx: SectionCtx, gm: GameModeHandlers, _ui: GameModeUi): HTMLElement {
  const g = ctx.c.gear;
  const used = g.loadout.reduce((sum, i) => sum + i.bulk, 0);
  const change = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading || g.isCommitmentLocked }, "Change loadout");
  change.addEventListener("click", () => gm.onLoadoutChange({
    commitment: choiceForCommitment(g.commitment),
    items: g.loadout.map((i) => i.name),
  }));
  return h("section", { className: "sheet-card focus-load", "data-section": "committed-loadout", style: "grid-column: 1 / -1;" },
    h("h2", {}, "Loadout", " ", srdLink(SRD.planning)),
    h("p", { className: "lbl" }, loadTotalText(used, loadLimitFor(ctx.gameData, g.commitment), "committed") + ` · ${g.commitment}`),
    h("ul", {}, ...g.loadout.map((i) => h("li", {}, `${i.name} · ${i.bulk} load`))),
    change,
  );
}

/** Change-loadout confirmation: overlay with the choices, checklist and Back / Leave flow / Confirm change. */
export function renderLoadoutConfirm(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const proposal = ui.loadoutChange;
  if (proposal === null) return null;
  const choices = LOAD_CHOICES.map((choice) => {
    const limit = loadLimitFor(ctx.gameData, choice);
    const b = h("button", { type: "button", "aria-pressed": proposal.commitment === choice ? "true" : "false", disabled: ctx.anyLoading },
      limit === null ? choice : `${choice} · ${limit}`);
    b.addEventListener("click", () => gm.onLoadoutProposalChoice(choice));
    return b;
  });
  const back = h("button", { type: "button", disabled: ctx.anyLoading }, "Back");
  back.addEventListener("click", () => gm.onLoadoutChange(null));
  const leave = h("button", { type: "button", disabled: ctx.anyLoading }, "Leave flow");
  leave.addEventListener("click", () => gm.onLoadoutChange(null));
  // A level none carries nothing: checked items with level none would be refused, so Confirm waits for a level.
  const effectiveLevel = proposal.commitment ?? ctx.c.gear.commitment;
  const needsLevel = effectiveLevel === "none" && proposal.items.length > 0;
  const confirm = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading || needsLevel }, "Confirm change");
  confirm.addEventListener("click", gm.onLoadoutConfirm);
  return overlay("Confirm loadout change", "game-mode-popup", "game-mode-confirm", "Change loadout?",
    [
      h("p", {}, "Your scoundrel is already on a score. Confirm this loadout change with the table before replacing the committed items."),
      h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" }, ...choices),
      h("p", { className: "small", role: "status" },
        needsLevel ? "Choose Light, Normal or Heavy to carry these items. None carries nothing." : (ui.loadoutError ?? "")),
      renderProposalChecklist(ctx, gm, proposal),
      h("p", { className: "small" }, "Choose items now or declare more during the score. This suggests a load limit; it never blocks play."),
      h("p", { className: "small" }, srdLink(SRD.planning)),
    ],
    { left: [back], right: [leave, confirm] });
}

/** Resolution: six-step stepper, Back/Next stored as the cursor, step content with crew editors. */
export function renderResolution(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ctx.c.modeFlow;
  if (flow.kind !== "resolution") return null;
  const step = flow.step;
  const idx = RESOLUTION_STEPS.indexOf(step as (typeof RESOLUTION_STEPS)[number]);
  const crew = ui.linkedCrew;
  const linked = crew !== null;
  // Direct selection: each step is a control that sets the stored step (no completion prerequisite).
  const stepper = h("ol", { className: "resolution-stepper", "aria-label": "Resolution steps" },
    ...RESOLUTION_STEPS.map((s, i) => {
      const btn = h("button", { type: "button", "aria-current": s === step ? "step" : undefined, disabled: ctx.anyLoading }, `${i + 1}. ${RESOLUTION_LABELS[s]}`);
      btn.addEventListener("click", () => gm.onFlowSet("resolution", s));
      return h("li", { className: s === step ? "active" : "" }, btn);
    }));
  let content: HTMLElement;
  switch (step) {
    case "scoundrel-xp":
      content = h("div", {},
        h("p", { className: "serif" }, "End-of-session review. For each trigger that occurred, mark at least 1 XP; 2 if it occurred a lot. Success isn’t required. No trigger means no automatic XP."),
        h("p", { className: "small" }, "Mark this XP on any attribute or your playbook track. Desperate-action XP is already marked during play."),
        h("p", { className: "small" }, ctx.state.experienceCondition
          ? `Playbook-specific challenge: ${ctx.state.experienceCondition}.`
          : "Playbook-specific challenge."),
        renderXpAllocation(ctx, gm, ui),
        h("p", { className: "small" }, srdLink(SRD.advancement)));
      break;
    case "payoff":
      content = h("div", {},
        h("div", { className: "two-col" },
          h("div", {},
            h("p", { className: "serif" }, "Crew receives 2 rep, plus or minus the target-minus-crew Tier difference, minimum zero. A completely quiet score earns zero rep."),
            h("ul", { className: "small" },
              h("li", {}, "If a boss is owed, subtract crew Tier + 1 coin as tithe. Ask your GM whether a tithe applies."))),
          h("div", {}, referenceTable(["Coin", "Score"], PAYOFF_GUIDE))),
        crewEditor("Rep", crew?.rep.current ?? null, "rep", "Update crew", ctx, gm, linked),
        crewEditor("Coin", crew?.coin ?? null, "coin", "Update crew", ctx, gm, linked),
        myShareEditor(ctx, gm),
        h("p", { className: "small" }, srdLink(SRD.payoff)));
      break;
    case "heat":
      content = h("div", {},
        h("div", { className: "two-col" },
          h("div", {}, referenceTable(["Heat", "Exposure"], HEAT_EXPOSURE)),
          h("div", {}, h("p", { className: "serif" }, "Base heat above. Add +1 for a high-profile or well-connected target, +1 hostile turf, +1 at war, +2 if killing was involved."))),
        h("p", { className: "note" }, crew ? `At ${crew.heat.max} heat, gain a wanted level and clear heat; excess heat rolls over. Use the crew’s resulting heat and wanted level for entanglements.` : "At the crew’s heat maximum, gain a wanted level and clear heat; excess heat rolls over. Use the crew’s resulting heat and wanted level for entanglements."),
        crewEditor("Heat", crew?.heat.current ?? null, "heat", "Update crew", ctx, gm, linked),
        h("p", { className: "small" }, srdLink(SRD.heat)));
      break;
    case "entanglements": {
      const heat = crew?.heat.current ?? 0;
      const current = entanglementCurrent(heat);
      content = h("div", {},
        h("p", { className: "serif", style: "font-weight: 600;" }, "Before you roll: check that nobody else on the crew is already rolling entanglements for this score."),
        h("p", { className: "serif" }, "After payoff and heat are determined, find the column that matches the crew’s current heat level. Roll a number of dice equal to the crew’s wanted level, and use the result of the roll to select the entanglement. If wanted level is zero, roll two dice and keep the lowest result. Otherwise use the highest die, as with a fortune roll. The GM generates the entanglement for the crew."),
        h("div", { className: "current-heat" },
          h("strong", {}, crew ? `Crew’s current heat: ${heat}` : "Link a crew to see its heat."),
          h("span", {}, ` · Matching band · Heat ${current.band}`)),
        entanglementTable([
          h("tr", {}, h("th", {}, "Result"), h("th", {}, `Heat ${current.band}`)),
        ], current.rows.map((r) => h("tr", {}, h("th", { scope: "row" }, r.result), h("td", {}, r.outcome)))),
        h("details", { className: "all-entanglements" },
          h("summary", {}, "Show all"),
          entanglementTable(
            [h("tr", {}, h("th", {}, "Result"), ...["0–3", "4–5", "6+"].map((b) => h("th", {}, `Heat ${b}`)))],
            ENTANGLEMENT_ROWS.map((r) => h("tr", {}, h("th", { scope: "row" }, r.result), ...(["0–3", "4–5", "6+"] as const).map((b) => h("td", {}, r.outcomes[b])))),
          )),
        h("div", { className: "entanglement-descriptions" },
          ...entanglementsInBand(current.band).map((name) =>
            h("details", {}, h("summary", {}, name), h("p", { className: "small" }, ENTANGLEMENT_DESCRIPTIONS[name] ?? "")))),
        h("h3", {}, "Bring the trouble into play"),
        h("p", {}, "Bring the entanglement into play immediately, or hold off until an appropriate moment. Entanglements manifest fully before the PCs have a chance to avoid them."),
        h("p", { className: "small" }, "Confirm with your GM. Resolve the fiction at the table; this sheet doesn’t choose an outcome."),
        h("p", { className: "small" }, "Source: Blades in the Dark SRD (CC-BY). ", srdLink(ENTANGLEMENTS_SRD_URL)));
      break;
    }
    case "crew-xp":
      content = h("div", {},
        h("h3", {}, "Crew XP triggers"),
        h("p", { className: "serif" }, CREW_XP_INTRO),
        h("p", { className: "serif" }, CREW_XP_LEADIN),
        h("p", { className: "small" }, CREW_XP_MAX_NOTE),
        h("ul", {}, ...CREW_XP_CATEGORIES.map((cat, i) => h("li", {},
          h("strong", {}, cat.title),
          " ",
          cat.text,
          i === 0 ? h("p", { className: "small" }, ui.crewXpTrigger
            ? `This crew’s trigger: ${ui.crewXpTrigger}`
            : "This crew’s trigger is on its crew type; check the crew sheet.") : null))),
        h("p", { className: "serif" }, "Review the triggers at the end of the session, then add the agreed crew XP here."),
        crewEditor("XP", crew?.experience.points ?? null, "xp", "Update crew XP", ctx, gm, linked),
        h("p", { className: "small" }, "Confirm with your GM. This optional edit affects the crew, not just this scoundrel."),
        h("h3", {}, "Advancement"),
        h("p", { className: "serif" }, CREW_ADVANCE_TEXT),
        h("p", { className: "small" }, CREW_ADVANCE_ORIGIN_TEXT),
        h("p", { className: "serif" }, CREW_PROFITS_TEXT),
        h("p", { className: "small" }, CREW_ADVANCEMENT_ATTRIBUTION, " ", srdLink(CREW_ADVANCEMENT_SRD_URL)));
      break;
    default:
      content = h("div", {},
        h("p", { className: "serif" }, "Optional: update crew rep here, or skip. If rep was already recorded during Payoff, skip: this is not a second award."),
        crewEditor("Rep", crew?.rep.current ?? null, "rep", "Update crew rep", ctx, gm, linked),
        h("p", { className: "small" }, "Confirm with your GM. This optional edit affects the crew, not just this scoundrel."),
        h("p", { className: "small" }, srdLink(SRD.payoff)));
  }
  const back = stepBefore("resolution", step);
  const next = stepAfter("resolution", step);
  // The first step's Back returns to the Score sheet (approved 06a: first Back links to 05-score).
  const backBtn = h("button", { type: "button", disabled: ctx.anyLoading }, "Back");
  backBtn.addEventListener("click", () => (back ? gm.onFlowSet("resolution", back) : gm.onFlowSet("none", "")));
  const isOptional = idx === 4 || idx === 5;
  // Optional steps (Crew XP, Crew Rep) skip after a confirm. Skipping Crew Rep ends Resolution into Downtime.
  const skip = isOptional ? h("button", { type: "button", disabled: ctx.anyLoading }, "Skip") : null;
  skip?.addEventListener("click", () => {
    if (window.confirm("Skip this optional step? Nothing is awarded or changed. You can come back to it.")) {
      if (next !== null) gm.onFlowSet("resolution", next);
      else gm.onMode("downtime");
    }
  });
  const skipAll = h("button", { type: "button", disabled: ctx.anyLoading }, "Skip Resolution");
  skipAll.addEventListener("click", () => {
    if (window.confirm("Skip the rest of Resolution? Nothing is awarded or changed. The step cursor clears; the sheet keeps its current state.")) {
      gm.onFlowSet("none", "");
    }
  });
  const leave = h("button", { type: "button", disabled: ctx.anyLoading }, "Leave flow");
  leave.addEventListener("click", () => gm.onFlowSet("none", ""));
  const nextBtn = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading }, next ? "Next" : "Next: Downtime");
  nextBtn.addEventListener("click", () => (next ? gm.onFlowSet("resolution", next) : gm.onMode("downtime")));
  // Resolution is an approved overlay dialog (aria-modal), like the Score popups (mockups 06a-06f).
  return overlay(
    "Resolution",
    "resolution",
    "game-mode-resolution",
    RESOLUTION_LABELS[step as ResolutionStep],
    [
      h("p", { className: "small" }, `Score resolution · ${idx + 1} of ${RESOLUTION_STEPS.length}`),
      h("p", { className: "small" }, "Confirm with your GM before you mark anything."),
      stepper,
      content,
    ],
    { left: [backBtn], right: [skip, skipAll, leave, nextBtn].filter((b): b is HTMLButtonElement => b !== null) },
  );
}

function myShareEditor(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const input = amountInput("My share coin amount");
  const apply = h("button", { type: "button", disabled: ctx.anyLoading }, "Apply to my share · coin");
  apply.addEventListener("click", () => gm.onMyShare(Number(input.value) || 0));
  return h("div", { className: "game-mode-share" },
    h("p", { className: "lbl", style: "margin: 0;" }, `My share · coin ${ctx.c.fund.satchel.coins} of ${ctx.c.fund.satchel.max}`),
    h("p", { className: "small", style: "margin: 0 0 0.25em;" }, "This edits your own fund, not the crew."),
    h("div", { style: "display: flex; gap: 0.35em; align-items: center; flex-wrap: wrap;" }, input, apply));
}
