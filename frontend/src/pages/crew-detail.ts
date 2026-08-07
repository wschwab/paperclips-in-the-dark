import { Effect } from "effect";
import {
  ApiError,
  DecodeError,
  getCrew,
  undoCrew,
  crewContactAdd,
  crewContactRemove,
  factionSetStatus,
  factionRemove,
  StaleRevisionError,
} from "../api/client.js";
import { el, setChildren } from "../lib/dom.js";
import type { Crew } from "../schema/crew.js";

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

interface RenderState {
  c: Crew;
  isUndoLoading: boolean;
  isContactLoading: boolean;
  isFactionLoading: boolean;
  errorMsg: string | null;
  noticeMsg: string | null;
  undoNotice: string | null;
  refreshNotice: string | null;
  handlers: {
    onUndo: () => void;
    onContactAdd: () => void;
    onContactRemove: (name: string) => void;
    onFactionSetStatus: (name: string, status: number) => void;
    onFactionRemove: (name: string) => void;
  };
}

/** Friendly text for op-level errors (DUPLICATE / NOT_FOUND) carried in ApiError bodies. */
function opErrorText(err: ApiError): string {
  const body = err.body;
  if (body.startsWith("DUPLICATE")) {
    return "DUPLICATE: a contact with that name already exists";
  }
  if (body.startsWith("NOT_FOUND")) {
    return "NOT_FOUND: not on this sheet (removed elsewhere?)";
  }
  return `API error (${err.status}): ${body}`;
}

