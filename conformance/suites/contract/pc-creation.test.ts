import { expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { assertResponseValid, decode, Schemas } from "../../src/schemas.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";

// CONTRACT-01 stage 1 — RED oracle for the dedicated PC creation path
// POST /api/characters/pc (DEC-01 human ruling 2026-08-24).
//
// Normative source: docs/pages/contract/contract-c1-pc-creation.mdx.
// Every number below is read from data/games/*.json at runtime — no test
// embeds a game maximum (spec §5.5). Against the current backend these rows
// are red because the route is not implemented yet (the request falls
// through to the {id} entity routes and comes back 404 NOT_FOUND). The
// grandfathering and setting-absent rows pin behavior that must hold both
// before and after stage 2, so they may pass while the file is red.
//
// Stage-2 contract enforced here:
//   V1  sum(final actionRatings) === StartingActionDots      → else VALIDATION
//   V2  every rating <= StartingActionDotMax                 → else VALIDATION
//   V3  playbook exists in the game's Playbooks              → else VALIDATION
//   V4  final map keys exactly the game's actions            → else VALIDATION
//   V5  submitted values for playbook DefaultActionPoints    → else VALIDATION
//       actions must match the default (omitted keys take
//       the default: final = defaults ∪ submissions)
//   Setting absent → 404 NOT_FOUND naming the missing keys.

const BLADES = "blades-in-the-dark";
const SV = "scum-and-villainy";

const blades = gameSetting(BLADES);
if (blades.StartingActionDots === undefined || blades.StartingActionDotMax === undefined) {
  throw new Error(`${BLADES} must publish StartingActionDots/StartingActionDotMax for this oracle`);
}
const STARTING_DOTS: number = blades.StartingActionDots;
const STARTING_MAX: number = blades.StartingActionDotMax;

/** All action names published by a game's Attributes, in settings order. */
function actionNames(stem: string): string[] {
  return gameSetting(stem).Attributes.flatMap((attribute) => attribute.Actions.map((a) => a.Name));
}

function sum(ratings: Record<string, number>): number {
  return Object.values(ratings).reduce((a, b) => a + b, 0);
}
/**
 * The chosen playbook's nonzero DefaultActionPoints, read from the game
 * settings file at runtime (DEC-01 ruling; C# GameSettingExtensions.cs:38
 * reference). Blades' Cutter carries Skirmish 2 + Command 1; every Blades
 * playbook defaults 3 of the 7 starting dots.
 */
function defaultActionPoints(stem: string, playbook: string): Record<string, number> {
  const setting = gameSetting(stem);
  const pb = setting.Playbooks.find((candidate) => candidate.Name === playbook);
  const defaults: Record<string, number> = {};
  for (const dap of pb?.DefaultActionPoints ?? []) {
    if (dap.Points > 0) defaults[dap.Action] = dap.Points;
  }
  return defaults;
}

/**
 * Deterministic valid allocation for a playbook: start from its
 * DefaultActionPoints (locked contributions), then cycle the remaining
 * actions raising each rating by one until the settings budget is spent,
 * never exceeding the settings cap.
 */
function allocate(stem: string, playbook: string = firstPlaybook(stem)): Record<string, number> {
  const setting = gameSetting(stem);
  if (setting.StartingActionDots === undefined || setting.StartingActionDotMax === undefined) {
    throw new Error(`${stem} publishes no PC allocation budget`);
  }
  const names = actionNames(stem);
  const defaults = defaultActionPoints(stem, playbook);
  const ratings = Object.fromEntries(names.map((name) => [name, defaults[name] ?? 0]));
  let remaining = setting.StartingActionDots - sum(defaults);
  while (remaining > 0) {
    let progressed = false;
    for (const name of names) {
      if (remaining === 0) break;
      if (name in defaults) continue; // defaulted dots are fixed, never raised
      if (ratings[name] < setting.StartingActionDotMax) {
        ratings[name] += 1;
        remaining -= 1;
        progressed = true;
      }
    }
    if (!progressed) throw new Error(`budget ${setting.StartingActionDots} unreachable under cap ${setting.StartingActionDotMax}`);
  }
  return ratings;
}

interface OperationErrorBody {
  ok?: boolean;
  error?: { code?: string; status?: number; message?: string };
}

async function postPc(body: unknown): Promise<{ status: number; body: OperationErrorBody }> {
  const response = await api.post("characters/pc", body);
  return { status: response.status, body: response.body as OperationErrorBody };
}

/** Expects a typed VALIDATION rejection whose message names the given tokens. */
async function expectValidation(id: string, title: string, body: unknown, messageTokens: Array<string | number>): Promise<void> {
  testCase(id, title, async () => {
    const { status, body: responseBody } = await postPc(body);
    expect(status).toBe(400);
    assertResponseValid("createPcCharacter", status, responseBody);
    expect(responseBody.error?.code).toBe("VALIDATION");
    const message = responseBody.error?.message ?? "";
    for (const token of messageTokens) {
      expect(message).toContain(String(token));
    }
  });
}

testCase("C1PC-HAPPY-001", `valid allocation (sum ${STARTING_DOTS}, max ${STARTING_MAX}) creates the character and persists ratings`, async () => {
  const playbook = firstPlaybook(BLADES);
  const ratings = allocate(BLADES);
  expect(sum(ratings)).toBe(STARTING_DOTS);

  const response = await api.post("characters/pc", { gameStem: BLADES, playbook, actionRatings: ratings });
  expect(response.status).toBe(200);
  assertResponseValid("createPcCharacter", response.status, response.body);

  const created = await decode(Schemas.OperationResult, response.body);
  expect(created.ok).toBe(true);
  expect(created.character?.kind).toBe("character");
  const id = created.character?.id;
  if (!id) throw new Error("PC creation returned no character id");

  const detail = await api.get(`characters/${id}`);
  expect(detail.status).toBe(200);
  assertResponseValid("getCharacter", detail.status, detail.body);
  const character = await decode(Schemas.Character, detail.body);

  expect(character.playbook.name).toBe(playbook);
  const stored: Record<string, number> = {};
  for (const attribute of character.talent.attributes) {
    for (const action of attribute.actions) stored[action.name] = action.rating;
  }
  expect(stored).toEqual(ratings);
});

expectValidation(
  "C1PC-OVER-BUDGET-001",
  `over-budget allocation (sum ${STARTING_DOTS + 1}) is rejected naming rule and numbers`,
  (() => {
    const ratings = allocate(BLADES);
    // Raise one action within the cap; only the total is now wrong.
    const raiseable = actionNames(BLADES).find((name) => ratings[name] < STARTING_MAX);
    if (!raiseable) throw new Error("no raiseable action for over-budget case");
    ratings[raiseable] += 1;
    expect(sum(ratings)).toBe(STARTING_DOTS + 1);
    return { gameStem: BLADES, playbook: firstPlaybook(BLADES), actionRatings: ratings };
  })(),
  [STARTING_DOTS + 1, STARTING_DOTS],
);

expectValidation(
  "C1PC-UNDER-BUDGET-001",
  `under-budget allocation (sum ${STARTING_DOTS - 1}) is rejected naming rule and numbers`,
  (() => {
    const ratings = allocate(BLADES);
    const droppable = actionNames(BLADES).find((name) => ratings[name] > 0);
    if (!droppable) throw new Error("no droppable action for under-budget case");
    ratings[droppable] -= 1;
    expect(sum(ratings)).toBe(STARTING_DOTS - 1);
    return { gameStem: BLADES, playbook: firstPlaybook(BLADES), actionRatings: ratings };
  })(),
  [STARTING_DOTS - 1, STARTING_DOTS],
);

expectValidation(
  "C1PC-RATING-CAP-001",
  `one action at ${STARTING_MAX + 1} is rejected naming rule and numbers`,
  (() => {
    const names = actionNames(BLADES);
    const ratings = allocate(BLADES);
    const raised = names[0];
    const delta = STARTING_MAX + 1 - ratings[raised];
    ratings[raised] = STARTING_MAX + 1;
    // Keep the sum at budget so ONLY the cap rule is violated.
    let toRemove = delta;
    for (const name of names.slice(1)) {
      while (toRemove > 0 && ratings[name] > 0) {
        ratings[name] -= 1;
        toRemove -= 1;
      }
    }
    expect(toRemove).toBe(0);
    expect(sum(ratings)).toBe(STARTING_DOTS);
    return { gameStem: BLADES, playbook: firstPlaybook(BLADES), actionRatings: ratings };
  })(),
  [STARTING_MAX + 1, STARTING_MAX],
);

expectValidation(
  "C1PC-UNKNOWN-ACTION-001",
  "an action name the game does not publish is rejected naming the name",
  (() => {
    const ratings = allocate(BLADES);
    ratings["Definitely Not An Action"] = 0; // sum stays at budget; the NAME is the violation
    return { gameStem: BLADES, playbook: firstPlaybook(BLADES), actionRatings: ratings };
  })(),
  ["Definitely Not An Action"],
);

expectValidation(
  "C1PC-MISSING-ACTION-001",
  "a missing action name is rejected naming the omitted action",
  (() => {
    const names = actionNames(BLADES);
    const ratings = allocate(BLADES);
    const omitted = names[names.length - 1];
    let orphan = ratings[omitted];
    delete ratings[omitted];
    // Re-home the omitted dots within the cap so only completeness is violated.
    for (const name of names) {
      while (orphan > 0 && ratings[name] < STARTING_MAX) {
        ratings[name] += 1;
        orphan -= 1;
      }
    }
    expect(orphan).toBe(0);
    expect(sum(ratings)).toBe(STARTING_DOTS);
    return { gameStem: BLADES, playbook: firstPlaybook(BLADES), actionRatings: ratings };
  })(),
  [actionNames(BLADES)[actionNames(BLADES).length - 1]],
);

expectValidation(
  "C1PC-UNKNOWN-PLAYBOOK-001",
  "an unknown playbook is rejected naming the playbook",
  { gameStem: BLADES, playbook: "No Such Playbook", actionRatings: allocate(BLADES) },
  ["No Such Playbook"],
);

// V5 playbook-specific cases: the Blades Cutter's DefaultActionPoints are
// read from data/games/blades-in-the-dark.json at runtime (Skirmish 2,
// Command 1 — cited here because every Blades playbook defaults exactly
// these 3 of the StartingActionDots budget).
const CUTTER = firstPlaybook(BLADES); // Playbooks[0].Name in the settings file
const cutterDefaults = defaultActionPoints(BLADES, CUTTER);
if (Object.keys(cutterDefaults).length === 0) {
  throw new Error(`${BLADES} ${CUTTER} must publish nonzero DefaultActionPoints for this oracle`);
}

testCase("C1PC-DEFAULTS-HONORED-001", `valid allocation honoring the ${CUTTER} defaults (Skirmish ${cutterDefaults["Skirmish"] ?? "?"}, Command ${cutterDefaults["Command"] ?? "?"}) creates and persists`, async () => {
  const ratings = allocate(BLADES, CUTTER);
  for (const [action, points] of Object.entries(cutterDefaults)) {
    expect(ratings[action]).toBe(points);
  }
  const response = await api.post("characters/pc", { gameStem: BLADES, playbook: CUTTER, actionRatings: ratings });
  expect(response.status).toBe(200);
  assertResponseValid("createPcCharacter", response.status, response.body);
  const created = await decode(Schemas.OperationResult, response.body);
  const id = created.character?.id;
  if (!id) throw new Error("PC creation returned no character id");
  const detail = await api.get(`characters/${id}`);
  const character = await decode(Schemas.Character, detail.body);
  const stored: Record<string, number> = {};
  for (const attribute of character.talent.attributes) {
    for (const action of attribute.actions) stored[action.name] = action.rating;
  }
  expect(stored).toEqual(ratings);
});

expectValidation(
  "C1PC-DEFAULTS-CONFLICT-001",
  `a submitted value conflicting with a defaulted action is rejected naming the action and its default`,
  (() => {
    const ratings = allocate(BLADES, CUTTER);
    // Move one defaulted dot onto an unlocked action: budget and cap stay
    // satisfied; only the match-with-default rule is violated.
    const [conflictAction, defaultValue] = Object.entries(cutterDefaults)[0];
    const receiver = actionNames(BLADES).find(
      (name) => !(name in cutterDefaults) && ratings[name] < STARTING_MAX,
    );
    if (!receiver) throw new Error("no receiver action available for conflict case");
    ratings[conflictAction] = defaultValue - 1;
    ratings[receiver] += 1;
    return { gameStem: BLADES, playbook: CUTTER, actionRatings: ratings };
  })(),
  [Object.keys(cutterDefaults)[0], String(Object.values(cutterDefaults)[0])],
);

testCase("C1PC-DEFAULTS-OMITTED-001", "omitted defaulted actions take their DefaultActionPoints via the overlay", async () => {
  const ratings = allocate(BLADES, CUTTER);
  for (const action of Object.keys(cutterDefaults)) delete ratings[action];
  const response = await api.post("characters/pc", { gameStem: BLADES, playbook: CUTTER, actionRatings: ratings });
  expect(response.status).toBe(200);
  assertResponseValid("createPcCharacter", response.status, response.body);
  const created = await decode(Schemas.OperationResult, response.body);
  const id = created.character?.id;
  if (!id) throw new Error("PC creation returned no character id");
  const detail = await api.get(`characters/${id}`);
  const character = await decode(Schemas.Character, detail.body);
  const stored: Record<string, number> = {};
  for (const attribute of character.talent.attributes) {
    for (const action of attribute.actions) stored[action.name] = action.rating;
  }
  const expected = { ...ratings, ...cutterDefaults };
  expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(STARTING_DOTS);
  expect(stored).toEqual(expected);
});

testCase("C1PC-GAME-NOT-FOUND-001", "unknown game stem keeps the shared create semantics (GAME_NOT_FOUND domain failure)", async () => {
  const { status, body } = await postPc({
    gameStem: "not-a-real-game",
    playbook: firstPlaybook(BLADES),
    actionRatings: allocate(BLADES),
  });
  expect(status).toBe(200);
  assertResponseValid("createPcCharacter", status, body);
  expect(body.error?.code).toBe("GAME_NOT_FOUND");
});

testCase("C1PC-GRANDFATHER-001", "unvalidated path still accepts zero-rating characters", async () => {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  assertResponseValid("createCharacter", response.status, response.body);
  const created = await decode(Schemas.OperationResult, response.body);
  expect(created.ok).toBe(true);
  const id = created.character?.id;
  if (!id) throw new Error("character seeding returned no id");

  const detail = await api.get(`characters/${id}`);
  expect(detail.status).toBe(200);
  const character = await decode(Schemas.Character, detail.body);
  const ratings: number[] = character.talent.attributes.flatMap((attribute) =>
    attribute.actions.map((action) => action.rating),
  );
  expect(ratings.length).toBeGreaterThan(0);
  // The zero-rating allocation the validated path rejects is business as
  // usual on the unvalidated path (grandfathering, DEC-01).
  expect(ratings.every((rating) => rating === 0)).toBe(true);
});

testCase("C1PC-SETTING-ABSENT-001", "game without a published PC budget returns NOT_FOUND naming the absent keys", async () => {
  const svActions = actionNames(SV);
  const zeroRatings = Object.fromEntries(svActions.map((name) => [name, 0]));
  const { status, body } = await postPc({
    gameStem: SV,
    playbook: firstPlaybook(SV),
    actionRatings: zeroRatings,
  });
  expect(status).toBe(404);
  assertResponseValid("createPcCharacter", status, body);
  expect(body.error?.code).toBe("NOT_FOUND");
});
