/**
 * Scoundrel XP completion (XP-TRACKER-04, Resolution step 1). The GM confirms a total, places it on
 * the Playbook and attribute tracks, and completes atomically through xp.resolve (XP-TRACKER-02).
 * Maxima and current points come from the character's settings-derived tracks, never literals.
 * Completion is blocked while XP is unplaced, over the total, over a track's room, or the total is
 * not a whole number of 0 or more.
 */
import { el } from "../../lib/dom.js";
import type { Character } from "../../schema/character.js";
import type { SectionCtx } from "./context.js";
import type { GameModeHandlers, GameModeUi } from "./gameMode.js";

export const XP_DESTINATIONS = ["Playbook", "Insight", "Prowess", "Resolve"] as const;
export type XpDestination = (typeof XP_DESTINATIONS)[number];
export type XpAllocations = Record<XpDestination, number>;

/** The GM's draft. total null follows the session counters; adjust unlocks the total. */
export interface XpDraft {
  total: number | null;
  adjust: boolean;
  allocations: XpAllocations;
}

export const EMPTY_XP_DRAFT: XpDraft = {
  total: null,
  adjust: false,
  allocations: { Playbook: 0, Insight: 0, Prowess: 0, Resolve: 0 },
};

export interface XpTrack {
  name: XpDestination;
  points: number;
  max: number;
}

/** Current points and maximum of each destination, from the character's own tracks. */
export function xpTracks(c: Character): XpTrack[] {
  return XP_DESTINATIONS.map((name) => {
    const xp = name === "Playbook"
      ? c.playbook.experience
      : c.talent.attributes.find((a) => a.name === name)?.experience;
    return { name, points: xp?.points ?? 0, max: xp?.max ?? 0 };
  });
}

/** The three session expression counters summed: the default GM total. */
export function sessionXpTotal(c: Character): number {
  return c.session.playbookExpressions + c.session.characterExpressions + c.session.struggleExpressions;
}

export interface XpCheck {
  total: number;
  allocated: number;
  remaining: number;
  totalValid: boolean;
  errors: string[];
  canComplete: boolean;
}

/** Live totals and every reason completion is blocked. Pure, so the UI and tests share it. */
export function checkXpDraft(c: Character, draft: XpDraft): XpCheck {
  const total = draft.total ?? sessionXpTotal(c);
  const totalValid = Number.isInteger(total) && total >= 0;
  const errors: string[] = [];
  if (!totalValid) errors.push("The GM total must be a whole number, 0 or more.");
  let allocated = 0;
  for (const track of xpTracks(c)) {
    const amount = draft.allocations[track.name];
    if (!Number.isInteger(amount) || amount < 0) {
      errors.push(`${track.name} allocation must be a whole number, 0 or more.`);
      continue;
    }
    allocated += amount;
    const room = track.max - track.points;
    if (amount > room) errors.push(`${track.name} exceeds its room by ${amount - room}.`);
  }
  const remaining = totalValid ? total - allocated : 0;
  if (totalValid && remaining > 0) errors.push(`${remaining} XP unplaced.`);
  if (totalValid && remaining < 0) errors.push(`${-remaining} XP over the total.`);
  return {
    total,
    allocated,
    remaining,
    totalValid,
    errors,
    canComplete: errors.length === 0 && totalValid && remaining === 0,
  };
}

/** Completion copy: what the counters do, and the zero-total case. */
export function completionNotes(c: Character, draft: XpDraft): string[] {
  const notes = ["Completing clears the three session expression counters. Permanent XP is kept; nothing else changes."];
  if (draft.total === 0 || (draft.total === null && sessionXpTotal(c) === 0)) {
    notes.push("A zero total awards nothing, but completion still clears the counters.");
  }
  return notes;
}

/** Destination row: filled, pending and empty boxes against the maximum, with the room left. */
function trackBoxes(track: XpTrack, planned: number): HTMLElement {
  const boxes = [];
  for (let i = 1; i <= track.max; i++) {
    const state = i <= track.points ? "1" : i <= planned ? "p" : "0";
    boxes.push(el("span", { className: "stress-box xp-alloc-box", "data-stress": state, "aria-hidden": "true" }));
  }
  return el("div", { className: "stress-track xp-alloc-track", "aria-hidden": "true" }, ...boxes);
}

