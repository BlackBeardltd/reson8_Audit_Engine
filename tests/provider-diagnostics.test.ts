import { afterEach, describe, expect, it, vi } from "vitest";
import { logProviderResponse } from "../src/diagnostics/provider-response.js";

describe("provider diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits structured provider responses without credentials", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logProviderResponse({
      provider: "audd",
      operation: "recognize",
      status: 200,
      ok: true,
      payload: { result: { title: "Song" }, api_token: "must-not-be-present-in-log", nested: { client_secret: "also-secret" } },
      auditJobId: "job-1",
    });

    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toContain('"event":"provider_response"');
    expect(line).toContain('"provider":"audd"');
    expect(line).toContain('"httpStatus":200');
    expect(line).toContain("Song");
    expect(line).toContain('\"api_token\":\"[REDACTED]\"');
    expect(line).toContain('\"client_secret\":\"[REDACTED]\"');
    expect(line).not.toContain("must-not-be-present-in-log");
    expect(line).not.toContain("also-secret");
  });
});
