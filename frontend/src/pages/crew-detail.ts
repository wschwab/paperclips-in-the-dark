import { Effect } from "effect";
import { ApiError, DecodeError, getCrew } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";

function renderCrewDetail(c: Crew): HTMLElement {
  return el(
    "section",
    { className: "crew-detail" },
    el(
      "div",
      { className: "crew-header" },
      el("h1", {}, c.name),
      el("p", { className: "crew-type" }, c.crewTypeName),
    ),
    el(
      "div",
      { className: "crew-basics" },
      el("h2", {}, "Details"),
      el("dl", {},
        el("dt", {}, "Lair"),
        el("dd", {}, c.lair || "(not set)"),
        el("dt", {}, "Hunting Grounds"),
        el("dd", {}, c.huntingGrounds || "(not set)"),
        el("dt", {}, "Reputation"),
        el("dd", {}, c.reputation || "(not set)"),
      ),
    ),
    el(
      "div",
      { className: "crew-status" },
      el("h2", {}, "Status"),
      el("dl", {},
        el("dt", {}, "Tier"),
        el("dd", {}, String(c.tier)),
        el("dt", {}, "Hold"),
        el("dd", {}, c.hold),
        el("dt", {}, "Heat"),
        el("dd", {}, `${c.heat.current} / ${c.heat.max}`),
        el("dt", {}, "Wanted"),
        el("dd", {}, `${c.wanted.current} / ${c.wanted.max}`),
        el("dt", {}, "Rep"),
        el("dd", {}, `${c.rep.current} / ${c.rep.max}`),
      ),
    ),
    el(
      "div",
      { className: "crew-fund" },
      el("h2", {}, "Fund"),
      el("dl", {},
        el("dt", {}, "Coin"),
        el("dd", {}, String(c.coin)),
        el("dt", {}, "Stash"),
        el("dd", {}, String(c.stash)),
      ),
    ),
    el(
      "div",
      { className: "crew-notes" },
      el("h2", {}, "Notes"),
      el("p", {}, c.notes || "(no notes)"),
    ),
  );
}

function renderError(message: string): HTMLElement {
  return el(
    "section",
    { className: "crew-detail-error" },
    el("h1", {}, "Crew"),
    el("p", { className: "error", role: "alert" }, message),
  );
}

function renderLoading(): HTMLElement {
  return el(
    "section",
    { className: "crew-detail-loading" },
    el("h1", {}, "Crew"),
    el("p", {}, "Loading…"),
  );
}

/**
 * Mount the crew detail page into `root` for the given ID.
 * Returns a disposer.
 */
export function mountCrewDetailPage(
  root: HTMLElement,
  crewId: string,
): () => void {
  let cancelled = false;
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const program = Effect.gen(function* () {
    const crew = yield* getCrew(crewId);
    return crew;
  });

  void Effect.runPromise(
    Effect.match(program, {
      onFailure: (err) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        const msg =
          err instanceof ApiError
            ? `Failed to reach /api/crews/${crewId} (${err.status}): ${err.body}`
            : err instanceof DecodeError
              ? `Invalid crew response: ${err.message}`
              : String(err);
        setChildren(root, renderError(msg));
      },
      onSuccess: (crew) => {
        if (cancelled) return;
        root.setAttribute("aria-busy", "false");
        setChildren(root, renderCrewDetail(crew));
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
