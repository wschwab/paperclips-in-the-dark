/**
 * Harm table — lined rows for lesser / moderate / severe / fatal.
 *
 * Spec §12: "harm as a lined table". Slot counts come from the caller
 * (game-settings) — never hardcoded as game maxima.
 */

import { el } from "../lib/dom.js";

export type HarmLevel = "lesser" | "moderate" | "severe" | "fatal";

export interface HarmRow {
  level: HarmLevel;
  /** Display label (e.g. "Lesser (1)", "Severe (3)"). */
  label: string;
  /** Notes / injuries currently sitting in the level's slots. */
  slots: readonly string[];
  /** How many empty/filled slots to draw. Defaults to slots.length or 1. */
  capacity?: number;
  /** Called when a filled slot's remove control is clicked. */
  onRemove?: (slotIndex: number, text: string) => void;
  /** Accessible name for the remove control; defaults to including the level and slot. */
  removeLabel?: (text: string, slotIndex: number) => string;
}

export interface HarmTableOptions {
  rows: readonly HarmRow[];
  id?: string;
  /** Optional caption. */
  caption?: string;
  /** Disables remove controls while an op is in flight. */
  disabled?: boolean;
}

const DEFAULT_CAPACITY: Record<HarmLevel, number> = {
  lesser: 2,
  moderate: 2,
  severe: 1,
  fatal: 1,
};

export function harmTable(opts: HarmTableOptions): HTMLElement {
  const table = el(
    "table",
    {
      className: "harm-table",
      id: opts.id,
    },
    opts.caption ? el("caption", { className: "lbl" }, opts.caption) : null,
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", { scope: "col" }, "Level"),
        el("th", { scope: "col" }, "Injury"),
        el("th", { scope: "col" }, "Slots"),
      ),
    ),
  );

  const tbody = el("tbody", {});
  for (const row of opts.rows) {
    const capacity = row.capacity ?? DEFAULT_CAPACITY[row.level] ?? 1;
    const slotsCell = el("td", { className: "harm-slot-list" });
    for (let i = 0; i < capacity; i++) {
      const text = row.slots[i] ?? "";
      const filled = text.length > 0;
      slotsCell.append(
        el(
          "span",
          {
            className: "harm-slot",
            "data-filled": filled ? "1" : "0",
            title: text || "empty",
          },
          // use checkbox visually for empty/full without form semantics
          // — rendered text for the injury goes in the Injury column.
        ),
      );
    }

    const injuryCell = el("td", { className: "harm-injury" });
    // Iterate the original slots array so sparse rows keep their true slot
    // indexes (removal targets must not be renumbered by filtering).
    const filledIndexes: number[] = [];
    row.slots.forEach((text, slotIndex) => {
      if (text.length === 0) return;
      filledIndexes.push(slotIndex);
      injuryCell.append(document.createTextNode(text));
      if (row.onRemove) {
        injuryCell.append(
          el(
            "button",
            {
              type: "button",
              className: "harm-remove-btn",
              disabled: opts.disabled,
              "aria-label":
                row.removeLabel?.(text, slotIndex) ??
                `Remove ${row.label} harm "${text}", slot ${slotIndex + 1}`,
              title: "Remove (clerical error)",
            },
            "✕",
          ),
        );
      }
      injuryCell.append(document.createTextNode(" "));
    });
    if (filledIndexes.length === 0) {
      injuryCell.append(document.createTextNode("—"));
    }
    // Wire remove handlers (el() cannot express onClick).
    if (row.onRemove) {
      injuryCell.querySelectorAll("button").forEach((btn, i) => {
        const slotIndex = filledIndexes[i] ?? 0;
        const text = row.slots[slotIndex] ?? "";
        btn.addEventListener("click", () => row.onRemove?.(slotIndex, text));
      });
    }

    tbody.append(
      el(
        "tr",
        { "data-level": row.level },
        el("th", { scope: "row", className: "harm-level" }, row.label),
        injuryCell,
        slotsCell,
      ),
    );
  }
  table.append(tbody);
  return table;
}

/** Convenience factory for the canonical Blades 4-row harm table. */
export function bladesHarmTable(
  injuries: Partial<Record<HarmLevel, readonly string[]>> = {},
): HTMLElement {
  return harmTable({
    caption: "Harm",
    rows: [
      {
        level: "lesser",
        label: "Lesser",
        slots: injuries.lesser ?? [],
        capacity: 2,
      },
      {
        level: "moderate",
        label: "Moderate",
        slots: injuries.moderate ?? [],
        capacity: 2,
      },
      {
        level: "severe",
        label: "Severe",
        slots: injuries.severe ?? [],
        capacity: 1,
      },
      {
        level: "fatal",
        label: "Fatal",
        slots: injuries.fatal ?? [],
        capacity: 1,
      },
    ],
  });
}
