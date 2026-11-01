import type { CharacterFlow } from "../schema/flow.js";
import type sharedGuidance from "../../../data/games/flow-guidance.json";

// Type-only import: shared content is served by the API, never bundled or duplicated.
export type FlowGuidance = typeof sharedGuidance;
export function flowGuidance(flow: CharacterFlow | null): FlowGuidance | null {
  const guidance = flow?.guidance;
  if (!guidance || !guidance.links || !guidance.scoreStart || !guidance.resolution || !guidance.downtime) return null;
  return guidance as unknown as FlowGuidance;
}
export function schemaObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** The advertised schema supplies editor vocabulary, required fields and numeric bounds.
 * It is not a second JSON Schema validator: authoritative validation stays on the server. */
export function flowInputSchema(flow: CharacterFlow | null): Record<string, unknown> {
  const action = flow?.actions.find((a) => a.op === "flow.step.complete");
  const properties = schemaObject(action?.inputSchema.properties);
  // The skip conditional keeps required awards out of the empty-input skip branch.
  const branches = action?.inputSchema.allOf;
  if (Array.isArray(branches)) {
    const nonSkip = schemaObject(schemaObject(schemaObject(schemaObject(branches[0]).else).properties).inputs);
    if (nonSkip.properties) return nonSkip;
  }
  return schemaObject(properties.inputs);
}
export function flowInputField(flow: CharacterFlow | null, key: string): Record<string, unknown> {
  return schemaObject(schemaObject(flowInputSchema(flow).properties)[key]);
}
/** Navigation actions publish fixed request values as const properties. */
export function navigationBody(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schemaObject(schema.properties))
    .filter(([, property]) => Object.hasOwn(schemaObject(property), "const"))
    .map(([key, property]) => [key, schemaObject(property).const]));
}
