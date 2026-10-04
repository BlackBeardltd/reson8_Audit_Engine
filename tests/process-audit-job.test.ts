import { describe, expect, it } from "vitest";
import { processAuditJob } from "../src/jobs/process-audit-job.js";

describe("processAuditJob", () => {
  it("moves a queued job through recognition and Sonic DNA analysis to completed", async () => {
    const events: string[] = [];
    const result = await processAuditJob("job-123", {
      getJob: async () => ({
        id: "job-123",
        ownerId: "owner-123",
        sourceAudioPath: "owner-123/job-123/master.wav",
        mimeType: "audio/wav",
        status: "queued" as const,
      }),
      markProcessing: async () => events.push("processing"),
      downloadMaster: async () => new Uint8Array([1, 2, 3]),
      createRecognitionSample: async () => new Uint8Array([4, 5]),
      recognize: async () => ({
        matched: true as const,
        artist: "Artist",
        title: "Song",
        spotifyUrl: "https://open.spotify.com/track/abc",
      }),
      saveRecognition: async () => events.push("recognition"),
      decode: async () => ({
        samples: new Float32Array([0, 0.1, -0.1, 0]),
        sampleRate: 44100,
        channels: 1,
      }),
      saveSonicDna: async (_jobId, dna) => {
        events.push("dna");
        expect(dna.sampleRate).toBe(44100);
      },
      markCompleted: async () => events.push("completed"),
      markFailed: async () => events.push("failed"),
    });

    expect(result.status).toBe("completed");
    expect(events).toEqual(["processing", "recognition", "dna", "completed"]);
  });

  it("marks the job failed and preserves the error when processing fails", async () => {
    let failure = "";
    const result = await processAuditJob("job-123", {
      getJob: async () => ({
        id: "job-123",
        ownerId: "owner-123",
        sourceAudioPath: "owner-123/job-123/master.wav",
        mimeType: "audio/wav",
        status: "queued" as const,
      }),
      markProcessing: async () => {},
      downloadMaster: async () => {
        throw new Error("master unavailable");
      },
      createRecognitionSample: async () => new Uint8Array(),
      recognize: async () => ({ matched: false as const }),
      saveRecognition: async () => {},
      decode: async () => {
        throw new Error("not reached");
      },
      saveSonicDna: async () => {},
      markCompleted: async () => {},
      markFailed: async (_jobId, message) => {
        failure = message;
      },
    });

    expect(result.status).toBe("failed");
    expect(failure).toBe("master unavailable");
  });
});
