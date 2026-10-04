import { createAudioDecoder } from "../audio/decoder.js";
import { createRecognitionSample } from "../audio/recognition-sample.js";
import { AuddClient } from "../providers/audd/client.js";
import { createSupabaseAuditStore } from "../integrations/supabase-audit-store.js";
import { processAuditJob, type AuditProcessorDependencies } from "./process-audit-job.js";

const POLL_INTERVAL_MS = 15_000;

export async function processNextQueuedAudit(): Promise<{ jobId: string; status: "completed" | "failed" } | null> {
  const store = createSupabaseAuditStore();
  const job = await store.claimNextQueuedJob();
  if (!job) return null;

  const audd = new AuddClient();
  const decoder = createAudioDecoder();

  const deps: AuditProcessorDependencies = {
    getJob: async () => ({
      id: job.id,
      ownerId: job.ownerId,
      sourceAudioPath: job.sourceAudioPath,
      mimeType: job.mimeType,
      status: "queued",
    }),
    markProcessing: async (jobId) => store.markProcessing(jobId),
    downloadMaster: async (path) => store.downloadMaster(path),
    createRecognitionSample,
    recognize: (sample) => audd.recognize(sample),
    saveRecognition: async (jobId, recognition) => store.saveRecognition(jobId, recognition),
    saveSonicDna: async (jobId, dna) => store.saveSonicDna(jobId, dna),
    saveEvidence: async (jobId, recognition) => store.saveEvidence(jobId, recognition),
    decode: async (bytes) => decoder.decode(bytes),
    markCompleted: async (jobId) => store.markCompleted(jobId),
    markFailed: async (jobId, message) => store.markFailed(jobId, message),
  };

  return { jobId: job.id, ...(await processAuditJob(job.id, deps)) };
}

async function runWorkerLoop(): Promise<void> {
  console.log(JSON.stringify({ worker: "audit", status: "started", pollIntervalMs: POLL_INTERVAL_MS }));

  for (;;) {
    try {
      const result = await processNextQueuedAudit();
      console.log(JSON.stringify({ worker: "audit", result }));
    } catch (error) {
      console.error(JSON.stringify({
        worker: "audit",
        error: error instanceof Error ? error.message : String(error),
      }));
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (process.env.NODE_ENV !== "test") {
  runWorkerLoop().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
