/**
 * Trauma stamps — rubber-stamped labels for the trauma track.
 *
 * Spec §12: "trauma as stamped labels". Each stamp is either latent
 * (dashed, faint) or stamped (inked blood accent + typewriter face).
 */

import { el } from "../lib/dom.js";

export interface TraumaStampsOptions {
  /** All trauma names the sheet knows about (order preserved). */
  items: readonly string[];
  /** Currently stamped names (case-sensitive match against items). */
  stamped?: readonly string[];
  /** When set, stamps toggle on click. */
  onToggle?: (name: string, next: boolean) => void;
  /** When set, each stamped stamp shows a remove control. */
  onRemove?: (name: string) => void;
  /** Disables interactive controls while an op is in flight. */
  disabled?: boolean;
  id?: string;
}

export function traumaStamps(opts: TraumaStampsOptions): HTMLElement {
  const stamped = new Set(opts.stamped ?? []);
  const interactive = typeof opts.onToggle === "function";

  const root = el("div", {
    className: "trauma-stamps",
    role: "list",
    "aria-label": "Trauma",
    id: opts.id,
  });

  for (const name of opts.items) {
    const isOn = stamped.has(name);
    if (interactive) {
      const btn = el(
        "button",
        {
          type: "button",
          className: "trauma-stamp",
          role: "listitem",
          "data-stamped": isOn ? "1" : "0",
          "aria-pressed": isOn ? "true" : "false",
          "aria-label": `Trauma: ${name}`,
          disabled: opts.disabled,
        },
        name,
      );
      btn.addEventListener("click", () => {
        const next = btn.dataset.stamped !== "1";
        btn.dataset.stamped = next ? "1" : "0";
        btn.setAttribute("aria-pressed", next ? "true" : "false");
        opts.onToggle?.(name, next);
      });
      root.append(btn);
    } else {
      const stamp = el(
        "span",
        {
          className: "trauma-stamp",
          role: "listitem",
          "data-stamped": isOn ? "1" : "0",
        },
        name,
      );
      if (isOn && opts.onRemove) {
        const removeBtn = el(
          "button",
          {
            type: "button",
            className: "trauma-remove-btn",
            disabled: opts.disabled,
            "aria-label": `Remove trauma: ${name}`,
            title: "Remove trauma",
          },
          "✕",
        );
        removeBtn.addEventListener("click", () => opts.onRemove?.(name));
        stamp.append(removeBtn);
      }
      root.append(stamp);
    }
  }

  return root;
}
