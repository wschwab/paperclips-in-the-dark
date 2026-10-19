// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mountRosterPage } from "./roster.js";

const ok = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });

describe("launch screen About & licence aside (CREW-WORLD-02)", () => {
  it("states the attribution, the licence and the setting ownership, with the required links", async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ characters: [], crews: [] }));
    const root = document.createElement("div");
    document.body.append(root);
    const dispose = mountRosterPage(root);
    try {
      await vi.waitFor(() => expect(root.querySelector("aside.about-licence")).not.toBeNull());
      const aside = root.querySelector("aside.about-licence")!;
      expect(aside.getAttribute("aria-labelledby")).toBeTruthy();
      expect(aside.querySelector("h2")?.textContent).toBe("About & licence");
      const text = aside.textContent ?? "";
      expect(text).toContain("based on Blades in the Dark");
      expect(text).toContain("John Harper");
      expect(text).toContain("One Seven Design");
      expect(text).toContain("Evil Hat Productions");
      expect(text).toContain("This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license");
      expect(text).toContain("Doskvol/Duskwall setting material is the property of John Harper / One Seven Design, used in a free fan project.");
      const hrefs = Array.from(aside.querySelectorAll("a")).map((a) => a.getAttribute("href"));
      for (const href of [
        "https://bladesinthedark.com/",
        "https://bladesinthedark.com/basics",
        "https://bladesinthedark.com/licensing",
        "https://creativecommons.org/licenses/by/3.0/",
        "https://www.evilhat.com/home/blades-in-the-dark",
      ]) {
        expect(hrefs).toContain(href);
      }
      for (const a of Array.from(aside.querySelectorAll("a"))) {
        expect(a.getAttribute("rel")).toContain("noopener");
      }
    } finally { dispose(); root.remove(); vi.unstubAllGlobals(); }
  });
});
