/** Ephemeral form snapshots for passive projections, never mutation/navigation renders. */
type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
interface FormDraft {
  key: string;
  focused: boolean;
  value: string;
  checked: boolean | null;
  selected: string[] | null;
  selection: { start: number; end: number; direction: "forward" | "backward" | "none" } | null;
}

/** Label identity is scoped to the sheet section; duplicate controls keep their own ordinal. */
function formFields(root: HTMLElement): Map<string, FormField> {
  const fields = new Map<string, FormField>();
  const occurrences = new Map<string, number>();
  for (const field of root.querySelectorAll<FormField>("input, textarea, select")) {
    if (field instanceof HTMLInputElement && ["file", "hidden", "button", "submit", "reset"].includes(field.type)) continue;
    const section = field.closest("[data-section]")?.getAttribute("data-section") ?? "";
    const row = field.closest("[data-focus-key]")?.getAttribute("data-focus-key") ?? "";
    const identity = JSON.stringify([section, row, field.tagName,
      field instanceof HTMLInputElement ? field.type : "",
      field.id, field.getAttribute("name"), field.getAttribute("aria-label"), field.getAttribute("placeholder")]);
    const ordinal = occurrences.get(identity) ?? 0;
    occurrences.set(identity, ordinal + 1);
    fields.set(`${identity}:${ordinal}`, field);
  }
  return fields;
}

export function captureFormDrafts(root: HTMLElement): FormDraft[] {
  return [...formFields(root)].map(([key, field]) => {
    let selection: FormDraft["selection"] = null;
    if (field === document.activeElement && !(field instanceof HTMLSelectElement) && field.selectionStart !== null && field.selectionEnd !== null) {
      selection = { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection ?? "none" };
    }
    return {
      key, value: field.value, focused: field === document.activeElement,
      checked: field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio") ? field.checked : null,
      selected: field instanceof HTMLSelectElement ? [...field.selectedOptions].map((option) => option.value) : null,
      selection,
    };
  });
}

/** Run after normal focus restoration, so restoring a value does not discard its caret/range. */
export function restoreFormDrafts(root: HTMLElement, drafts: readonly FormDraft[]): void {
  const fields = formFields(root);
  for (const draft of drafts) {
    const field = fields.get(draft.key);
    if (!field) continue;
    if (draft.focused) field.focus({ preventScroll: true });
    if (field instanceof HTMLSelectElement) {
      const selected = draft.selected;
      if (!selected || !selected.every((value) => [...field.options].some((option) => option.value === value))) continue;
      for (const option of field.options) option.selected = selected.includes(option.value);
    } else {
      field.value = draft.value;
      if (field instanceof HTMLInputElement && draft.checked !== null) field.checked = draft.checked;
      if (draft.selection) field.setSelectionRange(draft.selection.start, draft.selection.end, draft.selection.direction);
    }
  }
}
