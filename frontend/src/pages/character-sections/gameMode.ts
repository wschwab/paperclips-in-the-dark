import { checkXpDraft, renderXpAllocation, type XpDraft } from "./xp-allocation.js";
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
  LOAD_CHOICES, choiceForCommitment, commitmentFor, downtimeRemaining, loadLimitFor,
  type LoadChoice, type LoadoutProposal,
} from "../game-mode.js";
import type { CharacterFlow } from "../../schema/flow.js";
import { flowGuidance, flowInputField, flowInputSchema, type FlowGuidance } from "../flow-presentation.js";

export interface GameModeUi {
  flow: CharacterFlow | null;
  flowInputs: Record<string, unknown>;
  flowError: string | null;
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
  /** Planning draft; completion stores the chosen approach on the server. */
  planApproach: string | null;
  crewNotice: string | null;
  /** Explicit XP allocation draft; one flow completion awards it and advances. */
  xpDraft: XpDraft;
  /** The compact XP Tracker bottom sheet is open. */
  xpTrackerOpen: boolean;
}

export interface GameModeHandlers {
  onMode: (mode: "free-play" | "score" | "downtime") => void;
  onFlowSet: (kind: "none" | "score-start" | "resolution", step: string) => void;
  onFlowComplete: (skip?: boolean, inputs?: Record<string, unknown>) => void;
  onFlowInput: (key: string, value: unknown) => void;
  onFlowRetry: () => void;
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
  onFlowNext: () => void;
}

const h = el;

function section(title: string, ...children: Array<HTMLElement | null>): HTMLElement {
  return h("div", { className: "game-mode-block" }, h("h3", { className: "lbl" }, title), ...children);
}

function srdLink(href: string): HTMLElement {
  return h("a", { className: "srd-link", href, target: "_blank", rel: "noopener noreferrer" }, "SRD ↗");
}

