/**
 * PERF-03 — mutation continuity instrumentation.
 *
 * Diagnostics only: records what actually happens around a character-sheet
 * mutation performed at a scrolled position, so CHAR-03 can pick an
 * architecture fix against measured evidence instead of guesses. Per mutation
 * (a wrapped handler whose operation completes through a non-GET fetch):
 *
 * - pre/post window.scrollY (+ derived delta),
 * - initiating element descriptor + bounding rect (event target),
 * - focused element descriptor + rect before and after,
 * - operation duration (handler entry → first non-GET response settled) and
 *   render-to-stable duration (first post-completion render → DOM quiet for
 *   `quietMs`, the PERF-01 mutation-observer quiet-window idiom),
 * - resulting `.error` / `.notice` alerts and whether each intersects the
 *   viewport.
 *
 * The recorder classifies operations by observing the network boundary
 * (window.fetch is patched for the lifetime of the install) rather than by
 * editing every handler: local-only interactions (edit-mode toggles, cue
 * dismissal) never see a non-GET completion and are dropped as `abandoned`
 * candidates. The first non-GET completion wins a span, so trailing probes
 * (capability refreshes are GETs and never match anyway) cannot redefine it.
 *
 * The live API is exposed as `window.__paperclipsContinuity`
 * (`records()` / `drain()`), which is how browser probes and future
 * regression checks read the evidence back.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FocusSnapshot {
  /** Structural descriptor (tag, label/text, nearest data-section). */
  descriptor: string;
  rect: RectSnapshot | null;
}

export interface AlertSnapshot {
  text: string;
  visible: boolean;
  rect: RectSnapshot | null;
}

export type MutationOutcome = "success" | "failure" | "abandoned";

export interface MutationContinuityRecord {
  op: string;
  startedAt: number;
  preScrollY: number | null;
  postScrollY: number | null;
  scrollDelta: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  initiatorDescriptor: string | null;
  initiatorRect: RectSnapshot | null;
  focusBefore: FocusSnapshot | null;
  focusAfter: FocusSnapshot | null;
  focusRestored: boolean | null;
  /** Handler entry → first non-GET response settled. */
  operationMs: number | null;
  /** First post-completion render → DOM quiet (`quietMs`). */
  renderToStableMs: number | null;
  outcome: MutationOutcome;
  outcomeStatus: number | null;
  alertCount: number | null;
  anyAlertVisible: boolean | null;
  alerts: AlertSnapshot[];
  stabilized: boolean;
  superseded: boolean;
}

export interface InstallOptions {
  /** The mounted page root; observers and initiator capture attach here. */
  root: HTMLElement;
  /** DOM-quiet window closing a span (default 80 ms). */
  quietMs?: number;
  /** Force-finalize bound for a span (default 10 000 ms). */
  maxWaitMs?: number;
  /** Scroll source override (layout-less environments / tests). */
  readScrollY?: () => number | null;
}

export interface MutationContinuity {
  /** Wrap a page's handler object; every invocation opens a candidate span. */
  wrapHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T;
  /** Call after the page applies a wholesale re-render. */
  noteRender(): void;
  /** Settled records (peek — the buffer keeps them). */
  records(): readonly MutationContinuityRecord[];
  /** Settled records, clearing the buffer. */
  drain(): MutationContinuityRecord[];
  /** Unpatch fetch, disconnect observers, remove the window export. */
  dispose(): void;
}

