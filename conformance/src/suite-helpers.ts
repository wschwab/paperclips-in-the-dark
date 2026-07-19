import { expect } from "vitest";
import { api } from "./api.js";
import { firstAction, firstPlaybook } from "./game-data.js";
import type { CharacterDto, CrewDto, OperationResultDto } from "./schemas.js";

export const BLADES = "blades-in-the-dark";
export const SCUM = "scum-and-villainy";

export function successfulCharacter(result: OperationResultDto): CharacterDto {
  expect(result.ok).toBe(true);
  expect(result.error).toBeNull();
  if (!result.character) throw new Error("Operation result did not contain a character");
  return result.character;
}

export function successfulCrew(result: OperationResultDto): CrewDto {
  expect(result.ok).toBe(true);
  expect(result.error).toBeNull();
  if (!result.crew) throw new Error("Operation result did not contain a crew");
  return result.crew;
}

export async function newCharacter(stem = BLADES, playbook = firstPlaybook(stem)): Promise<CharacterDto> {
  return successfulCharacter(await api.createCharacter(stem, playbook));
}

export async function newCrew(stem = BLADES, crewType = "Assassins"): Promise<CrewDto> {
  return successfulCrew(await api.createCrew(stem, crewType));
}

export async function characterOp(
  character: CharacterDto,
  operation: string,
  body?: unknown,
): Promise<CharacterDto> {
  return successfulCharacter(await api.characterOp(character.id, operation, body));
}

export async function crewOp(crew: CrewDto, operation: string, body?: unknown): Promise<CrewDto> {
  return successfulCrew(await api.crewOp(crew.id, operation, body));
}

export function firstActionFor(stem: string): { attribute: string; action: string } {
  return firstAction(stem);
}

export function revisionHeader(revision: number): Record<string, string> {
  return { "If-Match": String(revision) };
}