function amountInput(label: string, key: string, ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLInputElement {
  const schema = flowInputField(ui.flow, key);
  const input = h("input", {
    type: "number", step: "1", "aria-label": label,
    value: String(ui.flowInputs[key] ?? 0), style: "width: 5em;",
    disabled: ctx.anyLoading || ui.flow?.receipt?.status === "completed",
    ...(typeof schema.minimum === "number" ? { min: String(schema.minimum) } : {}),
    ...(typeof schema.maximum === "number" ? { max: String(schema.maximum) } : {}),
    required: Array.isArray(flowInputSchema(ui.flow).required) && (flowInputSchema(ui.flow).required as string[]).includes(key),
  }) as HTMLInputElement;
  input.addEventListener("input", () => gm.onFlowInput(key, input.value === "" ? "" : Number(input.value)));
  return input;
}

/** Crew deltas remain a local draft until the single completion action. */
function crewEditor(label: string, current: number | null, track: "rep" | "coin" | "heat" | "xp",
  button: string, ctx: SectionCtx, gm: GameModeHandlers, linked: boolean, ui: GameModeUi): HTMLElement {
  const key = { rep: "crewRep", coin: "crewCoin", heat: "crewHeat", xp: "crewXp" }[track];
  const input = amountInput(`${label} amount`, key, ctx, gm, ui);
  input.disabled ||= !linked;
  return h("div", { className: "game-mode-crew-editor", "data-crew-track": track },
    h("p", { className: "lbl", style: "margin: 0;" }, `${button} · ${label} · current ${current ?? "—"}`),
    h("p", { className: "small", style: "margin: 0 0 0.25em;" },
      "Enter the amount to add (use a minus to subtract). Applied together when you complete this step."),
    h("div", { style: "display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;" }, input),
    h("p", { className: "small notice", role: "note", style: "margin: 0.25em 0 0;" }, flowGuidance(ui.flow)?.onePlayerWarning ?? ""),
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
export function renderDowntimeActivities(ctx: SectionCtx, gm: GameModeHandlers, variant: "panel" | "sheet", ui: GameModeUi): HTMLElement {
  const guidance = flowGuidance(ui.flow);
  const desc = h("input", { type: "text", "aria-label": "Activity description", placeholder: "what you did" }) as HTMLInputElement;
  const activityButtons = (guidance?.downtime.activities ?? []).map(({ value, label, guidance: advice }) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading, title: advice }, label);
    b.addEventListener("click", () => gm.onDowntimeSpend(value, desc.value.trim()));
    return b;
  });
  const body = [
    h("p", { className: "small" }, guidance?.downtime.intro ?? "Loading activity guidance…"),
    desc,
    h("div", { className: "activity-menu" }, ...activityButtons),
    guidance ? h("p", { className: "small" }, srdLink(guidance.links.downtime)) : null,
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
  const steps = (ui.flow?.steps ?? []).filter((s) => s.kind === "score-start").map((s) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading }, s.label);
    b.addEventListener("click", () => gm.onFlowSet(s.kind, s.step));
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
  const retry = h("button", { type: "button" }, "Retry guided flow");
  retry.addEventListener("click", gm.onFlowRetry);
  const body = c.mode === "score"
    ? renderScorePanel(ctx, gm, ui)
    : c.mode === "downtime"
      ? h("div", {}, renderDowntimeBudget(ctx, gm, "panel"), renderDowntimeActivities(ctx, gm, "panel", ui))
      : section("Free Play", h("p", { className: "serif", style: "margin: 0.25em 0;" },
          "The sheet works as usual. Pick Score or Downtime when you want guided assistance."));
  return h("aside", { className: "mode-panel", "data-section": "game-mode", "aria-label": "Game mode" },
    h("h2", {}, "Game mode"),
    h("p", { className: "small scope" }, `For ${c.dossier.name || "this scoundrel"} only`),
    renderModeSwitch(ctx, gm),
    ui.flowError && ctx.c.mode !== "free-play" ? h("p", { className: "notice small", role: "alert" }, ui.flowError, retry) : null,
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

/** Score popups keep their approved layout; the projection owns navigation and copy. */
export function renderScorePopup(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ui.flow;
  const guidance = flowGuidance(flow);
  if (flow?.kind !== "score-start" || !guidance) return null;
  const step = flow.step;
  const position = flow.steps.findIndex((s) => s.step === step);
  const title = flow.steps[position]?.label ?? step;
  const completed = flow.receipt?.status === "completed";
  const body: HTMLElement[] = [];
  if (step === "planning") {
    const vocabulary = flowInputField(flow, "planApproach").enum;
    body.push(
      h("p", { className: "serif" }, guidance.scoreStart.planning.intro),
      h("div", { className: "approach-grid" }, ...guidance.scoreStart.planning.approaches
        .filter((p) => !Array.isArray(vocabulary) || vocabulary.includes(p.value))
        .map((p) => {
          const card = h("button", { type: "button", className: "approach-card",
            "aria-pressed": ui.planApproach === p.value ? "true" : "false", disabled: ctx.anyLoading || completed },
            h("strong", {}, p.value), h("span", { className: "small" }, p.description));
          card.addEventListener("click", () => gm.onPlanApproach(p.value));
          return card;
        })),
    );
  } else if (step === "loadout") {
    body.push(renderLoadoutChoices(ctx, gm, ui), h("p", { className: "small" }, guidance.scoreStart.loadout.note));
  } else if (step === "engagement") {
    body.push(
      h("p", { className: "serif" }, guidance.scoreStart.engagement.intro),
      h("ul", { className: "small" }, ...guidance.scoreStart.engagement.diceNotes.map((text) => h("li", {}, text))),
      engagementFactors(guidance),
      h("p", { className: "small", "data-starting-position": "" }, guidance.scoreStart.engagement.positionNote),
      flowNote(ctx, gm, ui),
    );
  }
  body.push(h("p", { className: "small" }, srdLink(guidance.links.planning)));
  if (ui.flowError) body.push(h("p", { className: "notice small", role: "alert" }, ui.flowError));
  if (flow.receipt) body.push(receiptNotice(flow));
  const back = h("button", { type: "button", disabled: ctx.anyLoading }, "Back");
  back.addEventListener("click", () => gm.onFlowSet(flow.back === null ? "none" : flow.kind, flow.back ?? ""));
  const leave = h("button", { type: "button", disabled: ctx.anyLoading }, "Leave flow");
  leave.addEventListener("click", () => gm.onFlowSet("none", ""));
  const nextLabel = flow.next === null ? "Enter Score" : `Next: ${flow.steps.find((s) => s.step === flow.next)?.label ?? flow.next}`;
  const requiredInputs = flowInputSchema(flow).required;
  const needsApproach = step === "planning" && Array.isArray(requiredInputs) && requiredInputs.includes("planApproach") && !ui.planApproach;
  const next = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading || flow.actions.length === 0 || needsApproach }, nextLabel);
  next.addEventListener("click", gm.onFlowNext);
  const skip = flow.skippable && !completed ? h("button", { type: "button", disabled: ctx.anyLoading }, "Skip") : null;
  skip?.addEventListener("click", () => gm.onFlowComplete(true));
  const close = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading }, "Close");
  close.addEventListener("click", () => gm.onFlowSet("none", ""));
  return overlay(`Score ${step}`, "game-mode-popup", "", title, body,
    { left: [back], right: [skip, leave, next].filter((b): b is HTMLButtonElement => b !== null) },
    { subtitle: `${guidance.scoreStart.title} · ${position + 1} of ${flow.steps.length}`, close });
}

