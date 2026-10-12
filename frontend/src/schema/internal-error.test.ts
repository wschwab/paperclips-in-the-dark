import { describe, expect, it } from "vitest";
import { decodeOperationResultEither } from "./operation-result.js";
import { opErrorFriendlyText } from "../api/client.js";

// Contract: INTERNAL-ERROR-01 (docs/pages/contract/internal-errors.mdx). A server defect is
// HTTP 500, code INTERNAL, retryable literally false, the fixed recovery text, and details {}.
const RECOVERY = "This is a server defect. Report it; do not change the request.";

const internalBody = (overrides: Record<string, unknown> = {}, errorOverrides: Record<string, unknown> = {}) => ({
  ok: false,
  applied: { op: "request" },
  sideEffects: [],
  error: {
    code: "INTERNAL",
    status: 500,
    message: "Internal server failure",
    retryable: false,
    recovery: RECOVERY,
    details: {},
    ...errorOverrides,
  },
  ...overrides,
});

describe("INTERNAL server-defect error (INTERNAL-ERROR-01)", () => {
  it("decodes the canonical 500 INTERNAL body", () => {
    const decoded = decodeOperationResultEither(internalBody());
    expect(decoded._tag).toBe("Right");
  });

  it("rejects retryable: true (a server defect is not cured by replay)", () => {
    expect(decodeOperationResultEither(internalBody({}, { retryable: true }))._tag).toBe("Left");
  });

  it("rejects a status other than 500", () => {
    expect(decodeOperationResultEither(internalBody({}, { status: 400 }))._tag).toBe("Left");
  });

  it("rejects any recovery text other than the canonical instruction", () => {
    expect(decodeOperationResultEither(internalBody({}, { recovery: "Try again." }))._tag).toBe("Left");
  });

  it("rejects extra details (details is a strict empty object)", () => {
    expect(decodeOperationResultEither(internalBody({}, { details: { entity: {} } }))._tag).toBe("Left");
  });

  it("shows a clear server-problem message with no retry prompt", () => {
    const decoded = decodeOperationResultEither(internalBody());
    if (decoded._tag !== "Right") throw new Error("expected INTERNAL to decode");
    const text = opErrorFriendlyText(decoded.right as never);
    expect(text).toContain("server");
    expect(text).toContain("report");
    expect(text).toContain(RECOVERY);
    expect(text.toLowerCase()).not.toContain("try again");
    expect(text.toLowerCase()).not.toContain("retry");
    expect(text).not.toContain("refreshes with the server state");
  });
});
