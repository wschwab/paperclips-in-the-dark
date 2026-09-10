import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("stored-read allocation regressions", () => {
  it("[TOOLING-READ-PERF-001] does not allocate/sort known keys during removal discovery", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/src/pitd_normalize.adb", import.meta.url,
    )), "utf8");
    const walker = source.slice(source.indexOf("procedure List_Removals"), source.indexOf("end List_Removals;"));
    expect(walker).not.toContain("Collect_Keys (O)");
    expect(walker).toContain("Collect_Removal_Keys (O, Allowed, Exempt)");
    const collector = source.slice(source.indexOf("function Collect_Removal_Keys"), source.indexOf("end Collect_Removal_Keys;"));
    expect(collector).toMatch(/if not In_Allowed[\s\S]*Exempt[\s\S]*then\s+Append \(K,/);
    expect(collector).toContain("Sort (K, Less_Keys'Access)");
  });

  it("[TOOLING-READ-PERF-002] reuses the parsed entity for normalization", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/src/pitd_stored.adb", import.meta.url,
    )), "utf8");
    const classifier = source.slice(source.indexOf("procedure Classify_Stored"), source.indexOf("end Classify_Stored;"));
    expect(classifier).toContain("Ctx := Pitd_Normalize.Canonicalize (Kind, Id, E);");
    expect(classifier.match(/E := Read \(Bytes\);/g)).toHaveLength(1);
  });

  it("[TOOLING-READ-PERF-003] optimizes production server code without disabling checks", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/paperclips_server.gpr", import.meta.url,
    )), "utf8");
    const manifest = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/alire.toml", import.meta.url,
    )), "utf8");
    expect(manifest).toMatch(/\[gpr-set-externals\][\s\S]*GPR_BUILD = "production"/);
    expect(source).toContain('Build_Mode := external ("GPR_BUILD", "production");');
    expect(source).toMatch(/case Build_Mode is\s+when "production" =>\s+for Default_Switches \("Ada"\) use \("-gnat2022", "-O2"\);/);
    expect(source).not.toContain("-gnatp");
  });

  it("[TOOLING-READ-PERF-004] checks allowed names without allocating wrapped strings", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/src/pitd_normalize.adb", import.meta.url,
    )), "utf8");
    const membership = source.slice(source.indexOf("function In_Allowed"), source.indexOf("end In_Allowed;"));
    expect(membership).toContain("Allowed'Length < 2 or else Name'Length > Allowed'Length - 2");
    expect(membership).toContain("Allowed'First .. Allowed'Last - Name'Length - 1");
    expect(membership).not.toContain('"|" & Name & "|"');
    expect(membership).toContain("Allowed (I + 1 .. I + Name'Length) = Name");
    expect(membership).toContain("Allowed (I) = '|'");
    expect(membership).toContain("Allowed (I + Name'Length + 1) = '|'");
  });

  it("[TOOLING-READ-PERF-005] reuses immutable canonical strings after a single field lookup", () => {
    const source = readFileSync(fileURLToPath(new URL(
      "../../backend-ada/server/src/pitd_normalize.adb", import.meta.url,
    )), "utf8");
    const strings = source.slice(source.indexOf("function N_Str ("), source.indexOf("end N_Str;"));
    expect(strings).toContain("if V.Kind = JSON_String_Type then return V; end if;");
    expect(strings.match(/Get \(O, Name\)/g)).toHaveLength(1);
    const required = source.slice(source.indexOf("function N_Str_Required"), source.indexOf("end N_Str_Required;"));
    expect(required).toContain("if S'Length >= Min_Len then return V; end if;");
    expect(required).not.toContain("Str_Field (O, Name)");
    expect(required.match(/Get \(O, Name\)/g)).toHaveLength(1);
  });
});
