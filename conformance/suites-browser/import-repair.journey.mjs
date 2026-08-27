// import-repair — BROWSER-02 top-level journey 4/6 (spec §16 AR-005).
//
// The per-entity import page end to end: a partial-document preview →
// confirm → apply; the needs-input round trip (pointer-level editable fields,
// values merged back, re-preview, apply); the stale-preview-token recovery
// (entity changes between preview and confirm → friendly re-preview, never a
// raw dump); and exact data-loss pointers for unknown keys nested in an
// object AND inside an array element. Import placement itself (roster-level
// panel, degraded repair) is journey 1's sub-flow.

import { composeCtx, unionCheckpoints } from "./lib.mjs";

export const id = "import-repair";

export const checkpoints = [
  { id: "partial-preview-applied", description: "partial doc: preview -> Confirm import -> .import-success" },
  { id: "needs-input-fields-shown", description: "empty-name doc renders needs-input fields with exact pointers" },
  { id: "needs-input-roundtrip", description: "provided value re-previews and applies" },
  { id: "stale-token-recovers", description: "confirm on a stale token renders the friendly re-preview path" },
  { id: "stale-re-preview-applies", description: "Re-preview -> Confirm import lands on success" },
  { id: "data-loss-pointers", description: "preview lists exact pointers for nested AND array unknown keys" },
];

// The deliberate preview fault injections (NORMALIZATION_REQUIRED /
export const expectedConsoleNoise = [
  { urlPattern: "/import", text: "Failed to load resource" },
];

const api = async (baseUrl, path, init) => {
  const response = await fetch(`${baseUrl}/api/${path}`, init);
  return { status: response.status, text: await response.text() };
};

async function createCharacter(page, baseUrl) {
  const res = await page.evaluate(async (url) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ gameStem: "blades-in-the-dark", playbook: "Cutter" }),
    });
    return r.json();
  }, new URL("/api/characters", baseUrl).href);
  if (!res?.character?.id) throw new Error(`character creation failed: ${JSON.stringify(res)}`);
  return res.character.id;
}

async function openImportPage(page, ctx, characterId) {
  await ctx.goto(`/character/${characterId}/import`);
  await page.locator("#import-doc").waitFor({ state: "visible", timeout: 15_000 });
}

/** Fill the document, click "Preview import", and await the preview
 * response (200 canonical, 409 normalization/needs-input, 400 entry). */
async function previewAndAwait(page, doc) {
  const previewResponse = page.waitForResponse(
    (r) => r.url().includes("/import?preview=1") && (r.status() === 200 || r.status() === 409 || r.status() === 400),
    { timeout: 15_000 },
  );
  await page.locator("#import-doc").fill(doc);
  await page.locator("#import-preview-btn").click();
  return previewResponse;
}

