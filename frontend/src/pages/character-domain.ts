import { opErrorFriendlyText, type OpError } from "../api/client.js";
import type { Character } from "../schema/character.js";

/**
 * Character sheet domain helpers (ARCH-02): pure functions extracted from
 * the character-detail page module — dossier access, game-data extraction,
 * and per-op error copy. No DOM, no Effect transport, no page state.
 */

export type DossierField = "name" | "alias" | "look" | "notes" |
  { kind: "named"; key: "background" | "heritage" | "vice"; field: "name" | "description" };

export function getNamedValue(c: Character, key: "background" | "heritage" | "vice", field: "name" | "description"): string {
  return c.dossier[key][field];
}

export function getDossierValue(c: Character, field: DossierField): string {
  if (typeof field === "string") {
    const v = c.dossier[field];
    // notes is string[] per C4 (legacy single string still decodes)
    if (typeof v === "string") return v;
    return v.join(", ");
  }
  return getNamedValue(c, field.key, field.field);
}

export function buildDossierPayload(field: DossierField, value: string): Record<string, unknown> {
  if (typeof field === "string") return { [field]: value };
  // For named fields, send the full named object with the changed field
  return { [field.key]: { name: field.field === "name" ? value : "", description: field.field === "description" ? value : "" } };
}

/**
 * Playbook-specific Score XP text: the playbook's ExperienceCondition,
 * from the playbook endpoint response or (fallback) the game-data Playbooks
 * list. Returns null when neither source has it (graceful degradation).
 */
export function extractExperienceCondition(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): string | null {
  if (playbookData && typeof playbookData.ExperienceCondition === "string") {
    return playbookData.ExperienceCondition;
  }
  if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && typeof found.ExperienceCondition === "string") {
      return found.ExperienceCondition;
    }
  }
  return null;
}

/**
 * Playbook SpecialAbilities for the character's playbook: from the playbook
 * endpoint response or (fallback) the game-data Playbooks list. Each entry
 * carries { Name, Description, TimesTakeable }. Returns [] when neither
 * source has it (graceful degradation).
 */
