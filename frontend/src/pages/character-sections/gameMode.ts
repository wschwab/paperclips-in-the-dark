/**
 * Per-scoundrel game mode UI (GAME-MODE-03). Assistance only: nothing here
 * disables an operation. The Score popup and Resolution step are read from the
 * stored cursor (`modeFlow`), so they survive reloads and never gate a write.
 */
import { el } from "../../lib/dom.js";
import type { Crew } from "../../schema/crew.js";
import type { SectionCtx } from "./context.js";
import {
  DOWNTIME_ACTIVITIES,
  LOAD_CHOICES,
  ONE_PLAYER_WARNING,
  PLAN_APPROACHES,
  RESOLUTION_STEPS,
  SCORE_START_STEPS,
  SRD,
  commitmentFor,
  desperateAttributes,
  downtimeRemaining,
  entanglementRows,
  loadLimitFor,
  stepAfter,
  stepBefore,
} from "../game-mode.js";

export interface GameModeUi {
  /** The linked crew, loaded for the Resolution editors; null when unlinked or not loaded. */
  linkedCrew: Crew | null;
  /** Show the full entanglement table (Show all disclosure). */
  showAllEntanglements: boolean;
  /** A confirmed-pending loadout replacement awaiting Confirm (Back cancels). */
  loadoutChange: (typeof LOAD_CHOICES)[number] | null;
  /** Planning approach picked in the popup (assistance only; not persisted). */
  planApproach: string | null;
  crewNotice: string | null;
}

export interface GameModeHandlers {
  onMode: (mode: "free-play" | "score" | "downtime") => void;
  onFlowSet: (kind: "none" | "score-start" | "resolution", step: string) => void;
  onPlanApproach: (approach: string) => void;
  onLoadoutChange: (choice: (typeof LOAD_CHOICES)[number] | null) => void;
  onLoadoutConfirm: () => void;
  onLoadoutCommitment: (choice: (typeof LOAD_CHOICES)[number]) => void;
  onLoadoutToggle: (name: string, commit: boolean) => void;
  onDesperate: (attribute: string) => void;
  onToggleAllEntanglements: () => void;
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

/** Crew editor: shows the current total and applies an amount added (signed) with the one-player warning. */
function crewEditor(
  label: string,
  current: number | null,
  track: "rep" | "coin" | "heat" | "xp",
  ctx: SectionCtx,
  gm: GameModeUi,
  handlers: GameModeHandlers,
): HTMLElement {
  const input = amountInput(`${label} amount`);
  const apply = h("button", {
    type: "button",
    disabled: ctx.anyLoading || gm.linkedCrew === null,
    title: `Apply to crew ${label.toLowerCase()}`,
  }, `Apply to ${label.toLowerCase()}`);
  apply.addEventListener("click", () => handlers.onCrewDelta(track, Number(input.value) || 0));
  return h("div", { className: "game-mode-crew-editor", "data-crew-track": track },
    h("p", { className: "lbl", style: "margin: 0;" }, `${label} · current ${current ?? "—"}`),
    h("p", { className: "small", style: "margin: 0 0 0.25em;" },
      "Enter the amount to add (use a minus to subtract). The field shows the current total, not the amount."),
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

function renderDowntimeTracker(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const d = ctx.c.downtime;
  const remaining = downtimeRemaining(d);
  const total = d.free + d.paid;
  const dots = "●".repeat(Math.max(0, Math.min(remaining, total))) + "○".repeat(Math.max(0, total - Math.max(0, remaining)));
  const adjust = (delta: number, reason: "coin" | "gift" | "correction", label: string) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading, title: label }, label);
    b.addEventListener("click", () => gm.onDowntimeAdjust(delta, reason));
    return b;
  };
  const desc = h("input", { type: "text", "aria-label": "Activity description", placeholder: "what you did" }) as HTMLInputElement;
  const activityButtons = DOWNTIME_ACTIVITIES.map(({ value, label }) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading, title: `Record activity: ${label}` }, label);
    b.addEventListener("click", () => gm.onDowntimeSpend(value, desc.value.trim()));
    return b;
  });
  return section("Downtime activities",
    h("p", { className: "serif", style: "margin: 0.25em 0;", "data-downtime-remaining": String(remaining) },
      `${dots} ${remaining} of ${d.free + d.paid} left`),
    remaining < 0
      ? h("p", { className: "notice small" }, "Over the soft budget. Add a coin or gift extra, or record a correction. Nothing is blocked.")
      : null,
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" },
      adjust(1, "coin", "+1 (coin)"),
      adjust(1, "gift", "+1 (gift)"),
      adjust(-1, "correction", "−1"),
    ),
    h("p", { className: "small", style: "margin: 0.5em 0 0.25em;" },
      "Explicit activity picks spend one unit each. Helping someone is their Recover, not yours."),
    desc,
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap; margin-top: 0.25em;" }, ...activityButtons),
    h("p", { className: "small" }, srdLink(SRD.downtime)),
  );
}

