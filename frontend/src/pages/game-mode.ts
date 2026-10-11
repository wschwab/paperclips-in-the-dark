/**
 * Per-scoundrel game mode: pure assistance rules (GAME-MODE-03).
 *
 * Nothing here gates an operation. Mode, flow cursors and the soft downtime
 * budget are advisory: the sheet suggests work and never blocks it. Every
 * number comes from the game settings passed in (LoadMaxima,
 * DowntimeSettings, Attributes) — no maxima are hardcoded here. The enum
 * labels below are the design's declared vocabulary (contract enums), not
 * limits.
 */
import type { GameMode, ModeFlow, Downtime } from "../schema/character.js";
import { ENTANGLEMENT_BANDS, type EntanglementBandLabel, ENTANGLEMENT_ROWS } from "../data/entanglements.js";

export const MODES: readonly GameMode[] = ["free-play", "score", "downtime"];

/** Design load choices, in display order. Limits come from settings. */
export const LOAD_CHOICES = ["Light", "Normal", "Heavy"] as const;

export const SCORE_START_STEPS = ["planning", "loadout", "engagement"] as const;
export const RESOLUTION_STEPS = [
  "scoundrel-xp",
  "payoff",
  "heat",
  "entanglements",
  "crew-xp",
  "crew-rep",
] as const;

export type ScoreStartStep = (typeof SCORE_START_STEPS)[number];

/** Display names for the Resolution steps, as the approved stepper shows them. */
export const RESOLUTION_LABELS: Record<ResolutionStep, string> = {
  "scoundrel-xp": "Scoundrel XP",
  payoff: "Payoff",
  heat: "Heat",
  entanglements: "Entanglements",
  "crew-xp": "Crew XP",
  "crew-rep": "Crew Rep",
};
export type ResolutionStep = (typeof RESOLUTION_STEPS)[number];

/** Approved Planning approaches with the mockup's one-line descriptions. UI assistance only; no contract op. */
export const PLAN_APPROACHES = [
  { value: "Assault", description: "Do violence to a target." },
  { value: "Deception", description: "Lure, trick, or manipulate." },
  { value: "Stealth", description: "Trespass unseen." },
  { value: "Occult", description: "Engage a supernatural power." },
  { value: "Social", description: "Negotiate, bargain, or persuade." },
  { value: "Transport", description: "Carry cargo or people through danger." },
] as const;

/** A load level, as the Loadout popup and confirmation show it. */
export type LoadChoice = (typeof LOAD_CHOICES)[number];

/** Settings commitment key -> design load level; "none" has no level. */
export function choiceForCommitment(key: string): LoadChoice | null {
  return LOAD_CHOICES.find((c) => c.toLowerCase() === key) ?? null;
}

/** A proposed committed loadout awaiting Confirm change (Back/Leave flow cancels). */
export interface LoadoutProposal {
  commitment: LoadChoice | null;
  items: string[];
}

/** Approved downtime activity menu (contract downtimeActivity enum), in display order. */
export const DOWNTIME_ACTIVITIES = [
  { value: "acquire-asset", label: "Acquire Asset" },
  { value: "long-term-project", label: "Long-Term Project" },
  { value: "recover", label: "Recover" },
  { value: "reduce-heat", label: "Reduce Heat" },
  { value: "train", label: "Train" },
  { value: "indulge-vice", label: "Indulge Vice" },
  { value: "other", label: "Other" },
] as const;

export type DowntimeActivityValue = (typeof DOWNTIME_ACTIVITIES)[number]["value"];

/** Approved SRD links (cited in the design). */
export const SRD = {
  planning: "https://bladesinthedark.com/planning-engagement",
  advancement: "https://bladesinthedark.com/advancement",
  payoff: "https://bladesinthedark.com/payoff",
  heat: "https://bladesinthedark.com/heat",
  entanglements: "https://bladesinthedark.com/entanglements",
  downtime: "https://bladesinthedark.com/downtime-activities",
} as const;

