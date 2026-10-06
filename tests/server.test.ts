import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const store = {
  authenticate: async () => "owner-1",
  resolvePublicOwnerId: async () => "public-owner",
  createJobDependencies: () => {
    throw new Error("not used");
  },
  getAuditStatus: async () => ({
    jobId: "job-1",
    status: "completed" as const,
    sample: { available: true, version: 1 },
    full: { available: true, version: 1, locked: true },
  }),
  getAuditReport: async () => ({
    bytes: new Uint8Array([37, 80, 68, 70]),
    contentType: "application/pdf",
    filename: "report.pdf",
  }),
};

describe("authentication-disabled API surface", () => {
  it("does not expose a browser authentication configuration endpoint", async () => {
    const app = buildServer({
      authenticate: async () => { throw new Error("not used"); },
      resolvePublicOwnerId: async () => null,
      createJobDependencies: () => { throw new Error("not used"); },
    } as any);

    const response = await app.inject({ method: "GET", url: "/v1/auth/config" });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
