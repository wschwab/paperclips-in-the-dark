/**
 * CONTRACT-01 stage 3 — completion cues for the character sheet.
 *
 * Every prompt is derived from the character DTO itself (blank name/alias/
 * heritage/background/look, missing vice fields, zero abilities, no crew
 * link) — never a hardcoded checklist file. Blank follows the contract's
 * `nonBlankString` vocabulary (whitespace-only counts as unset), so the
 * cues agree with the generated completeness records.
 */

import type { Character } from "../schema/character.js";
import { isNonBlankString } from "../schema/generated/completeness.js";

export interface CompletionCue {
  /** Stable section key — dismissal identity and data attribute. */
  key: string;
  /** Visible prompt text. */
  label: string;
}

/**
 * The visible completion prompts for one character DTO, in stable sheet
 * order; empty when nothing is outstanding.
 */
export function completionCues(c: Character): readonly CompletionCue[] {
  const unset = (value: string): boolean => !isNonBlankString(value);
  const cues: CompletionCue[] = [];
  if (unset(c.dossier.name)) {
    cues.push({ key: "name", label: "Give your character a name." });
  }
  if (unset(c.dossier.alias)) {
    cues.push({ key: "alias", label: "Add an alias." });
  }
  if (unset(c.dossier.heritage.name)) {
    cues.push({ key: "heritage", label: "Choose a heritage." });
  }
  if (unset(c.dossier.background.name)) {
    cues.push({ key: "background", label: "Pick a background." });
  }
  if (unset(c.dossier.look)) {
    cues.push({ key: "look", label: "Describe your look." });
  }
  // One cue per sheet section: vice covers type, purveyor, and description.
  if (
    unset(c.dossier.vice.name) ||
    unset(c.dossier.vice.purveyor.name) ||
    unset(c.dossier.vice.description)
  ) {
    cues.push({
      key: "vice",
      label: "Choose a vice with a purveyor, and describe it.",
    });
  }
  if (c.playbook.abilities.length === 0) {
    cues.push({ key: "ability", label: "Take your first playbook ability." });
  }
  if (unset(c.dossier.crewId)) {
    cues.push({ key: "crew", label: "Join or create a crew." });
  }
  return cues;
}
