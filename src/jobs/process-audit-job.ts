import type { AuditRecognition } from "../providers/audd/normalize.js";
import { analyzePcm, type SonicDnaFeatures } from "../audio/sonic-dna.js";

export interface AuditJobRecord {
  id: string;
  ownerId: string;
  sourceAudioPath: string;
  mimeType: string;
  status: "queued" | "processing" | "completed" | "failed";
}

export interface AuditProcessorDependencies {
  getJob(jobId: string): Promise<AuditJobRecord | null>;
  markProcessing(jobId: string): Promise<void>;
  downloadMaster(path: string): Promise<Uint8Array>;
  createRecognitionSample(master: Uint8Array, mimeType: string): Promise<Uint8Array>;
  recognize(sample: Uint8Array): Promise<AuditRecognition>;
  saveRecognition(jobId: string, recognition: AuditRecognition): Promise<void>;
  saveEvidence(jobId: string, recognition: AuditRecognition): Promise<void>;
  decode(bytes: Uint8Array, mimeType?: string): Promise<{ samples: Float32Array; sampleRate: number; channels: number }>;
  saveSonicDna(jobId: string, dna: SonicDnaFeatures): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
  markFailed(jobId: string, message: string): Promise<void>;
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

    const master = await deps.downloadMaster(job.sourceAudioPath);
    const sample = await deps.createRecognitionSample(master, job.mimeType);
    const recognition = await deps.recognize(sample);
    await deps.saveRecognition(jobId, recognition);
    await deps.saveEvidence(jobId, recognition);

    const decoded = await deps.decode(master, job.mimeType);
    const dna = analyzePcm(decoded.samples, decoded.sampleRate);
    await deps.saveSonicDna(jobId, {
      ...dna,
      sampleRate: decoded.sampleRate,
      channels: decoded.channels,
      durationSeconds: decoded.samples.length / decoded.sampleRate,
    });

    await deps.markCompleted(jobId);
    return { status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await deps.markFailed(jobId, message);
    return { status: "failed" };
  }
}
