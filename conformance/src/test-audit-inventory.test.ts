import { describe, expect, it } from "vitest";
import {
  parseAdaAsserts,
  parseProofFamilies,
  collapseAssertLabel,
  packageOfSpec,
  conformanceIdFromName,
  idForVitest,
  slugify,
  deriveLayer,
  makeVitestRow,
  makeAdaRow,
  makeProofRow,
  sortRows,
  assemble,
  blankRow,
} from "../scripts/test-audit-inventory.mjs";

// ---------------------------------------------------------------------------
// TA00 test-audit inventory generator (Wave 0 quarantine): pure helper tests.
// Every classification/decision field stays blank; these tests pin the
// determinism (stable ids), the path-derived layers, the multiline Ada
// `pragma Assert` parse, the SPARK proof-family scan (contracted subprograms
// only — expression/null-body functions are excluded), and the explicit
// layer/file/name/line sort order. None of this decides keep/merge/upgrade/
// delete.
// ---------------------------------------------------------------------------

describe("TA00 layer derivation", () => {
  it("[TA00-LAYER-001] derives the contract layer from conformance suite path", () => {
    expect(deriveLayer("conformance/suites/contract/endpoints.test.ts")).toBe("contract");
  });
  it("[TA00-LAYER-002] derives semantics/persistence/lifecycle/parity from suite paths", () => {
    expect(deriveLayer("conformance/suites/semantics/clocks.test.ts")).toBe("semantics");
    expect(deriveLayer("conformance/suites/persistence/history.test.ts")).toBe("persistence");
    expect(deriveLayer("conformance/suites/lifecycle/retirement.test.ts")).toBe("lifecycle");
    expect(deriveLayer("conformance/suites/parity/capability-parity.test.ts")).toBe("parity");
  });
  it("[TA00-LAYER-003] derives the tooling layer for all conformance tooling files", () => {
    expect(deriveLayer("conformance/src/managed-run.test.ts")).toBe("tooling");
    expect(deriveLayer("conformance/src/generators.test.ts")).toBe("tooling");
    expect(deriveLayer("conformance/src/stdio-shim.test.ts")).toBe("tooling");
    expect(deriveLayer("conformance/src/report.test.ts")).toBe("tooling");
  });
  it("[TA00-LAYER-004] derives frontend layers from src subdirectories", () => {
    expect(deriveLayer("frontend/src/api/client.test.ts")).toBe("api");
    expect(deriveLayer("frontend/src/components/clock.test.ts")).toBe("components");
    expect(deriveLayer("frontend/src/pages/roster.test.ts")).toBe("pages");
    expect(deriveLayer("frontend/src/schema/decoders.test.ts")).toBe("schema");
  });
  it("[TA00-LAYER-005] maps a frontend src-root test to the main layer", () => {
    expect(deriveLayer("frontend/src/main.test.ts")).toBe("main");
  });
  it("[TA00-LAYER-006] maps Ada core paths to ada-runtime and spark-proof", () => {
    expect(deriveLayer("backend-ada/core/tests/core_tests.adb")).toBe("ada-runtime");
    expect(deriveLayer("backend-ada/core/src/paperclips_core-monitors.ads")).toBe("spark-proof");
  });
  it("[TA00-LAYER-007] maps frontend lib/styles dirs when present", () => {
    expect(deriveLayer("frontend/src/lib/foo.test.ts")).toBe("lib");
    expect(deriveLayer("frontend/src/styles/bar.test.ts")).toBe("styles");
  });
});

describe("TA00 ids and slugs", () => {
  it("[TA00-ID-001] slugify collapses to a stable lower-case hyphen token", () => {
    expect(slugify("frontend/src/pages/roster.test.ts My Test (FV-018)")).toBe(
      "frontend-src-pages-roster-test-ts-my-test-fv-018",
    );
    expect(slugify("a  b\tc")).toBe("a-b-c");
    expect(slugify("---x---")).toBe("x");
  });
  it("[TA00-ID-002] extracts a bracketed conformance id from a vitest name", () => {
    expect(
      conformanceIdFromName("§ clocks (SC-O5) > [CLOCK-OWNER-001] create validates ownership"),
    ).toBe("CLOCK-OWNER-001");
    expect(conformanceIdFromName("no bracket here")).toBeNull();
  });
  it("[TA00-ID-003] uses the bracket id when present, else a path+name slug", () => {
    expect(idForVitest("§ x > [FOO-001] something", "conformance/suites/contract/a.test.ts")).toBe("FOO-001");
    expect(idForVitest("plain frontend test", "frontend/src/main.test.ts")).toBe(
      "frontend-src-main-test-ts-plain-frontend-test",
    );
  });
});