function receiptNotice(flow: CharacterFlow): HTMLElement {
  const receipt = flow.receipt!;
  return h("p", { className: "notice small", "data-flow-receipt": receipt.completionId, role: "status" },
    `Step ${receipt.status}${receipt.skipped ? " · skipped" : ""}. ${receipt.status === "completed"
      ? "Next only navigates; awards are not applied again. Use an ordinary adjustment or Undo to change them."
      : "This completion was undone. A new deliberate completion can apply this step again."}`);
}

function flowNote(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const input = h("textarea", { "aria-label": "External outcome note",
    disabled: ctx.anyLoading || ui.flow?.receipt?.status === "completed" }) as HTMLTextAreaElement;
  input.value = String(ui.flowInputs.note ?? "");
  input.addEventListener("input", () => gm.onFlowInput("note", input.value));
  return h("label", { className: "small" }, "Optional table outcome note", input);
}

/** A two-column reference table: a header row, then one row per approved entry. */
function referenceTable(head: readonly string[], rows: ReadonlyArray<readonly string[]>): HTMLElement {
  return h("table", { className: "rule-table reference-table" },
    h("tbody", {},
      h("tr", {}, h("th", { scope: "col" }, head[0]), h("th", { scope: "col" }, head[1])),
      ...rows.map(([a, b]) => h("tr", {}, h("th", { scope: "row" }, a), h("td", {}, b)))));
}

/** Entanglement result table (approved mockup 06d). Head rows then body rows. */
function entanglementTable(head: HTMLElement[], body: HTMLElement[]): HTMLElement {
  return h("table", { className: "rule-table ent-table" }, h("tbody", {}, ...head, ...body));
}

function engagementFactors(guidance: FlowGuidance): HTMLElement {
  return h("table", { className: "engagement-factors" },
    h("thead", {}, h("tr", {}, ...guidance.scoreStart.engagement.factorHeaders.map((label) => h("th", {}, label)))),
    h("tbody", {},
      ...guidance.scoreStart.engagement.factors.map((row) =>
        h("tr", {}, h("th", { scope: "row" }, row.factor), h("td", {}, row.advantage), h("td", {}, row.disadvantage)))));
}

