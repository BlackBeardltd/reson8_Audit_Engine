import { describe, expect, it } from "vitest";
import { generateAuditReport, type AuditReportInput } from "../src/reports/generate-audit-report.js";

const input: AuditReportInput = {
  auditId: "job-123",
  generatedAt: "2026-10-04T03:00:00.000Z",
  evidence: {
    status: "verified",
    artist: "Artist",
    title: "Song",
    isrc: "NGABC2600001",
    sources: ["audd", "spotify"],
  },
  sonicDna: {
    bpm: 94,
    key: null,
    mode: null,
    loudnessLufs: -12.4,
    rmsEnergy: 0.08,
    dynamicRangeDb: 9.2,
    spectralCentroidHz: 1800,
    moodTags: ["Low Energy"],
    genreContext: ["R&B", "Afrobeats"],
  },
  assessment: {
    assessmentVersion: "1.0",
    executiveSummary: "Strong rhythmic identity.",
    creativeIdentity: "Introspective R&B.",
    strengths: ["Rhythm", "Vocal identity"],
    risks: ["Limited market evidence"],
    aAndRPositioning: {
      primaryLane: "Afro-R&B",
      adjacentLanes: ["Alternative R&B"],
      rationale: "Supported by observed evidence.",
    },
    commercialRead: {
      marketability: "undetermined",
      rationale: "No market evidence supplied.",
    },
    releaseStrategy: {
      recommendation: "Lead with the strongest sonic identity.",
      priorities: ["Validate audience response"],
    },
    evidenceGaps: ["Audience telemetry"],
    confidence: 0.82,
    limitations: ["Evidence-limited assessment"],
  },
};

describe("generateAuditReport", () => {
  it("creates a downloadable PDF for the sample tier without exposing full assessment sections", async () => {
    const pdf = await generateAuditReport(input, "sample");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain("A&R AUDIT");
    expect(text).not.toContain("Limited market evidence");
  });

  it("creates a fuller editable PDF with form fields for the paid tier", async () => {
    const pdf = await generateAuditReport(input, "full");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain("Limited market evidence");
    expect(text).toContain("/AcroForm");
  });
});
