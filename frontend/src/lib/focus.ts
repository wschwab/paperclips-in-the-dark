/**
 * Focus restoration across wholesale re-renders (FV-012).
 *
 * The detail pages rebuild the entire sheet through `setChildren` after every
 * mutation, which destroys the focused control and drops keyboard focus to
 * <body>. To fix this the page render wrappers capture the focused control's
 * position *before* the render and re-apply it *after* the render:
 *
 * - position = the name of the nearest `[data-section]` ancestor (a stable
 *   top-level sheet block) + the control's ordinal among that section's
 *   focusable controls + the section's focusable count;
 * - after rendering we focus the control at the same ordinal again. When the
 *   sheet structure is unchanged this restores the triggering control
 *   (success, failure, stale refresh); when a list changed, the ordinal lands
 *   on the next sibling's control after a deletion or on the newly inserted
 *   item's control (or the add-row continuation control) after an add;
 * - controls that sit in a form that closes on save (dossier/profile fields,
 *   vice editor, cohort editor) carry a stable `data-focus-key` on both the
 *   editing and read rows; the key takes priority and lands on the replaced
 *   row's first control (e.g. Save → the field's Edit button);
 * - while the target is disabled (the in-flight loading render) the request
 *   stays pending so the post-mutation render can fulfil it.
 */

export interface FocusTarget {
  /** nearest [data-section] ancestor name; null = the page root is the scope */
  section: string | null;
  /** stable key of the focused control or its nearest [data-focus-key] row */
  key: string | null;
  /** index of the focused control among the scope's focusable controls */
  ordinal: number;
  /** scope's focusable count at capture time (structure fingerprint) */
  count: number;
}

const FOCUSABLE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[tabindex]",
].join(", ");

/**
 * Structural focusability: the element can receive focus when enabled.
 * Disabled controls still count so ordinals and counts stay stable across the
 * loading renders that disable the whole section.
 */
function isFocusableCandidate(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.getAttribute("tabindex") === "-1") return false;
  if (
    node instanceof HTMLInputElement ||
    node instanceof HTMLSelectElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLButtonElement
  ) {
    return true;
  }
  if (node.tagName === "A" && node.hasAttribute("href")) return true;
  return node.hasAttribute("tabindex");
}

/** All focusable descendants in document order (disabled controls included). */
function allFocusables(scope: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of scope.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (isFocusableCandidate(el)) out.push(el);
  }
  return out;
}

/** Enabled focusable descendants in document order. */
function enabledFocusables(scope: HTMLElement): HTMLElement[] {
  return allFocusables(scope).filter((el) => !el.hasAttribute("disabled"));
}

/**
 * Capture the currently focused control's position inside `root`. Returns
 * null when nothing inside the page is focused (e.g. initial load).
 */
export function captureFocusTarget(root: HTMLElement): FocusTarget | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const sectionEl = active.closest<HTMLElement>("[data-section]");
  const scope = sectionEl ?? root;
  const key = active.closest<HTMLElement>("[data-focus-key]")?.getAttribute("data-focus-key") ?? null;
  const focusables = allFocusables(scope);
  const ordinal = focusables.indexOf(active);
  if (ordinal === -1) return null;
  return {
    section: sectionEl ? sectionEl.getAttribute("data-section") : null,
    key,
    ordinal,
    count: focusables.length,
  };
}

/**
 * Re-apply a captured focus target after the page re-rendered. Returns true
 * when focus was placed (the request is fulfilled), false when the target is
 * still disabled or the scope is gone (keep the request pending).
 */
export function applyFocusTarget(root: HTMLElement, target: FocusTarget): boolean {
  const scope = target.section
    ? root.querySelector<HTMLElement>(`[data-section="${target.section}"]`)
    : root;
  if (!scope) return false;

  // Keyed rows (forms that close on save): focus the replaced row's control.
  if (target.key) {
    const keyed = scope.querySelector<HTMLElement>(`[data-focus-key="${target.key}"]`);
    if (keyed) {
      if (isFocusableCandidate(keyed)) {
        keyed.focus();
        return true;
      }
      const first = enabledFocusables(keyed)[0];
      if (first) {
        first.focus();
        return true;
      }
      return false; // row present but still disabled (loading render)
    }
    // The keyed row was deleted — fall through to ordinal restore.
  }

  const focusables = allFocusables(scope);
  if (focusables.length === target.count) {
    // Same structure as the capture: the control sits at the same ordinal.
    const el = focusables[target.ordinal];
    if (el && !el.hasAttribute("disabled")) {
      el.focus();
      return true;
    }
    return false; // still disabled — in-flight loading render
  }

  // Structure changed (list mutated / form closed): restore by ordinal and
  // scan to the nearest enabled control when the slot changed or shrank.
  const el = focusables[target.ordinal];
  if (el && !el.hasAttribute("disabled")) {
    el.focus();
    return true;
  }
  for (let i = target.ordinal + 1; i < focusables.length; i++) {
    const candidate = focusables[i]!;
    if (!candidate.hasAttribute("disabled")) {
      candidate.focus();
      return true;
    }
  }
  for (let i = Math.min(target.ordinal, focusables.length - 1); i >= 0; i--) {
    const candidate = focusables[i]!;
    if (!candidate.hasAttribute("disabled")) {
      candidate.focus();
      return true;
    }
  }
  return false;
}
