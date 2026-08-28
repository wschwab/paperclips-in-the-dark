/**
 * renderNotesSection (ARCH-02): notes section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderNotesSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, anyLoading } = ctx;
  // Notes (F2ab: C4 array of entries with per-note add/remove; legacy
  // single string still decodes)
return   (() => {
    const notes = c.dossier.notes;
    const entries = Array.isArray(notes) ? notes : notes ? [notes] : [];
    const noteEntries = entries.map((n, idx) =>
      el("li", {
        className: "note-entry",
        style: "display: flex; gap: 0.5em; align-items: center;",
      },
        el("span", { style: "flex: 1;" }, n),
        (() => {
          const rm = el("button", {
            type: "button",
            disabled: anyLoading,
            title: `Remove note ${idx + 1}`,
          }, "✕");
          rm.addEventListener("click", () => handlers.onNoteRemove(idx));
          return rm;
        })(),
      ),
    );
    const noteInput = el("input", {
      type: "text",
      "aria-label": "New note",
      disabled: anyLoading,
      placeholder: "add a note",
    }) as HTMLInputElement;
    noteInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        handlers.onNoteAdd();
      }
    });
    const addBtn = el("button", {
      type: "button",
      disabled: anyLoading,
      title: "Add note",
    }, state.isNotesLoading ? "…" : "+ Add");
    addBtn.addEventListener("click", handlers.onNoteAdd);

    return el(
      "div",
      { className: "character-notes", "data-section": "notes" },
      el("h2", {}, "Notes"),
      entries.length > 0
        ? el("ul", { className: "note-list" }, ...noteEntries)
        : el("p", {}, "(no notes)"),
      el("div", {
        className: "note-add-row",
        style: "display: flex; gap: 0.5em; margin-top: 0.5em; align-items: center;",
      },
        noteInput,
        addBtn,
      ),
      state.notesNotice
        ? el("p", { className: "notice", style: "margin-top: 0.5em;" }, state.notesNotice)
        : null,
    );
  })();

}
