import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";
import type { CharacterDto } from "../../src/schemas.js";

// DESPERATE-LOG-01: desperate.mark adds +1 XP to a named attribute track and appends that attribute name
// to session.desperateMarks in one revisioned write. Only mode.set into Score clears the tally; xp.resolve
// does not. Rejections use the existing VALIDATION 400 code (pointer /attribute) and change nothing,
// including the revision. Maxima come from the character's attribute tracks, never literals.

function attributeTrack(character: CharacterDto, name: string): { points: number; max: number } {
  const attr = character.talent.attributes.find((a) => a.name === name);
  if (!attr) throw new Error(`missing attribute ${name}`);
  return attr.experience;
}

async function scoreCharacter(): Promise<CharacterDto> {
  const character = await newCharacter();
  const res = await api.characterOp(character.id, "mode.set", { mode: "score" }, character.revision);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  return api.character(character.id);
}

describe("DESPERATE-LOG-01 desperate-action XP mark (desperate.mark)", () => {
  testCase("DESPERATE-001", "a mark adds +1 to the named track and appends the attribute to session.desperateMarks in one revisioned write", async () => {
    const before = await scoreCharacter();
    const res = await api.post(
      `characters/${before.id}/ops/desperate.mark`,
      { attribute: "Insight" },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(200);
    const after = await api.character(before.id);
    expect(attributeTrack(after, "Insight").points).toBe(attributeTrack(before, "Insight").points + 1);
    expect(after.session.desperateMarks).toEqual([...before.session.desperateMarks, "Insight"]);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.mode).toBe("score");
    expect(after.modeFlow).toEqual(before.modeFlow);
  });

  testCase("DESPERATE-002", "an attribute that is not one of the character's tracks is rejected with VALIDATION 400 at /attribute, and nothing changes", async () => {
    const before = await scoreCharacter();
    const res = await api.post(
      `characters/${before.id}/ops/desperate.mark`,
      { attribute: "Charisma" },
      { "If-Match": String(before.revision) },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const after = await api.character(before.id);
    expect(after.revision).toBe(before.revision);
    expect(after.session.desperateMarks).toEqual(before.session.desperateMarks);
  });

  testCase("DESPERATE-003", "a track already at its maximum is rejected with VALIDATION 400 and nothing changes", async () => {
    const before = await scoreCharacter();
    const track = attributeTrack(before, "Prowess");
    let current = before;
    // Fill the Prowess track with desperate marks; each mark is one revisioned write.
    for (let i = track.points; i < track.max; i += 1) {
      const res = await api.post(`characters/${current.id}/ops/desperate.mark`, { attribute: "Prowess" }, { "If-Match": String(current.revision) });
      expect(res.status).toBe(200);
      current = await api.character(current.id);
    }
    expect(attributeTrack(current, "Prowess").points).toBe(track.max);
    const res = await api.post(`characters/${current.id}/ops/desperate.mark`, { attribute: "Prowess" }, { "If-Match": String(current.revision) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const after = await api.character(current.id);
    expect(after.revision).toBe(current.revision);
    expect(after.session.desperateMarks.length).toBe(current.session.desperateMarks.length);
  });

  testCase("DESPERATE-004", "an Idempotency-Key replay returns the stored result and does not mark twice", async () => {
    const before = await scoreCharacter();
    const key = `desperate-replay-${before.id}`;
    const body = { attribute: "Resolve" };
    const first = await api.post(`characters/${before.id}/ops/desperate.mark`, body, { "If-Match": String(before.revision), "Idempotency-Key": key });
    expect(first.status).toBe(200);
    const second = await api.post(`characters/${before.id}/ops/desperate.mark`, body, { "If-Match": String(before.revision), "Idempotency-Key": key });
    expect(second.status).toBe(200);
    const after = await api.character(before.id);
    expect(attributeTrack(after, "Resolve").points).toBe(attributeTrack(before, "Resolve").points + 1);
    expect(after.session.desperateMarks.filter((n) => n === "Resolve").length).toBe(1);
  });

  testCase("DESPERATE-005", "a stale If-Match is rejected before any write, with the existing STALE_REVISION code", async () => {
    const before = await scoreCharacter();
    const res = await api.post(
      `characters/${before.id}/ops/desperate.mark`,
      { attribute: "Insight" },
      { "If-Match": String(before.revision + 99) },
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "STALE_REVISION" } });
    expect((await api.character(before.id)).session.desperateMarks).toEqual(before.session.desperateMarks);
  });

  testCase("DESPERATE-006", "entering Score from another mode clears the tally; selecting Score again preserves it", async () => {
    const before = await scoreCharacter();
    const marked = await api.post(`characters/${before.id}/ops/desperate.mark`, { attribute: "Insight" }, { "If-Match": String(before.revision) });
    expect(marked.status).toBe(200);
    const withMark = await api.character(before.id);
    expect(withMark.session.desperateMarks.length).toBeGreaterThan(0);
    const same = await api.characterOp(before.id, "mode.set", { mode: "score" }, withMark.revision);
    expect(same.ok).toBe(true);
    expect((await api.character(before.id)).session.desperateMarks).toEqual(withMark.session.desperateMarks);
    const freePlay = await api.characterOp(before.id, "mode.set", { mode: "free-play" }, withMark.revision + 1);
    expect(freePlay.ok).toBe(true);
    const back = await api.characterOp(before.id, "mode.set", { mode: "score" }, (await api.character(before.id)).revision);
    expect(back.ok).toBe(true);
    expect((await api.character(before.id)).session.desperateMarks).toEqual([]);
  });

  testCase("DESPERATE-007", "xp.resolve does not clear the desperate marks tally", async () => {
    const before = await scoreCharacter();
    const marked = await api.post(`characters/${before.id}/ops/desperate.mark`, { attribute: "Insight" }, { "If-Match": String(before.revision) });
    expect(marked.status).toBe(200);
    const withMark = await api.character(before.id);
    const res = await api.post(
      `characters/${before.id}/ops/xp.resolve`,
      { total: 0, allocations: { Playbook: 0, Insight: 0, Prowess: 0, Resolve: 0 } },
      { "If-Match": String(withMark.revision) },
    );
    expect(res.status).toBe(200);
    expect((await api.character(before.id)).session.desperateMarks).toEqual(withMark.session.desperateMarks);
  });
});
