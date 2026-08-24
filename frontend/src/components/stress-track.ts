/**
 * Stress track — a row (or grid) of heavy boxes.
 *
 * Spec §12: "stress track as a row of heavy boxes". `max` is required —
 * capacity always comes from the caller (DTO / game settings); a game
 * maximum is never hardcoded here (spec §5, §5.5).
 */

import { el } from "../lib/dom.js";

export interface StressTrackOptions {
  /** Current stress (0..max, values past max render with accent). */
  value?: number;
  /** Capacity (game-settings derived, e.g. character.monitor.stress.max). */
  max: number;
  /** Optional label shown under the track. */
  label?: string;
  /** When set, boxes are buttons. */
  onChange?: (next: number) => void;
  id?: string;
}

export function stressTrack(opts: StressTrackOptions): HTMLElement {
  const max = opts.max;
  const value = Math.max(0, opts.value ?? 0);
  const interactive = typeof opts.onChange === "function";

  const row = el("div", {
    className: "stress-track",
    role: "group",
    "aria-label": opts.label
      ? `${opts.label}: ${Math.min(value, max)} of ${max}`
      : `Stress ${Math.min(value, max)} of ${max}`,
  });

  const state = { value };

  for (let i = 1; i <= max; i++) {
    const mode = stressMode(i, state.value);
    if (interactive) {
      const btn = el("button", {
        type: "button",
        className: "stress-box",
        "data-stress": mode,
        "data-index": String(i),
        "aria-label": `Stress ${i}`,
        "aria-pressed": mode === "0" ? "false" : "true",
      });
      btn.addEventListener("click", () => {
        const next = state.value === i ? i - 1 : i;
        state.value = next;
        paint(row, next, max);
        opts.onChange?.(next);
      });
      row.append(btn);
    } else {
      row.append(
        el("span", {
          className: "stress-box",
          "data-stress": mode,
          "aria-hidden": "true",
        }),
      );
    }
  }

  const wrap = el(
    "div",
    { className: "stress", id: opts.id },
    row,
    opts.label
      ? el("div", { className: "stress-label lbl" }, opts.label)
      : null,
  );
  return wrap;
}

function stressMode(index: number, value: number): string {
  if (index > value) return "0";
  // Past capacity shouldn't happen often; render spilled boxes with accent.
  return "1";
}

function paint(root: HTMLElement, value: number, max: number): void {
  const kids = root.querySelectorAll<HTMLElement>(".stress-box");
  kids.forEach((node, idx) => {
    const i = idx + 1;
    const mode = stressMode(i, value);
    node.dataset.stress = mode;
    if (node instanceof HTMLButtonElement) {
      node.setAttribute("aria-pressed", mode === "0" ? "false" : "true");
    }
  });
  root.setAttribute(
    "aria-label",
    `Stress ${Math.min(value, max)} of ${max}`,
  );
}
