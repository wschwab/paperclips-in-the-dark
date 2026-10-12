import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// THUMBNAIL-01: every icon, manifest and social-image URL in the document head must point at a file
// that ships in frontend/public (and therefore lands in dist).
const root = resolve(__dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const publicFile = (url: string) => resolve(root, "public", url.replace(/^\//, ""));

/** Every local (root-relative) URL the head references through link href or meta content. */
function headUrls(): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) urls.push(m[1]!);
  for (const m of html.matchAll(/<meta\b[^>]*\bcontent="([^"]+)"/g)) {
    if (/^\/[^/]/.test(m[1]!)) urls.push(m[1]!);
  }
  return urls.filter((u) => u.startsWith("/"));
}

/** Read the pixel size of a JPEG from its SOF marker. */
function jpegSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error(`bad marker at ${i}`);
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("no SOF marker");
}

describe("document head (THUMBNAIL-01)", () => {
  it("every local head URL points at an existing file in frontend/public", () => {
    const urls = headUrls();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(existsSync(publicFile(url)), url).toBe(true);
    }
  });

  it("links the 32, 180, 192 and 512 icons and the manifest", () => {
    expect(html).toMatch(/rel="icon"[^>]*sizes="32x32"[^>]*href="\/favicon-32\.png"|href="\/favicon-32\.png"[^>]*sizes="32x32"/);
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/);
    expect(html).toMatch(/href="\/icon-192\.png"[^>]*|sizes="192x192"[^>]*href="\/icon-192\.png"/);
    expect(html).toMatch(/href="\/icon-512\.png"[^>]*|sizes="512x512"[^>]*href="\/icon-512\.png"/);
    expect(html).toContain('rel="manifest" href="/site.webmanifest"');
  });

  it("drops the flat SVG favicon so the browser tab shows the thumbnail icon", () => {
    expect(html).not.toContain("favicon.svg");
    expect(existsSync(resolve(root, "public/favicon.svg"))).toBe(false);
  });

  it("gives Open Graph and Twitter the title and a 1200x630 image", () => {
    expect(html).toContain('property="og:title" content="Paperclips in the Dark"');
    expect(html).toMatch(/property="og:image" content="\/og-image\.jpg"/);
    expect(html).toMatch(/name="twitter:image" content="\/og-image\.jpg"/);
    expect(html).toMatch(/name="twitter:card" content="summary_large_image"/);
    expect(jpegSize(publicFile("/og-image.jpg"))).toEqual({ width: 1200, height: 630 });
  });

  it("keeps the og image small", () => {
    expect(statSync(publicFile("/og-image.jpg")).size).toBeLessThan(300 * 1024);
  });

  it("ships actual PNG dimensions matching each advertised icon size", () => {
    for (const [url, size] of [
      ["/favicon-32.png", 32], ["/apple-touch-icon.png", 180],
      ["/icon-192.png", 192], ["/icon-512.png", 512],
    ] as const) {
      const bytes = readFileSync(publicFile(url));
      expect(bytes.subarray(0, 8).toString("hex"), url).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16), url).toBe(size);
      expect(bytes.readUInt32BE(20), url).toBe(size);
    }
  });

  it("the manifest lists only icons that exist, with the square sizes", () => {
    const manifest = JSON.parse(readFileSync(publicFile("/site.webmanifest"), "utf8")) as { icons: Array<{ src: string; sizes: string }> };
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    }
    expect(manifest.icons.some((i) => i.src.endsWith(".svg"))).toBe(false);
  });
});
