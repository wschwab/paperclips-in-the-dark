import { Schema } from "effect";
import { Revision, Uuid } from "./common.js";

const JsonObject = Schema.Record({ key: Schema.String, value: Schema.Unknown });
export const FlowKind = Schema.Literal("none", "score-start", "resolution");
export const FlowProgress = Schema.Struct({
  instanceId: Schema.String,
  kind: FlowKind,
  planApproach: Schema.String,
  notes: Schema.Array(Schema.Struct({ step: Schema.String, text: Schema.String })),
});
const CrewRevision = Schema.NullOr(Schema.Struct({ id: Uuid, revision: Revision }));
export const FlowReceipt = Schema.Struct({
  completionId: Schema.String.pipe(Schema.minLength(1)),
  transactionId: Schema.String.pipe(Schema.minLength(1)),
  instanceId: Schema.String.pipe(Schema.minLength(1)),
  kind: Schema.Literal("score-start", "resolution"),
  step: Schema.String,
  status: Schema.Literal("completed", "undone"),
  skipped: Schema.Boolean,
  inputs: JsonObject,
  characterRevision: Revision,
  crew: CrewRevision,
});
export const CharacterFlow = Schema.Struct({
  characterId: Uuid,
  revision: Revision,
  crew: CrewRevision,
  mode: Schema.Literal("free-play", "score", "downtime"),
  kind: FlowKind,
  step: Schema.String,
  instanceId: Schema.String,
  steps: Schema.Array(Schema.Struct({
    kind: Schema.Literal("score-start", "resolution"),
    step: Schema.String,
    label: Schema.String,
    skippable: Schema.Boolean,
  })),
  back: Schema.NullOr(Schema.String),
  next: Schema.NullOr(Schema.String),
  skippable: Schema.Boolean,
  actions: Schema.Array(Schema.Struct({
    id: Schema.String,
    op: Schema.Literal("flow.step.complete", "mode.flow.set", "mode.set"),
    inputSchema: JsonObject,
  })),
  guidance: JsonObject,
  receipt: Schema.NullOr(FlowReceipt),
});
export type CharacterFlow = typeof CharacterFlow.Type;
export type FlowReceipt = typeof FlowReceipt.Type;
export interface FlowCompleteRequest {
  completionId: string;
  instanceId: string;
  kind: "score-start" | "resolution";
  step: string;
  skip?: boolean;
  inputs: Record<string, unknown>;
}
export const decodeCharacterFlow = Schema.decodeUnknownSync(CharacterFlow, { onExcessProperty: "error" });
