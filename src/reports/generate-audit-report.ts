import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import type { ArAssessment } from "../providers/groq/client.js";

export type AuditReportTier = "sample" | "full";

export interface AuditReportInput {
  auditId: string;
  generatedAt: string;
  evidence: Record<string, unknown>;
  sonicDna: Record<string, unknown> | null;
  assessment: ArAssessment;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function wrap(value: string, max = 92): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawParagraph(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size = 10): number {
  let cursor = y;
  for (const line of wrap(value)) {
    page.drawText(line, { x, y: cursor, size, font, color: rgb(0.12, 0.13, 0.15) });
    cursor -= size + 4;
  }
  return cursor - 6;
}

function drawHeading(page: PDFPage, title: string, x: number, y: number, font: PDFFont): number {
  page.drawText(title, { x, y, size: 12, font, color: rgb(0.05, 0.06, 0.08) });
  return y - 20;
}

function addEditableField(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  name: string,
  value: string,
  x: number,
  y: number,
  width = 500,
  height = 46,
): number {
  const form = pdf.getForm();
  const field = form.createTextField(name);
  field.enableMultiline();
  field.setText(value);
  field.addToPage(page, { x, y: y - height, width, height });
  field.setFontSize(9);
  field.updateAppearances(font);
  return y - height - 14;
}

export async function generateAuditReport(
  input: AuditReportInput,
  tier: AuditReportTier,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([612, 792]);
  const margin = 48;
  let y = 744;

  page.drawText("RESON8", { x: margin, y, size: 11, font: bold, color: rgb(0.08, 0.09, 0.1) });
  page.drawText("A&R AUDIT", { x: margin, y: y - 20, size: 24, font: bold, color: rgb(0.03, 0.04, 0.05) });
  page.drawText(tier === "sample" ? "CONFIDENTIAL SAMPLE REPORT" : "CONFIDENTIAL FULL REPORT", {
    x: margin, y: y - 38, size: 9, font: bold, color: rgb(0.3, 0.31, 0.34),
  });

  const artist = text(input.evidence.artist);
  const title = text(input.evidence.title);
  page.drawText(`${artist} — ${title}`, { x: margin, y: y - 66, size: 15, font: bold });
  page.drawText(`Audit ID: ${input.auditId} · Generated: ${input.generatedAt.slice(0, 10)}`, {
    x: margin, y: y - 82, size: 8, font,
  });

  y -= 118;
  y = drawHeading(page, "Executive assessment", margin, y, bold);
  y = addEditableField(pdf, page, font, "executive_summary", input.assessment.executiveSummary, margin, y);

  y = drawHeading(page, "Creative identity", margin, y, bold);
  y = addEditableField(pdf, page, font, "creative_identity", input.assessment.creativeIdentity, margin, y);

  y = drawHeading(page, "A&R positioning", margin, y, bold);
  y = addEditableField(
    pdf,
    page,
    font,
    "ar_positioning",
    `Primary lane: ${input.assessment.aAndRPositioning.primaryLane}\nAdjacent lanes: ${input.assessment.aAndRPositioning.adjacentLanes.join(", ")}\nRationale: ${input.assessment.aAndRPositioning.rationale}`,
    margin,
    y,
    500,
    72,
  );

  if (tier === "full") {
    if (y < 150) {
      page = pdf.addPage([612, 792]);
      y = 744;
    }

    y = drawHeading(page, "Strengths", margin, y, bold);
    y = addEditableField(pdf, page, font, "strengths", input.assessment.strengths.map((v) => `• ${v}`).join("\n"), margin, y, 500, 70);

    y = drawHeading(page, "Risks and constraints", margin, y, bold);
    y = addEditableField(pdf, page, font, "risks", input.assessment.risks.map((v) => `• ${v}`).join("\n"), margin, y, 500, 70);

    y = drawHeading(page, "Commercial read", margin, y, bold);
    y = addEditableField(
      pdf,
      page,
      font,
      "commercial_read",
      `${input.assessment.commercialRead.marketability.toUpperCase()} — ${input.assessment.commercialRead.rationale}`,
      margin,
      y,
      500,
      58,
    );

    y = drawHeading(page, "Release strategy", margin, y, bold);
    y = addEditableField(
      pdf,
      page,
      font,
      "release_strategy",
      `${input.assessment.releaseStrategy.recommendation}\n\nPriorities:\n${input.assessment.releaseStrategy.priorities.map((v) => `• ${v}`).join("\n")}`,
      margin,
      y,
      500,
      100,
    );

    if (y < 170) {
      page = pdf.addPage([612, 792]);
      y = 744;
    }

    y = drawHeading(page, "Evidence gaps and limitations", margin, y, bold);
    y = addEditableField(
      pdf,
      page,
      font,
      "evidence_gaps",
      `Evidence gaps:\n${input.assessment.evidenceGaps.map((v) => `• ${v}`).join("\n")}\n\nLimitations:\n${input.assessment.limitations.map((v) => `• ${v}`).join("\n")}`,
      margin,
      y,
      500,
      120,
    );

    const sonicHeading = input.sonicDna && input.sonicDna.provenance === "tidal_catalog_metadata"
      ? "Catalog Sonic Profile (TIDAL metadata)"
      : "Observed Sonic DNA";
    y = drawHeading(page, sonicHeading, margin, y, bold);
    const dna = input.sonicDna
      ? [
          `BPM: ${text(input.sonicDna.bpm)}`,
          `Key: ${text(input.sonicDna.key)}`,
          `Mode: ${text(input.sonicDna.mode)}`,
          `Loudness LUFS: ${text(input.sonicDna.loudnessLufs)}`,
          `Dynamic range dB: ${text(input.sonicDna.dynamicRangeDb)}`,
          `Spectral centroid Hz: ${text(input.sonicDna.spectralCentroidHz)}`,
          `Mood tags: ${text(input.sonicDna.moodTags)}`,
          `Genre context: ${text(input.sonicDna.genreContext)}`,
        ].join("\n")
      : "No master-derived or provider sonic profile was available for this audit.";
    y = addEditableField(pdf, page, font, "sonic_dna", dna, margin, y, 500, 120);
  }

  if (y < 110) {
    page = pdf.addPage([612, 792]);
    y = 744;
  }

  page.drawText(
    `Evidence status: ${text(input.evidence.status)} · Assessment confidence: ${Math.round(input.assessment.confidence * 100)}%`,
    { x: margin, y: 58, size: 8, font },
  );
  page.drawText(
    "Evidence before opinion. This report must not be read as independent market-performance data.",
    { x: margin, y: 44, size: 7, font },
  );

  return pdf.save();
}
