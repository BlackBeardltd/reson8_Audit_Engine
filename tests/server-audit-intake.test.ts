import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("GET /", () => {
  it("serves the data-ingestion UI without authentication", async () => {
    const app = buildServer({
      authenticate: async () => "11111111-1111-1111-1111-111111111111",
      createJobDependencies: () => {
        throw new Error("must not be called");
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Submit a recording for evidence-grade A&R analysis.");

    await app.close();
  });
});

describe("GET /health", () => {
  it("returns a healthy Audit Engine status without requiring authentication", async () => {
    const app = buildServer({
      authenticate: async () => "11111111-1111-1111-1111-111111111111",
      createJobDependencies: () => {
        throw new Error("must not be called");
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "reson8-audit-engine",
    });

    await app.close();
  });
});

describe("POST /v1/audits", () => {
  it("requires bearer authentication before reading the audit payload", async () => {
    const app = buildServer({
      authenticate: async () => "11111111-1111-1111-1111-111111111111",
      createJobDependencies: () => {
        throw new Error("must not be called");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/audits",
      payload: Buffer.from([1, 2, 3]),
      headers: {
        "content-type": "audio/wav",
        "x-audio-filename": "master.wav",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "UNAUTHORIZED",
      message: "Authorization token is required",
    });

    await app.close();
  });

  it("accepts a verified user and creates a queued audit job", async () => {
    const response = await buildServer({
      authenticate: async (token) => {
        expect(token).toBe("token-123");
        return "11111111-1111-1111-1111-111111111111";
      },
      createJobDependencies: () => ({
        ensureProfile: async () => {},
        createJob: async () => "job-123",
        uploadMaster: async () => {},
        setSourcePath: async () => {},
        deleteMaster: async () => {},
        deleteJob: async () => {},
      }),
    }).inject({
      method: "POST",
      url: "/v1/audits",
      payload: Buffer.from([1, 2, 3]),
      headers: {
        authorization: "Bearer token-123",
        "content-type": "audio/wav",
        "x-audio-filename": "master.wav",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      jobId: "job-123",
      status: "queued",
    });
  });
});
