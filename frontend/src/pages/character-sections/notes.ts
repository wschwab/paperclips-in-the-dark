/**
 * renderNotesSection (ARCH-02): notes section controller, extracted verbatim from the
 * character-detail page's render pass. DOM output is unchanged except NOTES-EDIT-01:
 * a note can be edited in place (Edit → textarea with Save / Cancel; Save sends note.update).
 */
import { el } from "../../lib/dom.js";
import type { SectionCtx } from "./context.js";

export function renderNotesSection(ctx: SectionCtx): HTMLElement {
  const { state, c, handlers, anyLoading } = ctx;
  // Notes (F2ab: C4 array of entries with per-note add/edit/remove)
  const notes = c.dossier.notes;
  const entries = notes;
  const noteEntries = entries.map((n, idx) => {
    if (state.noteEdit && state.noteEdit.index === idx) {
      return renderNoteEditor(ctx, idx, state.noteEdit);
    }
    const editBtn = el("button", {
      type: "button",
      className: "note-edit-control",
      disabled: anyLoading,
      title: `Edit note ${idx + 1}`,
      "data-focus-aside": "true",
      "data-focus-key": `note-edit-${idx}`,
    }, "Edit");
    editBtn.addEventListener("click", () => handlers.onNoteEditStart(idx));
    return el("li", {
      className: "note-entry",
      style: "display: flex; gap: 0.5em; align-items: center;",
    },
      el("span", { style: "flex: 1;" }, n),
      editBtn,
      (() => {
        const rm = el("button", {
          type: "button",
          disabled: anyLoading,
          title: `Remove note ${idx + 1}`,
        }, "✕");
        rm.addEventListener("click", () => handlers.onNoteRemove(idx));
        return rm;
      })(),
    );
  });
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
}

/** In-place editor for one note: textarea plus Save (blank text disables it) and Cancel. */
function renderNoteEditor(ctx: SectionCtx, idx: number, edit: { index: number; text: string }): HTMLElement {
  const { handlers, anyLoading } = ctx;
  const label = idx + 1;
  const area = el("textarea", {
    "aria-label": `Edit note ${label}`,
    rows: 3,
    disabled: anyLoading,
    style: "flex: 1; min-width: 0;",
  }) as HTMLTextAreaElement;
  area.value = edit.text;
  const save = el("button", {
    type: "button",
    className: "note-edit-control",
    disabled: anyLoading || area.value.trim() === "",
    title: `Save note ${label}`,
  }, "Save");
  area.addEventListener("input", () => {
    edit.text = area.value;
    save.disabled = anyLoading || area.value.trim() === "";
  });
  save.addEventListener("click", () => handlers.onNoteEditSave(idx, area.value));
  const cancel = el("button", {
    type: "button",
    className: "note-edit-control",
    disabled: anyLoading,
    title: `Cancel note ${label} edit`,
  }, "Cancel");
  cancel.addEventListener("click", () => handlers.onNoteEditCancel());
  queueMicrotask(() => area.focus());
  return el("li", {
    "data-focus-key": `note-edit-${idx}`,
    className: "note-entry note-editing",
    style: "display: flex; flex-direction: column; gap: 0.5em; margin: 0.25em 0;",
  },
    area,
    el("div", { className: "note-edit-actions", style: "display: flex; gap: 0.5em;" }, save, cancel),
  );
}