function renderLoadoutChoices(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const current = typeof ui.flowInputs.commitment === "string" ? ui.flowInputs.commitment : ctx.c.gear.commitment;
  const vocabulary = flowInputField(ui.flow, "commitment").enum;
  const choices = LOAD_CHOICES.filter((choice) => !Array.isArray(vocabulary) || vocabulary.includes(commitmentFor(choice))).map((choice) => {
    const limit = loadLimitFor(ctx.gameData, choice);
    const pressed = commitmentFor(choice) === current;
    const b = h("button", { type: "button", "aria-pressed": pressed ? "true" : "false", disabled: ctx.anyLoading || ctx.c.gear.isCommitmentLocked || ui.flow?.receipt?.status === "completed" },
      limit === null ? choice : `${choice} · ${limit}`);
    b.addEventListener("click", () => gm.onLoadoutCommitment(choice));
    return b;
  });
  return h("div", {},
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" }, ...choices),
    h("p", { className: "small" }, flowGuidance(ui.flow)?.scoreStart.loadout.intro ?? ""),
    renderGearChecklist(ctx, gm, ui),
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

function renderGearChecklist(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const g = ctx.c.gear;
  const committed = new Set(Array.isArray(ui.flowInputs.items) ? ui.flowInputs.items as string[] : g.loadout.map((i) => i.name));
  const row = (item: { name: string; bulk: number }) => {
    const on = committed.has(item.name);
    const cb = h("input", { type: "checkbox", checked: on, disabled: ctx.anyLoading || ui.flow?.receipt?.status === "completed" }) as HTMLInputElement;
    cb.addEventListener("change", () => gm.onLoadoutToggle(item.name, cb.checked));
    return h("label", { className: "gear" }, cb, ` ${item.name} `, h("span", { className: "small" }, `${item.bulk} load`));
  };
  const used = ownedItems(g).filter((item) => committed.has(item.name)).reduce((sum, i) => sum + i.bulk, 0);
  return h("div", { className: "game-mode-loadout" },
    h("p", { className: "lbl" }, loadTotalText(used,
      loadLimitFor(ctx.gameData, typeof ui.flowInputs.commitment === "string" ? ui.flowInputs.commitment : g.commitment),
      ui.flow?.receipt?.status === "completed" ? "committed" : "proposed")),
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
export function renderCommittedLoadout(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const g = ctx.c.gear;
  const used = g.loadout.reduce((sum, i) => sum + i.bulk, 0);
  const change = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading || g.isCommitmentLocked }, "Change loadout");
  change.addEventListener("click", () => gm.onLoadoutChange({
    commitment: choiceForCommitment(g.commitment),
    items: g.loadout.map((i) => i.name),
  }));
  return h("section", { className: "sheet-card focus-load", "data-section": "committed-loadout", style: "grid-column: 1 / -1;" },
    h("h2", {}, "Loadout", " ", flowGuidance(ui.flow) ? srdLink(flowGuidance(ui.flow)!.links.planning) : null),
    h("p", { className: "lbl" }, loadTotalText(used, loadLimitFor(ctx.gameData, g.commitment), "committed") + ` · ${g.commitment}`),
    h("ul", {}, ...g.loadout.map((i) => h("li", {}, `${i.name} · ${i.bulk} load`))),
    change,
  );
}

/** Change-loadout confirmation: overlay with the choices, checklist and Back / Leave flow / Confirm change. */
export function renderLoadoutConfirm(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const proposal = ui.loadoutChange;
  if (proposal === null) return null;
  const guidance = flowGuidance(ui.flow);
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
      h("p", { className: "small" }, guidance?.scoreStart.loadout.note ?? ""),
      ...(guidance ? [h("p", { className: "small" }, srdLink(guidance.links.planning))] : []),
    ],
    { left: [back], right: [leave, confirm] });
}

