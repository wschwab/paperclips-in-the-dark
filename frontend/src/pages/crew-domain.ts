import {
  ApiError,
  OpError,
  DecodeError,
  opErrorFriendlyText,
  transportErrorText,
  decodeErrorText,
} from "../api/client.js";
import type { Crew } from "../schema/crew.js";

/**
 * Crew sheet domain helpers (ARCH-02): pure functions extracted from the
 * crew-detail page module — tier formatting, game-data extraction, claims
 * graph normalization, and per-error-class copy. No DOM, no Effect
 * transport, no page state.
 */

/** Friendly copy per error class (FV-023/FV-024): typed op errors map known
 * codes to user copy, transport/decode failures get their own distinct copy;
 * never raw body/DTO/parser text. */
export function opErrorText(err: unknown): string {
  if (err instanceof OpError) {
    if (err.error.code === "DUPLICATE") {
      return "A contact with that name already exists";
    }
    if (err.error.code === "NOT_FOUND") {
      return "Not on this sheet (removed elsewhere?)";
    }
    if (err.error.code === "ABILITY_MAXED") {
      return "That ability is already taken to its limit";
    }
    if (err.error.code === "UPGRADE_MAXED") {
      return "All of that upgrade's boxes are already marked";
    }
    return opErrorFriendlyText(err);
  }
  if (err instanceof ApiError) {
    return transportErrorText(err);
  }
  if (err instanceof DecodeError) {
    return decodeErrorText(err);
  }
  return String(err);
}

// CONTRACT-04 (2026-08-25): Tier renders in Roman numerals like the printed
// crew sheet — 0 stays "0"; a legacy value above the printed scale falls
// back to decimal digits. Pure display: the wire format is the DTO integer.
// CONTRACT-04 review fix: numeral rendering derives from the loaded
// capabilities tierMax (settings-derived server-side). Requires a positive
// finite tierMax before Roman formatting; without one, renders decimal.
const ROMAN_PAIRS: ReadonlyArray<[number, string]> = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function toRoman(n: number): string {
  let result = "";
  for (const [value, numeral] of ROMAN_PAIRS) {
    while (n >= value) { result += numeral; n -= value; }
  }
  return result;
}
export const formatTier = (tier: number, tierMax?: number | null): string => {
  // Render decimal only when an explicit cap is provided AND exceeded.
  // Otherwise, always render Roman — the UI fallback when capabilities
  // haven't loaded yet. Tier 0 renders as decimal "0".
  if (tier < 1) return String(tier);
  if (typeof tierMax === "number" && tier > tierMax) return String(tier);
  return toRoman(tier);
};

/**
 * The crew type's Reputations (game data) — the F2ac reputation dropdown
 * source. Same preferred/fallback shape as extractCrewAbilities:
 * per-crew-type endpoint first, CrewTypes list (find-by-name) otherwise.
 * Returns [] when neither source has it (the dropdown degrades to a
 * read-only value row).
 */
export function extractReputations(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): string[] {
  if (crewTypeData && Array.isArray(crewTypeData.Reputations)) {
    return (crewTypeData.Reputations as unknown[]).filter(
      (r): r is string => typeof r === "string",
    );
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.Reputations)) {
      return (found.Reputations as unknown[]).filter(
        (r): r is string => typeof r === "string",
      );
    }
  }
  return [];
}

/**
 * Canonical BitD cohort type lists. The Ada backend serves the raw
 * {stem}-crews.json game-data file, which carries the per-crew-type
 * Reputations but not the top-level cohort lists, so these task-specified
 * values are the fallback when the game-data keys are absent (the UI must
 * stay usable live). When a game provides CohortGangTypes / CohortExpertTypes
 * the game-data arrays win.
 */
const COHORT_GANG_TYPES = ["Adepts", "Rooks", "Rovers", "Skulls", "Thugs"];
const COHORT_EXPERT_TYPES = [
  "Doctor",
  "Investigator",
  "Occultist",
  "Assassin",
  "Spy",
  "Custom",
];

