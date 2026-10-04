import { createAudioDecoder } from "../audio/decoder.js";
import { createRecognitionSample } from "../audio/recognition-sample.js";
import { AuddClient } from "../providers/audd/client.js";
import { createSupabaseAuditStore } from "../integrations/supabase-audit-store.js";
import { processAuditJob, type AuditProcessorDependencies } from "./process-audit-job.js";

export async function processNextQueuedAudit(): Promise<{ jobId: string; status: "completed" | "failed" } | null> {
  const store = createSupabaseAuditStore();
  const job = await store.claimNextQueuedJob();
  if (!job) return null;

  const audd = new AuddClient();
  const decoder = createAudioDecoder();

  const deps: AuditProcessorDependencies = {
    getJob: async () => ({
      id: job.id, ownerId: job.ownerId, sourceAudioPath: job.sourceAudioPath, mimeType: job.mimeType, status: "queued",
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

if (process.env.NODE_ENV !== "test") {
  processNextQueuedAudit()
    .then((result) => {
      console.log(JSON.stringify({ worker: "audit", result }));
      process.exit(result ? 0 : 0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