/** Resolution renders the projected order and commits the entire local step draft once. */
export function renderResolution(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ui.flow;
  const guidance = flowGuidance(flow);
  if (flow?.kind !== "resolution" || !guidance) return null;
  const { step } = flow;
  const idx = flow.steps.findIndex((s) => s.step === step);
  const crew = ui.linkedCrew;
  const linked = flow.crew !== null;
  const completed = flow.receipt?.status === "completed";
  const guide = guidance.resolution;
  const stepper = h("ol", { className: "resolution-stepper", "aria-label": "Resolution steps" },
    ...flow.steps.map((s, i) => {
      const btn = h("button", { type: "button", "aria-current": s.step === step ? "step" : undefined, disabled: ctx.anyLoading }, `${i + 1}. ${s.label}`);
      btn.addEventListener("click", () => gm.onFlowSet(s.kind, s.step));
      return h("li", { className: s.step === step ? "active" : "" }, btn);
    }));
  let content: HTMLElement;
  switch (step) {
    case "scoundrel-xp":
      content = h("div", {},
        h("p", { className: "serif" }, guide.scoundrelXp.intro),
        h("p", { className: "small" }, guide.scoundrelXp.note),
        h("p", { className: "small" }, ctx.state.experienceCondition
          ? `Playbook-specific challenge: ${ctx.state.experienceCondition}.` : "Playbook-specific challenge."),
        renderXpAllocation(ctx, gm, ui),
        h("p", { className: "small" }, srdLink(guidance.links.advancement)));
      break;
    case "payoff":
      content = h("div", {},
        h("div", { className: "two-col" },
          h("div", {}, h("p", { className: "serif" }, guide.payoff.intro),
            h("ul", { className: "small" }, ...guide.payoff.notes.map((text) => h("li", {}, text)))),
          h("div", {}, referenceTable(guide.payoff.table.head, guide.payoff.table.rows))),
        crewEditor("Rep", crew?.rep.current ?? null, "rep", "Update crew", ctx, gm, linked, ui),
        crewEditor("Coin", crew?.coin ?? null, "coin", "Update crew", ctx, gm, linked, ui),
        h("div", { className: "game-mode-share" },
          h("p", { className: "lbl" }, `My share · coin ${ctx.c.fund.satchel.coins} of ${ctx.c.fund.satchel.max}`),
          h("p", { className: "small" }, "This edits your own fund, not the crew. Applied with this step."),
          amountInput("My share coin amount", "myShare", ctx, gm, ui)),
        h("p", { className: "small" }, srdLink(guidance.links.payoff)));
      break;
    case "heat":
      content = h("div", {},
        h("div", { className: "two-col" },
          h("div", {}, referenceTable(guide.heat.table.head, guide.heat.table.rows)),
          h("div", {}, h("p", { className: "serif" }, guide.heat.intro))),
        h("p", { className: "note" }, crew ? guide.heat.noteTemplate.replace("{heatMax}", String(crew.heat.max)) : guide.heat.note),
        crewEditor("Heat", crew?.heat.current ?? null, "heat", "Update crew", ctx, gm, linked, ui),
        h("p", { className: "small" }, srdLink(guidance.links.heat)));
      break;
    case "entanglements": {
      const data = guide.entanglements;
      const heat = crew?.heat.current ?? 0;
      const band = data.bands.find((b) => heat >= b.min && (b.max === null || heat <= b.max));
      const outcomes = (r: (typeof data.rows)[number], label: string) => (r.outcomes as Record<string, string>)[label] ?? "";
      const names = band ? [...new Set(data.rows.flatMap((r) => outcomes(r, band.label).split(" or ")))] : [];
      content = h("div", {},
        h("p", { className: "serif", style: "font-weight: 600;" }, data.warning),
        h("p", { className: "serif" }, data.intro),
        h("div", { className: "current-heat" },
          h("strong", {}, crew ? `Crew’s current heat: ${heat}` : "Link a crew to see its heat."),
          h("span", {}, band ? ` · Matching band · Heat ${band.label}` : "")),
        band ? entanglementTable(
          [h("tr", {}, h("th", {}, "Result"), h("th", {}, `Heat ${band.label}`))],
          data.rows.map((r) => h("tr", {}, h("th", { scope: "row" }, r.result), h("td", {}, outcomes(r, band.label))))) : null,
        h("details", { className: "all-entanglements" }, h("summary", {}, "Show all"),
          entanglementTable(
            [h("tr", {}, h("th", {}, "Result"), ...data.bands.map((b) => h("th", {}, `Heat ${b.label}`)))],
            data.rows.map((r) => h("tr", {}, h("th", { scope: "row" }, r.result),
              ...data.bands.map((b) => h("td", {}, outcomes(r, b.label))))))),
        h("div", { className: "entanglement-descriptions" },
          ...names.map((name) => h("details", {}, h("summary", {}, name),
            h("p", { className: "small" }, (data.descriptions as Record<string, string>)[name] ?? "")))),
        h("h3", {}, "Bring the trouble into play"), h("p", {}, data.bringIntoPlay),
        h("p", { className: "small" }, guidance.gmNote),
        flowNote(ctx, gm, ui),
        h("p", { className: "small" }, "Source: Blades in the Dark SRD (CC-BY). ", srdLink(guidance.links.entanglements)));
      break;
    }
    case "crew-xp":
      content = h("div", {},
        h("h3", {}, "Crew XP triggers"),
        h("ul", {}, ...guide.crewXp.categories.map((cat, i) => h("li", {}, h("strong", {}, cat.title), " ", cat.text,
          i === 0 ? h("p", { className: "small" }, ui.crewXpTrigger
            ? `This crew’s trigger: ${ui.crewXpTrigger}` : "This crew’s trigger is on its crew type; check the crew sheet.") : null))),
        h("p", { className: "serif" }, guide.crewXp.intro),
        h("p", { className: "serif" }, guide.crewXp.leadin),
        h("p", { className: "small" }, guide.crewXp.note),
        h("p", { className: "serif" }, guide.crewXp.review),
        crewEditor("XP", crew?.experience.points ?? null, "xp", "Update crew XP", ctx, gm, linked, ui),
        h("p", { className: "small" }, guidance.gmNote),
        h("h3", {}, "Advancement"),
        h("p", { className: "serif" }, guide.crewXp.advance),
        h("p", { className: "small" }, guide.crewXp.origin),
        h("p", { className: "serif" }, guide.crewXp.profits),
        h("p", { className: "small" }, guide.crewXp.attribution, " ", srdLink(guidance.links.crewAdvancement)));
      break;
    case "crew-rep":
      content = h("div", {},
        h("p", { className: "serif" }, guide.crewRep.intro),
        crewEditor("Rep", crew?.rep.current ?? null, "rep", "Update crew rep", ctx, gm, linked, ui),
        h("p", { className: "small" }, guide.crewRep.note),
        h("p", { className: "small" }, srdLink(guidance.links.payoff)));
      break;
    default:
      content = h("p", { role: "alert" }, "This flow step has no sheet editor. Use its advertised API action.");
  }
  const back = h("button", { type: "button", disabled: ctx.anyLoading }, "Back");
  back.addEventListener("click", () => gm.onFlowSet(flow.back === null ? "none" : flow.kind, flow.back ?? ""));
  const skip = flow.skippable && !completed ? h("button", { type: "button", disabled: ctx.anyLoading }, "Skip") : null;
  skip?.addEventListener("click", () => {
    if (window.confirm("Skip this optional step? Nothing is awarded or changed. You can come back to it.")) gm.onFlowComplete(true);
  });
  const skipAll = h("button", { type: "button", disabled: ctx.anyLoading }, "Skip Resolution");
  skipAll.addEventListener("click", () => {
    if (window.confirm("Skip the rest of Resolution? Nothing is awarded or changed. The step cursor clears; the sheet keeps its current state.")) gm.onFlowSet("none", "");
  });
  const leave = h("button", { type: "button", disabled: ctx.anyLoading }, "Leave flow");
  leave.addEventListener("click", () => gm.onFlowSet("none", ""));
  const xpCheck = step === "scoundrel-xp" && !completed ? checkXpDraft(ctx.c, ui.xpDraft, flow) : null;
  const invalidNumber = Object.values(ui.flowInputs).some((value) => typeof value === "number" && !Number.isInteger(value) || value === "");
  const next = h("button", { type: "button", className: "btn-primary",
    disabled: ctx.anyLoading || flow.actions.length === 0 || invalidNumber || (xpCheck !== null && !xpCheck.canComplete) },
    flow.next === null ? "Next: Downtime" : "Next");
  next.addEventListener("click", gm.onFlowNext);
  return overlay("Resolution", "resolution", "game-mode-resolution", flow.steps[idx]?.label ?? step, [
    h("p", { className: "small" }, `${guide.title} · ${idx + 1} of ${flow.steps.length}`),
    h("p", { className: "small" }, guidance.gmNote), stepper,
    flow.receipt ? receiptNotice(flow) : null,
    ui.flowError ? h("p", { className: "notice small", role: "alert" }, ui.flowError) : null,
    content,
  ].filter((node): node is HTMLElement => node !== null),
  { left: [back], right: [skip, skipAll, leave, next].filter((b): b is HTMLButtonElement => b !== null) });
}
