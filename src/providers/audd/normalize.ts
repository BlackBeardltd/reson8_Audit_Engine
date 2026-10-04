export interface NormalizedAuddRecognition {
  matched: true;
  artist?: string;
  title?: string;
  album?: string;
  releaseDate?: string;
  label?: string;
  songLink?: string;
  timecode?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
}

export interface UnmatchedAuddRecognition { matched: false; }

export type AuditRecognition = NormalizedAuddRecognition | UnmatchedAuddRecognition;

type AuddLikeResult = {
  artist?: unknown; title?: unknown; album?: unknown;
  release_date?: unknown; releaseDate?: unknown; label?: unknown;
  song_link?: unknown; songLink?: unknown; timecode?: unknown;
  spotify?: { external_urls?: { spotify?: unknown }; uri?: unknown } | null;
  apple_music?: { url?: unknown } | null;
};

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

export function normalizeAuddRecognition(input: AuddLikeResult | null | undefined): AuditRecognition {
  if (!input) return { matched: false };
  return {
    matched: true,
    artist: stringOrUndefined(input.artist),
    title: stringOrUndefined(input.title),
    album: stringOrUndefined(input.album),
    releaseDate: stringOrUndefined(input.release_date ?? input.releaseDate),
    label: stringOrUndefined(input.label),
    songLink: stringOrUndefined(input.song_link ?? input.songLink),
    timecode: stringOrUndefined(input.timecode),
    spotifyUrl: stringOrUndefined(input.spotify?.external_urls?.spotify),
    appleMusicUrl: stringOrUndefined(input.apple_music?.url),
  };
}
