/**
 * renderCrewNotesSection (ARCH-02): Notes section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged.
 */
import { el } from "../../lib/dom.js";
import type { RenderState } from "../crew-detail.js";

export function renderCrewNotesSection(state: RenderState): HTMLElement {
  const { c, handlers } = state;
  // -- Notes (C4 / F2ac) -------------------------------------------------------
  //
  // Notes are a string[] in the DTO (FV-030: the ordinary decoder rejects
  // legacy single-string values; conversion lives only in the import/repair
  // migration path).
  // Multi-line textarea + per-entry remove; add/remove go through
  // note.add / note.remove (index-based removal, 0-based to match the op).
  const notesEntries = c.notes;
  const noteList = notesEntries.length > 0
    ? el(
        "ul",
        { className: "note-list", style: "list-style: none; padding: 0; margin: 0 0 0.5em 0;" },
        ...notesEntries.map((note, idx) => {
          const removeBtn = el("button", {
            type: "button",
            disabled: state.anyLoading,
            "aria-label": `Remove note ${idx}`,
            title: `Remove note ${idx}`,
          }, "✕");
          removeBtn.addEventListener("click", () => handlers.onNoteRemove(idx));
          return el(
            "li",
            { className: "note-entry", style: "display: flex; gap: 0.5em; align-items: flex-start; margin: 0.25em 0;" },
            el("span", { className: "note-text", style: "flex: 1;" }, note),
            removeBtn,
          );
        }),
      )
    : el("p", {}, "(no notes)");
  const newNoteInput = el("textarea", {
    "aria-label": "New note",
    rows: 3,
    disabled: state.anyLoading,
    placeholder: "Write a new note…",
  }) as HTMLTextAreaElement;
  const addNoteBtn = el("button", {
    type: "button",
    disabled: state.anyLoading,
    title: "Add note",
  }, state.isNoteLoading ? "…" : "Add note");
  addNoteBtn.addEventListener("click", handlers.onNoteAdd);

  const notesSection = el(
    "div",
    { className: "crew-notes" },
    el("h2", {}, "Notes"),
    noteList,
    el("div", { style: "display: flex; gap: 0.5em; align-items: flex-start;" },
      newNoteInput,
      addNoteBtn,
    ),
  );


  return notesSection;
}
