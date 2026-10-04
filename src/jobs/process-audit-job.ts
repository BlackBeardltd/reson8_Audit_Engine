import type { AuditRecognition } from "../providers/audd/normalize.js";
import type { CatalogMetadata } from "../providers/dsp/catalog.js";
import type { ArAssessment } from "../providers/groq/client.js";
import { analyzePcm, type SonicDnaFeatures } from "../audio/sonic-dna.js";

export interface AuditJobRecord {
  id: string;
  ownerId: string;
  sourceAudioPath: string | null;
  mimeType: string | null;
  sourceType: "master" | "dsp_link";
  catalogUrl: string | null;
  status: "queued" | "processing" | "completed" | "failed";
}

export interface AuditProcessorDependencies {
  getJob(jobId: string): Promise<AuditJobRecord | null>;
  markProcessing(jobId: string): Promise<void>;
  collectCatalogMetadata(url: string): Promise<CatalogMetadata>;
  recognizeUrl(url: string): Promise<AuditRecognition>;
  downloadMaster(path: string): Promise<Uint8Array>;
  createRecognitionSample(master: Uint8Array, mimeType: string): Promise<Uint8Array>;
  recognize(sample: Uint8Array): Promise<AuditRecognition>;
  saveRecognition(jobId: string, recognition: AuditRecognition): Promise<void>;
  saveEvidence(jobId: string, recognition: AuditRecognition): Promise<void>;
  saveCatalogMetadata(jobId: string, metadata: CatalogMetadata): Promise<void>;
  decode(bytes: Uint8Array, mimeType?: string): Promise<{ samples: Float32Array; sampleRate: number; channels: number }>;
  saveSonicDna(jobId: string, dna: SonicDnaFeatures): Promise<void>;
  generateAssessment(input: {
    evidence: Record<string, unknown>;
    sonicDna: Record<string, unknown> | null;
    catalogMetadata?: Record<string, unknown> | null;
  }): Promise<ArAssessment>;
  saveAssessment(jobId: string, assessment: ArAssessment): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
  markFailed(jobId: string, message: string): Promise<void>;
}

function recognitionEvidence(recognition: AuditRecognition): Record<string, unknown> {
  if (!recognition.matched) {
    return {
      matched: false,
      confidence: null,
      source: "audd",
    };
  }

  return {
    matched: true,
    artist: recognition.artist ?? null,
    title: recognition.title ?? null,
    album: recognition.album ?? null,
    releaseDate: recognition.releaseDate ?? null,
    label: recognition.label ?? null,
    isrc: recognition.isrc ?? null,
    spotifyId: recognition.spotifyId ?? null,
    appleMusicId: recognition.appleMusicId ?? null,
    musicbrainzId: recognition.musicbrainzId ?? null,
    confidence: 1,
    source: "audd",
  };
}

function catalogEvidence(metadata: CatalogMetadata): Record<string, unknown> {
  return {
    status: metadata.evidenceStatus,
    platform: metadata.platform,
    artist: metadata.artist,
    title: metadata.title,
    album: metadata.album,
    releaseDate: metadata.releaseDate,
    isrc: metadata.isrc,
    upc: metadata.upc,
    label: metadata.label,
    genre: metadata.genre,
    externalIds: metadata.externalIds,
    canonicalUrl: metadata.canonicalUrl,
    source: metadata.platform,
  };
}

function dnaEvidence(dna: SonicDnaFeatures): Record<string, unknown> {
  return {
    sampleRate: dna.sampleRate,
    channels: dna.channels,
    durationSeconds: dna.durationSeconds,
    bpm: dna.bpm,
    key: dna.key,
    mode: dna.mode,
    loudnessLufs: dna.loudnessLufs,
    rmsEnergy: dna.rmsEnergy,
    dynamicRangeDb: dna.dynamicRangeDb,
    spectralCentroidHz: dna.spectralCentroidHz,
    spectralBandwidthHz: dna.spectralBandwidthHz,
    spectralRolloffHz: dna.spectralRolloffHz,
    zeroCrossingRate: dna.zeroCrossingRate,
    moodTags: dna.moodTags,
    genreContext: dna.genreContext,
  };
}

export async function processAuditJob(
  jobId: string,
  deps: AuditProcessorDependencies,
): Promise<{ status: "completed" | "failed" }> {
  const job = await deps.getJob(jobId);
  if (!job) throw new Error("Audit job not found");
  if (job.status !== "queued") throw new Error(`Audit job is not queued: ${job.status}`);

  try {
    await deps.markProcessing(jobId);

    if (job.sourceType === "dsp_link") {
      if (!job.catalogUrl) throw new Error("Catalog URL is missing");
      const metadata = await deps.collectCatalogMetadata(job.catalogUrl);
      await deps.saveCatalogMetadata(jobId, metadata);

      let recognition: AuditRecognition | null = null;
      if (metadata.previewUrl) {
        try {
          recognition = await deps.recognizeUrl(metadata.previewUrl);
          await deps.saveRecognition(jobId, recognition);
          await deps.saveEvidence(jobId, recognition);
        } catch {
          // Preview recognition is enrichment; catalog metadata remains authoritative evidence.
        }
      }

      await deps.saveAssessment(jobId, await deps.generateAssessment({
        evidence: recognition ? recognitionEvidence(recognition) : catalogEvidence(metadata),
        sonicDna: null,
        catalogMetadata: catalogEvidence(metadata),
      }));
      await deps.markCompleted(jobId);
      return { status: "completed" };
    }

    if (!job.sourceAudioPath || !job.mimeType) throw new Error("Master source is missing");
    const master = await deps.downloadMaster(job.sourceAudioPath);
    const sample = await deps.createRecognitionSample(master, job.mimeType);
    const recognition = await deps.recognize(sample);
    await deps.saveRecognition(jobId, recognition);
    await deps.saveEvidence(jobId, recognition);

    const decoded = await deps.decode(master, job.mimeType);
    const dna = analyzePcm(decoded.samples, decoded.sampleRate);
    const normalizedDna = {
      ...dna,
      sampleRate: decoded.sampleRate,
      channels: decoded.channels,
      durationSeconds: decoded.samples.length / decoded.sampleRate,
    };
    await deps.saveSonicDna(jobId, normalizedDna);

    await deps.saveAssessment(jobId, await deps.generateAssessment({
      evidence: recognitionEvidence(recognition),
      sonicDna: dnaEvidence(normalizedDna),
      catalogMetadata: null,
    }));

    await deps.markCompleted(jobId);
    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await deps.markFailed(jobId, message);
    return { status: "failed" };
  }
}