describe("TA00 Ada pragma Assert parsing", () => {
  it("[TA00-ADA-001] parses single-line pragma Assert with balanced parens", () => {
    const src =
      "procedure T is\nbegin\n   pragma Assert (Monitors.Stress (S) = 5 and Applied = 5);\nend T;";
    const found = parseAdaAsserts(src);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(3);
    expect(found[0].endLine).toBe(3);
    expect(found[0].label).toBe("Monitors.Stress (S) = 5 and Applied = 5");
  });
  it("[TA00-ADA-002] parses a multiline pragma Assert as ONE row", () => {
    const src = [
      "procedure T is",
      "begin",
      "   pragma Assert (Error = No_Error and Rating = 1",
      "                  and Points (X) = 0);",
      "end T;",
    ].join("\n");
    const found = parseAdaAsserts(src);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(3);
    expect(found[0].endLine).toBe(4);
    expect(found[0].label).toBe("Error = No_Error and Rating = 1 and Points (X) = 0");
  });
  it("[TA00-ADA-003] collapseAssertLabel flattens whitespace", () => {
    expect(collapseAssertLabel("  a\n\t b  c  ")).toBe("a b c");
  });
  it("[TA00-ADA-004] handles nested parens in the assert body without truncating", () => {
    const src = [
      "begin",
      "   pragma Assert (Harms (T) = Harm_Counts'(others => 0)",
      "                  and Healing_Clock (T) = 0);",
      "end;",
    ].join("\n");
    const found = parseAdaAsserts(src);
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe(
      "Harms (T) = Harm_Counts'(others => 0) and Healing_Clock (T) = 0",
    );
  });
});

describe("TA00 SPARK proof-family parsing", () => {
  const CLOCK_SPEC = [
    "pragma SPARK_Mode (On);",
    "package Paperclips_Core.Clocks is",
    "   type Clock_State (Size : Capacity) is record",
    "      Segments : Natural := 0;",
    "   end record;",
    "   procedure Progress",
    "     (Item : in out Clock_State; Amount : Natural;",
    "      Applied : out Natural)",
    "   with Pre => Amount <= Capacity'Last,",
    "     Post => (if Amount <= Item.Size then Applied = Amount);",
    "   procedure Reset (Item : in out Clock_State)",
    "   with Post => Item.Segments = 0;",
    "end Paperclips_Core.Clocks;",
  ].join("\n");

  it("[TA00-PROOF-001] finds only subprograms carrying a with Pre/Post aspect", () => {
    expect(parseProofFamilies(CLOCK_SPEC)).toEqual([
      { name: "Progress", line: 6 },
      { name: "Reset", line: 11 },
    ]);
  });

  it("[TA00-PROOF-002] excludes null-body, expression functions, and private helpers", () => {
    const src = [
      "package Paperclips_Core.Monitors is",
      "   function Is_Deadish (Item : Monitor) return Boolean is",
      "     (Harms (Item) (Fatal) > 0);",
      "   function Stress (Item : Monitor) return Natural is (Item.Value);",
      "   procedure Add_Stress",
      "     (Item : in out Monitor; Requested : Natural; Applied : out Natural)",
      "   with Post => (if Requested <= 1 then Applied = Requested);",
      "private",
      "end Paperclips_Core.Monitors;",
    ].join("\n");
    expect(parseProofFamilies(src)).toEqual([{ name: "Add_Stress", line: 5 }]);
  });

  it("[TA00-PROOF-003] does not cross a `;` / `is` / next-decl to reach a later aspect", () => {
    const src = [
      "package Paperclips_Core.Funds is",
      "   function Satchel (Item : Fund) return Natural;",
      "   procedure Spend (Item : in out Fund)",
      "   with Post => (if Requested > 1 then Error = No_Error);",
      "end Paperclips_Core.Funds;",
    ].join("\n");
    expect(parseProofFamilies(src)).toEqual([{ name: "Spend", line: 3 }]);
  });

  it("[TA00-PROOF-004] packageOfSpec reads the spec package name", () => {
    expect(packageOfSpec("package Paperclips_Core.Monitors is\nend;")).toBe(
      "Paperclips_Core.Monitors",
    );
    expect(packageOfSpec("package Body Foo is\nend;")).toBeNull();
  });
});

