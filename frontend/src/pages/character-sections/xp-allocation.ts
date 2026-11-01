/**
 * Scoundrel XP completion: the GM confirms a total and allocates it across tracks.
 * The projected completion action atomically awards XP and advances the flow.
 * Maxima and current points come from the character's settings-derived tracks, never literals.
 * Completion is blocked while XP is unplaced, over the total, over a track's room, or the total is
 * not a whole number of 0 or more.
 */
import { el } from "../../lib/dom.js";
import type { Character } from "../../schema/character.js";
import type { SectionCtx } from "./context.js";
import type { GameModeHandlers, GameModeUi } from "./gameMode.js";
import type { CharacterFlow } from "../../schema/flow.js";
import { flowGuidance, flowInputField, schemaObject } from "../flow-presentation.js";

export type XpAllocations = Record<string, number>;

/** The GM's draft. total null follows the session counters; adjust unlocks the total. */
export interface XpDraft {
  total: number | null;
  adjust: boolean;
  allocations: XpAllocations;
}

export const EMPTY_XP_DRAFT: XpDraft = {
  total: null,
  adjust: false,
  allocations: {},
};

export interface XpTrack {
  name: string;
  points: number;
  max: number;
}

/** Current points and maximum of each destination, from the character's own tracks. */
export function xpTracks(c: Character, flow: CharacterFlow | null = null): XpTrack[] {
  const schemas = schemaObject(flowInputField(flow, "allocations").properties);
  const names = Object.keys(schemas).length > 0 ? Object.keys(schemas) : ["Playbook", ...c.talent.attributes.map((a) => a.name)];
  return names.map((name) => {
    const xp = name === "Playbook" ? c.playbook.experience : c.talent.attributes.find((a) => a.name === name)?.experience;
    const room = schemaObject(schemas[name]).maximum;
    return { name, points: xp?.points ?? 0,
      max: typeof room === "number" ? (xp?.points ?? 0) + room : xp?.max ?? 0 };
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
export function checkXpDraft(c: Character, draft: XpDraft, flow: CharacterFlow | null = null): XpCheck {
  const total = draft.total ?? sessionXpTotal(c);
  const totalValid = Number.isInteger(total) && total >= 0;
  const errors: string[] = [];
  if (!totalValid) errors.push("The GM total must be a whole number, 0 or more.");
  const totalSchema = flowInputField(flow, "total");
  if (typeof totalSchema.minimum === "number" && total < totalSchema.minimum) errors.push(`The GM total must be at least ${totalSchema.minimum}.`);
  if (typeof totalSchema.maximum === "number" && total > totalSchema.maximum) errors.push(`The GM total must be at most ${totalSchema.maximum}.`);
  let allocated = 0;
  for (const track of xpTracks(c, flow)) {
    const amount = draft.allocations[track.name] ?? 0;
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
  const guidance = flowGuidance(ui.flow)?.resolution.scoundrelXp;
  const check = checkXpDraft(c, draft, ui.flow);
  const setDraft = (next: XpDraft) => gm.onXpDraft(next);
  const completed = ui.flow?.receipt?.status === "completed";
  const disabled = ctx.anyLoading || completed;

  const totalInput = numberInput("GM total XP", check.total, !draft.adjust || disabled, (raw) => {
    const n = raw.trim() === "" ? NaN : Number(raw);
    setDraft({ ...draft, total: Number.isNaN(n) ? null : n });
  });
  const totalSchema = flowInputField(ui.flow, "total");
  if (typeof totalSchema.minimum === "number") totalInput.min = String(totalSchema.minimum);
  if (typeof totalSchema.maximum === "number") totalInput.max = String(totalSchema.maximum);
  const adjust = el("input", { type: "checkbox", checked: draft.adjust, disabled }) as HTMLInputElement;
  adjust.addEventListener("change", () => setDraft({ ...draft, adjust: adjust.checked }));

  const rows = xpTracks(c, ui.flow).map((track) => {
    const amount = draft.allocations[track.name] ?? 0;
    const planned = track.points + (!completed && Number.isInteger(amount) && amount > 0 ? amount : 0);
    const room = track.max - track.points;
    const minus = el("button", { type: "button", className: "btn-secondary", "aria-label": `Remove 1 ${track.name} allocation`, disabled: disabled || !(amount > 0) }, "−");
    const plus = el("button", { type: "button", className: "btn-secondary", "aria-label": `Add 1 ${track.name} allocation`, disabled }, "+");
    const set = (next: number) => setDraft({ ...draft, allocations: { ...draft.allocations, [track.name]: next } });
    minus.addEventListener("click", () => set(Math.max(0, (Number.isInteger(amount) ? amount : 0) - 1)));
    plus.addEventListener("click", () => set((Number.isInteger(amount) ? amount : 0) + 1));
    const input = numberInput(`${track.name} allocation`, Number.isNaN(amount) ? null : amount, disabled, (raw) => {
      const n = raw.trim() === "" ? NaN : Number(raw);
      set(Number.isNaN(n) ? 0 : n);
    });
    input.max = String(room);
    return el("div", { className: "xp-alloc-row", "data-xp-destination": track.name },
      el("div", { className: "xp-alloc-copy" },
        el("p", { className: "lbl xp-alloc-name" }, `${track.name} XP`),
        el("p", { className: "small xp-alloc-room" },
          completed ? `${track.points} / ${track.max} current · ${amount} XP recorded in this receipt`
            : `${track.points} / ${track.max} current → ${planned} / ${track.max} planned · ${room - (Number.isInteger(amount) ? amount : 0)} room left`),
        trackBoxes(track, planned)),
      el("div", { className: "xp-alloc-stepper" }, minus, input, plus));
  });

  const complete = el("button", { type: "button", className: "btn-primary", disabled: disabled || !check.canComplete },
    "Complete Scoundrel XP");
  complete.addEventListener("click", () => gm.onXpResolve(check.total,
    Object.fromEntries(xpTracks(c, ui.flow).map((track) => [track.name, draft.allocations[track.name] ?? 0]))));

  return el("div", { className: "xp-alloc" },
    el("p", { className: "small xp-alloc-equation" },
      `Session expressions: ${c.session.playbookExpressions} + ${c.session.characterExpressions} + ${c.session.struggleExpressions} = ${sessionXpTotal(c)} session XP`),
    el("div", { className: "xp-alloc-total" },
      el("span", { className: "lbl" }, "GM total"),
      totalInput,
      el("label", { className: "small" }, adjust, " Adjust")),
    el("p", { className: "xp-alloc-live", role: "status", "aria-live": "polite" },
      completed ? `Recorded ${check.total} XP · No additional award on Next`
        : `Available ${check.totalValid ? check.total : "—"} XP · Remaining ${check.totalValid ? check.remaining : "—"} XP`),
    el("div", { className: "xp-alloc-rows" }, ...rows),
    !completed && check.errors.length > 0 ? el("p", { className: "notice small", role: "alert" }, check.errors.join(" ")) : null,
    el("p", { className: "small" }, guidance?.completionNote ?? "",
      check.total === 0 ? ` ${guidance?.zeroNote ?? ""}` : ""),
    el("div", { className: "xp-alloc-actions" }, complete));
}
