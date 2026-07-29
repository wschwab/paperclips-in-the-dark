import { Effect } from "effect";
import { ApiError, DecodeError, getCrew, undoCrew, StaleRevisionError } from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";

function renderCrewDetail(c: Crew, onUndo: () => void, isUndoLoading: boolean, undoNotice: string | null = null, refreshNotice: string | null = null): HTMLElement {
  const undoButton = el(
    "button",
    {
      disabled: isUndoLoading,
      title: "Undo last change",
    },
    isUndoLoading ? "…" : "Undo last change",
  );
  undoButton.addEventListener("click", onUndo);

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
      el("p", {},
        el("a", { href: `/crew/${c.id}/history` }, "History"),
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
      refreshNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, refreshNotice)
        : null,
      undoNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, undoNotice)
        : null,
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
    el(
      "div",
      { className: "crew-actions" },
      el("h2", {}, "Actions"),
      undoButton,
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
  let currentCrew: Crew | null = null;
  let isUndoLoading = false;
  let undoNotice: string | null = null;
  let refreshNotice: string | null = null;

  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  setChildren(root, renderLoading());

  const renderDetail = () => {
    if (currentCrew) {
      setChildren(root, renderCrewDetail(currentCrew, onUndo, isUndoLoading, undoNotice, refreshNotice));
    }
  };

  const onUndo = () => {
    if (!currentCrew || isUndoLoading) return;
    isUndoLoading = true;
    undoNotice = null;
    renderDetail();

    const program = undoCrew(crewId);

    void Effect.runPromise(
      Effect.match(program, {
        onFailure: (err) => {
          if (cancelled) return;
          isUndoLoading = false;
          if (err instanceof StaleRevisionError) {
            refreshNotice = null;
            renderDetail();
            const recoverProgram = getCrew(crewId);
            void Effect.runPromise(
              Effect.match(recoverProgram, {
                onFailure: (recoverErr) => {
                  if (cancelled) return;
                  if (recoverErr instanceof ApiError) {
                    undoNotice = `Sheet refresh failed (${recoverErr.status}): ${recoverErr.body}`;
                  } else if (recoverErr instanceof DecodeError) {
                    undoNotice = `Sheet refresh failed (invalid response): ${recoverErr.message}`;
                  } else {
                    undoNotice = `Sheet refresh failed: ${String(recoverErr)}`;
                  }
                  renderDetail();
                },
                onSuccess: (crew) => {
                  if (cancelled) return;
                  currentCrew = crew;
                  refreshNotice = "Sheet refreshed because it changed elsewhere";
                  renderDetail();
                  setTimeout(() => {
                    if (!cancelled) {
                      refreshNotice = null;
                      renderDetail();
                    }
                  }, 3000);
                },
              }),
            );
          } else if (err instanceof ApiError) {
            if (err.body.startsWith("NO_HISTORY")) {
              undoNotice = "Nothing to undo — no history available";
            } else {
              undoNotice = `API error (${err.status}): ${err.body}`;
            }
            renderDetail();
          } else if (err instanceof DecodeError) {
            undoNotice = `Invalid response: ${err.message}`;
            renderDetail();
          } else {
            undoNotice = String(err);
            renderDetail();
          }
        },
        onSuccess: (crew) => {
          if (cancelled) return;
          isUndoLoading = false;
          refreshNotice = null;
          undoNotice = null;
          currentCrew = crew;
          renderDetail();
        },
      }),
    );
  };

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
        currentCrew = crew;
        renderDetail();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
