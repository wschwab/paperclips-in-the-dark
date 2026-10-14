/**
 * XP Tracker (XP-TRACKER-04): Score-only assistance. Desperate action XP and the three session
 * expression tracks. Wide screens show it under the Game mode panel. Compact screens open it from the
 * footer "XP Tracker" tab as a bottom sheet (aria-expanded; Close, Escape, focus return; the drag
 * handle is an extra). The expression rows reuse the sheet's stress track component exactly as the
 * Talents section did.
 */
import { el } from "../../lib/dom.js";
import { stressTrack } from "../../components/stress-track.js";
import { SRD, desperateAttributes } from "../game-mode.js";
import type { SectionCtx } from "./context.js";
import type { GameModeHandlers, GameModeUi } from "./gameMode.js";
import { sessionXpTotal } from "./xp-allocation.js";

const EXPRESSIONS = [
  { key: "playbookExpressions", label: "Playbook expressions", short: "playbook" },
  { key: "characterExpressions", label: "Scoundrel expressions", short: "character" },
  { key: "struggleExpressions", label: "Struggle expressions", short: "struggle" },
] as const;

const XP_TRACKER_FOCUSABLE = "a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])";

/** This Score's Desperate action XP marks, one line per attribute in the order first marked: "+2 Insight XP". */
function desperateMarkList(marks: readonly string[]): HTMLElement {
  if (marks.length === 0) {
    return el("p", { className: "small", "data-desperate-marks": "" }, "No Desperate action XP marked this Score yet.");
  }
  const counts = new Map<string, number>();
  for (const attribute of marks) counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
  return el("ul", { className: "xp-tracker-marks", "data-desperate-marks": "", "aria-label": "Desperate action XP marked this Score" },
    ...[...counts].map(([attribute, n]) => el("li", {}, `+${n} ${attribute} XP`)));
}

/** Desperate action XP and the expression rows: the content shared by the panel and the sheet. */
function trackerBody(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement[] {
  const { c, handlers } = ctx;
  const attrs = desperateAttributes(ctx.gameData);
  const select = el("select", { "aria-label": "Desperate action attribute", disabled: ctx.anyLoading },
    ...attrs.map((a) => el("option", { value: a }, a))) as HTMLSelectElement;
  const mark = el("button", { type: "button", className: "btn-secondary", disabled: ctx.anyLoading || attrs.length === 0 },
    "+ Desperate action XP");
  mark.addEventListener("click", () => gm.onDesperate(select.value));

  const rows = EXPRESSIONS.map((t) => {
    const value = c.session[t.key];
    const track = stressTrack({
      value,
      max: c.session.max,
      label: t.label,
      onChange: (next) => handlers.onSessionTrack(t.key, next),
    });
    track.setAttribute("data-session-track", t.short);
    const minus = el("button", {
      type: "button",
      disabled: ctx.gameplayDisabled || value <= 0,
      title: `Remove 1 ${t.label}`,
    }, "−1");
    minus.addEventListener("click", () => handlers.onSessionDelta(t.key, -1));
    const plus = el("button", {
      type: "button",
      disabled: ctx.gameplayDisabled || value >= c.session.max,
      title: `Add 1 ${t.label}`,
    }, "+1");
    plus.addEventListener("click", () => handlers.onSessionDelta(t.key, 1));
    return el("div", {
      className: "session-track xp-tracker-row",
      "data-session-track": t.short,
    }, track, el("span", {}, `${value} / ${c.session.max}`), minus, plus);
  });

  const nodes: Array<HTMLElement | null> = [
    el("p", { className: "small" }, "Pick the attribute you used. It marks 1 XP there now."),
    el("div", { className: "xp-tracker-desperate" }, select, mark),
    desperateMarkList(c.session.desperateMarks),
    el("p", { className: "small", style: "margin-top: 0.5em;" }, "1 per trigger, 2 if it happened a lot. Resolution clears them."),
    ...rows,
    el("p", { className: "small" }, el("a", { className: "srd-link", href: SRD.advancement, target: "_blank", rel: "noopener noreferrer" }, "SRD ↗")),
  ];
  return nodes.filter((n): n is HTMLElement => n !== null);
}

/** Wide layout: the panel under the Game mode panel. Hidden on compact screens by CSS. */
export function renderXpTrackerPanel(ctx: SectionCtx, gm: GameModeHandlers): HTMLElement {
  return el("section", { className: "xp-tracker-panel", "data-section": "xp-tracker", "aria-label": "XP Tracker" },
    el("h3", { className: "lbl" }, "XP Tracker"),
    el("p", { className: "small scope" }, `${sessionXpTotal(ctx.c)} expression XP this session`),
    ...trackerBody(ctx, gm));
}

/** Compact layout: the footer tab that opens the bottom sheet. Hidden on wide screens by CSS. */
export function renderXpTrackerTab(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const tab = el("button", {
    type: "button",
    className: "xp-tracker-tab",
    "aria-expanded": ui.xpTrackerOpen ? "true" : "false",
    "aria-controls": "xp-tracker-sheet",
  },
    el("span", { className: "lbl" }, "XP Tracker"),
    el("span", { className: "small" }, `${sessionXpTotal(ctx.c)} expression XP`));
  tab.addEventListener("click", () => gm.onXpTrackerOpen(!ui.xpTrackerOpen));
  return tab;
}

/** Compact layout: the bottom sheet, rendered only while open. Escape and Close return focus to the tab. */
export function renderXpTrackerSheet(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement | null {
  if (!ui.xpTrackerOpen || ctx.c.mode !== "score") return null;
  const close = el("button", { type: "button", className: "btn-secondary xp-tracker-close" }, "Close");
  close.addEventListener("click", () => gm.onXpTrackerOpen(false));
  const handle = el("div", { className: "xp-tracker-handle", "aria-hidden": "true" }, el("span", {}));
  // Drag is an extra: a downward drag of more than 80px closes the sheet. The button path always works.
  let startY: number | null = null;
  handle.addEventListener("pointerdown", (e) => { startY = e.clientY; });
  handle.addEventListener("pointerup", (e) => {
    if (startY !== null && e.clientY - startY > 80) gm.onXpTrackerOpen(false);
    startY = null;
  });
  const sheet = el("section", {
    id: "xp-tracker-sheet",
    className: "xp-tracker-sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "XP Tracker",
    "data-section": "xp-tracker-sheet",
    tabindex: "-1",
  },
    handle,
    el("header", { className: "xp-tracker-sheet-head" }, el("h2", {}, "XP Tracker"), close),
    el("div", { className: "xp-tracker-sheet-body" }, ...trackerBody(ctx, gm)));
  // Modal focus containment: Tab wraps inside the dialog; the background is inert while it is open.
  sheet.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = Array.from(sheet.querySelectorAll<HTMLElement>(XP_TRACKER_FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const outside = !(active instanceof Node) || !sheet.contains(active);
    if (e.shiftKey && (outside || active === first || active === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (outside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  });
  queueMicrotask(() => close.focus());
  return sheet;
}

