#!/usr/bin/env node

// SC-C5: Ada validator metadata generator (SC-R1 selection).
//
// Emits Pitd_Schema_Validators (spec + body) into
// backend-ada/server/src/generated/ in the SC-R1 spike emission shape
// (validator-spike.mdx §4 / Appendix A): Required_*/Allowed_* delimiter-list
// constants, one Check_* procedure per nested object/array item, deduplicated
// pattern matchers / enum membership / numeric-bound checks, and a
// Validate_<Entity> entry point per entity DTO and campaign $defs root.
//
// Deterministic and idempotent: the output is a pure function of the five
// schema files. The generator fails loudly on unsupported constructs instead
// of emitting a partial validator. SC-A1 consumes the unit in Wave 4; it is
// NOT referenced by server code yet (do not wire into builds).
//
//   node skill/generate-ada-validators.mjs            # committed location
//   node skill/generate-ada-validators.mjs --out <d>  # elsewhere (tests)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, repoRoot, schemaDir } from "./contract-lib.mjs";

const skillDir = dirname(fileURLToPath(import.meta.url));
const defaultOutDir = resolve(repoRoot, "backend-ada/server/src/generated");
const outFlag = process.argv.indexOf("--out");
const outDir = outFlag >= 0 ? resolve(process.argv[outFlag + 1]) : defaultOutDir;

// ---------------------------------------------------------------------------
// Schema loading and reference resolution
// ---------------------------------------------------------------------------

const FILE_ORDER = ["common", "character", "crew", "clock", "campaign"];
const schemas = {};
for (const file of FILE_ORDER) {
  schemas[file] = await readJson(resolve(schemaDir, `${file}.json`));
}

const ENTITY_ROOTS = [
  { file: "character", def: null },
  { file: "crew", def: null },
  { file: "clock", def: null },
];
// campaign.json is a $defs-only file; every def root becomes an entry point.
const CAMPAIGN_DEFS = Object.keys(schemas.campaign.$defs ?? {});

// Builtin checkers (pre-declared in the body before any generated node).
const BUILTIN = {
  string: "Check_Str",
  boolean: "Check_Bool",
  minLength1: "Check_Min_Length_1",
  stringArray: "Check_String_Array",
  containerArray: "Check_Effect_Array",
};

const REF_RE = /^([A-Za-z0-9-]+\.json)?#\/\$defs\/([A-Za-z0-9_]+)$/;

function resolveRef(ref, file) {
  const match = REF_RE.exec(ref);
  if (!match) throw new Error(`${file}.json: unsupported $ref "${ref}"`);
  const targetFile = match[1] ? match[1].replace(/\.json$/, "") : file;
  if (!schemas[targetFile]) throw new Error(`${file}.json: unknown $ref file "${match[1]}"`);
  const defName = match[2];
  if (!schemas[targetFile].$defs?.[defName]) {
    throw new Error(`${file}.json: $ref "${ref}" targets missing $defs.${defName}`);
  }
  return { file: targetFile, def: defName };
}

const defKey = (file, def) => `${file}#/$defs/${def}`;
const pathKey = (file, tokens) => `${file}#/${tokens.join("/")}`;

// ---------------------------------------------------------------------------
// Identifier naming (deterministic)
// ---------------------------------------------------------------------------

const ADa_KEYWORDS = new Set([
  "abort", "abs", "abstract", "accept", "access", "aliased", "all", "and",
  "array", "at", "begin", "body", "case", "constant", "declare", "delay",
  "delta", "digits", "do", "else", "elsif", "end", "entry", "exception",
  "exit", "for", "function", "generic", "goto", "if", "in", "interface",
  "is", "limited", "loop", "mod", "new", "not", "null", "of", "or", "others",
  "out", "overriding", "package", "pragma", "private", "procedure",
  "protected", "raise", "range", "record", "rem", "renames", "requeue",
  "return", "reverse", "select", "separate", "some", "subtype", "synchronized",
  "tagged", "task", "terminate", "then", "type", "until", "use", "when",
  "while", "with", "xor",
]);

function toAdaIdentifier(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`cannot map "${name}" to an Ada identifier (unsupported characters)`);
  }
  const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const ident = snake
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("_");
  if (ADa_KEYWORDS.has(ident.toLowerCase()) || ADa_KEYWORDS.has(ident)) {
    throw new Error(`"${name}" maps to the Ada keyword "${ident}"`);
  }
  return ident;
}

const nameRegistry = new Map();
function uniqueName(key, base) {
  const candidate = toAdaIdentifier(base);
  if (nameRegistry.has(candidate) && nameRegistry.get(candidate) !== key) {
    throw new Error(`Ada identifier collision: "${candidate}" for ${key} and ${nameRegistry.get(candidate)}`);
  }
  nameRegistry.set(candidate, key);
  return candidate;
}

// ---------------------------------------------------------------------------
// Schema graph walk
// ---------------------------------------------------------------------------

const nodes = []; // { key, kind, ... } in registration (walk) order
const nodeIndex = new Map();
const patternRegistry = new Map(); // regex -> checker name
const boundRegistry = new Map(); // "min:max" -> checker name

// Required_*/Allowed_* constant text per object node key.
const objectConstants = new Map();