/** Cohort gang-type options: game-data CohortGangTypes, else the canonical
 * list (never empty — the add/edit forms need a working menu). */
export function extractCohortGangTypes(
  crewGameData: Record<string, unknown> | null,
): string[] {
  if (crewGameData && Array.isArray(crewGameData.CohortGangTypes)) {
    const values = (crewGameData.CohortGangTypes as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    if (values.length > 0) return values;
  }
  return [...COHORT_GANG_TYPES];
}

/** Cohort expert-type options: game-data CohortExpertTypes, else the
 * canonical list. */
export function extractCohortExpertTypes(
  crewGameData: Record<string, unknown> | null,
): string[] {
  if (crewGameData && Array.isArray(crewGameData.CohortExpertTypes)) {
    const values = (crewGameData.CohortExpertTypes as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
    if (values.length > 0) return values;
  }
  return [...COHORT_EXPERT_TYPES];
}

/** Split a comma-separated input into trimmed non-empty items (edges/flaws). */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Order-sensitive array equality for the cohort edges/flaws diff. */
export function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The crew type's SpecialAbilities (game data): from the per-crew-type
 * endpoint response or (fallback) the CrewTypes list from
 * /api/games/{stem}/crews. Each entry carries { Name, TimesTakeable,
 * Description }. Returns [] when neither source has it (graceful
 * degradation). The current Ada backend answers 404 for the per-crew-type
 * GET (its conformance case accepts [200, 404]), so the fallback is the
 * path the live probe exercises.
 */
export function extractCrewAbilities(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Array<Record<string, unknown>> {
  if (crewTypeData && Array.isArray(crewTypeData.SpecialAbilities)) {
    return crewTypeData.SpecialAbilities as Array<Record<string, unknown>>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.SpecialAbilities)) {
      return found.SpecialAbilities as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/**
 * The crew type's Upgrades (game data) — same source shape and fallback
 * logic as extractCrewAbilities. Each entry carries { Name, TotalBoxes,
 * Description }.
 */
export function extractCrewUpgrades(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Array<Record<string, unknown>> {
  if (crewTypeData && Array.isArray(crewTypeData.Upgrades)) {
    return crewTypeData.Upgrades as Array<Record<string, unknown>>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && Array.isArray(found.Upgrades)) {
      return found.Upgrades as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** TotalBoxes from game data (never hardcoded); defaults to 1 when absent. */
export function upgradeTotalBoxes(upgrade: Record<string, unknown> | undefined): number {
  return upgrade && typeof upgrade.TotalBoxes === "number" ? upgrade.TotalBoxes : 1;
}

/** Description from game data, with a fallback for unknown upgrades. */
export function upgradeDescription(upgrade: Record<string, unknown> | undefined, name: string): string {
  return upgrade && typeof upgrade.Description === "string" && upgrade.Description.length > 0
    ? upgrade.Description
    : `No description available for ${name}.`;
}

/** Canonical Claims graph for the crew type: {Columns, Rows, Nodes, Edges}. */
export function extractCrewClaims(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): Record<string, unknown> | null {
  if (crewTypeData && typeof crewTypeData.Claims === "object" && crewTypeData.Claims !== null) {
    return crewTypeData.Claims as Record<string, unknown>;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && typeof (found as Record<string, unknown>).Claims === "object") {
      return (found as Record<string, unknown>).Claims as Record<string, unknown>;
    }
  }
  return null;
}

export interface ClaimNode {
  id: string;
  name: string;
  description: string;
  kind: "claim" | "turf" | "lair";
  column: number;
  row: number;
}

/** Normalize the PascalCase game-data Claims graph into frontend shapes. */
export function claimsGraph(claims: Record<string, unknown>): { nodes: ClaimNode[]; edges: Array<{ from: string; to: string }>; columns: number; rows: number } {
  const nodes = Array.isArray(claims.Nodes) ? (claims.Nodes as Array<Record<string, unknown>>) : [];
  const edges = Array.isArray(claims.Edges) ? (claims.Edges as Array<Record<string, unknown>>) : [];
  return {
    columns: typeof claims.Columns === "number" ? claims.Columns : 5,
    rows: typeof claims.Rows === "number" ? claims.Rows : 3,
    nodes: nodes.map((n) => ({
      id: typeof n.Id === "string" ? n.Id : "",
      name: typeof n.Name === "string" ? n.Name : "",
      description: typeof n.Description === "string" ? n.Description : "",
      kind: (n.Kind === "turf" || n.Kind === "lair" ? n.Kind : "claim") as ClaimNode["kind"],
      column: typeof n.Column === "number" ? n.Column : 1,
      row: typeof n.Row === "number" ? n.Row : 1,
    })),
    edges: edges
      .filter((e) => typeof e.From === "string" && typeof e.To === "string")
      .map((e) => ({ from: e.From as string, to: e.To as string })),
  };
}

/** Effective claim display fields (canonical defaults merged with overrides). */
export function effectiveClaim(
  node: ClaimNode,
  overrides: ReadonlyArray<{ claimId: string; name?: string; description?: string; effects?: ReadonlyArray<Readonly<Record<string, unknown>>> }>,
): { node: ClaimNode; name: string; description: string; customized: boolean } {
  const ov = overrides.find((o) => o.claimId === node.id);
  return {
    node,
    name: ov?.name ?? node.name,
    description: ov?.description ?? node.description,
    customized: !!ov,
  };
}

/**
 * The crew type's ExperienceTrigger (game data) — the criteria text shown
 * beneath the XP tracker. Same source shape and find-by-name fallback as
 * extractCrewAbilities: per-crew-type endpoint preferred, CrewTypes list
 * otherwise. Returns null when neither source has it (graceful
 * degradation — the criteria line is simply omitted).
 */
export function extractExperienceTrigger(
  crewTypeData: Record<string, unknown> | null,
  crewTypesData: readonly Record<string, unknown>[] | null,
  crewTypeName: string,
): string | null {
  if (crewTypeData && typeof crewTypeData.ExperienceTrigger === "string") {
    return crewTypeData.ExperienceTrigger;
  }
  if (Array.isArray(crewTypesData)) {
    const found = crewTypesData.find(
      (ct) => ct && typeof ct === "object" && ct.Name === crewTypeName,
    );
    if (found && typeof found.ExperienceTrigger === "string") {
      return found.ExperienceTrigger;
    }
  }
  return null;
}

/**
 * F4/FV-028: name the "restored state" after a successful crew undo by
 * diffing before vs after. Picks the most salient changed tracker so the
 * positive undo notice is concrete; falls back to a neutral phrase.
 */
export function describeCrewRestore(before: Crew, after: Crew): string {
  if (before.name !== after.name) {
    return `the name "${after.name || "Unnamed"}"`;
  }
  if (before.heat.current !== after.heat.current) {
    return `heat to ${after.heat.current}/${after.heat.max}`;
  }
  if (before.rep.current !== after.rep.current) {
    return `rep to ${after.rep.current}/${after.rep.max}`;
  }
  if (before.coin !== after.coin) {
    return `coin to ${after.coin}`;
  }
  if (before.stash !== after.stash) {
    return `stash to ${after.stash}`;
  }
  if (before.turf !== after.turf) {
    return `turf to ${after.turf}`;
  }
  if (before.experience.points !== after.experience.points) {
    return `XP to ${after.experience.points}/${after.experience.max}`;
  }
  return "the previous state";
}

/** Editable free-text crew fields (contract fields.update). Reputation is a
 * game-data dropdown (F2ac) and notes are a dedicated multi-note section
 * (C4/F2ac), so neither is a free-text profile field here. */
export type CrewField = "name" | "lair" | "huntingGrounds";

export const CREW_FIELD_LABELS: Record<CrewField, string> = {
  name: "Name",
  lair: "Lair",
  huntingGrounds: "Hunting grounds",
};
