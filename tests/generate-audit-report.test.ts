import { PDFDocument } from "@cantoo/pdf-lib";
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
  it("creates an editable sample PDF that excludes paid-only assessment fields", async () => {
    const pdf = await generateAuditReport(input, "sample");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");

    const document = await PDFDocument.load(pdf);
    const names = document.getForm().getFields().map((field) => field.getName());
    expect(names).toContain("executive_summary");
    expect(names).toContain("creative_identity");
    expect(names).toContain("ar_positioning");
    expect(names).not.toContain("risks");
    expect(names).not.toContain("release_strategy");
  });

  it("creates a fuller editable PDF containing the paid assessment fields", async () => {
    const pdf = await generateAuditReport(input, "full");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");

    const document = await PDFDocument.load(pdf);
    const names = document.getForm().getFields().map((field) => field.getName());
    expect(names).toContain("risks");
    expect(names).toContain("commercial_read");
    expect(names).toContain("release_strategy");
    expect(names).toContain("sonic_dna");
  });
});
