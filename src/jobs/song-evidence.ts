import type { AuditRecognition } from "../providers/audd/normalize.js";

export type EvidenceStatus = "unresolved" | "partial" | "verified";

export interface SongEvidenceObject {
  status: EvidenceStatus;
  confidence: number | null;
  canonicalArtist: string | null;
  canonicalTitle: string | null;
  album: string | null;
  releaseDate: string | null;
  label: string | null;
  isrc: string | null;
  spotifyId: string | null;
  appleMusicId: string | null;
  musicbrainzId: string | null;
  sources: string[];
}

export function buildSongEvidence(recognition: AuditRecognition): SongEvidenceObject {
  if (!recognition.matched) {
    return {
      status: "unresolved",
      confidence: null,
      canonicalArtist: null,
      canonicalTitle: null,
      album: null,
      releaseDate: null,
      label: null,
      isrc: null,
      spotifyId: null,
      appleMusicId: null,
      musicbrainzId: null,
      sources: [],
    };
  }

  const ids = [recognition.isrc, recognition.spotifyId, recognition.appleMusicId, recognition.musicbrainzId]
    .filter(Boolean);
  const hasIdentity = Boolean(recognition.artist && recognition.title);
  const status: EvidenceStatus = hasIdentity && ids.length >= 2 ? "verified" : hasIdentity || ids.length > 0 ? "partial" : "unresolved";

  return {
    status,
    confidence: status === "verified" ? 1 : status === "partial" ? 0.6 : null,
    canonicalArtist: recognition.artist ?? null,
    canonicalTitle: recognition.title ?? null,
    album: recognition.album ?? null,
    releaseDate: recognition.releaseDate ?? null,
    label: recognition.label ?? null,
    isrc: recognition.isrc ?? null,
    spotifyId: recognition.spotifyId ?? null,
    appleMusicId: recognition.appleMusicId ?? null,
    musicbrainzId: recognition.musicbrainzId ?? null,
    sources: [
      "audd",
      recognition.spotifyId ? "spotify" : null,
      recognition.appleMusicId ? "apple_music" : null,
      recognition.musicbrainzId ? "musicbrainz" : null,
    ].filter((v): v is string => Boolean(v)),
  };
}
