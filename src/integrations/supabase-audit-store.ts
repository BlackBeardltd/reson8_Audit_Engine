import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateAuditJobDependencies } from "../jobs/create-audit-job.js";
import type { AuditJobRecord } from "../jobs/process-audit-job.js";
import type { AuditRecognition } from "../providers/audd/normalize.js";
import { buildSongEvidence } from "../jobs/song-evidence.js";
import type { SonicDnaFeatures } from "../audio/sonic-dna.js";

export interface SupabaseAuditStore {
  admin: SupabaseClient;
  createJobDependencies(): CreateAuditJobDependencies;
  authenticate(accessToken: string): Promise<string>;
  claimNextQueuedJob(): Promise<AuditJobRecord | null>;
  markProcessing(jobId: string): Promise<void>;
  downloadMaster(path: string): Promise<Uint8Array>;
  saveRecognition(jobId: string, recognition: AuditRecognition): Promise<void>;
  saveEvidence(jobId: string, recognition: AuditRecognition): Promise<void>;
  saveSonicDna(jobId: string, dna: SonicDnaFeatures): Promise<void>;
  markCompleted(jobId: string): Promise<void>;
  markFailed(jobId: string, message: string): Promise<void>;
}

export function createSupabaseAuditStore(
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
): SupabaseAuditStore {
  if (!url) throw new Error("SUPABASE_URL is required");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required");

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const event = async (jobId: string, eventType: string, status: string, message?: string, payload: Record<string, unknown> = {}) => {
    await admin.from("audit_events").insert({ audit_job_id: jobId, event_type: eventType, status, message, payload });
  };

  return {
    admin,

    async authenticate(accessToken) {
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error || !data.user) throw new Error("Invalid authentication token");
      return data.user.id;
    },

    createJobDependencies() {
      return {
        ensureProfile: async (ownerId) => {
          const { error } = await admin.from("profiles").upsert({ id: ownerId }, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw new Error(`Unable to initialize profile: ${error.message}`);
        },
        createJob: async (input) => {
          const { data, error } = await admin.from("audit_jobs").insert({
            owner_id: input.ownerId, status: "queued", original_filename: input.filename,
            mime_type: input.mimeType, size_bytes: input.sizeBytes, sha256: input.sha256,
          }).select("id").single();
          if (error || !data) throw new Error(`Unable to create audit job: ${error?.message ?? "unknown error"}`);
          return data.id as string;
        },
        uploadMaster: async (path, bytes, mimeType) => {
          const { error } = await admin.storage.from("audit-audio").upload(path, bytes, { contentType: mimeType, upsert: false });
          if (error) throw new Error(`Unable to store audio master: ${error.message}`);
        },
        setSourcePath: async (jobId, path) => {
          const { error } = await admin.from("audit_jobs").update({ source_audio_path: path }).eq("id", jobId);
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

    async claimNextQueuedJob() {
      const { data: queued, error: selectError } = await admin
        .from("audit_jobs")
        .select("id,owner_id,source_audio_path,mime_type,status")
        .eq("status", "queued")
        .not("source_audio_path", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (selectError) throw new Error(`Unable to read queued audits: ${selectError.message}`);
      if (!queued?.source_audio_path) return null;

      const { data: claimed, error: claimError } = await admin
        .from("audit_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", queued.id)
        .eq("status", "queued")
        .select("id,owner_id,source_audio_path,mime_type,status")
        .maybeSingle();

      if (claimError) throw new Error(`Unable to claim audit job: ${claimError.message}`);
      if (!claimed) return null;

      await event(claimed.id, "processing_claimed", "processing");
      return {
        id: claimed.id as string,
        ownerId: claimed.owner_id as string,
        sourceAudioPath: claimed.source_audio_path as string,
        mimeType: claimed.mime_type as string,
        status: "queued",
      };
    },

    async markProcessing(jobId) {
      await event(jobId, "processing_started", "processing");
    },

    async downloadMaster(path) {
      const { data, error } = await admin.storage.from("audit-audio").download(path);
      if (error || !data) throw new Error(`Unable to download audio master: ${error?.message ?? "not found"}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async saveRecognition(jobId, recognition) {
      const row = recognition.matched ? {
        audit_job_id: jobId, provider: "audd", matched: true,
        artist: recognition.artist ?? null, title: recognition.title ?? null,
        album: recognition.album ?? null, release_date: recognition.releaseDate ?? null,
        label: recognition.label ?? null, isrc: recognition.isrc ?? null,
        timecode: recognition.timecode ?? null, song_link: recognition.songLink ?? recognition.spotifyUrl ?? null,
        raw_response: recognition,
      } : {
        audit_job_id: jobId, provider: "audd", matched: false, raw_response: recognition,
      };
      const { error } = await admin.from("recognition_results").upsert(row, { onConflict: "audit_job_id,provider" });
      if (error) throw new Error(`Unable to save recognition: ${error.message}`);
      await event(jobId, "recognition", recognition.matched ? "matched" : "unmatched");
    },

    async saveEvidence(jobId, recognition) {
      const evidence = buildSongEvidence(recognition);
      const { error } = await admin.from("reconciled_tracks").upsert({
        audit_job_id: jobId,
        canonical_artist: evidence.canonicalArtist,
        canonical_title: evidence.canonicalTitle,
        album: evidence.album,
        release_date: evidence.releaseDate,
        label: evidence.label,
        isrc: evidence.isrc,
        spotify_id: evidence.spotifyId,
        apple_music_id: evidence.appleMusicId,
        musicbrainz_id: evidence.musicbrainzId,
        evidence_status: evidence.status,
        confidence: evidence.confidence,
        sources: evidence.sources,
      }, { onConflict: "audit_job_id" });
      if (error) throw new Error(`Unable to save song evidence: ${error.message}`);
      await event(jobId, "evidence_reconciliation", evidence.status, undefined, evidence);
    },

    async saveSonicDna(jobId, dna) {
      const { error } = await admin.from("sonic_dna").upsert({
        audit_job_id: jobId, analysis_version: "audit-engine-0.1.0",
        duration_seconds: dna.durationSeconds, sample_rate: dna.sampleRate, channels: dna.channels,
        bpm: dna.bpm, key: dna.key, mode: dna.mode, loudness_lufs: dna.loudnessLufs,
        rms_energy: dna.rmsEnergy, dynamic_range_db: dna.dynamicRangeDb,
        spectral_centroid_hz: dna.spectralCentroidHz, spectral_bandwidth_hz: dna.spectralBandwidthHz,
        spectral_rolloff_hz: dna.spectralRolloffHz, zero_crossing_rate: dna.zeroCrossingRate,
        mood_tags: dna.moodTags, genre_context: dna.genreContext, raw_features: dna,
      }, { onConflict: "audit_job_id" });
      if (error) throw new Error(`Unable to save Sonic DNA: ${error.message}`);
      await admin.from("audit_jobs").update({ duration_seconds: dna.durationSeconds }).eq("id", jobId);
      await event(jobId, "sonic_dna", "completed", undefined, { analysisVersion: "audit-engine-0.1.0" });
    },

    async markCompleted(jobId) {
      const { error } = await admin.from("audit_jobs").update({
        status: "completed", completed_at: new Date().toISOString(), error_code: null, error_message: null,
      }).eq("id", jobId);
      if (error) throw new Error(`Unable to complete audit job: ${error.message}`);
      await event(jobId, "audit_completed", "completed");
    },

    async markFailed(jobId, message) {
      const { error } = await admin.from("audit_jobs").update({
        status: "failed", completed_at: new Date().toISOString(), error_code: "AUDIT_PROCESSING_FAILED", error_message: message,
      }).eq("id", jobId);
      if (error) throw new Error(`Unable to mark audit job failed: ${error.message}`);
      await event(jobId, "audit_failed", "failed", message);
    },
  };
}
