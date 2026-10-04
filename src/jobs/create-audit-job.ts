import { sha256 } from "./content-hash.js";
import { validateAudioUpload } from "./audio-intake.js";

export interface CreateAuditJobInput {
  ownerId: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface CreateAuditJobDependencies {
  ensureProfile: (ownerId: string) => Promise<void>;
  createJob: (input: { ownerId: string; filename: string; mimeType: string; sizeBytes: number; sha256: string; }) => Promise<string>;
  createCatalogJob: (input: { ownerId: string; catalogUrl: string; sha256: string }) => Promise<string>;
  uploadMaster: (path: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
  setSourcePath: (jobId: string, path: string) => Promise<void>;
  deleteMaster: (path: string) => Promise<void>;
  deleteJob?: (jobId: string) => Promise<void>;
}

export async function createAuditJob(
  input: CreateAuditJobInput,
  deps: CreateAuditJobDependencies,
) {
  const validated = validateAudioUpload({
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
  });
  const digest = await sha256(input.bytes);

  await deps.ensureProfile(input.ownerId);

  const jobId = await deps.createJob({
    ownerId: input.ownerId,
    filename: validated.filename,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    sha256: digest,
  });

  const sourceAudioPath = `${input.ownerId}/${jobId}/${validated.filename}`;

  try {
    await deps.uploadMaster(sourceAudioPath, input.bytes, validated.mimeType);
    await deps.setSourcePath(jobId, sourceAudioPath);
  } catch (error) {
    try {
      await deps.deleteMaster(sourceAudioPath);
    } catch {
      // Preserve the original pipeline error; cleanup failure is operational telemetry.
    }
    try {
      await deps.deleteJob?.(jobId);
    } catch {
      // Preserve the original pipeline error; cleanup failure is operational telemetry.
    }
    throw error;
  }

  return { jobId, sourceAudioPath, sha256: digest };
}
