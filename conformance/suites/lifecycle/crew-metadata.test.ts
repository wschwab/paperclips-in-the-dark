import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { validateResponse } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCrew, revisionHeader, BLADES } from "../../src/suite-helpers.js";

// AUDIT-0 BUG-013 / Wave 2A: crew summaries must include derived-at-response-time
// canUndo and historyCount fields. The schema (campaign.json#/$defs/crewSummary)
// requires both as non-optional. The server must compute them from the retained
// snapshot count at response time, never store them. These tests verify the
// lifecycle transitions: fresh (false/0), after snapshot-worthy op (true/1),
// after undo (false/0), and that the fields never persist into current.json.

function crewSummaryFromList(body: unknown, crewId: string): Record<string, unknown> | undefined {
  if (!Array.isArray(body)) return undefined;
  return body.find((row) => typeof row === "object" && row !== null && "id" in row && row.id === crewId) as
    | Record<string, unknown>
    | undefined;
}

function crewSummaryFromRoster(body: unknown, crewId: string): Record<string, unknown> | undefined {
  if (typeof body !== "object" || body === null || !("crews" in body)) return undefined;
  return crewSummaryFromList((body as { crews: unknown }).crews, crewId);
}

describe("crew summary history metadata (AUDIT-0 BUG-013 / Wave 2A)", () => {
  testCase(
    "CREW-METADATA-001",
    "fresh readable crew summary has canUndo:false and historyCount:0",
    async () => {
      const crew = await newCrew();

      // /api/crews — list endpoint
      const listResp = await api.get("crews");
      expect(listResp.status).toBe(200);
      validateResponse("crewSummary", listResp.body);
      const listRow = crewSummaryFromList(listResp.body, crew.id);
      expect(listRow).toBeDefined();
      expect(listRow!.canUndo).toBe(false);
      expect(listRow!.historyCount).toBe(0);

      // /api/campaign/roster — roster endpoint
      const rosterResp = await api.get("campaign/roster");
      expect(rosterResp.status).toBe(200);
      validateResponse("roster", rosterResp.body);
      const rosterRow = crewSummaryFromRoster(rosterResp.body, crew.id);
      expect(rosterRow).toBeDefined();
      expect(rosterRow!.canUndo).toBe(false);
      expect(rosterRow!.historyCount).toBe(0);
    },
  );

  testCase(
    "CREW-METADATA-002",
    "snapshot-worthy crew op sets canUndo:true and historyCount:1",
    async () => {
      const crew = await newCrew();

      // note.add is snapshot-worthy (see PERSISTENCE-SNAPSHOT-002)
      const opResp = await api.post(`crews/${crew.id}/ops/note.add`, { text: "snapshot-worthy" });
      expect(opResp.status).toBe(200);
      const opResult = await api.operation(opResp);
      expect(opResult.ok).toBe(true);

      // /api/crews — list endpoint
      const listResp = await api.get("crews");
      expect(listResp.status).toBe(200);
      validateResponse("crewSummary", listResp.body);
      const listRow = crewSummaryFromList(listResp.body, crew.id);
      expect(listRow).toBeDefined();
      expect(listRow!.canUndo).toBe(true);
      expect(listRow!.historyCount).toBe(1);

      // /api/campaign/roster — roster endpoint
      const rosterResp = await api.get("campaign/roster");
      expect(rosterResp.status).toBe(200);
      validateResponse("roster", rosterResp.body);
      const rosterRow = crewSummaryFromRoster(rosterResp.body, crew.id);
      expect(rosterRow).toBeDefined();
      expect(rosterRow!.canUndo).toBe(true);
      expect(rosterRow!.historyCount).toBe(1);
    },
  );

  testCase(
    "CREW-METADATA-003",
    "undo consumes snapshot: canUndo:false and historyCount:0",
    async () => {
      const crew = await newCrew();

      // Create a snapshot
      const opResp = await api.post(`crews/${crew.id}/ops/note.add`, { text: "to be undone" });
      const opResult = await api.operation(opResp);
      expect(opResult.ok).toBe(true);
      const updatedCrew = opResult.crew ?? crew;

      // Verify snapshot exists
      const beforeUndo = await api.get("crews");
      const beforeRow = crewSummaryFromList(beforeUndo.body, crew.id);
      expect(beforeRow?.canUndo).toBe(true);
      expect(beforeRow?.historyCount).toBe(1);

      // Undo
      const undoResp = await api.post(`crews/${crew.id}/undo`, undefined, revisionHeader(updatedCrew.revision));
      expect(undoResp.status).toBe(200);
      const undoResult = await api.operation(undoResp);
      expect(undoResult.ok).toBe(true);

      // After undo: no retained snapshots
      const afterUndo = await api.get("crews");
      expect(afterUndo.status).toBe(200);
      validateResponse("crewSummary", afterUndo.body);
      const afterRow = crewSummaryFromList(afterUndo.body, crew.id);
      expect(afterRow).toBeDefined();
      expect(afterRow!.canUndo).toBe(false);
      expect(afterRow!.historyCount).toBe(0);
    },
  );

  testCase(
    "CREW-METADATA-004",
    "canUndo and historyCount never persist into current.json",
    async () => {
      const crew = await newCrew();

      // Create a snapshot (sets the derived fields at response time)
      const opResp = await api.post(`crews/${crew.id}/ops/note.add`, { text: "persistence check" });
      expect(opResp.status).toBe(200);

      // Fetch the full crew DTO — the stored document must NOT contain
      // canUndo or historyCount (they are derived at response time only)
      const fetched = await api.crew(crew.id);
      expect(fetched).toBeDefined();
      expect("canUndo" in fetched).toBe(false);
      expect("historyCount" in fetched).toBe(false);
    },
  );
});
