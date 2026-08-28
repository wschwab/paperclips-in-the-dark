import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";

/**
 * Shared DOM furniture for the crew sheet's section controllers (ARCH-02),
 * extracted verbatim from the crew-detail page module.
 */

/**
 * A row of clickable heavy boxes in the F1 styleguide idiom (same visual
 * language as the character stress track). Clicking box N asks to set the
 * value to N; the +/- buttons are the precise write path over the same ops.
 */
export function boxTrack(opts: {
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

/** One bounded tracker: box row + current/max + -/+ buttons. */
export function renderTracker(
  state: RenderState,
  opts: {
    className: string;
    label: string;
    current: number;
    max: number;
    isLoading: boolean;
    onDelta: (delta: number) => void;
    onTrack: (next: number) => void;
    note?: string | null;
  },
): HTMLElement {
  const minusBtn = el("button", {
    type: "button",
    disabled: state.anyLoading || opts.current <= 0,
    title: `Remove 1 ${opts.label.toLowerCase()}`,
  }, "−1");
  minusBtn.addEventListener("click", () => opts.onDelta(-1));

  const plusBtn = el("button", {
    type: "button",
    // P29/FV-029: the bound control is disabled once the track is full — the
    // server would otherwise clamp the delta silently.
    disabled: state.anyLoading || opts.current >= opts.max,
    title: `Add 1 ${opts.label.toLowerCase()}`,
  }, opts.isLoading ? "…" : "+1");
  plusBtn.addEventListener("click", () => opts.onDelta(1));

  return el(
    "div",
    { className: opts.className, style: "margin: 0.6em 0;" },
    el(
      "div",
      { style: "display: flex; gap: 1em; align-items: center; flex-wrap: wrap;" },
      boxTrack({
        value: opts.current,
        max: opts.max,
        label: opts.label,
        disabled: state.anyLoading,
        onChange: opts.onTrack,
      }),
      el("span", {}, `${opts.current} / ${opts.max}`),
      minusBtn,
      plusBtn,
    ),
    opts.note
      ? el("div", { className: "lbl", style: "margin-top: 0.35em;" }, opts.note)
      : null,
  );
}