function renderScorePanel(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const attrs = desperateAttributes(ctx.gameData);
  const select = h("select", { "aria-label": "Desperate action attribute", disabled: ctx.anyLoading },
    ...attrs.map((a) => h("option", { value: a }, a))) as HTMLSelectElement;
  const xp = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading || attrs.length === 0 }, "+ Desperate action XP");
  xp.addEventListener("click", () => gm.onDesperate(select.value));
  const endScore = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading || ctx.retired || ctx.pendingTrauma, title: ctx.endScoreTitle }, "End Score");
  endScore.addEventListener("click", ctx.handlers.onEndScore);
  const steps = SCORE_START_STEPS.map((s) => {
    const b = h("button", { type: "button", disabled: ctx.anyLoading }, s.charAt(0).toUpperCase() + s.slice(1));
    b.addEventListener("click", () => gm.onFlowSet("score-start", s));
    return b;
  });
  return section("Score in progress",
    h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" }, ...steps),
    h("p", { className: "small", style: "margin: 0.5em 0 0.25em;" },
      "Desperate action: pick the attribute you used. It marks 1 XP there now, the same as any attribute XP."),
    select,
    xp,
    h("p", { className: "small" }, srdLink(SRD.advancement)),
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
      ? renderDowntimeTracker(ctx, gm)
      : section("Free Play", h("p", { className: "serif", style: "margin: 0.25em 0;" },
          "The sheet works as usual. Pick Score or Downtime when you want guided assistance."));
  return h("aside", { className: "mode-panel", "data-section": "game-mode", "aria-label": "Game mode" },
    h("h2", {}, "Game mode"),
    h("p", { className: "small scope" }, `For ${c.dossier.name || "this scoundrel"} only`),
    renderModeSwitch(ctx, gm),
    h("div", { className: "panel-content" }, body),
    h("p", { className: "small", style: "margin-top: 0.5em;" }, "A table aid, not a rules engine. Nothing here blocks your sheet."),
  );
}

/** Score popup: Planning → Loadout → Engagement, read from the stored cursor. */
export function renderScorePopup(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ctx.c.modeFlow;
  if (flow.kind !== "score-start") return null;
  const step = flow.step;
  const back = stepBefore("score-start", step);
  const next = stepAfter("score-start", step);
  const body = step === "planning"
    ? h("div", {},
        h("p", { className: "serif" }, "Choose the approach. No detail prompt is needed here."),
        h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" },
          ...PLAN_APPROACHES.map((p) => {
            const b = h("button", { type: "button", "aria-pressed": ui.planApproach === p ? "true" : "false", disabled: ctx.anyLoading }, p);
            b.addEventListener("click", () => gm.onPlanApproach(p));
            return b;
          })),
        h("p", { className: "small" }, srdLink(SRD.planning)))
    : step === "loadout"
      ? renderLoadoutChoices(ctx, gm)
      : h("div", {},
          h("p", { className: "serif" }, "The crew makes the engagement roll, not the GM on its behalf."),
          h("ul", { className: "small" },
            h("li", {}, "Start with 1d for sheer luck."),
            h("li", {}, "Add 1d for each major advantage."),
            h("li", {}, "Subtract 1d for each major disadvantage."),
            h("li", {}, "Cover the operation, the plan's detail, target defenses and vulnerabilities, helpful friends and contacts, interfering enemies and rivals, Tier, and other circumstances.")),
          h("p", { className: "small" }, "The GM frames the first obstacle. The sheet neither rolls nor requires a result."));
  const backBtn = h("button", { type: "button", disabled: ctx.anyLoading || back === null }, "Back");
  backBtn.addEventListener("click", () => back && gm.onFlowSet("score-start", back));
  const nextBtn = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading }, next ? "Next" : "Close");
  nextBtn.addEventListener("click", () => (next ? gm.onFlowSet("score-start", next) : gm.onFlowSet("none", "")));
  const closeBtn = h("button", { type: "button", disabled: ctx.anyLoading }, "Close");
  closeBtn.addEventListener("click", () => gm.onFlowSet("none", ""));
  return h("section", { className: "sheet-card game-mode-popup", role: "dialog", "aria-modal": "false", "aria-label": `Score ${step}`, "data-section": "game-mode-popup", style: "grid-column: 1 / -1;" },
    h("h2", {}, `Score · ${step === "planning" ? "Planning" : step === "loadout" ? "Loadout" : "Engagement"}`),
    body,
    h("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; flex-wrap: wrap;" }, closeBtn, backBtn, nextBtn),
  );
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
    h("p", { className: "small" }, "Choose a load level; limits come from the game settings."),
    renderGearChecklist(ctx, gm),
  );
}

