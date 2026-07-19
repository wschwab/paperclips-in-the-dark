/**
 * Action dots — Blades action rating as a row of inked circles.
 *
 * Spec §12 furniture. Interactive: clicking a dot sets rating to that
 * 1-based index (click filled terminal → clear). Sheets (F2) will pass
 * onChange and withhold interactivity when desired.
 */

import { el } from "../lib/dom.js";

export interface ActionDotsOptions {
  /** Action name (label). */
  name: string;
  /** Current filled count (0..max). */
  value?: number;
  /** Number of dots shown. Default 4 (Blades actions). */
  max?: number;
  /** When set, dots are buttons and call back on change. */
  onChange?: (next: number) => void;
  /** Optional id prefix for a11y. */
  id?: string;
}

export function actionDots(opts: ActionDotsOptions): HTMLElement {
  const max = opts.max ?? 4;
  const value = clamp(opts.value ?? 0, 0, max);
  const interactive = typeof opts.onChange === "function";

  const dots = el("div", {
    className: "action-dots",
    role: "group",
    "aria-label": `${opts.name} rating ${value} of ${max}`,
  });

  const state = { value };

  for (let i = 1; i <= max; i++) {
    const filled = i <= state.value ? "1" : "0";
    if (interactive) {
      const btn = el("button", {
        type: "button",
        className: "action-dot",
        "data-fill": filled,
        "data-index": String(i),
        "aria-label": `${opts.name} ${i}`,
        "aria-pressed": filled === "1" ? "true" : "false",
      });
      btn.addEventListener("click", () => {
        // clicking the last filled box clears; otherwise set to that index
        const next = state.value === i ? i - 1 : i;
        state.value = next;
        paint(dots, next);
        dots.setAttribute(
          "aria-label",
          `${opts.name} rating ${next} of ${max}`,
        );
        opts.onChange?.(next);
      });
      dots.append(btn);
    } else {
      dots.append(
        el("span", {
          className: "action-dot",
          "data-fill": filled,
          "aria-hidden": "true",
        }),
      );
    }
  }

  return el(
    "div",
    {
      className: "action",
      id: opts.id,
    },
    el("span", { className: "action-name" }, opts.name),
    dots,
  );
}

function paint(root: HTMLElement, value: number): void {
  const kids = root.querySelectorAll<HTMLElement>(".action-dot");
  kids.forEach((node, idx) => {
    const i = idx + 1;
    const filled = i <= value ? "1" : "0";
    node.dataset.fill = filled;
    if (node instanceof HTMLButtonElement) {
      node.setAttribute("aria-pressed", filled === "1" ? "true" : "false");
    }
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