export function extractSpecialAbilities(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): Array<Record<string, unknown>> {
  if (playbookData && Array.isArray(playbookData.SpecialAbilities)) {
    return playbookData.SpecialAbilities as Array<Record<string, unknown>>;
  }
  if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && Array.isArray(found.SpecialAbilities)) {
      return found.SpecialAbilities as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** CONTRACT-05: the playbook's BitS rolodex names as add-contact suggestions. */
export function extractContactNameSuggestions(
  playbookData: Record<string, unknown> | null,
): string[] {
  if (!playbookData) return [];
  const rolodex = playbookData.Rolodex;
  if (!rolodex || typeof rolodex !== "object") return [];
  const friends = (rolodex as Record<string, unknown>).Friends;
  if (!Array.isArray(friends)) return [];
  return friends.filter((f): f is string => typeof f === "string");
}

/** Game-data option lists for the heritage / background / vice dropdowns. */
export function gameDataOptions(
  gameData: Record<string, unknown> | null,
  key: "heritage" | "background" | "vice",
): Array<Record<string, unknown>> {
  if (!gameData) return [];
  const list = key === "heritage"
    ? gameData.Heritages
    : key === "background"
      ? gameData.Backgrounds
      : gameData.Vices;
  if (!Array.isArray(list)) return [];
  return list.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
}

/** Game-data description for a named option (heritage Description / background Example). */
export function gameDataDescription(
  gameData: Record<string, unknown> | null,
  key: "heritage" | "background",
  name: string,
): string | null {
  const entry = gameDataOptions(gameData, key).find((o) => o.Name === name);
  if (!entry) return null;
  const desc = key === "heritage" ? entry.Description : entry.Example;
  return typeof desc === "string" ? desc : null;
}

/** Sources (purveyor strings) for a vice name, from game data Vices[].Sources. */
export function viceSources(
  gameData: Record<string, unknown> | null,
  viceName: string,
): string[] {
  const entry = gameDataOptions(gameData, "vice").find((o) => o.Name === viceName);
  const sources = entry?.Sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter((x): x is string => typeof x === "string");
}

/** Currently active harms flattened to { intensity, description } pairs (F2ab heal picker). */
export function activeHarms(c: Character): Array<{ intensity: string; description: string }> {
  const out: Array<{ intensity: string; description: string }> = [];
  for (const level of ["lesser", "moderate", "severe", "fatal"] as const) {
    for (const desc of c.monitor.harm[level]) {
      if (desc) out.push({ intensity: level, description: desc });
    }
  }
  return out;
}

/**
 * Display description for a taken ability: prefer the DTO's stored
 * description, fall back to the game-data SpecialAbilities entry, and
 * degrade to "" when neither is available.
 */
export function abilityDescription(
  ability: { name: string; description: string },
  specialAbilities: Array<Record<string, unknown>>,
): string {
  if (ability.description) return ability.description;
  const sa = specialAbilities.find((x) => String(x.Name) === ability.name);
  return sa && typeof sa.Description === "string" ? sa.Description : "";
}

/** Friendly text for heal op-level errors (CANNOT_HEAL / NOT_FOUND). */
export function healOpErrorText(err: OpError): string {
  if (err.error.code === "CANNOT_HEAL") {
    return "Cannot heal — the healing clock isn't full yet";
  }
  if (err.error.code === "NOT_FOUND") {
    return "That harm is no longer there — the sheet refreshes with the server state";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for playbook op-level errors (ABILITY_MAXED / NOT_FOUND). */
export function playbookOpErrorText(err: OpError): string {
  if (err.error.code === "ABILITY_MAXED") {
    return "That ability is already taken to its limit";
  }
  if (err.error.code === "NOT_FOUND") {
    return "Not on this sheet (removed elsewhere?)";
  }
  return opErrorFriendlyText(err);
}

/**
 * F4/FV-028: name the "restored state" after a successful undo by diffing the
 * character before vs after. Picks the most salient changed value so the
 * positive undo notice is concrete rather than a generic "undone". Falls back
 * to a neutral phrase when nothing tracked changed shape.
 */
export function describeRestore(before: Character, after: Character): string {
  if (before.isRetired !== after.isRetired) {
    return after.isRetired ? "the retirement" : "the character (un-retired)";
  }
  if (before.dossier.name !== after.dossier.name) {
    return `the name "${after.dossier.name || "Unnamed"}"`;
  }
  if (before.monitor.stress.current !== after.monitor.stress.current) {
    return `stress to ${after.monitor.stress.current}/${after.monitor.stress.max}`;
  }
  const beforeHarm = before.monitor.harm.lesser.length + before.monitor.harm.moderate.length +
    before.monitor.harm.severe.length + before.monitor.harm.fatal.length;
  const afterHarm = after.monitor.harm.lesser.length + after.monitor.harm.moderate.length +
    after.monitor.harm.severe.length + after.monitor.harm.fatal.length;
  if (beforeHarm !== afterHarm) {
    return `${afterHarm} active harm${afterHarm === 1 ? "" : "s"}`;
  }
  if (before.monitor.trauma.traumas.length !== after.monitor.trauma.traumas.length) {
    return `${after.monitor.trauma.traumas.length} trauma history entr${after.monitor.trauma.traumas.length === 1 ? "y" : "ies"}`;
  }
  return "the previous state";
}

/** One entry of the gear add-menu (playbook Items + game SharedItems). */
export interface GearMenuItem {
  name: string;
  bulk: number;
}

/**
 * Gear add-menu source: the playbook's Items plus the game's SharedItems,
 * deduped by name (playbook wins on duplicates). Both come from game data —
 * never a hardcoded list. Falls back to the game-data Playbooks entry when
 * the playbook endpoint fetch failed (graceful degradation, like F2o/F2p).
 */
export function extractGearMenu(
  playbookData: Record<string, unknown> | null,
  gameData: Record<string, unknown> | null,
  playbookName: string,
): GearMenuItem[] {
  const byName = new Map<string, number>();
  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const entry of items) {
      if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).Name === "string") {
        const name = String((entry as Record<string, unknown>).Name);
        const bulk = typeof (entry as Record<string, unknown>).Bulk === "number"
          ? (entry as Record<string, unknown>).Bulk as number
          : 0;
        if (!byName.has(name)) byName.set(name, bulk);
      }
    }
  };
  let playbookItems: unknown = null;
  if (playbookData && Array.isArray(playbookData.Items)) {
    playbookItems = playbookData.Items;
  } else if (Array.isArray(gameData?.Playbooks)) {
    const found = (gameData!.Playbooks as Array<Record<string, unknown>>).find(
      (p) => p && typeof p === "object" && p.Name === playbookName,
    );
    if (found && Array.isArray(found.Items)) playbookItems = found.Items;
  }
  collect(playbookItems);
  collect(gameData?.SharedItems);
  return Array.from(byName, ([name, bulk]) => ({ name, bulk }));
}

/** Friendly text for gear op-level errors (COMMITMENT_LOCKED / OVER_BULK / …). */
export function gearOpErrorText(err: OpError): string {
  if (err.error.code === "COMMITMENT_LOCKED") {
    return "The commitment is locked — unlock it before changing it";
  }
  if (err.error.code === "NO_COMMITMENT") {
    return "Set a load commitment before committing gear";
  }
  if (err.error.code === "OVER_BULK") {
    return "This item would exceed your load capacity";
  }
  if (err.error.code === "DUPLICATE") {
    return "That item is already in your loadout";
  }
  if (err.error.code === "NOT_FOUND") {
    return "Not on this sheet (removed elsewhere?)";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for fund/stash op-level errors (INSUFFICIENT_FUNDS / SATCHEL_FULL / …). */
export function coinOpErrorText(err: OpError): string {
  if (err.error.code === "INSUFFICIENT_FUNDS") {
    return "Not enough coins to cover that (spend draws from the satchel first, then liquidates stash at 2:1)";
  }
  if (err.error.code === "SATCHEL_FULL") {
    return "The satchel can't hold that many coins — spend or stash some first";
  }
  return opErrorFriendlyText(err);
}

/** Friendly text for clock op-level errors (VALIDATION / NOT_FOUND). */
export function clockOpErrorText(err: OpError): string {
  if (err.error.code === "NOT_FOUND") {
    return "Clock gone (deleted elsewhere?)";
  }
  return opErrorFriendlyText(err);
}