function renderGearChecklist(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  const g = ctx.c.gear;
  const row = (item: { name: string; bulk: number }, committed: boolean) => {
    const cb = h("input", { type: "checkbox", checked: committed, disabled: ctx.anyLoading }) as HTMLInputElement;
    cb.addEventListener("change", () => gm.onLoadoutToggle(item.name, cb.checked));
    return h("label", { className: "gear" }, cb, ` ${item.name} `, h("span", { className: "small" }, `${item.bulk} load`));
  };
  const used = g.loadout.reduce((sum, i) => sum + i.bulk, 0);
  return h("div", { className: "game-mode-loadout" },
    h("p", { className: "lbl" }, `${used} of ${g.maxBulk} load committed`),
    ...g.availableGear.map((i) => row(i, false)),
    ...g.loadout.map((i) => row(i, true)),
  );
}

/** Score sheet loadout card: committed loadout, with Change loadout behind a confirmation. */
export function renderCommittedLoadout(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const g = ctx.c.gear;
  const used = g.loadout.reduce((sum, i) => sum + i.bulk, 0);
  const change = h("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading || g.isCommitmentLocked }, "Change loadout");
  change.addEventListener("click", () => gm.onLoadoutChange(LOAD_CHOICES[0]));
  const confirmBox = ui.loadoutChange === null ? null : h("div", { className: "game-mode-confirm", role: "alertdialog", "aria-label": "Confirm loadout change" },
    h("p", {}, `Replace the committed loadout with ${ui.loadoutChange}? Back cancels; Confirm commits.`),
    h("div", { style: "display: flex; gap: 0.5em;" },
      (() => { const b = h("button", { type: "button" }, "Back"); b.addEventListener("click", () => gm.onLoadoutChange(null)); return b; })(),
      (() => { const b = h("button", { type: "button", className: "btn-primary" }, "Confirm"); b.addEventListener("click", gm.onLoadoutConfirm); return b; })(),
    ));
  return h("section", { className: "sheet-card focus-load", "data-section": "committed-loadout", style: "grid-column: 1 / -1;" },
    h("h2", {}, "Loadout", " ", srdLink(SRD.planning)),
    h("p", { className: "lbl" }, `${used} of ${g.maxBulk} load committed · ${g.commitment}`),
    h("ul", {}, ...g.loadout.map((i) => h("li", {}, `${i.name} · ${i.bulk} load`))),
    change,
    confirmBox,
  );
}

/** Resolution: six-step stepper, Back/Next stored as the cursor, step content with crew editors. */
export function renderResolution(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  const flow = ctx.c.modeFlow;
  if (flow.kind !== "resolution") return null;
  const step = flow.step;
  const idx = RESOLUTION_STEPS.indexOf(step as (typeof RESOLUTION_STEPS)[number]);
  const crew = ui.linkedCrew;
  const attrs = desperateAttributes(ctx.gameData);
  const stepper = h("ol", { className: "resolution-stepper", "aria-label": "Resolution steps" },
    ...RESOLUTION_STEPS.map((s, i) => {
      return h("li", { "aria-current": s === step ? "step" : undefined, className: s === step ? "active" : "" }, `${i + 1}. ${s}`);
    }));
  let content: HTMLElement;
  switch (step) {
    case "scoundrel-xp":
      content = h("div", {},
        h("p", { className: "serif" }, "End-of-session review. For each trigger that occurred, mark at least 1 XP; 2 if it occurred a lot. No trigger means no automatic award."),
        h("ul", { className: "small" },
          h("li", {}, "Playbook-specific challenge (for example stealth or evasion for the Lurk)."),
          h("li", {}, "Expressed beliefs, drives, heritage, or background."),
          h("li", {}, "Struggled with vice or traumas.")),
        h("div", { style: "display: flex; gap: 0.35em; flex-wrap: wrap;" },
          playbookMark(ctx),
          ...attrs.map((a) => {
            const b = h("button", { type: "button", disabled: ctx.anyLoading }, `+1 ${a}`);
            b.addEventListener("click", () => ctx.handlers.onAttributeXpDelta(a, 1));
            return b;
          })),
        h("p", { className: "small" }, srdLink(SRD.advancement)));
      break;
    case "payoff":
      content = h("div", {},
        h("p", { className: "serif" }, "Crew receives 2 rep, plus or minus the target-minus-crew Tier difference, minimum zero. A completely quiet score earns zero rep."),
        h("ul", { className: "small" },
          h("li", {}, "Coin guide: 2 minor, 4 small, 6 standard, 8 big, 10+ major."),
          h("li", {}, "If owed, tithe is crew Tier + 1 coin.")),
        crew ? crewEditor("Rep", crew.rep.current, "rep", ctx, ui, gm) : h("p", { className: "small" }, "Link a crew to edit its rep and coin here."),
        crew ? crewEditor("Coin", crew.coin, "coin", ctx, ui, gm) : null,
        myShareEditor(ctx, gm),
        h("p", { className: "small" }, srdLink(SRD.payoff)));
      break;
    case "heat":
      content = h("div", {},
        h("p", { className: "serif" }, "Base heat: 0 smooth or quiet, 2 contained, 4 loud or chaotic, 6 wild. Add +1 for a high-profile or well-connected target, +1 hostile turf, +1 at war, +2 if killing was involved."),
        crew ? crewEditor("Heat", crew.heat.current, "heat", ctx, ui, gm) : h("p", { className: "small" }, "Link a crew to edit its heat here."),
        h("p", { className: "small" }, srdLink(SRD.heat)));
      break;
    case "entanglements": {
      const heat = crew?.heat.current ?? 0;
      content = h("div", {},
        h("p", { className: "serif" }, `Crew heat is ${crew ? heat : "unknown"}. Roll dice equal to wanted level and use the highest die; at wanted level zero, roll two dice and keep the lowest. Outcomes are handled at the table.`),
        ...entanglementRows(heat, ui.showAllEntanglements).map((r) =>
          h("p", { className: "small", "data-heat-band": r.heat }, `Heat ${r.heat}: ${r.outcomes.join(" or ")}`)),
        (() => { const b = h("button", { type: "button", "aria-expanded": ui.showAllEntanglements ? "true" : "false" }, ui.showAllEntanglements ? "Hide full table" : "Show all"); b.addEventListener("click", gm.onToggleAllEntanglements); return b; })(),
        h("p", { className: "small" }, srdLink(SRD.entanglements)));
      break;
    }
    case "crew-xp":
      content = h("div", {},
        h("p", { className: "serif" }, "Optional: update crew XP here, or skip."),
        crew ? crewEditor("XP", crew.experience.points, "xp", ctx, ui, gm) : h("p", { className: "small" }, "Link a crew to edit its XP here."));
      break;
    default:
      content = h("div", {},
        h("p", { className: "serif" }, "Optional: update crew rep here, or skip. If rep was already recorded during Payoff, skip: this is not a second award."),
        crew ? crewEditor("Rep", crew.rep.current, "rep", ctx, ui, gm) : h("p", { className: "small" }, "Link a crew to edit its rep here."));
  }
  const back = stepBefore("resolution", step);
  const next = stepAfter("resolution", step);
  const backBtn = h("button", { type: "button", disabled: ctx.anyLoading || back === null }, "Back");
  backBtn.addEventListener("click", () => back && gm.onFlowSet("resolution", back));
  const nextBtn = h("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading }, next ? "Next" : "Finish");
  nextBtn.addEventListener("click", () => (next ? gm.onFlowSet("resolution", next) : gm.onMode("downtime")));
  // Design: skippable after a confirm, for optional steps and for the whole Resolution.
  const skip = (idx === 4 || idx === 5) && next !== null ? h("button", { type: "button", disabled: ctx.anyLoading }, "Skip") : null;
  skip?.addEventListener("click", () => {
    if (window.confirm("Skip this optional step? Nothing is awarded or changed. You can come back to it.")) {
      gm.onFlowSet("resolution", next!);
    }
  });
  const skipAll = h("button", { type: "button", disabled: ctx.anyLoading }, "Skip Resolution");
  skipAll.addEventListener("click", () => {
    if (window.confirm("Skip the rest of Resolution? Nothing is awarded or changed. The step cursor clears; the sheet keeps its current state.")) {
      gm.onFlowSet("none", "");
    }
  });
  return h("section", { className: "sheet-card game-mode-resolution", "data-section": "resolution", "aria-label": "Resolution", style: "grid-column: 1 / -1;" },
    h("h2", {}, `Resolution · step ${idx + 1} of ${RESOLUTION_STEPS.length}`),
    h("p", { className: "small" }, "Confirm with your GM before you mark anything."),
    stepper,
    content,
    h("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; flex-wrap: wrap;" }, backBtn, skip, skipAll, nextBtn),
  );
}

function playbookMark(ctx: SectionCtx): HTMLElement {
  const b = h("button", { type: "button", disabled: ctx.anyLoading }, "+1 Playbook XP");
  b.addEventListener("click", () => ctx.handlers.onPlaybookXpDelta(1));
  return b;
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
