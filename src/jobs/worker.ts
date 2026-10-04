import { createServer } from "node:http";
import { createAudioDecoder } from "../audio/decoder.js";
import { createRecognitionSample } from "../audio/recognition-sample.js";
import { AuddClient } from "../providers/audd/client.js";
import { collectCatalogMetadata } from "../providers/dsp/catalog.js";
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
      sourceType: job.sourceType,
      catalogUrl: job.catalogUrl,
      status: "queued",
    }),
    markProcessing: async (jobId) => store.markProcessing(jobId),
    downloadMaster: async (path) => store.downloadMaster(path),
    createRecognitionSample,
    recognize: (sample) => audd.recognize(sample),
    recognizeUrl: (url) => audd.recognizeUrl(url),
    collectCatalogMetadata,
    saveRecognition: async (jobId, recognition) => store.saveRecognition(jobId, recognition),
    saveSonicDna: async (jobId, dna) => store.saveSonicDna(jobId, dna),
    saveEvidence: async (jobId, recognition) => store.saveEvidence(jobId, recognition),
    saveCatalogMetadata: async (jobId, metadata) => store.saveCatalogMetadata(jobId, metadata),
    decode: async (bytes) => decoder.decode(bytes),
    markCompleted: async (jobId) => store.markCompleted(jobId),
    markFailed: async (jobId, message) => store.markFailed(jobId, message),
  };

  return { jobId: job.id, ...(await processAuditJob(job.id, deps)) };
}

function startHealthServer(): void {
  const port = Number(process.env.PORT ?? 10000);
  const host = process.env.HOST ?? "0.0.0.0";

  createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(302, { location: "https://reson8-audit-engine.onrender.com/" });
      response.end();
      return;
    }

    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        service: "reson8-audit-worker",
      }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  }).listen(port, host, () => {
    console.log(JSON.stringify({ worker: "audit", status: "health-listening", port, host }));
  });
}

async function runWorkerLoop(): Promise<void> {
  startHealthServer();
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
