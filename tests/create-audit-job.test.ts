import { describe, expect, it } from "vitest";
import { createAuditJob } from "../src/jobs/create-audit-job.js";

describe("createAuditJob", () => {
  it("creates a queued job, stores the master under the owner namespace, and returns the job id", async () => {
    const calls: string[] = [];
    const result = await createAuditJob(
      {
        ownerId: "11111111-1111-1111-1111-111111111111",
        filename: "My Song.wav",
        mimeType: "audio/wav",
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        ensureProfile: async () => {
          calls.push("profile");
        },
        createJob: async (input) => {
          calls.push("job");
          expect(input.ownerId).toBe("11111111-1111-1111-1111-111111111111");
          expect(input.sha256).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
          return "job-123";
        },
        createCatalogJob: async () => "catalog-job",
        uploadMaster: async (path) => {
          calls.push("upload");
          expect(path).toBe(
            "11111111-1111-1111-1111-111111111111/job-123/My Song.wav",
          );
        },
        setSourcePath: async (jobId, path) => {
          calls.push("path");
          expect(jobId).toBe("job-123");
          expect(path).toBe(
            "11111111-1111-1111-1111-111111111111/job-123/My Song.wav",
          );
        },
        deleteMaster: async () => {
          calls.push("delete");
        },
      },
    );

    expect(result).toEqual({
      jobId: "job-123",
      sourceAudioPath:
        "11111111-1111-1111-1111-111111111111/job-123/My Song.wav",
      sha256: expect.any(String),
    });
    expect(calls).toEqual(["profile", "job", "upload", "path"]);
  });

  it("cleans up the database job and uploaded master when storage upload fails", async () => {
    const calls: string[] = [];
    await expect(
      createAuditJob(
        {
          ownerId: "11111111-1111-1111-1111-111111111111",
          filename: "master.wav",
          mimeType: "audio/wav",
          bytes: new Uint8Array([1]),
        },
        {
          ensureProfile: async () => calls.push("profile"),
          createJob: async () => {
            calls.push("job");
            return "job-123";
          },
          createCatalogJob: async () => "catalog-job",
          uploadMaster: async () => {
            calls.push("upload");
            throw new Error("storage unavailable");
          },
          setSourcePath: async () => calls.push("path"),
          deleteMaster: async () => calls.push("delete-master"),
          deleteJob: async () => calls.push("delete-job"),
        },
      ),
    ).rejects.toThrow("storage unavailable");

    expect(calls).toEqual(["profile", "job", "upload", "delete-master", "delete-job"]);
  });
  it("cleans up the uploaded master when finalizing the job fails", async () => {
    const calls: string[] = [];

    await expect(
      createAuditJob(
        {
          ownerId: "11111111-1111-1111-1111-111111111111",
          filename: "master.wav",
          mimeType: "audio/wav",
          bytes: new Uint8Array([1]),
        },
        {
          ensureProfile: async () => calls.push("profile"),
          createJob: async () => "job-123",
          createCatalogJob: async () => "catalog-job",
          uploadMaster: async () => calls.push("upload"),
          setSourcePath: async () => {
            calls.push("path");
            throw new Error("database unavailable");
          },
          deleteMaster: async () => calls.push("delete-master"),
          deleteJob: async () => calls.push("delete-job"),
        },
      ),
    ).rejects.toThrow("database unavailable");

    expect(calls).toEqual(["profile", "upload", "path", "delete-master", "delete-job"]);
  });

});
