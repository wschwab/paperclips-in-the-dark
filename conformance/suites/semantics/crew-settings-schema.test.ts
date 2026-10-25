import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { AnySchemaObject } from "ajv";

// ajv is CJS with no "exports" map; loaded via createRequire (see error-union.test.ts).
const require = createRequire(import.meta.url);
const Ajv2020: typeof import("ajv/dist/2020.js").Ajv2020 = require("ajv/dist/2020");

const gamesDir = fileURLToPath(new URL("../../../data/games/", import.meta.url));
const json = (name: string): unknown => JSON.parse(readFileSync(`${gamesDir}${name}`, "utf8"));

describe("crew settings schema", () => {
  it("every shipped *-crews.json validates against crew-settings-schema.json", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(json("crew-settings-schema.json") as AnySchemaObject);
    const files = readdirSync(gamesDir).filter(name => name.endsWith("-crews.json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const ok = validate(json(file));
      expect(ok, `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });
});