export const ONE_PLAYER_WARNING = "Only one player should update the crew — check nobody else already has.";

type Settings = Record<string, unknown> | null;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Remaining soft budget: free + paid - spent. May be negative; never a hard cap. */
export function downtimeRemaining(d: Downtime): number {
  return d.free + d.paid - d.spent;
}

/**
 * Load allowance for a commitment from settings `LoadMaxima.CommitmentMaxBulk`, or null when absent.
 * The settings key is the design level name (Light, Normal, Heavy, Encumbered); the contract's
 * commitment is lowercase (light, normal, heavy, encumbered). Both forms are accepted.
 */
export function loadLimitFor(gameData: Settings, commitment: string): number | null {
  const load = asRecord(gameData?.LoadMaxima);
  const table = asRecord(load?.CommitmentMaxBulk);
  // Accept the design level name (Light / Normal / Heavy / Encumbered) or the contract's lowercase key.
  const LEVEL_NAMES: Record<string, string> = { light: "Light", normal: "Normal", heavy: "Heavy", encumbered: "Encumbered" };
  const level = LEVEL_NAMES[commitment.toLowerCase()] ?? null;
  const value = level === null ? table?.[commitment] : table?.[level];
  return typeof value === "number" ? value : null;
}

/** Attribute names from settings `Attributes`, in settings order. */
export function desperateAttributes(gameData: Settings): string[] {
  const list = gameData?.Attributes;
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => asRecord(a)?.Name)
    .filter((n): n is string => typeof n === "string");
}

/** Cursor set by a mode choice: Score starts at Planning; other modes clear the cursor. */
export function cursorForMode(mode: GameMode): ModeFlow {
  return mode === "score" ? { kind: "score-start", step: "planning" } : { kind: "none", step: "" };
}

/** Kind/step pairing rule from the contract (modeFlow). Invalid pairs are VALIDATION, not mode errors. */
export function isValidModeFlow(f: ModeFlow): boolean {
  if (f.kind === "none") return f.step === "";
  if (f.kind === "score-start") return (SCORE_START_STEPS as readonly string[]).includes(f.step);
  return (RESOLUTION_STEPS as readonly string[]).includes(f.step);
}

function neighbour(steps: readonly string[], current: string, dir: 1 | -1): string | null {
  const i = steps.indexOf(current);
  if (i < 0) return null;
  return steps[i + dir] ?? null;
}

export function stepAfter(kind: "score-start" | "resolution", step: string): string | null {
  return neighbour(kind === "score-start" ? SCORE_START_STEPS : RESOLUTION_STEPS, step, 1);
}

export function stepBefore(kind: "score-start" | "resolution", step: string): string | null {
  return neighbour(kind === "score-start" ? SCORE_START_STEPS : RESOLUTION_STEPS, step, -1);
}

/** The heat band a crew's current heat falls in. */
export function entanglementBand(heat: number): (typeof ENTANGLEMENT_BANDS)[number] {
  const band = ENTANGLEMENT_BANDS.find((b) => heat >= b.min && heat <= b.max);
  if (band === undefined) throw new Error(`heat ${heat} is outside every entanglement band`);
  return band;
}

/** The matching band's results for the initial view (Show all shows every band). */
export function entanglementCurrent(heat: number): { band: EntanglementBandLabel; rows: Array<{ result: string; outcome: string }> } {
  const band = entanglementBand(heat).label;
  return { band, rows: ENTANGLEMENT_ROWS.map((r) => ({ result: r.result, outcome: r.outcomes[band] })) };
}

/**
 * Advisory payoff rep: 2 plus the target-minus-crew Tier difference, floored
 * at zero. Advice only: the crew editor applies whatever the player enters.
 */
export function payoffRepSuggestion(targetTier: number, crewTier: number): number {
  return Math.max(0, 2 + (targetTier - crewTier));
}

/** Settings commitment key for a loadout choice (lowercase contract enum value). */
export function commitmentFor(choice: (typeof LOAD_CHOICES)[number]): string {
  return choice.toLowerCase();
}
