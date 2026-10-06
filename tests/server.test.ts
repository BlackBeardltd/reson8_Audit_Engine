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

describe("public Supabase browser configuration", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalPublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://gznwamoxuxzaayjaxvlo.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
    process.env.SUPABASE_SECRET_KEY = "postgres-secret-must-never-leak";
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY = originalPublishable;
    process.env.SUPABASE_SECRET_KEY = originalSecret;
  });

  it("exposes only browser-safe Supabase configuration", async () => {
    const app = buildServer(store);
    const response = await app.inject({ method: "GET", url: "/v1/auth/config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      supabaseUrl: "https://gznwamoxuxzaayjaxvlo.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
    });
    expect(response.body).not.toContain("postgres-secret-must-never-leak");

    await app.close();
  });

  it("refuses to expose browser configuration when the publishable key is missing", async () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    const app = buildServer(store);
    const response = await app.inject({ method: "GET", url: "/v1/auth/config" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "AUTH_CONFIG_UNAVAILABLE",
      message: "Browser authentication is not configured.",
    });

    await app.close();
  });
});
