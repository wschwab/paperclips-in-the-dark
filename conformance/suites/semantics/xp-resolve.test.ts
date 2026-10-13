import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";
import type { CharacterDto } from "../../src/schemas.js";

// XP-TRACKER-02: atomic Scoundrel XP completion. One revisioned write adds the GM-confirmed XP to the
// Playbook and attribute tracks, then sets the three session expression tracks to 0. Maxima come from
// the character's settings-derived tracks, never literals. Rejections use the existing VALIDATION 400
// code and leave the character and its revision untouched.

const DESTINATIONS = ["Playbook", "Insight", "Prowess", "Resolve"] as const;

function xpOf(character: CharacterDto, destination: (typeof DESTINATIONS)[number]): { points: number; max: number } {
  if (destination === "Playbook") return character.playbook.experience;
  const attr = character.talent.attributes.find((a) => a.name === destination);
  if (!attr) throw new Error(`missing attribute ${destination}`);
  return attr.experience;
}

function allocations(values: Partial<Record<(typeof DESTINATIONS)[number], number>>): Record<string, number> {
  return Object.fromEntries(DESTINATIONS.map((d) => [d, values[d] ?? 0]));
}

async function prepared(expressions: { playbook: number; character: number; struggle: number }) {
  const character = await newCharacter();
  const max = character.session.max;
  const set = await api.characterOp(character.id, "session.set", {
    playbookExpressions: Math.min(expressions.playbook, max),
    characterExpressions: Math.min(expressions.character, max),
    struggleExpressions: Math.min(expressions.struggle, max),
  }, character.revision);
  expect(set.ok).toBe(true);
  return (await api.character(character.id));
}

describe("XP-TRACKER-02 atomic Scoundrel XP completion (xp.resolve)", () => {
  testCase("XP-RESOLVE-001", "a valid split adds each allocation to its track and clears the three session counters in one revisioned write", async () => {
    const before = await prepared({ playbook: 2, character: 1, struggle: 1 });
    const pbBefore = xpOf(before, "Playbook").points;
    const insBefore = xpOf(before, "Insight").points;
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: 4, allocations: allocations({ Playbook: 1, Insight: 2, Resolve: 1 }) },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(200);
    const after = await api.character(before.id);
    expect(xpOf(after, "Playbook").points).toBe(pbBefore + 1);
    expect(xpOf(after, "Insight").points).toBe(insBefore + 2);
    expect(xpOf(after, "Resolve").points).toBe(xpOf(before, "Resolve").points + 1);
    expect(xpOf(after, "Prowess").points).toBe(xpOf(before, "Prowess").points);
    expect(after.session.playbookExpressions).toBe(0);
    expect(after.session.characterExpressions).toBe(0);
    expect(after.session.struggleExpressions).toBe(0);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  testCase("XP-RESOLVE-002", "an allocation beyond a track's room is rejected with VALIDATION 400, and nothing changes, including the revision", async () => {
    const before = await prepared({ playbook: 2, character: 0, struggle: 0 });
    const room = xpOf(before, "Playbook").max - xpOf(before, "Playbook").points;
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: room + 1, allocations: allocations({ Playbook: room + 1 }) },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const after = await api.character(before.id);
    expect(after.revision).toBe(before.revision);
    expect(xpOf(after, "Playbook").points).toBe(xpOf(before, "Playbook").points);
    expect(after.session.playbookExpressions).toBe(2);
  });

  testCase("XP-RESOLVE-003", "a zero total is allowed: the explicit GM decision awards nothing and still completes the counters", async () => {
    const before = await prepared({ playbook: 1, character: 1, struggle: 0 });
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: 0, allocations: allocations({}) },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(200);
    const after = await api.character(before.id);
    expect(xpOf(after, "Playbook").points).toBe(xpOf(before, "Playbook").points);
    expect(after.session.playbookExpressions).toBe(0);
    expect(after.session.characterExpressions).toBe(0);
  });

  testCase("XP-RESOLVE-004", "negative and non-integer allocations are rejected with VALIDATION 400 and no revision change", async () => {
    const before = await prepared({ playbook: 1, character: 0, struggle: 0 });
    for (const bad of [
      { total: -1, allocations: allocations({}) },
      { total: 1, allocations: allocations({ Playbook: -1, Insight: 2 }) },
      { total: 1.5, allocations: allocations({ Playbook: 1 }) },
    ]) {
      const res = await api.post(`characters/${before.id}/ops/xp.resolve`, bad, { "If-Match": String(before.revision) });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await api.character(before.id)).revision).toBe(before.revision);
  });

  testCase("XP-RESOLVE-005", "the sum of allocations must equal the GM total (nothing discarded or invented)", async () => {
    const before = await prepared({ playbook: 1, character: 0, struggle: 0 });
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: 3, allocations: allocations({ Playbook: 1 }) },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(400);
    expect((await api.character(before.id)).revision).toBe(before.revision);
  });

  testCase("XP-RESOLVE-007", "an Idempotency-Key replay returns the stored result and does not award the XP twice", async () => {
    const before = await prepared({ playbook: 1, character: 0, struggle: 0 });
    const body = { total: 1, allocations: allocations({ Playbook: 1 }) };
    const key = `xp-resolve-replay-${before.id}`;
    const first = await api.post(`characters/${before.id}/ops/xp.resolve`, body, { "If-Match": String(before.revision), "Idempotency-Key": key });
    expect(first.status).toBe(200);
    const second = await api.post(`characters/${before.id}/ops/xp.resolve`, body, { "If-Match": String(before.revision), "Idempotency-Key": key });
    expect(second.status).toBe(200);
    const after = await api.character(before.id);
    expect(xpOf(after, "Playbook").points).toBe(xpOf(before, "Playbook").points + 1);
  });

  testCase("XP-RESOLVE-006", "a stale If-Match is rejected before any write, with the existing STALE_REVISION code", async () => {
    const before = await prepared({ playbook: 1, character: 0, struggle: 0 });
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: 0, allocations: allocations({}) },
      { "If-Match": String(before.revision + 99) },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "STALE_REVISION" } });
    expect((await api.character(before.id)).session.playbookExpressions).toBe(1);
  });
});