function registerPattern(regex) {
  if (patternRegistry.has(regex)) return patternRegistry.get(regex);
  let checker;
  switch (regex) {
    case "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$":
      checker = "Check_Uuid";
      break;
    case "^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$":
      checker = "Check_Crew_Id";
      break;
    case "^[A-Za-z0-9-]+$":
      checker = "Check_Game_Stem";
      break;
    case "^[a-z0-9]+(?:-[a-z0-9]+)*$":
      checker = "Check_Claim_Id";
      break;
    case "^[0-9]{17}-[A-Za-z0-9]+$":
      checker = "Check_Snapshot_Id";
      break;
    case "^(sha256:[0-9a-f]{64})?$":
      checker = "Check_Delete_Token";
      break;
    default:
      throw new Error(`unsupported pattern "${regex}" (add a matcher to the generator)`);
  }
  patternRegistry.set(regex, checker);
  return checker;
}

function registerBound(min, max) {
  const key = `${min ?? "n"}:${max ?? "n"}`;
  if (boundRegistry.has(key)) return boundRegistry.get(key);
  let checker;
  if (min === undefined && max === undefined) {
    checker = "Check_Any_Int";
  } else if (min === 0 && max === undefined) {
    checker = "Check_Int_Min_0";
  } else if (min === 1 && max === undefined) {
    checker = "Check_Int_Min_1";
  } else {
    checker = `Check_Int_Min_${min}_Max_${max}`;
  }
  boundRegistry.set(key, checker);
  return checker;
}

function registerNode(node) {
  if (nodeIndex.has(node.key)) return nodeIndex.get(node.key);
  nodeIndex.set(node.key, node);
  nodes.push(node);
  return node;
}

function registerEnum(key, members, pathTokens) {
  const node = { key, kind: "enum", members };
  node.name = uniqueName(key, pathTokens.map(toAdaIdentifier).join("_"));
  return registerNode(node);
}

function registerConst(key, value, pathTokens) {
  const node = { key, kind: "const", value };
  node.name = uniqueName(key, pathTokens.map(toAdaIdentifier).join("_"));
  return registerNode(node);
}

function registerConstInt(key, value, pathTokens) {
  const node = { key, kind: "constInt", value };
  node.name = uniqueName(key, pathTokens.map(toAdaIdentifier).join("_"));
  return registerNode(node);
}

function registerObject(key, schema, file, pathTokens) {
  if (nodeIndex.has(key)) return nodeIndex.get(key);
  if (schema.additionalProperties !== false) {
    throw new Error(`${file}.json: object at ${key} must set additionalProperties: false`);
  }
  if (!Array.isArray(schema.required)) {
    throw new Error(`${file}.json: object at ${key} must declare a required list`);
  }
  const name = uniqueName(key, pathTokens[pathTokens.length - 1]);
  const node = {
    key,
    kind: "object",
    name,
    required: [...schema.required],
    props: [],
    extensions: [],
  };
  nodeIndex.set(key, node);
  nodes.push(node);

  if (schema.if) {
    node.extensions.push(parseConditional(schema, key, file));
  }
  if (schema["x-segmentsLeSize"] !== undefined) {
    node.extensions.push("segmentsLeSize");
  }

  const allowed = [];
  for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
    if (propName.includes("/") || propName.includes("~")) {
      throw new Error(`${file}.json: property "${propName}" needs RFC 6901 escaping`);
    }
    allowed.push(propName);
    node.props.push({
      name: propName,
      checker: checkerFor(propSchema, file, [...pathTokens, propName]),
    });
  }
  objectConstants.set(key, {
    required: [...schema.required],
    allowed,
  });
  return node;
}

function parseConditional(schema, key, file) {
  const ifProps = schema.if.properties ?? {};
  const thenProps = schema.then?.properties ?? {};
  const ifEntries = Object.entries(ifProps);
  const thenEntries = Object.entries(thenProps);
  if (ifEntries.length !== 1 || thenEntries.length !== 1) {
    throw new Error(`${file}.json: unsupported if/then at ${key} (exactly one property per side required)`);
  }
  const [ifProp, ifSchema] = ifEntries[0];
  const [thenProp, thenSchema] = thenEntries[0];
  if (typeof ifSchema.const !== "string") {
    throw new Error(`${file}.json: unsupported if/then at ${key} (if const must be a string)`);
  }
  if (typeof thenSchema.const !== "string" && typeof thenSchema.const !== "number") {
    throw new Error(`${file}.json: unsupported if/then at ${key} (then const must be string or number)`);
  }
  return { kind: "conditional", ifProp, ifConst: ifSchema.const, thenProp, thenConst: thenSchema.const };
}

