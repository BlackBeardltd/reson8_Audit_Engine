import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateAuditJobDependencies } from "../jobs/create-audit-job.js";

export interface SupabaseAuditStore {
  admin: SupabaseClient;
  createJobDependencies(): CreateAuditJobDependencies;
  authenticate(accessToken: string): Promise<string>;
}

export function createSupabaseAuditStore(
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
): SupabaseAuditStore {
  if (!url) throw new Error("SUPABASE_URL is required");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required");

  const admin = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return {
    admin,

    async authenticate(accessToken: string) {
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error || !data.user) {
        throw new Error("Invalid authentication token");
      }
      return data.user.id;
    },

    createJobDependencies() {
      return {
        ensureProfile: async (ownerId) => {
          const { error } = await admin.from("profiles").upsert(
            { id: ownerId },
            { onConflict: "id", ignoreDuplicates: true },
          );
          if (error) throw new Error(`Unable to initialize profile: ${error.message}`);
        },

        createJob: async (input) => {
          const { data, error } = await admin
            .from("audit_jobs")
            .insert({
              owner_id: input.ownerId,
              status: "queued",
              original_filename: input.filename,
              mime_type: input.mimeType,
              size_bytes: input.sizeBytes,
              sha256: input.sha256,
            })
            .select("id")
            .single();

          if (error || !data) {
            throw new Error(`Unable to create audit job: ${error?.message ?? "unknown error"}`);
          }

          return data.id as string;
        },

        uploadMaster: async (path, bytes, mimeType) => {
          const { error } = await admin.storage.from("audit-audio").upload(path, bytes, {
            contentType: mimeType,
            upsert: false,
          });
          if (error) throw new Error(`Unable to store audio master: ${error.message}`);
        },

        setSourcePath: async (jobId, path) => {
          const { error } = await admin
            .from("audit_jobs")
            .update({ source_audio_path: path })
            .eq("id", jobId);

          if (error) throw new Error(`Unable to finalize audit job: ${error.message}`);
        },

        deleteMaster: async (path) => {
          const { error } = await admin.storage.from("audit-audio").remove([path]);
          if (error) throw new Error(`Unable to clean up audio master: ${error.message}`);
        },

        deleteJob: async (jobId) => {
          const { error } = await admin.from("audit_jobs").delete().eq("id", jobId);
          if (error) throw new Error(`Unable to clean up audit job: ${error.message}`);
        },
      };
    },
  };
}