declare global {
  interface Window {
    __paperclipsContinuity?: MutationContinuity;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const MAX_ALERT_SNAPSHOTS = 5;
const ALERT_SELECTOR = ".error, .notice";
const MAX_TEXT = 80;

/** Copy live DOMRect geometry into a plain serializable snapshot. */
export function rectSnapshot(rect: DOMRect): RectSnapshot {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

/** Viewport visibility: nonzero size and positive overlap with the viewport. */
export function isRectInViewport(rect: RectSnapshot, viewportWidth: number, viewportHeight: number): boolean {
  return rect.width > 0
    && rect.height > 0
    && rect.right > 0
    && rect.bottom > 0
    && rect.left < viewportWidth
    && rect.top < viewportHeight;
}

/**
 * Stable-ish structural descriptor used to compare the focused control before
 * and after a wholesale re-render: tag + (aria-label | short text) + nearest
 * `[data-section]`.
 */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const labelled = el.getAttribute("aria-label")?.trim();
  const label = labelled
    ? labelled
    : `"${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24)}"`;
  const section = el.closest("[data-section]")?.getAttribute("data-section") ?? "-";
  return `${tag}[${label}]@${section}`;
}

function focusSnapshotOf(el: Element | null): FocusSnapshot | null {
  if (!el) return null;
  let rect: RectSnapshot | null = null;
  try {
    rect = rectSnapshot(el.getBoundingClientRect());
  } catch {
    rect = null;
  }
  return { descriptor: describeElement(el), rect };
}

function alertText(el: Element): string {
  return (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT);
}

// ---------------------------------------------------------------------------
// Recorder internals
// ---------------------------------------------------------------------------

interface InitiatorCapture {
  descriptor: string;
  rect: RectSnapshot | null;
}

interface OpenSpan {
  op: string;
  startedAtEpoch: number;
  startedPerf: number;
  preScrollY: number | null;
  initiator: InitiatorCapture | null;
  focusBefore: FocusSnapshot | null;
  completedPerf: number | null;
  outcome: MutationOutcome;
  outcomeStatus: number | null;
  operationMs: number | null;
  firstPostRenderPerf: number | null;
  lastActivityPerf: number;
  superseded: boolean;
}


/** Default scroll source: window.scrollY when finite, else null. */
function readWindowScrollY(): number | null {
  const y = window.scrollY;
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

export function installMutationContinuity(options: InstallOptions): MutationContinuity {
  const EVENT_TYPES = ["click", "change", "input"] as const;
  const root = options.root;
  const quietMs = options.quietMs ?? 80;
  const maxWaitMs = options.maxWaitMs ?? 10_000;
  const readScrollY = options.readScrollY ?? readWindowScrollY;

  if (window.__paperclipsContinuity) {
    throw new Error("mutation continuity already installed on this window");
  }

  let disposed = false;
  let open: OpenSpan | null = null;
  let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  const settled: MutationContinuityRecord[] = [];
  let pendingInitiator: InitiatorCapture | null = null;

  const now = () => performance.now();

  // -- initiator capture ----------------------------------------------------

  const captureInitiator = (event: Event) => {
    if (disposed || !(event.target instanceof Element)) return;
    let rect: RectSnapshot | null = null;
    try {
      rect = rectSnapshot(event.target.getBoundingClientRect());
    } catch {
      rect = null;
    }
    pendingInitiator = { descriptor: describeElement(event.target), rect };
  };
  // The bubble-phase bracket clears the capture once dispatch has passed back
  // through root — handlers run strictly between the two, so a stale capture
  // can never be attributed to a later, unrelated invocation.
  const clearInitiator = () => {
    pendingInitiator = null;
  };

  for (const type of EVENT_TYPES) {
    root.addEventListener(type, captureInitiator, true);
    root.addEventListener(type, clearInitiator, false);
  }

  // -- network boundary -----------------------------------------------------

  const originalFetchRef = window.fetch;
  const originalFetch = window.fetch.bind(window);
  const patchedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const span = open;
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET"))
      .toUpperCase();
    if (!span || span.completedPerf !== null || method === "GET" || method === "HEAD") {
      return originalFetch(input, init);
    }
    return originalFetch(input, init).then(
      (res) => {
        completeSpan(res.ok ? "success" : "failure", res.status);
        return res;
      },
      (err) => {
        completeSpan("failure", null);
        throw err;
      },
    );
  };
  window.fetch = patchedFetch as typeof window.fetch;

  function completeSpan(outcome: MutationOutcome, status: number | null): void {
    const span = open;
    if (!span || span.completedPerf !== null) return; // first completion wins
    const t = now();
    span.completedPerf = t;
    span.outcome = outcome;
    span.outcomeStatus = status;
    span.operationMs = t - span.startedPerf;
    span.lastActivityPerf = t;
    scheduleStabilityCheck();
  }

  // -- stability ------------------------------------------------------------

  const observer = new MutationObserver(() => {
    const span = open;
    if (!span) return;
    const t = now();
    span.lastActivityPerf = t;
    if (span.completedPerf !== null && span.firstPostRenderPerf === null) {
      span.firstPostRenderPerf = t;
    }
    scheduleStabilityCheck();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });

  function scheduleStabilityCheck(): void {
    const span = open;
    if (!span || span.completedPerf === null || span.firstPostRenderPerf === null) return;
    if (stabilityTimer !== null) clearTimeout(stabilityTimer);
    stabilityTimer = setTimeout(tryStableFinalize, quietMs);
  }

  function tryStableFinalize(): void {
    stabilityTimer = null;
    const span = open;
    if (!span || span.completedPerf === null || span.firstPostRenderPerf === null) return;
    if (now() - span.lastActivityPerf < quietMs) {
      scheduleStabilityCheck(); // activity raced the timer; wait another window
      return;
    }
    finalizeSpan(true);
  }

  // -- span lifecycle -------------------------------------------------------

  function begin(op: string): void {
    if (disposed) return;
    if (open) {
      open.superseded = true;
      finalizeSpan(false);
    }
    const t = now();
    open = {
      op,
      startedAtEpoch: Date.now(),
      startedPerf: t,
      preScrollY: readScrollY(),
      initiator: takeInitiator(),
      focusBefore: focusSnapshotOf(activeElementInRoot()),
      completedPerf: null,
      outcome: "abandoned",
      outcomeStatus: null,
      operationMs: null,
      firstPostRenderPerf: null,
      lastActivityPerf: t,
      superseded: false,
    };
    if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
    maxWaitTimer = setTimeout(() => {
      maxWaitTimer = null;
      if (open) finalizeSpan(false);
    }, maxWaitMs);
  }

  function takeInitiator(): InitiatorCapture | null {
    if (pendingInitiator) {
      const captured = pendingInitiator;
      pendingInitiator = null;
      return captured;
    }
    const active = activeElementInRoot();
    return active ? { descriptor: describeElement(active), rect: focusSnapshotOf(active)?.rect ?? null } : null;
  }

  function activeElementInRoot(): Element | null {
    const active = document.activeElement;
    return active instanceof Element && root.contains(active) ? active : null;
  }

  function noteRender(): void {
    const span = open;
    if (!span) return;
    const t = now();
    span.lastActivityPerf = t;
    if (span.completedPerf !== null) {
      if (span.firstPostRenderPerf === null) span.firstPostRenderPerf = t;
      scheduleStabilityCheck();
    }
  }

  function finalizeSpan(stabilized: boolean): void {
    const span = open;
    if (!span) return;
    open = null;
    if (stabilityTimer !== null) {
      clearTimeout(stabilityTimer);
      stabilityTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }

    const postScrollY = readScrollY();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const focusAfter = focusSnapshotOf(activeElementInRoot());

    const alertEls = Array.from(root.querySelectorAll<HTMLElement>(ALERT_SELECTOR));
    const alerts: AlertSnapshot[] = alertEls.slice(0, MAX_ALERT_SNAPSHOTS).map((el) => {
      let rect: RectSnapshot | null = null;
      try {
        rect = rectSnapshot(el.getBoundingClientRect());
      } catch {
        rect = null;
      }
      return {
        text: alertText(el),
        visible: rect !== null && isRectInViewport(rect, viewportWidth, viewportHeight),
        rect,
      };
    });

    const t = now();
    settled.push({
      op: span.op,
      startedAt: span.startedAtEpoch,
      preScrollY: span.preScrollY,
      postScrollY,
      scrollDelta: span.preScrollY !== null && postScrollY !== null ? postScrollY - span.preScrollY : null,
      viewportWidth,
      viewportHeight,
      initiatorDescriptor: span.initiator?.descriptor ?? null,
      initiatorRect: span.initiator?.rect ?? null,
      focusBefore: span.focusBefore,
      focusAfter,
      focusRestored: span.focusBefore && focusAfter
        ? span.focusBefore.descriptor === focusAfter.descriptor
        : null,
      operationMs: span.operationMs,
      renderToStableMs: span.firstPostRenderPerf !== null ? t - span.firstPostRenderPerf : null,
      outcome: span.completedPerf !== null ? span.outcome : "abandoned",
      outcomeStatus: span.outcomeStatus,
      alertCount: alertEls.length,
      anyAlertVisible: alerts.some((a) => a.visible),
      alerts,
      stabilized,
      superseded: span.superseded,
    });
  }

  // -- public surface -------------------------------------------------------

  const api: MutationContinuity = {
    wrapHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T {
      const out: Record<string, (...args: never[]) => unknown> = {};
      for (const key of Object.keys(handlers)) {
        const original = handlers[key];
        out[key] = (...args: never[]) => {
          begin(key);
          try {
            return original(...args);
          } finally {
            pendingInitiator = null;
          }
        };
      }
      return out as T;
    },

    noteRender,

    records: () => settled,

    drain: () => settled.splice(0, settled.length),

    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (open) finalizeSpan(false);
      if (stabilityTimer !== null) clearTimeout(stabilityTimer);
      if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
      observer.disconnect();
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetchRef;
      }
      for (const type of EVENT_TYPES) {
        root.removeEventListener(type, captureInitiator, true);
        root.removeEventListener(type, clearInitiator, false);
      }
      delete window.__paperclipsContinuity;
    },
  };

  window.__paperclipsContinuity = api;
  return api;
}
