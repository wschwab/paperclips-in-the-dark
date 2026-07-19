/**
 * SVG clock — inked segmented progress dial.
 *
 * Spec §12: "SVG clock component with 4/6/8-segment variants". Segment
 * count is a parameter so crews/long-term projects can use any size the
 * game-settings declare; the styleguide demos 4/6/8.
 */

export type ClockSize = 4 | 6 | 8 | number;

export interface ClockOptions {
  /** Number of segments (ticks). Commonly 4, 6, or 8. */
  segments: ClockSize;
  /** Currently filled segments (0..segments). */
  value?: number;
  /** Optional label drawn under the dial. */
  label?: string;
  /** Diameter in px. Default 140. */
  size?: number;
  /** When set, segments are focusable and clickable. */
  onChange?: (next: number) => void;
  id?: string;
}

export function clock(opts: ClockOptions): HTMLElement {
  const n = Math.max(1, Math.floor(opts.segments));
  const initial = clamp(opts.value ?? 0, 0, n);
  const size = opts.size ?? 140;
  const interactive = typeof opts.onChange === "function";
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "clock");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", labelFor(opts.label, initial, n));
  if (opts.id) svg.id = opts.id;

  const frame = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  frame.setAttribute("class", "clock-frame");
  frame.setAttribute("cx", String(cx));
  frame.setAttribute("cy", String(cy));
  frame.setAttribute("r", String(r));
  svg.append(frame);

  const state = { value: initial };
  const segmentNodes: SVGPathElement[] = [];

  for (let i = 0; i < n; i++) {
    const start = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const end = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "clock-segment");
    path.setAttribute("d", wedgePath(cx, cy, r * 0.92, start, end));
    path.dataset.filled = i < state.value ? "1" : "0";
    path.dataset.index = String(i + 1);

    if (interactive) {
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.setAttribute("aria-label", `Segment ${i + 1}`);
      path.setAttribute("aria-pressed", i < state.value ? "true" : "false");
      const activate = (): void => {
        const idx = i + 1;
        const next = state.value === idx ? idx - 1 : idx;
        state.value = next;
        paint(segmentNodes, next);
        svg.setAttribute("aria-label", labelFor(opts.label, next, n));
        opts.onChange?.(next);
      };
      path.addEventListener("click", activate);
      path.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activate();
        }
      });
    }

    segmentNodes.push(path);
    svg.append(path);
  }

  // Radial separator ticks — inked spokes read as ruling on a printed clock.
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "clock-tick");
    line.setAttribute("x1", String(cx + Math.cos(a) * (r * 0.12)));
    line.setAttribute("y1", String(cy + Math.sin(a) * (r * 0.12)));
    line.setAttribute("x2", String(cx + Math.cos(a) * r));
    line.setAttribute("y2", String(cy + Math.sin(a) * r));
    svg.append(line);
  }

  const figure = document.createElement("figure");
  figure.className = "sg-figure clock-wrap";
  figure.append(svg);
  const cap = document.createElement("figcaption");
  cap.textContent = opts.label ? `${opts.label} · ${n}` : `${n}-segment`;
  figure.append(cap);
  return figure;
}

function labelFor(label: string | undefined, value: number, n: number): string {
  return label ? `${label}: ${value} of ${n}` : `Clock ${value} of ${n}`;
}

function paint(nodes: SVGPathElement[], value: number): void {
  nodes.forEach((node, idx) => {
    const filled = idx < value ? "1" : "0";
    node.dataset.filled = filled;
    if (node.hasAttribute("aria-pressed")) {
      node.setAttribute("aria-pressed", filled === "1" ? "true" : "false");
    }
  });
}

/** Pie-wedge path from center through arc start→end. */
function wedgePath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number,
): string {
  const x1 = cx + Math.cos(start) * r;
  const y1 = cy + Math.sin(start) * r;
  const x2 = cx + Math.cos(end) * r;
  const y2 = cy + Math.sin(end) * r;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${x1} ${y1}`,
    `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    "Z",
  ].join(" ");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
