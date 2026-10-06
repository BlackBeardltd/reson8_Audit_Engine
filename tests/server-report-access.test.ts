import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const SAMPLE_PDF = Buffer.from("%PDF-1.7\n");

function store(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "11111111-1111-1111-1111-111111111111",
    resolvePublicOwnerId: async () => null,
    createJobDependencies: () => { throw new Error("not used"); },
    ...overrides,
  } as any;
}

describe("audit report retrieval", () => {
  it("returns completed sample report metadata for a processed job", async () => {
    const app = buildServer(store({
      getAuditStatus: async () => ({
        jobId: "job-123",
        status: "completed",
        sample: { available: true, version: 1 },
        full: { available: true, version: 1, locked: false },
      }),
    }));

    const response = await app.inject({ method: "GET", url: "/v1/audits/job-123" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jobId: "job-123",
      status: "completed",
      sample: { available: true, version: 1 },
      full: { available: true, version: 1, locked: false },
    });

    await app.close();
  });

  it("lets the public download the generated sample report", async () => {
    const app = buildServer(store({
      getAuditReport: async (jobId: string, tier: string, ownerId?: string) => {
        expect(jobId).toBe("job-123");
        expect(tier).toBe("sample");
        expect(ownerId).toBeUndefined();
        return { bytes: SAMPLE_PDF, contentType: "application/pdf", filename: "reson8-audit-job-123-sample-v1.pdf" };
      },
    }));

    const response = await app.inject({ method: "GET", url: "/v1/audits/job-123/reports/sample" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("reson8-audit-job-123-sample-v1.pdf");
    expect(response.body).toBe(SAMPLE_PDF.toString());

    await app.close();
  });

  it("lets an anonymous visitor download the generated full report", async () => {
    const app = buildServer(store({
      getAuditReport: async (jobId: string, tier: string, ownerId?: string) => {
        expect(jobId).toBe("job-123");
        expect(tier).toBe("full");
        expect(ownerId).toBeUndefined();
        return { bytes: SAMPLE_PDF, contentType: "application/pdf", filename: "reson8-audit-job-123-full-v1.pdf" };
      },
    }));

    const response = await app.inject({ method: "GET", url: "/v1/audits/job-123/reports/full" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("reson8-audit-job-123-full-v1.pdf");

    await app.close();
  });
});
