/**
 * Action dots — Blades action rating as a row of inked circles.
 *
 * Spec §12 furniture. Interactive: clicking a dot sets rating to that
 * 1-based index (click filled terminal → clear); keyboard drives the same
 * operation through a roving tabindex — arrows/Home/End move the active
 * dot and the selection follows. Sheets (F2) will pass onChange and withhold
 * interactivity when desired; `disabled` keeps an interactive row reachable
 * but inert.
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
  /** Optional tooltip on the action-name label (e.g. a short description). */
  title?: string;
  /** Display-only dots (PC chargen playbook DefaultActionPoints prefills):
   *  onChange is ignored and the row renders non-interactive spans. */
  locked?: boolean;
  /** Interactive-but-inert (A11Y-01): dots render as real buttons marked
   *  aria-disabled so AT users still find the group; activation is a no-op.
   *  Only meaningful together with onChange. */
  disabled?: boolean;
}

export function actionDots(opts: ActionDotsOptions): HTMLElement {
  const max = opts.max ?? 4;
  const value = clamp(opts.value ?? 0, 0, max);
  const interactive = typeof opts.onChange === "function" && !opts.locked;
  const inert = interactive && opts.disabled === true;

  const dots = el("div", {
    className: interactive ? "action-dots is-interactive" : "action-dots",
    role: "group",
    "aria-label": `${opts.name} rating ${value} of ${max}`,
  });

  const state = { value };

  // A11Y-01 roving tabindex: exactly one tab stop per rating group; the
  // active dot anchors on the highest filled rating (dot 1 when empty).
  const buttons: HTMLButtonElement[] = [];
  let active = clamp(Math.max(state.value, 1), 1, Math.max(max, 1));

  const setActive = (i: number, focus: boolean): void => {
    active = clamp(i, 1, max);
    buttons.forEach((btn, idx) => {
      btn.setAttribute("tabindex", idx + 1 === active ? "0" : "-1");
    });
    if (focus) buttons[active - 1]?.focus();
  };

  // Shared mutation funnel (A11Y-01): pointer and keyboard changes both land
  // here, so painting, the group-label announcement, and the onChange
  // callback cannot diverge between input modes.
  const apply = (next: number): void => {
    next = clamp(next, 0, max);
    state.value = next;
    paint(dots, next);
    dots.setAttribute("aria-label", `${opts.name} rating ${next} of ${max}`);
    opts.onChange?.(next);
  };

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
      if (inert) btn.setAttribute("aria-disabled", "true");
      buttons.push(btn);
      btn.addEventListener("click", () => {
        if (inert) return;
        setActive(i, false);
        // clicking the last filled box clears; otherwise set to that index
        apply(state.value === i ? i - 1 : i);
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

  if (interactive) {
    setActive(active, false);
    dots.addEventListener("keydown", (ev) => {
      if (inert) return;
      if (!(ev.target instanceof HTMLButtonElement)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const step =
        ev.key === "ArrowRight" || ev.key === "ArrowUp"
          ? 1
          : ev.key === "ArrowLeft" || ev.key === "ArrowDown"
            ? -1
            : 0;
      if (step !== 0) {
        setActive(active + step, true);
        // Selection follows the active dot; landing on the current value is
        // a no-op (no spurious onChange).
        if (active !== state.value) apply(active);
        ev.preventDefault();
      } else if (ev.key === "Home") {
        setActive(1, true);
        if (state.value !== 1) apply(1);
        ev.preventDefault();
      } else if (ev.key === "End") {
        setActive(max, true);
        if (state.value !== max) apply(max);
        ev.preventDefault();
      }
    });
  }

  return el(
    "div",
    {
      className: "action",
      id: opts.id,
    },
    el(
      "span",
      { className: "action-name", title: opts.title },
      opts.name,
    ),
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
