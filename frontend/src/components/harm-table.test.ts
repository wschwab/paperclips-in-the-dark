// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { harmTable } from "./harm-table.js";

const rows = [
  { level: "lesser" as const, label: "Lesser", slots: ["Bruised", "Sprained"], capacity: 2 },
  { level: "moderate" as const, label: "Moderate", slots: [], capacity: 2 },
  { level: "severe" as const, label: "Severe", slots: ["Broken leg"], capacity: 1 },
  { level: "fatal" as const, label: "Fatal", slots: [], capacity: 1 },
];

describe("harmTable (Design Audit F-03)", () => {
  it("emits uniform 3-column rows for every level", () => {
    const table = harmTable({ rows, caption: "Harm" });
    const headCells = table.querySelectorAll("thead th");
    expect([...headCells].map((c) => c.textContent)).toEqual(["Level", "Injury", "Slots"]);

    table.querySelectorAll("tbody tr").forEach((tr) => {
      // Level (th) + Injury (td) + Slots (td) = exactly 3 cells, every row.
      expect(tr.children.length).toBe(3);
    });
  });

  it("renders a distinct accessible remove button per filled injury when onRemove is set", () => {
    const onRemove = vi.fn();
    const rowsWithRemove = rows.map((r) => ({ ...r, onRemove }));
    const t2 = harmTable({ rows: rowsWithRemove });
    const buttons = [...t2.querySelectorAll("button.harm-remove-btn")];
    expect(buttons.length).toBe(3); // Bruised + Sprained + Broken leg
    const names = buttons.map((b) => b.getAttribute("aria-label"));
    expect(names).toContain('Remove Lesser harm "Bruised", slot 1');
    expect(names).toContain('Remove Severe harm "Broken leg", slot 1');
    expect(new Set(names).size).toBe(names.length); // all distinct
  });

  it("disambiguates duplicate descriptions by level and slot", () => {
    const onRemove = vi.fn();
    const table = harmTable({
      rows: [
        {
          level: "lesser",
          label: "Lesser",
          slots: ["Bruised", "Bruised"],
          capacity: 2,
          onRemove,
        },
      ],
    });
    const buttons = [...table.querySelectorAll("button.harm-remove-btn")];
    const names = buttons.map((b) => b.getAttribute("aria-label"));
    // Same text, different slot — the accessible names must differ.
    expect(names[0]).toContain("slot 1");
    expect(names[1]).toContain("slot 2");
    expect(new Set(names).size).toBe(2);
  });

  it("preserves the true slot index for sparse rows", () => {
    const onRemove = vi.fn();
    const table = harmTable({
      rows: [
        {
          level: "lesser",
          label: "Lesser",
          slots: ["", "Twisted ankle"],
          capacity: 2,
          onRemove,
        },
      ],
    });
    const btn = table.querySelector("button.harm-remove-btn") as HTMLButtonElement;
    btn.click();
    expect(onRemove).toHaveBeenCalledWith(1, "Twisted ankle");
  });

  it("calls onRemove with the slot index and text when clicked", () => {
    const onRemove = vi.fn();
    const rowsWithRemove = rows.map((r) => ({ ...r, onRemove }));
    const table = harmTable({ rows: rowsWithRemove });
    const buttons = [...table.querySelectorAll("button.harm-remove-btn")];
    (buttons[0] as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledWith(0, "Bruised");
  });
});