function renderCrewDetail(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  const anyLoading =
    state.isUndoLoading || state.isContactLoading || state.isFactionLoading;

  // -- Undo button ----------------------------------------------------------

  const undoButton = el(
    "button",
    {
      disabled: state.isUndoLoading,
      title: "Undo last change",
    },
    state.isUndoLoading ? "…" : "Undo last change",
  );
  undoButton.addEventListener("click", handlers.onUndo);

  // -- Contacts & Factions (F2y) ---------------------------------------------

  const contacts = c.contacts ?? [];
  const factions = c.factions ?? [];

  const contactEntries = contacts.map((contact) =>
    el(
      "div",
      { className: "contact-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "contact-name" }, contact.name),
      el("span", { className: "contact-profession" }, contact.profession || ""),
      el("button", {
        type: "button",
        disabled: anyLoading,
        title: `Remove contact: ${contact.name}`,
      }, "✕"),
    ),
  );
  contactEntries.forEach((entry, idx) => {
    const btn = entry.querySelector("button");
    if (btn) {
      btn.addEventListener("click", () => handlers.onContactRemove(contacts[idx]!.name));
    }
  });

  const contactNameInput = el("input", {
    type: "text",
    "aria-label": "Contact name",
    disabled: anyLoading,
    placeholder: "name",
  });
  const contactProfessionInput = el("input", {
    type: "text",
    "aria-label": "Contact profession",
    disabled: anyLoading,
    placeholder: "profession",
  });
  const addContactBtn = el("button", {
    type: "button",
    disabled: anyLoading,
    title: "Add contact",
  }, state.isContactLoading ? "…" : "+");
  addContactBtn.addEventListener("click", handlers.onContactAdd);

  const factionEntries = factions.map((faction) => {
    const statusInput = el("input", {
      type: "number",
      "aria-label": `Set status for ${faction.name}`,
      disabled: anyLoading,
      value: String(faction.status),
    }) as HTMLInputElement;
    const setBtn = el("button", {
      type: "button",
      disabled: anyLoading,
      title: `Set status for ${faction.name}`,
    }, state.isFactionLoading ? "…" : "Set");
    setBtn.addEventListener("click", () => {
      const parsed = Number.parseInt(statusInput.value, 10);
      if (Number.isNaN(parsed)) return;
      handlers.onFactionSetStatus(faction.name, parsed);
    });
    const removeBtn = el("button", {
      type: "button",
      disabled: anyLoading,
      title: `Remove faction: ${faction.name}`,
    }, "✕");
    removeBtn.addEventListener("click", () => handlers.onFactionRemove(faction.name));
    return el(
      "div",
      { className: "faction-entry", style: "display: flex; align-items: center; gap: 0.5em;" },
      el("span", { className: "faction-name" }, faction.name),
      el("span", { className: "faction-status" }, String(faction.status)),
      statusInput,
      setBtn,
      removeBtn,
    );
  });

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
      state.refreshNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.refreshNotice)
        : null,
      state.undoNotice
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.undoNotice)
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
      { className: "crew-contacts-factions" },
      el("h2", {}, "Contacts & Factions"),
      el("h3", { className: "lbl" }, "Contacts"),
      contacts.length === 0
        ? el("p", {}, "(no contacts)")
        : el("div", { className: "contact-list" }, ...contactEntries),
      el("div", { style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;" },
        contactNameInput,
        contactProfessionInput,
        addContactBtn,
      ),
      el("h3", { className: "lbl", style: "margin-top: 1em;" }, "Factions"),
      factions.length === 0
        ? el("p", {}, "(no factions)")
        : el("div", { className: "faction-list" }, ...factionEntries),
      state.errorMsg
        ? el("p", { className: "error", style: "margin-top: 1em;" }, state.errorMsg)
        : null,
      state.noticeMsg
        ? el("p", { className: "notice", style: "margin-top: 1em;" }, state.noticeMsg)
        : null,
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
  let isContactLoading = false;
  let isFactionLoading = false;
  let errorMsg: string | null = null;
  let noticeMsg: string | null = null;
  let undoNotice: string | null = null;
  let refreshNotice: string | null = null;

  const clearNotices = () => {
    errorMsg = null;
    noticeMsg = null;
    undoNotice = null;
    refreshNotice = null;
  };

  const refreshAndShowNotice = () => {
    if (!currentCrew) return;
    const recoverProgram = getCrew(crewId);
    void Effect.runPromise(
      Effect.match(recoverProgram, {
        onFailure: (recoverErr) => {
          if (cancelled) return;
          if (recoverErr instanceof ApiError) {
            errorMsg = `Sheet refresh failed (${recoverErr.status}): ${recoverErr.body}`;
          } else if (recoverErr instanceof DecodeError) {
            errorMsg = `Sheet refresh failed (invalid response): ${recoverErr.message}`;
          } else {
            errorMsg = `Sheet refresh failed: ${String(recoverErr)}`;
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
  };

  /** Shared failure path for the F2y mutation ops (mirrors character-detail). */
  const onOpFailure = (err: unknown, setLoadingFalse: () => void) => {
    if (cancelled) return;
    setLoadingFalse();
    if (err instanceof StaleRevisionError) {
      renderDetail();
      refreshAndShowNotice();
    } else if (err instanceof ApiError) {
      errorMsg = opErrorText(err);
      renderDetail();
    } else if (err instanceof DecodeError) {
      errorMsg = `Invalid response: ${err.message}`;
      renderDetail();
    } else {
      errorMsg = String(err);
      renderDetail();
    }
  };

  const renderDetail = () => {
    if (!currentCrew) return;
    setChildren(root, renderCrewDetail({
      c: currentCrew,
      isUndoLoading,
      isContactLoading,
      isFactionLoading,
      errorMsg,
      noticeMsg,
      undoNotice,
      refreshNotice,
      handlers,
    }));
  };

  const handlers = {
    onUndo: () => {
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
              refreshAndShowNotice();
            } else if (err instanceof ApiError) {
              if (err.body.startsWith("NO_HISTORY")) {
                undoNotice = "Nothing to undo — no history available";
              } else {
                errorMsg = `API error (${err.status}): ${err.body}`;
              }
              renderDetail();
            } else if (err instanceof DecodeError) {
              errorMsg = `Invalid response: ${err.message}`;
              renderDetail();
            } else {
              errorMsg = String(err);
              renderDetail();
            }
          },
          onSuccess: (crew) => {
            if (cancelled) return;
            isUndoLoading = false;
            errorMsg = null;
            noticeMsg = null;
            undoNotice = null;
            refreshNotice = null;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    // -- F2y: Contacts & Factions -------------------------------------------

    onContactAdd: () => {
      if (!currentCrew || isContactLoading) return;
      const nameInput = root.querySelector('input[aria-label="Contact name"]') as HTMLInputElement;
      const profInput = root.querySelector('input[aria-label="Contact profession"]') as HTMLInputElement;
      const name = nameInput?.value?.trim() ?? "";
      const profession = profInput?.value?.trim() ?? "";
      if (!name) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactAdd(crewId, name, profession, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onContactRemove: (name: string) => {
      if (!currentCrew || isContactLoading) return;
      isContactLoading = true;
      clearNotices();
      renderDetail();

      const program = crewContactRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isContactLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isContactLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },

    onFactionSetStatus: (name: string, status: number) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionSetStatus(crewId, name, status, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (result) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = result.crew;
            if (result.effective !== result.requested) {
              noticeMsg = `Faction status clamped to ${result.effective} (requested ${result.requested})`;
              setTimeout(() => {
                if (!cancelled) {
                  noticeMsg = null;
                  renderDetail();
                }
              }, 5000);
            }
            renderDetail();
          },
        }),
      );
    },

    onFactionRemove: (name: string) => {
      if (!currentCrew || isFactionLoading) return;
      isFactionLoading = true;
      clearNotices();
      renderDetail();

      const program = factionRemove(crewId, name, currentCrew.revision);
      void Effect.runPromise(
        Effect.match(program, {
          onFailure: (err) => onOpFailure(err, () => { isFactionLoading = false; }),
          onSuccess: (crew) => {
            if (cancelled) return;
            isFactionLoading = false;
            currentCrew = crew;
            renderDetail();
          },
        }),
      );
    },
  };

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
        currentCrew = crew;
        renderDetail();
      },
    }),
  );

  return () => {
    cancelled = true;
  };
}
