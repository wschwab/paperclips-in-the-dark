/** Local sheet presentation helpers. Navigation and shared advice belong to GET flow. */
import type { Downtime } from "../schema/character.js";

export const LOAD_CHOICES = ["Light", "Normal", "Heavy"] as const;
export type LoadChoice = (typeof LOAD_CHOICES)[number];
export interface LoadoutProposal { commitment: LoadChoice | null; items: string[] }

export function choiceForCommitment(key: string): LoadChoice | null {
  return LOAD_CHOICES.find((c) => c.toLowerCase() === key) ?? null;
}
export function downtimeRemaining(d: Downtime): number { return d.free + d.paid - d.spent; }
function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
export function loadLimitFor(gameData: Record<string, unknown> | null, commitment: string): number | null {
  const table = asRecord(asRecord(gameData?.LoadMaxima)?.CommitmentMaxBulk);
  const match = Object.entries(table ?? {}).find(([key]) => key.toLowerCase() === commitment.toLowerCase());
  return typeof match?.[1] === "number" ? match[1] : null;
}
export function desperateAttributes(gameData: Record<string, unknown> | null): string[] {
  const list = gameData?.Attributes;
  return Array.isArray(list) ? list.map((a) => asRecord(a)?.Name).filter((n): n is string => typeof n === "string") : [];
}
export function commitmentFor(choice: LoadChoice): Lowercase<LoadChoice> {
  return choice.toLowerCase() as Lowercase<LoadChoice>;
}
