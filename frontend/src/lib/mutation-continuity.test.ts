// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  installMutationContinuity,
  rectSnapshot,
  isRectInViewport,
  describeElement,
} from "./mutation-continuity.js";

// Helpers
// ---------------------------------------------------------------------------

const QUIET_MS = 40;
const MAX_WAIT_MS = 800;

/** Drain pending microtasks (fetch stubs, MutationObserver callbacks). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function jsonResponse(ok: boolean, status: number): Response {
  return { ok, status, text: async () => "{}" } as unknown as Response;
}

/** Stub window.fetch keyed by substring match against the request URL. */
function stubFetch(routes: Array<{ match: string; respond: () => Promise<Response> }>): void {
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    const hit = routes.find((r) => url.includes(r.match));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return hit.respond();
  }) as typeof window.fetch;
}

/** Pin a synthetic bounding box on an element (happy-dom reports zeros). */
function pinRect(el: Element, box: Partial<DOMRect>): void {
  const full = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
  el.getBoundingClientRect = () => ({ ...full, ...box }) as DOMRect;
}

let root: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  window.__paperclipsContinuity?.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("rectSnapshot", () => {
  it("copies the numeric geometry fields", () => {
    const snap = rectSnapshot({
      x: 1, y: 2, width: 30, height: 12, top: 2, right: 31, bottom: 14, left: 1,
    } as DOMRect);
    expect(snap).toEqual({
      x: 1, y: 2, width: 30, height: 12, top: 2, right: 31, bottom: 14, left: 1,
    });
  });
});

describe("isRectInViewport", () => {
  const vw = 1024;
  const vh = 768;

  it("true for a rect fully inside the viewport", () => {
    expect(isRectInViewport(
      { x: 10, y: 10, width: 50, height: 20, top: 10, right: 60, bottom: 30, left: 10 },
      vw, vh,
    )).toBe(true);
  });

  it("false for a rect entirely below the fold", () => {
    expect(isRectInViewport(
      { x: 10, y: 900, width: 50, height: 20, top: 900, right: 60, bottom: 920, left: 10 },
      vw, vh,
    )).toBe(false);
  });

  it("true for a partially clipped rect", () => {
    expect(isRectInViewport(
      { x: 10, y: 760, width: 50, height: 40, top: 760, right: 60, bottom: 800, left: 10 },
      vw, vh,
    )).toBe(true);
  });

  it("false for a zero-size rect", () => {
    expect(isRectInViewport(
      { x: 10, y: 10, width: 0, height: 0, top: 10, right: 10, bottom: 10, left: 10 },
      vw, vh,
    )).toBe(false);
  });
});

describe("describeElement", () => {
  it("prefers aria-label and names the nearest data-section", () => {
    const section = document.createElement("div");
    section.setAttribute("data-section", "monitor");
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Stress 3");
    section.append(btn);
    root.append(section);
    expect(describeElement(btn)).toBe("button[Stress 3]@monitor");
  });

  it("falls back to a text snippet without a section", () => {
    const btn = document.createElement("button");
    btn.textContent = "End score";
    root.append(btn);
    expect(describeElement(btn)).toBe('button["End score"]@-');
  });
});

// ---------------------------------------------------------------------------
// Recorder lifecycle
// ---------------------------------------------------------------------------