function registerArray(key, schema, file, pathTokens) {
  if (nodeIndex.has(key)) return nodeIndex.get(key);
  const items = schema.items;
  const name = uniqueName(key, pathTokens[pathTokens.length - 1]);
  const node = { key, kind: "array", name };

  // Item object names derive from the array token via the singular form
  // (attributes -> Attribute, abilities -> Ability, gearItems -> Gear_Item).
  const itemToken = (() => {
    const token = pathTokens[pathTokens.length - 1];
    if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.endsWith("s")) return token.slice(0, -1);
    return `${token}Item`;
  })();
  const itemPath = [...pathTokens.slice(0, -1), itemToken];
  const itemKey = pathKey(file, itemPath);

  if (items.type === "string" && items.pattern && schema.uniqueItems) {
    if (items.pattern !== "^[a-z0-9]+(?:-[a-z0-9]+)*$") {
      throw new Error(`${file}.json: unsupported unique string-array pattern at ${key}`);
    }
    node.variant = "uniqueClaimIds";
  } else if (items.$ref && schema.uniqueItems) {
    const target = resolveRef(items.$ref, file);
    if (!(target.file === "common" && target.def === "uuid")) {
      throw new Error(`${file}.json: unsupported uniqueItems $ref array at ${key}`);
    }
    node.variant = "uniqueUuids";
  } else if (items.$ref) {
    node.variant = "plain";
    node.itemKey = ensureDef(items.$ref, file);
  } else if (items.type === "object") {
    node.variant = "plain";
    node.itemKey = registerObject(
      itemKey,
      items,
      file,
      itemPath,
    ).key;
  } else {
    throw new Error(`${file}.json: unsupported array items at ${key}: ${JSON.stringify(items)}`);
  }
  nodeIndex.set(key, node);
  nodes.push(node);
  return node;
}

/** Checker for an array property: builtin for simple shapes, node otherwise. */
function arrayChecker(schema, file, pathTokens) {
  const items = schema.items;
  if (items.type === "string" && !items.pattern && !schema.uniqueItems) {
    return BUILTIN.stringArray;
  }
  if (items.type === "object" && !items.properties && !items.required) {
    return BUILTIN.containerArray;
  }
  const key = pathKey(file, pathTokens);
  return registerArray(key, schema, file, pathTokens).key;
}

function ensureDef(ref, file) {
  const target = resolveRef(ref, file);
  const key = defKey(target.file, target.def);
  if (nodeIndex.has(key)) return key;
  const defSchema = schemas[target.file].$defs[target.def];
  if (defSchema.type === "object") {
    registerObject(key, defSchema, target.file, [target.def]);
    return key;
  }
  if (defSchema.type === "array") {
    return arrayChecker(defSchema, target.file, [target.def]);
  }
  if (defSchema.enum) {
    registerEnum(key, defSchema.enum, [target.def]);
    return key;
  }
  // Leaf defs (uuid, timestamp, revision, formatVersion, notes, ...) resolve
  // to a builtin checker; no node is registered.
  return checkerFor(defSchema, target.file, [target.def]);
}

function checkerFor(schema, file, pathTokens) {
  if (schema.$ref) {
    return ensureDef(schema.$ref, file);
  }
  switch (schema.type) {
    case "object": {
      const key = pathKey(file, pathTokens);
      return registerObject(key, schema, file, pathTokens).key;
    }
    case "array": {
      return arrayChecker(schema, file, pathTokens);
    }
    case "string": {
      if (schema.pattern) return registerPattern(schema.pattern);
      if (schema.minLength !== undefined) {
        if (schema.minLength !== 1) {
          throw new Error(`${file}.json: unsupported minLength ${schema.minLength} at ${pathTokens.join("/")}`);
        }
        return BUILTIN.minLength1;
      }
      return BUILTIN.string;
    }
    case "boolean":
      return BUILTIN.boolean;
    case "integer": {
      if (schema.const !== undefined) {
        if (typeof schema.const !== "number" || !Number.isInteger(schema.const)) {
          throw new Error(`${file}.json: unsupported non-integer const at ${pathTokens.join("/")}`);
        }
        const key = pathKey(file, pathTokens);
        return registerConstInt(key, schema.const, pathTokens).key;
      }
      if (schema.minimum !== undefined && schema.maximum !== undefined) {
        return registerBound(schema.minimum, schema.maximum);
      }
      return registerBound(schema.minimum, schema.maximum);
    }
    default:
      break;
  }
  if (schema.enum) {
    const key = pathKey(file, pathTokens);
    return registerEnum(key, schema.enum, pathTokens).key;
  }
  if (schema.const !== undefined) {
    if (typeof schema.const !== "string") {
      throw new Error(`${file}.json: unsupported non-string const at ${pathTokens.join("/")}`);
    }
    const key = pathKey(file, pathTokens);
    return registerConst(key, schema.const, pathTokens).key;
  }
  if (schema.format) return BUILTIN.string; // date-time stays an annotation
  throw new Error(
    `${file}.json: unsupported schema construct at ${pathTokens.join("/")}: ` +
      JSON.stringify(schema).slice(0, 200),
  );
}

// Walk entity roots first (fixed order), then campaign $defs (file order).
for (const { file, def } of ENTITY_ROOTS) {
  const rootKey = def ? defKey(file, def) : `${file}#root`;
  if (def) {
    ensureDef(`#/$defs/${def}`, file);
  } else {
    registerObject(rootKey, schemas[file], file, [file]);
  }
}
for (const def of CAMPAIGN_DEFS) {
  ensureDef(`#/$defs/${def}`, "campaign");
}

// ---------------------------------------------------------------------------
// Topological order for object/array checker procedures
// ---------------------------------------------------------------------------