function numberInput(label: string, value: number | null, disabled: boolean, onInput: (raw: string) => void): HTMLInputElement {
  const input = el("input", {
    type: "number",
    step: "1",
    min: "0",
    "aria-label": label,
    value: value === null ? "" : String(value),
    disabled,
    className: "xp-alloc-input",
  }) as HTMLInputElement;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

/** Resolution step 1: the locked split-allocation screen. */
export function renderXpAllocation(ctx: SectionCtx, gm: GameModeHandlers, ui: GameModeUi): HTMLElement {
  const c = ctx.c;
  const draft = ui.xpDraft;
  const check = checkXpDraft(c, draft);
  const setDraft = (next: XpDraft) => gm.onXpDraft(next);

  const totalInput = numberInput("GM total XP", check.total, !draft.adjust || ctx.anyLoading, (raw) => {
    const n = raw.trim() === "" ? NaN : Number(raw);
    setDraft({ ...draft, total: Number.isNaN(n) ? null : n });
  });
  const adjust = el("input", { type: "checkbox", checked: draft.adjust, disabled: ctx.anyLoading }) as HTMLInputElement;
  adjust.addEventListener("change", () => setDraft({ ...draft, adjust: adjust.checked }));

  const rows = xpTracks(c).map((track) => {
    const amount = draft.allocations[track.name];
    const planned = track.points + (Number.isInteger(amount) && amount > 0 ? amount : 0);
    const room = track.max - track.points;
    const minus = el("button", { type: "button", className: "btn-secondary", "aria-label": `Remove 1 ${track.name} allocation`, disabled: ctx.anyLoading || !(amount > 0) }, "−");
    const plus = el("button", { type: "button", className: "btn-secondary", "aria-label": `Add 1 ${track.name} allocation`, disabled: ctx.anyLoading }, "+");
    const set = (next: number) => setDraft({ ...draft, allocations: { ...draft.allocations, [track.name]: next } });
    minus.addEventListener("click", () => set(Math.max(0, (Number.isInteger(amount) ? amount : 0) - 1)));
    plus.addEventListener("click", () => set((Number.isInteger(amount) ? amount : 0) + 1));
    const input = numberInput(`${track.name} allocation`, Number.isNaN(amount) ? null : amount, ctx.anyLoading, (raw) => {
      const n = raw.trim() === "" ? NaN : Number(raw);
      set(Number.isNaN(n) ? 0 : n);
    });
    return el("div", { className: "xp-alloc-row", "data-xp-destination": track.name },
      el("div", { className: "xp-alloc-copy" },
        el("p", { className: "lbl xp-alloc-name" }, `${track.name} XP`),
        el("p", { className: "small xp-alloc-room" },
          `${track.points} / ${track.max} current → ${planned} / ${track.max} planned · ${room - (Number.isInteger(amount) ? amount : 0)} room left`),
        trackBoxes(track, planned)),
      el("div", { className: "xp-alloc-stepper" }, minus, input, plus));
  });

  const complete = el("button", { type: "button", className: "btn-primary", disabled: ctx.anyLoading || !check.canComplete },
    "Complete Scoundrel XP");
  complete.addEventListener("click", () => gm.onXpResolve(check.total, draft.allocations));

  return el("div", { className: "xp-alloc" },
    el("p", { className: "small xp-alloc-equation" },
      `Session expressions: ${c.session.playbookExpressions} + ${c.session.characterExpressions} + ${c.session.struggleExpressions} = ${sessionXpTotal(c)} session XP`),
    el("div", { className: "xp-alloc-total" },
      el("span", { className: "lbl" }, "GM total"),
      totalInput,
      el("label", { className: "small" }, adjust, " Adjust")),
    el("p", { className: "xp-alloc-live", role: "status", "aria-live": "polite" },
      `Available ${check.totalValid ? check.total : "—"} XP · Remaining ${check.totalValid ? check.remaining : "—"} XP`),
    el("div", { className: "xp-alloc-rows" }, ...rows),
    check.errors.length > 0 ? el("p", { className: "notice small", role: "alert" }, check.errors.join(" ")) : null,
    el("p", { className: "small" }, completionNotes(c, draft).join(" ")),
    el("div", { className: "xp-alloc-actions" }, complete));
}
