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
  turf?: number;
  label: string;
  disabled: boolean;
  onChange: (next: number) => void;
}): HTMLElement {
  const { value, max, label, disabled, onChange } = opts;
  const turf = Math.min(max, Math.max(0, opts.turf ?? 0));
  const available = max - turf;
  const row = el(
    "div",
    {
      className: "stress-track",
      role: "group",
      "aria-label": `${label}: ${Math.min(value, available)} of ${available}${turf ? `; ${turf} boxes reserved for Turf` : ""}`,
    },
  );
  for (let i = 1; i <= max; i++) {
    if (i > available) {
      // Keep the control structure stable for focus restoration as turf changes.
      row.append(el("button", {
        type: "button",
        disabled: true,
        className: "stress-box",
        "data-stress": "2",
        "data-turf": "1",
        "data-index": String(i),
        "aria-pressed": "true",
        "aria-label": `Turf — Rep box ${i} reserved`,
      }));
      continue;
    }
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
    turf?: number;
    isLoading: boolean;
    onDelta: (delta: number) => void;
    onTrack: (next: number) => void;
    note?: string | null;
  },
): HTMLElement {
  const available = opts.max - Math.min(opts.max, Math.max(0, opts.turf ?? 0));
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
    disabled: state.anyLoading || opts.current >= available,
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
        turf: opts.turf,
        label: opts.label,
        disabled: state.anyLoading,
        onChange: opts.onTrack,
      }),
      el("span", {}, opts.turf === undefined ? `${opts.current} / ${available}` : `${opts.label} ${opts.current}/${available}`),
      minusBtn,
      plusBtn,
    ),
    opts.note
      ? el("div", { className: "lbl", style: "margin-top: 0.35em;" }, opts.note)
      : null,
  );
}