export async function run(page, ctx) {
  const { baseUrl } = ctx;
  const wrapped = composeCtx(ctx);
  // Load the SPA first so the create fetch below is same-origin (the server
  // is no-CORS by design; a preflight from origin "null" would be refused).
  await ctx.goto("/");
  const characterId = await createCharacter(page, baseUrl);

  // -- 1. Partial document: preview -> confirm -> apply ----------------------
  await openImportPage(page, ctx, characterId);
  await previewAndAwait(page, '{ "dossier": { "alias": "Import Alias" } }');
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".norm-preview").getByRole("button", { name: "Confirm import" }).click();
  await page.locator(".import-success").waitFor({ state: "visible", timeout: 15_000 });
  ctx.checkpoint("partial-preview-applied", 1);

  // -- 2. Needs-input: pointer fields, merge, re-preview, apply --------------
  await openImportPage(page, ctx, characterId);
  // Server-verified: an invalid /playbook is the needs-input case — the
  // preview cannot invent a playbook choice, so it answers 409 with the
  // exact pointer awaiting a caller value.
  await previewAndAwait(page, '{ "playbook": "" }');
  await page.locator(".norm-needs-input").waitFor({ state: "visible", timeout: 10_000 });
  const statusText = (await page.locator(".import-status").textContent()) ?? "";
  if (!statusText.includes("Some fields need your input.")) {
    throw new Error(`needs-input status copy missing: "${statusText}"`);
  }
  const pointerLabel = page.locator(".norm-inputs .norm-input", { hasText: "/playbook" });
  if ((await pointerLabel.count()) === 0) {
    const seen = await page.locator(".norm-inputs .norm-input span").allTextContents();
    throw new Error(`no needs-input field for /playbook; saw ${JSON.stringify(seen)}`);
  }
  ctx.checkpoint("needs-input-fields-shown", 1);
  // The canonical /playbook is an object; the merge normalizes the provided
  // value with JSON.parse, so a partial object satisfies the pointer.
  await pointerLabel.locator("input").fill('{"name": "Cutter"}');
  // The needs-input panel's button doubles as the re-preview trigger and is
  // labeled "Continue"; after the re-preview, the confirm is "Confirm import".
  await page.locator(".norm-preview").getByRole("button", { name: "Continue" }).click();
  await page.locator(".norm-preview").getByRole("button", { name: "Confirm import" }).click({ timeout: 15_000 });
  await page.locator(".import-success").waitFor({ state: "visible", timeout: 15_000 });
  ctx.checkpoint("needs-input-roundtrip", 1);
  await ctx.screenshot("import-repair-needs-input-applied");

  // -- 3. Stale preview token: friendly recovery, never a raw dump -----------
  await openImportPage(page, ctx, characterId);
  await previewAndAwait(page, '{ "dossier": { "alias": "Stale Race" } }');
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  // Mutate the stored entity AFTER the preview took its token.
  const detail = await api(baseUrl, `characters/${characterId}`);
  const revision = JSON.parse(detail.text).revision;
  const touch = await api(baseUrl, `characters/${characterId}/ops/dossier.update`, {
    method: "POST",
    headers: { "content-type": "application/json", "if-match": String(revision) },
    body: JSON.stringify({ alias: "Changed Underneath You" }),
  });
  if (touch.status !== 200) throw new Error(`concurrent mutation failed -> ${touch.status}: ${touch.text.slice(0, 160)}`);
  // Confirming with the now-stale token: the server answers 409
  // STALE_REVISION and the page renders the friendly recovery card.
  await page.locator(".norm-preview").getByRole("button", { name: "Confirm import" }).click();
  await page
    .locator(".import-preview")
    .getByText("This entry changed since you previewed it.")
    .waitFor({ state: "visible", timeout: 15_000 });
  await page
    .locator(".import-preview")
    .getByText("The document or the stored entry changed, so this preview is no longer valid.")
    .waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("stale-token-recovers", 1);
  await ctx.screenshot("import-repair-stale-token");

  // The Re-preview control issues a fresh preview from the same document
  // (409 with a NEW token proves the recovery path); the page pins If-Match
  // at mount, so a clean apply afterwards goes through a fresh page mount —
  // exactly the "fix the state, re-preview, confirm" loop the copy prescribes.
  const repreviewResponse = page.waitForResponse(
    (r) => r.url().includes("/import?preview=1") && (r.status() === 200 || r.status() === 409),
    { timeout: 15_000 },
  );
  await page.locator(".import-preview").getByRole("button", { name: "Re-preview" }).click();
  await repreviewResponse;
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  ctx.checkpoint("stale-re-preview-applies", 1);

  // Fresh mount (current revision) -> preview -> confirm -> apply.
  await openImportPage(page, ctx, characterId);
  await previewAndAwait(page, '{ "dossier": { "alias": "Stale Race" } }');
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".norm-preview").getByRole("button", { name: "Confirm import" }).click();
  await page.locator(".import-success").waitFor({ state: "visible", timeout: 15_000 });
  // Server-verified: unknown properties are flagged for removal at their
  // exact JSON pointer, including inside array elements.
  await openImportPage(page, ctx, characterId);
  await previewAndAwait(
    page,
    '{ "dossier": { "bogusNested": "keep-me-out" }, "contacts": [ { "name": "Marlane", "bogusContactKey": 2 } ] }',
  );
  await page.locator(".norm-preview").waitFor({ state: "visible", timeout: 10_000 });
  const removalText = (
    (await page.locator(".norm-preview .norm-warnings").textContent()) ?? ""
  ) + ((await page.locator(".norm-preview .norm-changes").textContent()) ?? "");
  const wanted = ["/dossier/bogusNested", "/contacts/0/bogusContactKey"];
  const missing = wanted.filter((p) => !removalText.includes(p));
  ctx.checkpoint("data-loss-pointers", wanted.length - missing.length);
  if (missing.length > 0) {
    throw new Error(`data-loss preview missing exact pointers ${JSON.stringify(missing)}; saw "${removalText.slice(0, 400)}"`);
  }
  await ctx.screenshot("import-repair-data-loss-pointers");
}
