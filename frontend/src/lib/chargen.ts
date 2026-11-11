/**
 * Pure, settings-derived starting Talent allocation math.
 * Shared by the on-sheet draft controls and their unit tests; no game
 * maximum is embedded here.
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

/**
 * The playbook's nonzero DefaultActionPoints from raw game-settings JSON
 * (DEC-01 ruling; C# reference GameSettingExtensions.cs:38 — per-playbook,
 * per-action defaults, "absent entry means 0"). Empty map when the game or
 * playbook publishes none: never a hardcoded default (spec §5.5).
 */
export function playbookDefaultsFromSettings(
  settings: Record<string, unknown> | null | undefined,
  playbook: string,
): Record<string, number> {
  if (!settings || !Array.isArray(settings["Playbooks"])) return {};
  for (const entry of settings["Playbooks"] as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const pb = entry as Record<string, unknown>;
    if (pb["Name"] !== playbook) continue;
    if (!Array.isArray(pb["DefaultActionPoints"])) return {};
    const defaults: Record<string, number> = {};
    for (const raw of pb["DefaultActionPoints"] as unknown[]) {
      if (typeof raw !== "object" || raw === null) continue;
      const dap = raw as Record<string, unknown>;
      const action = dap["Action"];
      const points = dap["Points"];
      if (typeof action === "string" && typeof points === "number" && points > 0) {
        defaults[action] = points;
      }
    }
    return defaults;
  }
  return {};
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
 * Finish-allocation rule: a playbook is chosen, unspent is exactly zero,
 * and every rating is within the settings-derived creation cap.
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
