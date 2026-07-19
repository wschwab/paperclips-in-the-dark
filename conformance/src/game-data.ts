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
  RecoveryClockSize: number;
  ActionPointMaximum: number;
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

export function firstAction(stem: string): { attribute: string; action: string } {
  const setting = gameSetting(stem);
  const attribute = setting.Attributes[0];
  const action = attribute?.Actions[0];
  if (!attribute || !action) throw new Error(`No actions in game data: ${stem}`);
  return { attribute: attribute.Name, action: action.Name };
}
