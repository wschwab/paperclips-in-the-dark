/**
 * Inked checkbox — square toggle drawn to look like pen-ticked form stock.
 *
 * Spec §12: "checkboxes and clocks drawn as inked circles/segments".
 * Circles live in action-dots; this is the rectangular sibling used on
 * loadout, armor, cohort status, etc.
 */

import { el } from "../lib/dom.js";

export interface InkedCheckboxOptions {
  checked?: boolean;
  label?: string;
  name?: string;
  id?: string;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}

export function inkedCheckbox(opts: InkedCheckboxOptions = {}): HTMLElement {
  const id =
    opts.id ??
    (opts.name
      ? `inked-${opts.name}`
      : `inked-${Math.random().toString(36).slice(2, 9)}`);

  const input = el("input", {
    type: "checkbox",
    className: "inked-check",
    id,
    name: opts.name,
    checked: Boolean(opts.checked),
    disabled: Boolean(opts.disabled),
  });
  input.dataset.checked = input.checked ? "1" : "0";
  input.setAttribute("aria-checked", input.checked ? "true" : "false");

  input.addEventListener("change", () => {
    input.dataset.checked = input.checked ? "1" : "0";
    input.setAttribute("aria-checked", input.checked ? "true" : "false");
    opts.onChange?.(input.checked);
  });

  // Keep data-checked in sync if the property is flipped programmatically
  // via click on a wrapped label (change event covers that path).

  if (!opts.label) return input;

  return el(
    "label",
    { className: "inked-check-label", htmlFor: id },
    input,
    el("span", { className: "inked-check-text" }, opts.label),
  );
}