describe("TA00 row assembly", () => {
  it("[TA00-ROW-001] vitest rows carry blank decisions and null line", () => {
    const r = makeVitestRow({
      id: "X-001",
      name: "x > [X-001] t",
      relFile: "conformance/suites/contract/a.test.ts",
    });
    expect(r).toEqual({
      id: "X-001",
      name: "x > [X-001] t",
      file: "conformance/suites/contract/a.test.ts",
      layer: "contract",
      framework: "vitest",
      line: null,
      decision: "",
      target: "",
      dupeOf: "",
    });
  });
  it("[TA00-ROW-002] ada rows pin the core_tests:<line> id and ada-runtime framework", () => {
    const r = makeAdaRow({ line: 42, label: "a = 1", relFile: "backend-ada/core/tests/core_tests.adb" });
    expect(r.id).toBe("core_tests:42");
    expect(r.framework).toBe("ada-runtime");
    expect(r.layer).toBe("ada-runtime");
    expect(r.line).toBe(42);
  });
  it("[TA00-ROW-003] proof rows pin the package.subprogram id and spark-proof framework", () => {
    const r = makeProofRow({
      subprogram: "Add_Stress",
      pkg: "Paperclips_Core.Monitors",
      line: 4,
      relFile: "backend-ada/core/src/paperclips_core-monitors.ads",
    });
    expect(r).toMatchObject({
      id: "Paperclips_Core.Monitors.Add_Stress",
      name: "Paperclips_Core.Monitors.Add_Stress",
      layer: "spark-proof",
      framework: "spark-proof",
      line: 4,
    });
  });
  it("[TA00-ROW-004] blankRow keeps every audit decision field empty", () => {
    expect(blankRow()).toEqual({ decision: "", target: "", dupeOf: "" });
  });
});
describe("TA00 sort order", () => {
  const row = (o: {
    id: string;
    name: string;
    file: string;
    layer: string;
    line?: number | null;
  }) => ({
    id: o.id,
    name: o.name,
    file: o.file,
    layer: o.layer,
    framework: "vitest",
    line: o.line === undefined ? null : o.line,
    decision: "",
    target: "",
    dupeOf: "",
  });

  it("[TA00-SORT-001] orders by layer using the canonical enum, not alphabetically", () => {
    const rows = [
      row({ id: "sp", name: "sp", file: "backend-ada/core/src/x.ads", layer: "spark-proof" }),
      row({ id: "tool", name: "tool", file: "conformance/src/t.test.ts", layer: "tooling" }),
      row({ id: "ada", name: "ada", file: "backend-ada/core/tests/core_tests.adb", layer: "ada-runtime" }),
      row({ id: "main", name: "main", file: "frontend/src/main.test.ts", layer: "main" }),
      row({ id: "contr", name: "contr", file: "conformance/suites/contract/a.test.ts", layer: "contract" }),
    ];
    expect(sortRows(rows).map((r) => r.layer)).toEqual([
      "contract",
      "tooling",
      "main",
      "ada-runtime",
      "spark-proof",
    ]);
  });

  it("[TA00-SORT-002] orders by file within a layer", () => {
    const rows = [
      row({ id: "2", name: "z", file: "frontend/src/pages/roster.test.ts", layer: "pages" }),
      row({ id: "1", name: "z", file: "frontend/src/api/client.test.ts", layer: "api" }),
      row({ id: "3", name: "z", file: "frontend/src/pages/shell.test.ts", layer: "pages" }),
    ];
    const sorted = sortRows(rows).map((r) => r.file);
    expect(sorted[0]).toBe("frontend/src/api/client.test.ts");
    expect(sorted[1]).toBe("frontend/src/pages/roster.test.ts");
    expect(sorted[2]).toBe("frontend/src/pages/shell.test.ts");
  });

  it("[TA00-SORT-003] orders by name within a file", () => {
    const rows = [
      row({ id: "b", name: "beta", file: "conformance/suites/clocks.test.ts", layer: "semantics" }),
      row({ id: "a", name: "alpha", file: "conformance/suites/clocks.test.ts", layer: "semantics" }),
    ];
    expect(sortRows(rows).map((r) => r.name)).toEqual(["alpha", "beta"]);
  });

  it("[TA00-SORT-004] orders by line with null (vitest) rows last within a group", () => {
    const rows = [
      row({ id: "line99", name: "Same", file: "backend-ada/core/src/x.ads", layer: "spark-proof", line: 99 }),
      row({ id: "noLine", name: "Same", file: "backend-ada/core/src/x.ads", layer: "spark-proof", line: null }),
      row({ id: "line3", name: "Same", file: "backend-ada/core/src/x.ads", layer: "spark-proof", line: 3 }),
    ];
    expect(sortRows(rows).map((r) => r.id)).toEqual(["line3", "line99", "noLine"]);
  });

  it("[TA00-SORT-005] breaks a repeated (layer,file,name) by line then id", () => {
    const rows = [
      row({ id: "core_tests:5", name: "y", file: "backend-ada/core/tests/core_tests.adb", layer: "ada-runtime", line: 5 }),
      row({ id: "core_tests:3", name: "y", file: "backend-ada/core/tests/core_tests.adb", layer: "ada-runtime", line: 3 }),
    ];
    expect(sortRows(rows).map((r) => r.id)).toEqual(["core_tests:3", "core_tests:5"]);
  });

  it("[TA00-SORT-006] sortRows is a total, deterministic order across mixed layers", () => {
    const rows = [
      row({ id: "c1", name: "c", file: "conformance/suites/contract/a.test.ts", layer: "contract" }),
      row({ id: "ada", name: "x=1", file: "backend-ada/core/tests/core_tests.adb", layer: "ada-runtime", line: 10 }),
      row({ id: "pr", name: "P.Add", file: "backend-ada/core/src/p.ads", layer: "spark-proof", line: 1 }),
      row({ id: "t1", name: "tool", file: "conformance/src/t.test.ts", layer: "tooling" }),
    ];
    expect(sortRows(rows).map((r) => r.id)).toEqual(sortRows(rows).map((r) => r.id));
  });
});

