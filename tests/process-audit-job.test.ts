import { describe, expect, it } from "vitest";
import { processAuditJob } from "../src/jobs/process-audit-job.js";

const assessment = {
  assessmentVersion: "1.0",
  executiveSummary: "Evidence-based assessment.",
  creativeIdentity: "Rhythmic R&B identity.",
  strengths: ["Rhythm"],
  risks: ["Limited market evidence"],
  aAndRPositioning: {
    primaryLane: "R&B",
    adjacentLanes: ["Afro-R&B"],
    rationale: "Supported by supplied evidence.",
  },
  commercialRead: {
    marketability: "undetermined" as const,
    rationale: "No market data supplied.",
  },
  releaseStrategy: {
    recommendation: "Lead with the strongest sonic identity.",
    priorities: ["Validate audience response"],
  },
  evidenceGaps: ["Audience telemetry"],
  confidence: 0.8,
  limitations: ["Evidence-limited assessment"],
};

describe("processAuditJob", () => {
  it("moves a queued master through evidence, Sonic DNA, Groq assessment and completion", async () => {
    const events: string[] = [];
    const result = await processAuditJob("job-123", {
      getJob: async () => ({
        id: "job-123",
        ownerId: "owner-123",
        sourceAudioPath: "owner-123/job-123/master.wav",
        mimeType: "audio/wav",
        sourceType: "master",
        catalogUrl: null,
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
      saveEvidence: async () => events.push("evidence"),
      decode: async () => ({
        samples: new Float32Array([0, 0.1, -0.1, 0]),
        sampleRate: 44100,
        channels: 1,
      }),
      saveSonicDna: async (_jobId, dna) => {
        events.push("dna");
        expect(dna.sampleRate).toBe(44100);
      },
      generateAssessment: async (input) => {
        events.push("assessment");
        expect(input.sonicDna).not.toBeNull();
        expect(input.evidence).toMatchObject({ artist: "Artist", title: "Song" });
        return assessment;
      },
      saveAssessment: async () => events.push("assessment-saved"),
      generateReport: async (_input, tier) => {
        events.push(`report-${tier}`);
        return new Uint8Array([37, 80, 68, 70, 45]);
      },
      saveReport: async (_jobId, tier) => events.push(`report-saved-${tier}`),
      markCompleted: async () => events.push("completed"),
      markFailed: async () => events.push("failed"),
    });

    expect(result.status).toBe("completed");
    expect(events).toEqual([
      "processing",
      "recognition",
      "evidence",
      "dna",
      "assessment",
      "assessment-saved",
      "report-sample",
      "report-saved-sample",
      "report-full",
      "report-saved-full",
      "completed",
    ]);
  });

  it("merges DSP identity with partial AudD enrichment before Groq and PDF generation", async () => {
    const assessmentInputs: Record<string, unknown>[] = [];
    const reportInputs: Record<string, unknown>[] = [];

    const result = await processAuditJob("job-dsp", {
      getJob: async () => ({
        id: "job-dsp",
        ownerId: "owner-123",
        sourceAudioPath: null,
        mimeType: null,
        sourceType: "dsp_link" as const,
        catalogUrl: "https://open.spotify.com/track/spotify-123",
        status: "queued" as const,
      }),
      markProcessing: async () => {},
      collectCatalogMetadata: async () => ({
        platform: "spotify" as const,
        sourceUrl: "https://open.spotify.com/track/spotify-123",
        canonicalUrl: "https://open.spotify.com/track/spotify-123",
        catalogId: "spotify-123",
        artist: "Spotify Artist",
        title: "Spotify Title",
        album: null,
        releaseDate: null,
        isrc: null,
        upc: null,
        label: null,
        genre: null,
        catalogPopularity: 61,
        artworkUrl: null,
        previewUrl: "https://example.com/preview.mp3",
        externalIds: { spotify: "spotify-123" },
        raw: {},
        evidenceStatus: "verified" as const,
        sonicProfile: {
          provenance: "tidal_catalog_metadata" as const,
          bpm: 96,
          key: "A",
          mode: "minor" as const,
          moodTags: ["Energetic"],
          genreContext: ["R&B"],
        },
      }),
      recognizeUrl: async () => ({
        matched: true as const,
        artist: null,
        title: null,
        album: "AudD Album",
        isrc: "US-ABC-12-34567",
      }),
      saveRecognition: async () => {},
      saveEvidence: async () => {},
      saveCatalogMetadata: async () => {},
      downloadMaster: async () => new Uint8Array(),
      createRecognitionSample: async () => new Uint8Array(),
      recognize: async () => ({ matched: false as const }),
      decode: async () => ({ samples: new Float32Array(), sampleRate: 44100, channels: 1 }),
      saveSonicDna: async () => {},
      generateAssessment: async (input) => {
        assessmentInputs.push(input.evidence);
        expect(input.sonicDna).toMatchObject({
          provenance: "tidal_catalog_metadata",
          bpm: 96,
          key: "A",
          mode: "minor",
          genreContext: ["R&B"],
        });
        return assessment;
      },
      saveAssessment: async () => {},
      generateReport: async (input) => {
        reportInputs.push(input.evidence);
        return new Uint8Array([37, 80, 68, 70, 45]);
      },
      saveReport: async () => {},
      markCompleted: async () => {},
      markFailed: async () => {},
    });

    expect(result.status).toBe("completed");
    expect(assessmentInputs[0]).toMatchObject({
      artist: "Spotify Artist",
      title: "Spotify Title",
      album: "AudD Album",
      isrc: "USABC1234567",
      identity: {
        artist: "Spotify Artist",
        title: "Spotify Title",
        album: "AudD Album",
        sourceProviders: ["spotify", "audd"],
      },
    });
    expect(reportInputs[1]).toMatchObject({
      artist: "Spotify Artist",
      title: "Spotify Title",
      album: "AudD Album",
    });
  });

  it("marks the job failed and preserves the error when processing fails", async () => {
    let failure = "";
    const result = await processAuditJob("job-123", {
      getJob: async () => ({
        id: "job-123",
        ownerId: "owner-123",
        sourceAudioPath: "owner-123/job-123/master.wav",
        mimeType: "audio/wav",
        sourceType: "master",
        catalogUrl: null,
        status: "queued" as const,
      }),
      markProcessing: async () => {},
      downloadMaster: async () => {
        throw new Error("master unavailable");
      },
      createRecognitionSample: async () => new Uint8Array(),
      recognize: async () => ({ matched: false as const }),
      saveRecognition: async () => {},
      saveEvidence: async () => {},
      decode: async () => {
        throw new Error("not reached");
      },
      saveSonicDna: async () => {},
      generateAssessment: async () => assessment,
      saveAssessment: async () => {},
      generateReport: async () => new Uint8Array(),
      saveReport: async () => {},
      markCompleted: async () => {},
      markFailed: async (_jobId, message) => {
        failure = message;
      },
    });

    expect(result.status).toBe("failed");
    expect(failure).toBe("master unavailable");
  });
});