describe("installMutationContinuity", () => {
  it("records a successful scrolled mutation end-to-end", async () => {
    let scrollY = 120;
    stubFetch([{ match: "/ops/stress.add", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root,
      quietMs: QUIET_MS,
      maxWaitMs: MAX_WAIT_MS,
      readScrollY: () => scrollY,
    });

    const box = document.createElement("button");
    box.setAttribute("aria-label", "Stress 4");
    pinRect(box, { x: 8, y: 300, width: 16, height: 16, top: 300, right: 24, bottom: 316, left: 8 });
    root.append(box);

    const handlers = {
      onStressTrack: () => {
        void window.fetch("/api/characters/pc1/ops/stress.add", { method: "POST" });
      },
    };
    const wrapped = api.wrapHandlers(handlers);
    box.addEventListener("click", () => wrapped.onStressTrack());

    scrollY = 140;
    box.click();
    expect(api.records()).toHaveLength(0); // still open

    await flushMicrotasks();
    root.append(document.createElement("p")); // simulated post-mutation render
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const records = api.records();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.op).toBe("onStressTrack");
    expect(rec.outcome).toBe("success");
    expect(rec.outcomeStatus).toBe(200);
    expect(rec.preScrollY).toBe(140);
    expect(rec.postScrollY).toBe(140);
    expect(rec.scrollDelta).toBe(0);
    expect(rec.operationMs).not.toBeNull();
    expect(rec.renderToStableMs).not.toBeNull();
    expect(rec.stabilized).toBe(true);
    expect(rec.superseded).toBe(false);
    expect(rec.initiatorDescriptor).toBe("button[Stress 4]@-");
    expect(rec.initiatorRect?.width).toBe(16);
    expect(rec.focusBefore).toBeNull(); // nothing focused
    expect(rec.focusAfter).toBeNull();
    expect(rec.focusRestored).toBeNull();
    expect(rec.alertCount).toBe(0);
    expect(rec.anyAlertVisible).toBe(false);
  });

  it("captures pre/post scroll drift", async () => {
    let scrollY = 900;
    stubFetch([{ match: "/ops/x", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => scrollY,
    });
    const handlers = api.wrapHandlers({
      onThing: () => { void window.fetch("/api/characters/pc1/ops/x", { method: "POST" }); },
    });

    scrollY = 905;
    handlers.onThing();
    await flushMicrotasks();
    root.append(document.createElement("span"));
    await flushMicrotasks();
    scrollY = 0; // the discontinuity under measurement
    vi.advanceTimersByTime(QUIET_MS + 10);

    const [rec] = api.records();
    expect(rec.preScrollY).toBe(905);
    expect(rec.postScrollY).toBe(0);
    expect(rec.scrollDelta).toBe(-905);
  });

  it("never treats GET completions as the operation (refresh probes are ignored)", async () => {
    stubFetch([{ match: "caps", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const handlers = api.wrapHandlers({
      onLocal: () => { void window.fetch("/api/characters/pc1/caps"); }, // GET
    });
    handlers.onLocal();

    await flushMicrotasks();
    vi.advanceTimersByTime(MAX_WAIT_MS + QUIET_MS);

    const [rec] = api.records();
    expect(rec.outcome).toBe("abandoned");
    expect(rec.operationMs).toBeNull();
    expect(rec.outcomeStatus).toBeNull();
    expect(rec.superseded).toBe(false);
  });

  it("records failure outcome, HTTP status, and alert visibility", async () => {
    stubFetch([{ match: "/ops/fail", respond: async () => jsonResponse(false, 422) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const handlers = api.wrapHandlers({
      onFail: () => { void window.fetch("/api/characters/pc1/ops/fail", { method: "POST" }); },
    });
    handlers.onFail();

    await flushMicrotasks();
    // Simulated post-failure render: one alert in view, one far below the fold.
    const seen = document.createElement("p");
    seen.className = "error";
    seen.setAttribute("role", "alert");
    seen.textContent = "Could not apply stress";
    pinRect(seen, { x: 0, y: 600, width: 400, height: 28, top: 600, right: 400, bottom: 628, left: 0 });
    const unseen = document.createElement("p");
    unseen.className = "notice";
    unseen.textContent = "Sheet refreshed because it changed elsewhere";
    pinRect(unseen, { x: 0, y: 5000, width: 400, height: 28, top: 5000, right: 400, bottom: 5028, left: 0 });
    root.append(seen, unseen);
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const [rec] = api.records();
    expect(rec.outcome).toBe("failure");
    expect(rec.outcomeStatus).toBe(422);
    expect(rec.alertCount).toBe(2);
    expect(rec.anyAlertVisible).toBe(true);
    expect(rec.alerts.map((a) => a.visible)).toEqual([true, false]);
    expect(rec.alerts[0].text).toContain("stress");
  });

  it("keeps the first completion when follow-up requests land in the same span", async () => {
    stubFetch([
      { match: "/ops/undo", respond: async () => jsonResponse(true, 200) },
      { match: "/api/other", respond: async () => jsonResponse(true, 204) },
    ]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const handlers = api.wrapHandlers({
      onUndo: () => {
        void window.fetch("/api/characters/pc1/ops/undo", { method: "POST" });
        void window.fetch("/api/other", { method: "POST" }); // trailing probe
      },
    });
    handlers.onUndo();

    await flushMicrotasks();
    root.append(document.createElement("i"));
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const [rec] = api.records();
    expect(rec.outcome).toBe("success");
    expect(rec.outcomeStatus).toBe(200);
  });

  it("force-finalizes a superseded span and starts a fresh one", async () => {
    let release!: () => void;
    stubFetch([
      {
        match: "/ops/slow",
        respond: () => new Promise<Response>((resolve) => { release = () => resolve(jsonResponse(true, 200)); }),
      },
      { match: "/ops/fast", respond: async () => jsonResponse(true, 200) },
    ]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const handlers = api.wrapHandlers({
      onSlow: () => { void window.fetch("/api/ops/slow", { method: "POST" }); },
      onFast: () => { void window.fetch("/api/ops/fast", { method: "POST" }); },
    });

    handlers.onSlow();
    handlers.onFast(); // supersedes the still-open slow span

    await flushMicrotasks();
    root.append(document.createElement("b"));
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const records = api.records();
    expect(records).toHaveLength(2);
    const [slow, fast] = records;
    expect(slow.op).toBe("onSlow");
    expect(slow.superseded).toBe(true);
    expect(slow.stabilized).toBe(false);
    expect(fast.op).toBe("onFast");
    expect(fast.superseded).toBe(false);
    expect(fast.outcome).toBe("success");

    release(); // the late answer must not resurrect the closed span
    await flushMicrotasks();
    expect(api.records()).toHaveLength(2);
  });

  it("tracks focused-element rects and restoration across a replaced control", async () => {
    stubFetch([{ match: "/ops/save", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });

    const field = document.createElement("input");
    field.setAttribute("data-section-holder", "");
    field.setAttribute("aria-label", "Alias");
    pinRect(field, { x: 4, y: 40, width: 200, height: 24, top: 40, right: 204, bottom: 64, left: 4 });
    root.append(field);

    const handlers = api.wrapHandlers({
      onSave: () => { void window.fetch("/api/characters/pc1/ops/save", { method: "POST" }); },
    });
    field.focus();
    field.addEventListener("click", () => handlers.onSave());

    field.click();
    await flushMicrotasks();

    // Wholesale re-render: the focused control is replaced by a structural twin.
    const twin = document.createElement("input");
    twin.setAttribute("aria-label", "Alias");
    pinRect(twin, { x: 4, y: 44, width: 200, height: 24, top: 44, right: 204, bottom: 68, left: 4 });
    field.replaceWith(twin);
    twin.focus();
    root.append(document.createElement("em"));
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const [rec] = api.records();
    expect(rec.focusBefore?.descriptor).toBe("input[Alias]@-");
    expect(rec.focusBefore?.rect?.width).toBe(200);
    expect(rec.focusAfter?.descriptor).toBe("input[Alias]@-");
    expect(rec.focusAfter?.rect?.y).toBe(44);
    expect(rec.focusRestored).toBe(true);
  });

  it("flags focus loss when the post-mutation active element differs", async () => {
    stubFetch([{ match: "/ops/save", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const field = document.createElement("input");
    field.setAttribute("aria-label", "Alias");
    root.append(field);
    const other = document.createElement("button");
    other.setAttribute("aria-label", "Unrelated");
    root.append(other);

    const handlers = api.wrapHandlers({
      onSave: () => { void window.fetch("/api/characters/pc1/ops/save", { method: "POST" }); },
    });
    field.focus();
    handlers.onSave();
    await flushMicrotasks();
    other.focus();
    root.append(document.createElement("u"));
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    const [rec] = api.records();
    expect(rec.focusBefore?.descriptor).toBe("input[Alias]@-");
    expect(rec.focusAfter?.descriptor).toBe("button[Unrelated]@-");
    expect(rec.focusRestored).toBe(false);
  });

  it("drain() clears settled records while records() only peeks", async () => {
    stubFetch([{ match: "/ops/tap", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const handlers = api.wrapHandlers({
      onTap: () => { void window.fetch("/api/ops/tap", { method: "POST" }); },
    });
    handlers.onTap();
    await flushMicrotasks();
    root.append(document.createElement("s"));
    await flushMicrotasks();
    vi.advanceTimersByTime(QUIET_MS + 10);

    expect(api.records()).toHaveLength(1);
    const drained = api.drain();
    expect(drained).toHaveLength(1);
    expect(api.records()).toHaveLength(0);
    expect(api.drain()).toHaveLength(0);
  });

  it("exposes itself on window and never leaves window.fetch patched", async () => {
    const original = window.fetch;
    stubFetch([{ match: "/ops/tap", respond: async () => jsonResponse(true, 200) }]);
    const stubbed = window.fetch;
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    expect(window.__paperclipsContinuity).toBe(api);
    // The fetch patch is transient (active only inside a wrapped handler's
    // synchronous issuance window): outside it, window.fetch keeps whatever
    // was last assigned, so spies and layered instrumentation stay intact.
    expect(window.fetch).toBe(stubbed);

    const handlers = api.wrapHandlers({
      onTap: () => { void window.fetch("/api/ops/tap", { method: "POST" }); },
    });
    expect(window.fetch).toBe(stubbed); // not yet inside a span
    handlers.onTap();
    expect(window.fetch).toBe(stubbed); // boundary closed again

    api.dispose();
    expect(window.fetch).toBe(stubbed);
    expect(original).toBeDefined();
    expect(window.__paperclipsContinuity).toBeUndefined();
  });

  it("ignores handler invocations after dispose()", async () => {
    stubFetch([{ match: "/ops/tap", respond: async () => jsonResponse(true, 200) }]);
    const api = installMutationContinuity({
      root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0,
    });
    const wrapped = api.wrapHandlers({
      onTap: () => { void window.fetch("/api/ops/tap", { method: "POST" }); },
    });
    api.dispose();
    expect(() => wrapped.onTap()).not.toThrow();
    await flushMicrotasks();
    vi.advanceTimersByTime(MAX_WAIT_MS + QUIET_MS);
    expect(api.records()).toHaveLength(0);
  });

  it("rejects a second concurrent install", () => {
    installMutationContinuity({ root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0 });
    expect(() =>
      installMutationContinuity({ root, quietMs: QUIET_MS, maxWaitMs: MAX_WAIT_MS, readScrollY: () => 0 }),
    ).toThrow(/already installed/);
  });
});