describe("TA00 assemble", () => {
  const base = { frontend: [], conformance: [], tooling: [], ada: [], proof: [] };

  it("[TA00-ASM-001] marks generated:false and keeps groups empty until the orchestrator runs", () => {
    const inv = assemble({
      ...base,
      ada: [makeAdaRow({ line: 1, label: "x", relFile: "backend-ada/core/tests/core_tests.adb" })],
    });
    expect(inv.generated).toBe(false);
    expect(inv.schema.generated).toBe(false);
    expect(inv.groups).toEqual([]);
    expect(inv.rows).toHaveLength(1);
    expect(inv.rows[0].decision).toBe("");
    expect(inv.rows[0].target).toBe("");
    expect(inv.rows[0].dupeOf).toBe("");
  });

  it("[TA00-ASM-002] assembles all sources into one sorted, flat row list", () => {
    const bundles = {
      ...base,
      conformance: [
        makeVitestRow({ id: "C-001", name: "c > [C-001] t", relFile: "conformance/suites/contract/a.test.ts" }),
      ],
      frontend: [
        makeVitestRow({ id: "f-1", name: "t", relFile: "frontend/src/main.test.ts" }),
      ],
      tooling: [
        makeVitestRow({ id: "TOOL-1", name: "tool", relFile: "conformance/src/t.test.ts" }),
      ],
      ada: [makeAdaRow({ line: 2, label: "a", relFile: "backend-ada/core/tests/core_tests.adb" })],
      proof: [
        makeProofRow({
          subprogram: "Add",
          pkg: "Paperclips_Core.Monitors",
          line: 3,
          relFile: "backend-ada/core/src/paperclips_core-monitors.ads",
        }),
      ],
    };
    const inv = assemble(bundles);
    expect(inv.rows).toHaveLength(5);
    // Explicit expected enum-layer order across all five sources.
    expect(inv.rows.map((r) => r.layer)).toEqual([
      "contract",
      "tooling",
      "main",
      "ada-runtime",
      "spark-proof",
    ]);
  });

  it("[TA00-ASM-003] rows carry no skipped placeholders and no guessed classifications", () => {
    expect(assemble(base).rows).toEqual([]);
    const inv = assemble({
      ...base,
      ada: [makeAdaRow({ line: 9, label: "x", relFile: "backend-ada/core/tests/core_tests.adb" })],
    });
    for (const r of inv.rows) {
      expect(r.decision).toBe("");
      expect(r.target).toBe("");
      expect(r.dupeOf).toBe("");
    }
  });
});
