import { el } from "../../lib/dom.js";

/**
 * Shared DOM furniture for the character sheet's section controllers
 * (ARCH-02), extracted from the character-detail page module.
 */

/**
 * CHAR-06: clickable heavy-box XP track in the stress-track idiom (the
 * character twin of the crew sheet's boxTrack). Clicking box N asks to set
 * the value to N; the caller turns that into a delta over the same bounded
 * op. Max always comes from the DTO (settings-derived server-side).
 */
export function xpBoxes(opts: {
  value: number;
  max: number;
  label: string;
  disabled: boolean;
  onChange: (next: number) => void;
}): HTMLElement {
  const { value, max, label, disabled, onChange } = opts;
  const row = el(
    "div",
    {
      className: "stress-track",
      role: "group",
      "aria-label": `${label}: ${Math.min(value, max)} of ${max}`,
    },
  );
  for (let i = 1; i <= max; i++) {
    const filled = i <= value;
    const btn = el("button", {
      type: "button",
      className: "stress-box",
      "data-stress": filled ? "1" : "0",
      "data-index": String(i),
      "aria-label": `${label} ${i}`,
      "aria-pressed": filled ? "true" : "false",
      disabled,
    });
    btn.addEventListener("click", () => onChange(i));
    row.append(btn);
  }
  return row;
}
