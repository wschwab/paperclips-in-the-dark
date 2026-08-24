import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const dataDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/games");

export interface GameSetting {
  Name: string;
  Language: string;
  Playbooks: Array<{
    Name: string;
    SpecialAbilities?: Array<{ Name: string; TimesTakeable: number }>;
    DefaultActionPoints?: Array<{ Action: string; Points: number }>;
  }>;
  Traumas: string[];
  TraumaMax: number;
  RecoveryClockSize: number;
  ActionPointMaximum: number;
  /** Optional PC-allocation budget (CONTRACT-01); absent until a game publishes it. */
  StartingActionDots?: number;
  /** Optional per-action starting cap (CONTRACT-01); absent until a game publishes it. */
  StartingActionDotMax?: number;
  FundMaxima: { SatchelMax: number; StashMax: number };
  Attributes: Array<{ Name: string; Actions: Array<{ Name: string }> }>;
}

export function gameSetting(stem: string): GameSetting {
  return JSON.parse(readFileSync(resolve(dataDirectory, `${stem}.json`), "utf8")) as GameSetting;
}

export function firstPlaybook(stem: string): string {
  const setting = gameSetting(stem);
  const playbook = setting.Playbooks[0];
  if (!playbook) throw new Error(`No playbooks in game data: ${stem}`);
  return playbook.Name;
}

export interface FactionStatusRange {
  Min: number;
  Max: number;
}

/**
 * C3 contract change (2026-07-29): faction status is clamped to the
 * game-settings faction-status range (see docs/pages/contract/c3-crew-contacts-factions.mdx).
 * Convention: game-settings JSON carries a top-level `FactionStatus` object
 * `{ Min, Max }` (PascalCase like RecoveryClockSize / ActionPointMaximum).
 * Returns undefined until the A-track follow-up adds the range to the data
 * files; the range is never hardcoded here or in the contract.
 */
export function factionStatusRange(stem: string): FactionStatusRange | undefined {
  const setting = gameSetting(stem) as GameSetting & { FactionStatus?: { Min?: number; Max?: number } };
  const range = setting.FactionStatus;
  if (range === undefined) return undefined;
  if (typeof range.Min !== "number" || typeof range.Max !== "number") {
    throw new Error(`game-settings ${stem}: FactionStatus must have numeric Min and Max`);
  }
  return { Min: range.Min, Max: range.Max };
}

export function firstAction(stem: string): { attribute: string; action: string } {
  const setting = gameSetting(stem);
  const attribute = setting.Attributes[0];
  const action = attribute?.Actions[0];
  if (!attribute || !action) throw new Error(`No actions in game data: ${stem}`);
  return { attribute: attribute.Name, action: action.Name };
}
