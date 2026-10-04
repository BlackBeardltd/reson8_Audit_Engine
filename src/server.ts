import Fastify from "fastify";
import { extractBearerToken } from "./auth/bearer.js";
import { createAuditJob } from "./jobs/create-audit-job.js";
import { MAX_AUDIO_FILE_BYTES } from "./jobs/audio-intake.js";
import { createSupabaseAuditStore } from "./integrations/supabase-audit-store.js";
import type { CreateAuditJobDependencies } from "./jobs/create-audit-job.js";

export interface AuditStore {
  authenticate(accessToken: string): Promise<string>;
  createJobDependencies(): CreateAuditJobDependencies;
}

export function buildServer(store: AuditStore = createSupabaseAuditStore()) {
  const app = Fastify({
    logger: true,
    bodyLimit: MAX_AUDIO_FILE_BYTES,
  });

  app.addContentTypeParser(/^audio\/.+$/i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "reson8-audit-engine",
  }));

  app.post<{
    Headers: {
      authorization?: string;
      "x-audio-filename"?: string;
    };
  }>("/v1/audits", async (request, reply) => {
    try {
      const token = extractBearerToken(request.headers.authorization);
      const ownerId = await store.authenticate(token);
      const filename = request.headers["x-audio-filename"];

      if (!filename) {
        return reply.code(400).send({
          error: "AUDIO_FILENAME_REQUIRED",
          message: "x-audio-filename is required",
        });
      }

      const contentType = String(request.headers["content-type"] ?? "").split(";")[0].trim();
      const bytes = request.body as Buffer;

      const result = await createAuditJob(
        {
          ownerId,
          filename,
          mimeType: contentType,
          bytes,
        },
        store.createJobDependencies(),
      );

      return reply.code(201).send({
        jobId: result.jobId,
        status: "queued",
        sha256: result.sha256,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create audit job";

      if (message === "Authorization token is required" || message === "Invalid authentication token") {
        return reply.code(401).send({
          error: "UNAUTHORIZED",
          message,
        });
      }

      if (
        message === "Audio filename is required" ||
        message === "Unsupported audio type" ||
        message === "Audio file is empty" ||
        message === "Audio file exceeds the 50 MB limit"
      ) {
        return reply.code(400).send({
          error: "INVALID_AUDIO_UPLOAD",
          message,
        });
      }

      request.log.error({ err: error }, "audit job creation failed");
      return reply.code(500).send({
        error: "AUDIT_JOB_CREATION_FAILED",
        message: "Unable to create audit job",
      });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 10000);
  const host = process.env.HOST ?? "0.0.0.0";
  buildServer().listen({ port, host }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
