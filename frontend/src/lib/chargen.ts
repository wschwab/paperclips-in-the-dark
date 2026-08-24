/**
 * CONTRACT-01 stage 3 — pure PC-chargen math derived from game settings.
 *
 * Every number comes from the raw game-settings payload (`getGame`);
 * nothing here embeds a game maximum (spec §5.5). Kept framework-free so
 * the budget parsing, unspent-counter math, and submit gating are directly
 * unit-testable.
 */

export interface PcBudget {
  /** StartingActionDots — total dots a fresh PC must allocate exactly. */
  startingActionDots: number;
  /** StartingActionDotMax — per-action cap at creation. */
  startingActionDotMax: number;
}

/**
 * The optional PC allocation budget from raw game-settings JSON. null when
 * either key is absent or malformed (integer ≥1 required) — such a game has
 * not published a PC budget and the UI keeps only the unvalidated create
 * path (CONTRACT-01 setting-absent ruling).
 */
export function pcBudgetFromSettings(
  settings: Record<string, unknown> | null | undefined,
): PcBudget | null {
  if (!settings) return null;
  // Local type guard: preserves narrowing for both budget keys in lockstep.
  const isBudgetInt = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v) && v >= 1;
  const dots = settings["StartingActionDots"];
  const max = settings["StartingActionDotMax"];
  if (!isBudgetInt(dots) || !isBudgetInt(max)) return null;
  return { startingActionDots: dots, startingActionDotMax: max };
}

/** One attribute group for the chargen pickers: attribute name + ordered actions. */
export interface ChargenGroup {
  attribute: string;
  actions: string[];
}

/**
 * Attribute groups from raw game-settings `Attributes` (Insight/Prowess/
 * Resolve in Blades). null when the payload does not publish well-formed
 * Attributes — callers keep only the unvalidated path rather than guessing.
 */
export function actionGroupsFromSettings(
  settings: Record<string, unknown> | null | undefined,
): ChargenGroup[] | null {
  if (!settings || !Array.isArray(settings["Attributes"])) return null;
  const groups: ChargenGroup[] = [];
  for (const attr of settings["Attributes"] as unknown[]) {
    if (typeof attr !== "object" || attr === null) return null;
    if (!("Name" in attr) || typeof attr.Name !== "string") return null;
    if (!("Actions" in attr) || !Array.isArray(attr.Actions)) return null;
    const actionNames: string[] = [];
    for (const action of attr.Actions) {
      if (typeof action !== "object" || action === null) return null;
      if (!("Name" in action) || typeof action.Name !== "string") return null;
      actionNames.push(action.Name);
    }
    if (actionNames.length === 0) return null;
    groups.push({ attribute: attr.Name, actions: actionNames });
  }
  return groups.length > 0 ? groups : null;
}

/** Sum of selected ratings (unselected actions count as 0). */
export function sumRatings(ratings: Record<string, number>): number {
  return Object.values(ratings).reduce((a, b) => a + b, 0);
}

/**
 * Unspent Talent points = StartingActionDots − sum(selected). Negative only
 * if a caller bypasses the picker clamp; gating treats ≠0 as not ready so
 * over-allocation is visible and blocked either way.
 */
export function unspentDots(budget: PcBudget, ratings: Record<string, number>): number {
  return budget.startingActionDots - sumRatings(ratings);
}

/**
 * Create-button rule: a playbook is chosen AND unspent is EXACTLY 0 AND
 * every rating sits within the settings-derived per-action cap.
 */
export function pcAllocationReady(
  budget: PcBudget,
  playbook: string,
  ratings: Record<string, number>,
): boolean {
  if (!playbook) return false;
  if (unspentDots(budget, ratings) !== 0) return false;
  return Object.values(ratings).every(
    (r) => r >= 0 && r <= budget.startingActionDotMax,
  );
}
