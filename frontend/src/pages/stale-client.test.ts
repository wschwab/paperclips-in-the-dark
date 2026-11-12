// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountCharacterDetailPage } from "./character-detail.js";
import { mountCrewDetailPage } from "./crew-detail.js";

const outdatedCopy = "This page is out of date — refresh to load the latest version";

const sheets = [
  {
    name: "character",
    id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
    mount: mountCharacterDetailPage,
    headline: "This scoundrel sheet could not be loaded.",
    detail: "Invalid scoundrel response:",
    collection: "characters",
  },
  {
    name: "crew",
    id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
    mount: mountCrewDetailPage,
    headline: "This crew sheet could not be loaded.",
    detail: "Invalid crew response:",
    collection: "crews",
  },
];

for (const sheet of sheets) {
  describe(`STALE-CLIENT-01 ${sheet.name} initial response`, () => {
    let dispose: (() => void) | undefined;

    afterEach(() => {
      dispose?.();
      dispose = undefined;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it.each([
      ["schema mismatch", '{"kind":"incompatible-sheet"}'],
      ["invalid JSON", "not json"],
    ])("offers a full document Reload for %s, preserving detail and roster navigation", async (_name, body) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => body });
      vi.stubGlobal("fetch", fetchMock);
      const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
      const root = document.createElement("div");
      dispose = sheet.mount(root, sheet.id);

      await vi.waitFor(() => expect(root.querySelector(".error-card-head")?.textContent).toBe(outdatedCopy));
      expect(root.getAttribute("aria-busy")).toBe("false");
      const button = root.querySelector<HTMLButtonElement>(".error-card-actions button");
      expect(button?.textContent).toBe("Reload");
      expect(button?.className).toBe("btn-primary");
      expect(root.querySelector('a[href="/roster"]')?.textContent).toBe("Back to roster");
      const details = root.querySelector<HTMLDetailsElement>("details.error-card-detail");
      expect(details?.open).toBe(false);
      expect(details?.querySelector("summary")?.textContent).toBe("Technical detail");
      expect(details?.querySelector("pre")?.textContent).toContain(sheet.detail);
      expect(root.querySelector(".error-card-head")?.textContent).not.toContain(sheet.detail);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/${sheet.collection}/${sheet.id}`);
      expect(reload).not.toHaveBeenCalled();

      button!.click();

      expect(reload).toHaveBeenCalledTimes(1);
      // Reload must not retry the same client code or issue any server writes.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each(["server", "transport"])("keeps generic %s failure recovery as Retry, not Reload", async (failure) => {
      const fetchMock = vi.fn();
      if (failure === "server") {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "server unavailable" });
      } else {
        fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));
      }
      // Keep the retried initial GET pending: no auxiliary fetches or writes.
      fetchMock.mockReturnValueOnce(new Promise(() => {}));
      vi.stubGlobal("fetch", fetchMock);
      const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
      const root = document.createElement("div");
      dispose = sheet.mount(root, sheet.id);

      await vi.waitFor(() => expect(root.querySelector(".error-card-head")?.textContent).toBe(sheet.headline));
      const button = root.querySelector<HTMLButtonElement>(".error-card-actions button");
      expect(button?.textContent).toBe("Retry");
      expect(root.textContent).not.toContain(outdatedCopy);
      expect(root.querySelector('a[href="/roster"]')?.textContent).toBe("Back to roster");
      expect(root.querySelector<HTMLDetailsElement>("details")?.open).toBe(false);
      expect(root.querySelector("details pre")?.textContent).toContain(
        failure === "server" ? "server unavailable" : "Could not reach the server",
      );

      button!.click();

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/${sheet.collection}/${sheet.id}`);
      expect(reload).not.toHaveBeenCalled();
      expect(root.getAttribute("aria-busy")).toBe("true");
    });
  });
}
