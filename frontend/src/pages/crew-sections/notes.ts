/**
 * renderCrewNotesSection (ARCH-02): Notes section controller, extracted verbatim from
 * the crew-detail page's render pass. DOM output is unchanged except NOTES-EDIT-01:
 * a note can be edited in place (Edit → textarea with Save / Cancel; Save sends note.update).
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
  // note.add / note.remove (index-based removal). Labels are 1-based; op indexes are 0-based.
  const notesEntries = c.notes;
  const noteList = notesEntries.length > 0
    ? el(
        "ul",
        { className: "note-list", style: "list-style: none; padding: 0; margin: 0 0 0.5em 0;" },
        ...notesEntries.map((note, idx) => {
          if (state.noteEdit && state.noteEdit.index === idx) {
            return renderCrewNoteEditor(state, idx, state.noteEdit);
          }
          const editBtn = el("button", {
            type: "button",
            className: "note-edit-control",
            disabled: state.anyLoading,
            "aria-label": `Edit note ${idx + 1}`,
            title: `Edit note ${idx + 1}`,
            "data-focus-aside": "true",
            "data-focus-key": `note-edit-${idx}`,
          }, "Edit");
          editBtn.addEventListener("click", () => handlers.onNoteEditStart(idx));
          const removeBtn = el("button", {
            type: "button",
            disabled: state.anyLoading,
            "aria-label": `Remove note ${idx + 1}`,
            title: `Remove note ${idx + 1}`,
          }, "✕");
          removeBtn.addEventListener("click", () => handlers.onNoteRemove(idx));
          return el(
            "li",
            { className: "note-entry", style: "display: flex; gap: 0.5em; align-items: flex-start; margin: 0.25em 0;" },
            el("span", { className: "note-text", style: "flex: 1;" }, note),
            editBtn,
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
  newNoteInput.value = state.noteDraft.text;
  newNoteInput.addEventListener("input", () => { state.noteDraft.text = newNoteInput.value; });
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

/** In-place editor for one crew note: textarea plus Save (blank text disables it) and Cancel. */
function renderCrewNoteEditor(
  state: RenderState,
  idx: number,
  edit: { index: number; text: string },
): HTMLElement {
  const { handlers } = state;
  const area = el("textarea", {
    "aria-label": `Edit note ${idx + 1}`,
    rows: 3,
    disabled: state.anyLoading,
  }) as HTMLTextAreaElement;
  area.value = edit.text;
  const save = el("button", {
    type: "button",
    className: "note-edit-control",
    title: `Save note ${idx + 1}`,
    disabled: state.anyLoading || area.value.trim() === "",
  }, "Save");
  area.addEventListener("input", () => {
    edit.text = area.value;
    save.disabled = state.anyLoading || area.value.trim() === "";
  });
  save.addEventListener("click", () => handlers.onNoteEditSave(idx, area.value));
  const cancel = el("button", {
    type: "button",
    className: "note-edit-control",
    title: `Cancel note ${idx + 1} edit`,
    disabled: state.anyLoading,
  }, "Cancel");
  cancel.addEventListener("click", () => handlers.onNoteEditCancel());
  queueMicrotask(() => area.focus());
  return el("li", { className: "note-entry note-editing", "data-focus-key": `note-edit-${idx}` },
    area,
    el("div", { className: "note-edit-actions" }, save, cancel),
  );
}