const dependencies = new Map(); // key -> Set of node keys it references
for (const node of nodes) {
  const deps = new Set();
  if (node.kind === "object") {
    for (const prop of node.props) {
      if (nodeIndex.has(prop.checker)) deps.add(prop.checker);
    }
  } else if (node.kind === "array" && node.variant === "plain") {
    deps.add(node.itemKey);
  }
  dependencies.set(node.key, deps);
}

// Kahn's algorithm; ties broken by registration order.
const registrationIndex = new Map(nodes.map((node, index) => [node.key, index]));
const remaining = new Map();
for (const [key, deps] of dependencies) remaining.set(key, new Set(deps));
const ordered = [];
const pending = nodes
  .filter((node) => remaining.get(node.key).size === 0)
  .sort((a, b) => registrationIndex.get(a.key) - registrationIndex.get(b.key));
while (pending.length > 0) {
  const node = pending.shift();
  ordered.push(node);
  for (const candidate of nodes) {
    const deps = remaining.get(candidate.key);
    if (!deps.has(node.key)) continue;
    deps.delete(node.key);
    if (deps.size === 0) {
      pending.push(candidate);
      pending.sort((a, b) => registrationIndex.get(a.key) - registrationIndex.get(b.key));
    }
  }
}
if (ordered.length !== nodes.length) {
  throw new Error("schema graph contains a cycle (unsupported: $recursiveRef-like shapes)");
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

const HEADER = `--  Generated by skill/generate-ada-validators.mjs (SC-C5) — DO NOT EDIT BY HAND.
--
--  Schema-derived recursive entity validators in the SC-R1 spike emission
--  shape (docs/pages/contract/wave0/validator-spike.mdx §4 and Appendix A).
--  Regenerate with:
--
--      node skill/generate-ada-validators.mjs
--
--  Inputs (single source of truth):
--      contract/schemas/common.json
--      contract/schemas/character.json
--      contract/schemas/crew.json
--      contract/schemas/clock.json
--      contract/schemas/campaign.json
--
--  Constructs enforced: nested required, nested additionalProperties: false,
--  external/internal $ref (inlined), enums, consts, patterns, numeric bounds,
--  minLength, string arrays, uniqueItems, container-only arrays, the clock
--  if/then conditional (behavior "bounded" implies rollover 0), and the
--  x-segmentsLeSize admission rule. "date-time" is an annotation (Draft
--  2020-12 default) and is not asserted.
--
--  Determinism: fixed walk order (schema property order), fixed emission
--  order (topological, registration-stable), RFC 6901 pointers with 0-based
--  array indices, unknown-key reports ordered by the emitted allowed-set
--  comparison. Output is a pure function of the schema files.
--
--  Consumption: SC-A1 wires this unit into server admission in Wave 4. It is
--  not referenced by server code yet.`;

const SPEC = `with GNATCOLL.JSON;

package Pitd_Schema_Validators is

   procedure Reset;

   function N_Errors return Natural;
   function Valid return Boolean;
   function Pointer (I : Positive) return String;
   function Reason (I : Positive) return String;

   procedure Validate_Character (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Character_Summary (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Clock (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Crew (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Crew_Summary (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Campaign (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Health (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_History_Entry (V : GNATCOLL.JSON.JSON_Value);
   procedure Validate_Roster (V : GNATCOLL.JSON.JSON_Value);

end Pitd_Schema_Validators;
`;

const body = [];
body.push(`with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with GNATCOLL.JSON;

package body Pitd_Schema_Validators is

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;

   Max_Errors : constant := 1024;
   type Entry_Rec is record
      Ptr : Unbounded_String;
      Msg : Unbounded_String;
   end record;
   Table : array (1 .. Max_Errors) of Entry_Rec;
   N : Natural := 0;

   procedure Reset is
   begin
      N := 0;
   end Reset;

   function N_Errors return Natural is (N);

   function Valid return Boolean is (N = 0);

   function Pointer (I : Positive) return String is
     (To_String (Table (I).Ptr));

   function Reason (I : Positive) return String is
     (To_String (Table (I).Msg));

   procedure Report (Ptr : String; Msg : String) is
   begin
      if N < Max_Errors then
         N := N + 1;
         Table (N) := (To_Unbounded_String (Ptr), To_Unbounded_String (Msg));
      end if;
   end Report;

   function Kind_Name (K : JSON_Value_Type) return String is
   begin
      case K is
         when JSON_Null_Type    => return "null";
         when JSON_Boolean_Type => return "boolean";
         when JSON_Int_Type     => return "integer";
         when JSON_Float_Type   => return "number";
         when JSON_String_Type  => return "string";
         when JSON_Array_Type   => return "array";
         when JSON_Object_Type  => return "object";
      end case;
   end Kind_Name;

   --  Unambiguous string accessor (avoids UTF8_String/XString overload clash).
   function S (V : JSON_Value) return String is
     (Ada.Strings.Unbounded.To_String (Get (V)));

   --  RFC 6901 array-index token: 0-based.
   function Idx (I : Positive) return String is
     (Ada.Strings.Fixed.Trim (Integer'Image (I - 1), Ada.Strings.Left));

   --  Delimiter-list helpers: lists are "|a|b|c|".
   function In_List (Item : String; List : String) return Boolean is
     (Ada.Strings.Fixed.Index (List, "|" & Item & "|") /= 0);

   --  Type + nested required + nested additionalProperties: false.
   --  Each violation is reported at its own JSON pointer.
   procedure Check_Object (V : JSON_Value; Ptr : String;
                           Required : String; Allowed : String) is
      Pos : Positive := 1;
      J   : Natural;
   begin
      if V.Kind /= JSON_Object_Type then
         Report (Ptr, "type: expected object, found " & Kind_Name (V.Kind));
         return;
      end if;

      while Pos < Required'Length loop
         J := Ada.Strings.Fixed.Index (Required, "|", Pos + 1);
         exit when J = 0;
         declare
            F : constant String := Required (Pos + 1 .. J - 1);
         begin
            if not Has_Field (V, F) then
               Report (Ptr & "/" & F, "missing required property");
            end if;
         end;
         Pos := J;
      end loop;

      declare
         Allowed_Passed : Boolean := True;
         Bad_Name : Unbounded_String := Null_Unbounded_String;
         procedure Check_Allowed (Name : UTF8_String; Value : JSON_Value) is
         begin
            if not In_List (Name, Allowed) then
               Allowed_Passed := False;
               Bad_Name := To_Unbounded_String (Name);
            end if;
         end Check_Allowed;
      begin
         Map_JSON_Object (V, Check_Allowed'Access);
         if not Allowed_Passed then
            Report (Ptr & "/" & To_String (Bad_Name),
                    "unknown property (additionalProperties: false)");
         end if;
      end;
   end Check_Object;

   --  Leaf type checkers.
   procedure Check_Str (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      end if;
   end Check_Str;

   procedure Check_Bool (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_Boolean_Type then
         Report (Ptr, "type: expected boolean, found " & Kind_Name (V.Kind));
      end if;
   end Check_Bool;

   procedure Check_Int (V : JSON_Value; Ptr : String;
                        Min : Integer; Max : Integer) is
   begin
      if V.Kind /= JSON_Int_Type then
         Report (Ptr, "type: expected integer, found " & Kind_Name (V.Kind));
      elsif Get (V) < Min or else Get (V) > Max then
         Report (Ptr, "range: " & Integer'Image (Get (V))
                 & " outside [" & Integer'Image (Min)
                 & " .. " & Integer'Image (Max) & "]");
      end if;
   end Check_Int;`);

// Named numeric-bound checkers (one per distinct (minimum, maximum) pair).
for (const [key, checker] of boundRegistry) {
  const [minText, maxText] = key.split(":");
  const min = minText === "n" ? "Integer'First" : minText;
  const max = maxText === "n" ? "Integer'Last" : maxText;
  body.push(`
   procedure ${checker} (V : JSON_Value; Ptr : String) is
   begin
      Check_Int (V, Ptr, ${min}, ${max});
   end ${checker};`);
}

// Pattern matcher functions (one per distinct regex) and their checkers.
const PATTERN_FUNCTIONS = {
  Check_Uuid: {
    function: "Is_Uuid",
    doc: "--  ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    body: `   function Is_Uuid (S : String) return Boolean is
      Hex : constant String := "0123456789abcdef";
   begin
      if S'Length /= 36 then
         return False;
      end if;
      if S (9) /= '-' or else S (14) /= '-' or else S (19) /= '-'
        or else S (24) /= '-' then
         return False;
      end if;
      if S (15) /= '4' then
         return False;
      end if;
      if S (20) /= '8' and then S (20) /= '9' and then S (20) /= 'a'
        and then S (20) /= 'b' then
         return False;
      end if;
      for I in S'Range loop
         if I = 9 or else I = 14 or else I = 19 or else I = 24 then
            null;
         elsif Ada.Strings.Fixed.Index (Hex, S (I) & "") = 0 then
            return False;
         end if;
      end loop;
      return True;
   end Is_Uuid;`,
    checker: `   procedure Check_Uuid (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Uuid (S (V)) then
         Report (Ptr, "pattern: """ & S (V) & """ is not a v4 UUID");
      end if;
   end Check_Uuid;`,
  },
  Check_Crew_Id: {
    function: "Is_Uuid_Or_Empty",
    doc: "--  ^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$",
    body: `   function Is_Uuid_Or_Empty (S : String) return Boolean is
     (S'Length = 0 or else Is_Uuid (S));`,
    checker: `   procedure Check_Crew_Id (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Uuid_Or_Empty (S (V)) then
         Report (Ptr, "pattern: """ & S (V) & """ is not a v4 UUID or empty");
      end if;
   end Check_Crew_Id;`,
  },
  Check_Game_Stem: {
    function: "Is_Game_Stem",
    doc: "--  ^[A-Za-z0-9-]+$",
    body: `   function Is_Game_Stem (S : String) return Boolean is
   begin
      if S'Length = 0 then
         return False;
      end if;
      for I in S'Range loop
         case S (I) is
            when 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '-' => null;
            when others => return False;
         end case;
      end loop;
      return True;
   end Is_Game_Stem;`,
    checker: `   procedure Check_Game_Stem (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Game_Stem (S (V)) then
         Report (Ptr, "pattern: """ & S (V) & """ is not ^[A-Za-z0-9-]+$");
      end if;
   end Check_Game_Stem;`,
  },
  Check_Claim_Id: {
    function: "Is_Claim_Id",
    doc: "--  ^[a-z0-9]+(?:-[a-z0-9]+)*$  (no leading/trailing/doubled hyphens)",
    body: `   function Is_Claim_Id (S : String) return Boolean is
   begin
      if S'Length = 0 then
         return False;
      end if;
      for I in S'Range loop
         case S (I) is
            when 'a' .. 'z' | '0' .. '9' | '-' => null;
            when others => return False;
         end case;
      end loop;
      if S (S'First) = '-' or else S (S'Last) = '-' then
         return False;
      end if;
      for I in S'First + 1 .. S'Last loop
         if S (I) = '-' and then S (I - 1) = '-' then
            return False;
         end if;
      end loop;
      return True;
   end Is_Claim_Id;`,
    checker: `   procedure Check_Claim_Id (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Claim_Id (S (V)) then
         Report (Ptr, "pattern: """ & S (V)
                 & """ is not ^[a-z0-9]+(?:-[a-z0-9]+)*$");
      end if;
   end Check_Claim_Id;`,
  },
  Check_Snapshot_Id: {
    function: "Is_Snapshot_Id",
    doc: "--  ^[0-9]{17}-[A-Za-z0-9]+$",
    body: `   function Is_Snapshot_Id (S : String) return Boolean is
   begin
      if S'Length < 19 then
         return False;
      end if;
      for I in S'First .. S'First + 16 loop
         if S (I) not in '0' .. '9' then
            return False;
         end if;
      end loop;
      if S (S'First + 17) /= '-' then
         return False;
      end if;
      for I in S'First + 18 .. S'Last loop
         if S (I) not in 'a' .. 'z' and then S (I) not in 'A' .. 'Z'
           and then S (I) not in '0' .. '9' then
            return False;
         end if;
      end loop;
      return True;
   end Is_Snapshot_Id;`,
    checker: `   procedure Check_Snapshot_Id (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Snapshot_Id (S (V)) then
         Report (Ptr, "pattern: """ & S (V)
                 & """ is not ^[0-9]{17}-[A-Za-z0-9]+$");
      end if;
   end Check_Snapshot_Id;`,
  },
  Check_Delete_Token: {
    function: "Is_Delete_Token",
    doc: "--  ^(sha256:[0-9a-f]{64})?$  (empty, or sha256: + 64 lowercase hex)",
    body: `   function Is_Delete_Token (S : String) return Boolean is
      Hex : constant String := "0123456789abcdef";
   begin
      if S'Length = 0 then
         return True;
      end if;
      if S'Length /= 71 or else S (S'First .. S'First + 6) /= "sha256:" then
         return False;
      end if;
      for I in S'First + 7 .. S'Last loop
         if Ada.Strings.Fixed.Index (Hex, S (I) & "") = 0 then
            return False;
         end if;
      end loop;
      return True;
   end Is_Delete_Token;`,
    checker: `   procedure Check_Delete_Token (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not Is_Delete_Token (S (V)) then
         Report (Ptr, "pattern: """ & S (V)
                 & """ is not ^(sha256:[0-9a-f]{64})?$");
      end if;
   end Check_Delete_Token;`,
  },
};

for (const checkerName of [...patternRegistry.values()]) {
  const pattern = PATTERN_FUNCTIONS[checkerName];
  if (!pattern) throw new Error(`missing pattern matcher emission for ${checkerName}`);
  body.push(`
   ${pattern.doc}
${pattern.body}

${pattern.checker}`);
}

body.push(`
   procedure Check_Enum (V : JSON_Value; Ptr : String; Members : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif not In_List (S (V), Members) then
         Report (Ptr, "enum: """ & S (V) & """ not in " & Members);
      end if;
   end Check_Enum;

   procedure Check_Const (V : JSON_Value; Ptr : String; Expected : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string const """ & Expected
                 & """, found " & Kind_Name (V.Kind));
      elsif S (V) /= Expected then
         Report (Ptr, "const: expected """ & Expected & """, found """
                 & S (V) & """");
      end if;
   end Check_Const;

   procedure Check_Const_Int (V : JSON_Value; Ptr : String; Expected : Integer) is
   begin
      if V.Kind /= JSON_Int_Type then
         Report (Ptr, "type: expected integer const " & Integer'Image (Expected)
                 & ", found " & Kind_Name (V.Kind));
      elsif Get (V) /= Expected then
         Report (Ptr, "const: expected " & Integer'Image (Expected)
                 & ", found " & Integer'Image (Get (V)));
      end if;
   end Check_Const_Int;

   procedure Check_Min_Length_1 (V : JSON_Value; Ptr : String) is
   begin
      if V.Kind /= JSON_String_Type then
         Report (Ptr, "type: expected string, found " & Kind_Name (V.Kind));
      elsif S (V)'Length < 1 then
         Report (Ptr, "minLength: empty string");
      end if;
   end Check_Min_Length_1;

   procedure Check_String_Array (V : JSON_Value; Ptr : String) is
      A : JSON_Array;
   begin
      if V.Kind /= JSON_Array_Type then
         Report (Ptr, "type: expected array, found " & Kind_Name (V.Kind));
         return;
      end if;
      A := Get (V);
      for I in 1 .. Length (A) loop
         if Get (A, I).Kind /= JSON_String_Type then
            Report (Ptr & "/" & Idx (I),
                    "type: expected string, found " & Kind_Name (Get (A, I).Kind));
         end if;
      end loop;
   end Check_String_Array;

   type Item_Check is access procedure (Item : JSON_Value; Ptr : String);

   procedure Check_Array (V : JSON_Value; Ptr : String; Check : Item_Check) is
      A : JSON_Array;
   begin
      if V.Kind /= JSON_Array_Type then
         Report (Ptr, "type: expected array, found " & Kind_Name (V.Kind));
         return;
      end if;
      A := Get (V);
      for I in 1 .. Length (A) loop
         Check (Get (A, I), Ptr & "/" & Idx (I));
      end loop;
   end Check_Array;

   procedure Check_Unique_Strings (V : JSON_Value; Ptr : String) is
      A : JSON_Array;
   begin
      if V.Kind /= JSON_Array_Type then
         Report (Ptr, "type: expected array, found " & Kind_Name (V.Kind));
         return;
      end if;
      A := Get (V);
      for I in 1 .. Length (A) loop
         if Get (A, I).Kind /= JSON_String_Type then
            Report (Ptr & "/" & Idx (I),
                    "type: expected string, found " & Kind_Name (Get (A, I).Kind));
         else
            for J in I + 1 .. Length (A) loop
               if Get (A, J).Kind = JSON_String_Type
                 and then Get (A, J) = Get (A, I) then
                  Report (Ptr & "/" & Idx (J),
                          "uniqueItems: duplicate of item " & Idx (I));
               end if;
            end loop;
         end if;
      end loop;
   end Check_Unique_Strings;

   procedure Check_Effect_Array (V : JSON_Value; Ptr : String) is
   begin
      --  items: {"type": "object"} — container type only.
      if V.Kind /= JSON_Array_Type then
         Report (Ptr, "type: expected array, found " & Kind_Name (V.Kind));
      end if;
   end Check_Effect_Array;

   procedure Check_Prop (Obj : JSON_Value; Ptr : String; Name : String;
                         Check : Item_Check) is
   begin
      if Has_Field (Obj, Name) then
         Check (Get (Obj, Name), Ptr & "/" & Name);
      end if;
   end Check_Prop;`);

// Required_*/Allowed_* constants (registration order).
for (const node of nodes) {
  if (node.kind !== "object") continue;
  const constants = objectConstants.get(node.key);
  const requiredList = `|${constants.required.join("|")}|`;
  const optional = constants.allowed.filter((name) => !constants.required.includes(name));
  body.push(`
   Required_${node.name} : constant String :=
     "${requiredList}";`);
  if (optional.length === 0) {
    body.push(`
   Allowed_${node.name} : constant String := Required_${node.name};`);
  } else {
    body.push(`
   Allowed_${node.name} : constant String :=
     Required_${node.name} & "|${optional.join("|")}|";`);
  }
}

// Enum wrappers (registration order).
for (const node of nodes) {
  if (node.kind !== "enum") continue;
  const members = `|${node.members.join("|")}|`;
  body.push(`
   procedure Check_Enum_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Enum (V, Ptr, "${members}");
   end Check_Enum_${node.name};`);
}

// Const wrappers (registration order).
for (const node of nodes) {
  if (node.kind === "const") {
    body.push(`
   procedure Check_Const_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Const (V, Ptr, "${node.value}");
   end Check_Const_${node.name};`);
  } else if (node.kind === "constInt") {
    body.push(`
   procedure Check_Const_Int_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Const_Int (V, Ptr, ${node.value});
   end Check_Const_Int_${node.name};`);
  }
}

// Object/array checkers (topological order).
function checkerAccessOrBuiltin(checker) {
  return nodeIndex.has(checker) ? checkerAccess(nodeIndex.get(checker)) : `${checker}'Access`;
}

for (const node of ordered) {
  if (node.kind === "object") {
    body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Object (V, Ptr, Required_${node.name}, Allowed_${node.name});`);
    for (const prop of node.props) {
      body.push(`      Check_Prop (V, Ptr, "${prop.name}", ${checkerAccessOrBuiltin(prop.checker)});`);
    }
    body.push(`   end Check_${node.name};`);
  } else if (node.kind === "array") {
    if (node.variant === "plain") {
      const itemNode = nodeIndex.get(node.itemKey);
      body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Array (V, Ptr, Check_${itemNode.name}'Access);
   end Check_${node.name};`);
    } else if (node.variant === "stringArray") {
      body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_String_Array (V, Ptr);
   end Check_${node.name};`);
    } else if (node.variant === "container") {
      body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
   begin
      Check_Effect_Array (V, Ptr);
   end Check_${node.name};`);
    } else if (node.variant === "uniqueClaimIds") {
      body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
      A : JSON_Array;
   begin
      Check_Unique_Strings (V, Ptr);
      if V.Kind = JSON_Array_Type then
         A := Get (V);
         for I in 1 .. Length (A) loop
            if Get (A, I).Kind = JSON_String_Type
              and then not Is_Claim_Id (S (Get (A, I))) then
               Report (Ptr & "/" & Idx (I),
                       "pattern: not a claim id");
            end if;
         end loop;
      end if;
   end Check_${node.name};`);
    } else if (node.variant === "uniqueUuids") {
      body.push(`
   procedure Check_${node.name} (V : JSON_Value; Ptr : String) is
      A : JSON_Array;
   begin
      Check_Unique_Strings (V, Ptr);
      if V.Kind = JSON_Array_Type then
         A := Get (V);
         for I in 1 .. Length (A) loop
            if Get (A, I).Kind = JSON_String_Type
              and then not Is_Uuid (S (Get (A, I))) then
               Report (Ptr & "/" & Idx (I),
                       "pattern: not a v4 UUID");
            end if;
         end loop;
      end if;
   end Check_${node.name};`);
    }
  }
}

function checkerAccess(node) {
  switch (node.kind) {
    case "object":
      return `Check_${node.name}'Access`;
    case "array":
      return `Check_${node.name}'Access`;
    case "enum":
      return `Check_Enum_${node.name}'Access`;
    case "const":
      return `Check_Const_${node.name}'Access`;
    case "constInt":
      return `Check_Const_Int_${node.name}'Access`;
    default:
      throw new Error(`unexpected node kind ${node.kind}`);
  }
}

// Clock extension checks (if/then conditional + x-segmentsLeSize).
for (const node of nodes) {
  if (node.kind !== "object" || node.extensions.length === 0) continue;
  for (const extension of node.extensions) {
    if (extension === "segmentsLeSize") {
      body.push(`
   procedure Check_Segments_Le_Size (V : JSON_Value; Ptr : String) is
   begin
      --  x-segmentsLeSize admission rule (clock.json): segments <= size.
      if Has_Field (V, "segments") and then Has_Field (V, "size") then
         if Get (V, "segments").Kind = JSON_Int_Type
           and then Get (V, "size").Kind = JSON_Int_Type
           and then Integer'(Get (Get (V, "segments")))
                      > Integer'(Get (Get (V, "size"))) then
            Report (Ptr & "/segments",
                    "x-segmentsLeSize: segments exceed size");
         end if;
      end if;
   end Check_Segments_Le_Size;`);
    } else if (extension.kind === "conditional") {
      const thenKind = typeof extension.thenConst === "number" ? "Int" : "String";
      const thenCheck = typeof extension.thenConst === "number"
        ? `Integer'(Get (Get (V, "${extension.thenProp}"))) /= ${extension.thenConst}`
        : `S (Get (V, "${extension.thenProp}")) /= "${extension.thenConst}"`;
      const expected = typeof extension.thenConst === "number"
        ? String(extension.thenConst)
        : `""${extension.thenConst}""`;
      body.push(`
   procedure Check_${node.name}_Conditional (V : JSON_Value; Ptr : String) is
   begin
      --  ${node.name.replace(/_/g, " ")} if/then: when "${extension.ifProp}" is
      --  "${extension.ifConst}", "${extension.thenProp}" must be ${extension.thenConst}.
      if Has_Field (V, "${extension.ifProp}")
        and then Has_Field (V, "${extension.thenProp}") then
         if Get (V, "${extension.ifProp}").Kind = JSON_String_Type
           and then S (Get (V, "${extension.ifProp}")) = "${extension.ifConst}"
           and then Get (V, "${extension.thenProp}").Kind = JSON_${thenKind}_Type
           and then ${thenCheck} then
            Report (Ptr & "/${extension.thenProp}",
                    "const: expected ${expected} when ${extension.ifProp} is "
                    & """${extension.ifConst}""");
         end if;
      end if;
   end Check_${node.name}_Conditional;`);
    }
  }
}

// Entry points (alphabetical).
const entryPoints = [
  ...ENTITY_ROOTS.map(({ file, def }) => ({
    key: def ? defKey(file, def) : `${file}#root`,
    name: def ? toAdaIdentifier(def) : toAdaIdentifier(file),
  })),
  ...CAMPAIGN_DEFS.map((def) => ({
    key: defKey("campaign", def),
    name: toAdaIdentifier(def),
  })),
];
entryPoints.sort((a, b) => a.name.localeCompare(b.name));

for (const { key, name } of entryPoints) {
  const node = nodeIndex.get(key);
  if (!node) throw new Error(`no schema node for entry point ${key}`);
  body.push(`
   procedure Validate_${name} (V : JSON_Value) is
   begin`);
  if (node.kind === "object") {
    body.push(`      Check_Object (V, "", Required_${node.name}, Allowed_${node.name});`);
    for (const prop of node.props) {
      body.push(`      Check_Prop (V, "", "${prop.name}", ${checkerAccessOrBuiltin(prop.checker)});`);
    }
    for (const extension of node.extensions) {
      if (extension === "segmentsLeSize") {
        body.push(`      Check_Segments_Le_Size (V, "");`);
      } else if (extension.kind === "conditional") {
        body.push(`      Check_${node.name}_Conditional (V, "");`);
      }
    }
  } else if (node.kind === "array") {
    body.push(`      Check_${node.name} (V, "");`);
  }
  body.push(`   end Validate_${name};`);
}

body.push(`
end Pitd_Schema_Validators;
`);

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "pitd_schema_validators.ads"), `${HEADER}\n\n${SPEC}`, "utf8");
await writeFile(resolve(outDir, "pitd_schema_validators.adb"), `${HEADER}\n${body.join("\n")}`, "utf8");
