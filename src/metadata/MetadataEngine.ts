export type MetadataProvider = "audd" | "spotify" | "tidal" | "id3";

export interface TrackIdentity {
  readonly title: string | null;
  readonly artist: string | null;
  readonly album: string | null;
  readonly isrc: string | null;
  readonly label: string | null;
  readonly releaseDate: string | null;
  readonly genres: readonly string[];
  readonly sourceProviders: readonly MetadataProvider[];
}

export interface Id3Tags {
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  isrc?: unknown;
  label?: unknown;
  releaseDate?: unknown;
  genres?: unknown;
}

export interface AuddMetadata {
  matched: boolean;
  title?: unknown;
  artist?: unknown;
  album?: unknown;
  isrc?: unknown;
  label?: unknown;
  releaseDate?: unknown;
}

export interface SpotifyMetadata {
  name?: unknown;
  title?: unknown;
  artists?: unknown;
  album?: unknown;
  external_ids?: unknown;
  label?: unknown;
  release_date?: unknown;
  genres?: unknown;
}

export interface TidalMetadata {
  title?: unknown;
  name?: unknown;
  artist?: unknown;
  artists?: unknown;
  album?: unknown;
  isrc?: unknown;
  label?: unknown;
  releaseDate?: unknown;
  release_date?: unknown;
  genres?: unknown;
}

export interface MetadataEngineInput {
  readonly audd?: AuddMetadata | null;
  readonly spotify?: SpotifyMetadata | null;
  readonly tidal?: TidalMetadata | null;
  readonly id3?: Id3Tags | null;
  readonly filename?: string | null;
}

const PLACEHOLDERS = new Set([
  "", "n/a", "na", "none", "null", "unknown", "not available", "not_available",
  "undefined", "untitled", "unknown artist", "unknown title",
]);

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const valueTrimmed = value.trim();
  if (!valueTrimmed || PLACEHOLDERS.has(valueTrimmed.toLowerCase())) return null;
  return valueTrimmed;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const object = asObject(current);
    if (!object) return null;
    current = object[key];
  }
  return current;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const result = clean(value);
    if (result) return result;
  }
  return null;
}

function artistFromArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const names = value.map((item) => clean(nested(item, "name"))).filter((item): item is string => Boolean(item));
  return names.length ? names.join(", ") : null;
}

function genresFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.map(clean).filter((item): item is string => Boolean(item)),
  )];
}

function normalizeIsrc(value: unknown): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const normalized = cleaned.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : cleaned.toUpperCase();
}

function parseFilename(filename: string | null | undefined): { artist: string | null; title: string | null } {
  const raw = clean(filename)?.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  if (!raw) return { artist: null, title: null };
  const separator = raw.indexOf(" - ");
  if (separator <= 0 || separator >= raw.length - 3) return { artist: null, title: clean(raw) };
  return {
    artist: clean(raw.slice(0, separator)),
    title: clean(raw.slice(separator + 3)),
  };
}

function freezeIdentity(identity: TrackIdentity): TrackIdentity {
  return Object.freeze({
    ...identity,
    genres: Object.freeze([...identity.genres]),
    sourceProviders: Object.freeze([...identity.sourceProviders]),
  });
}

export class MetadataEngine {
  static normalize(input: MetadataEngineInput): TrackIdentity {
    const spotify = input.spotify ?? null;
    const tidal = input.tidal ?? null;
    const audd = input.audd ?? null;
    const id3 = input.id3 ?? null;
    const filename = parseFilename(input.filename);

    const spotifyArtist = firstString(
      artistFromArray(spotify?.artists),
      nested(spotify?.artists, "name"),
    );
    const tidalArtist = firstString(
      clean(tidal?.artist),
      artistFromArray(tidal?.artists),
      nested(tidal?.artists, "name"),
    );

    const title = firstString(
      spotify?.name, spotify?.title,
      tidal?.title, tidal?.name,
      audd?.title,
      id3?.title,
      filename.title,
    );

    const artist = firstString(
      spotifyArtist,
      tidalArtist,
      audd?.artist,
      id3?.artist,
      filename.artist,
    );

    const album = firstString(
      nested(spotify?.album, "name"),
      spotify?.album,
      tidal?.album,
      audd?.album,
      id3?.album,
    );

    const isrc = normalizeIsrc(firstString(
      nested(spotify?.external_ids, "isrc"),
      spotify?.external_ids,
      tidal?.isrc,
      audd?.isrc,
      id3?.isrc,
    ));

    const label = firstString(
      spotify?.label,
      tidal?.label,
      audd?.label,
      id3?.label,
    );

    const releaseDate = firstString(
      spotify?.release_date,
      tidal?.releaseDate,
      tidal?.release_date,
      audd?.releaseDate,
      id3?.releaseDate,
    );

    const genres = genresFrom(spotify?.genres).length
      ? genresFrom(spotify?.genres)
      : genresFrom(tidal?.genres).length
        ? genresFrom(tidal?.genres)
        : genresFrom(id3?.genres);

    const sourceProviders: MetadataProvider[] = [];
    const providerHasData = (provider: MetadataProvider): boolean => {
      switch (provider) {
        case "spotify": return Boolean(
          clean(spotify?.name) || clean(spotify?.title) || spotifyArtist ||
          clean(nested(spotify?.album, "name")) || clean(spotify?.label) ||
          clean(spotify?.release_date) || normalizeIsrc(nested(spotify?.external_ids, "isrc")) ||
          genresFrom(spotify?.genres).length,
        );
        case "tidal": return Boolean(
          clean(tidal?.title) || clean(tidal?.name) || tidalArtist || clean(tidal?.album) ||
          clean(tidal?.isrc) || clean(tidal?.label) || clean(tidal?.releaseDate) ||
          clean(tidal?.release_date) || genresFrom(tidal?.genres).length,
        );
        case "audd": return Boolean(
          audd?.matched && (clean(audd.title) || clean(audd.artist) || clean(audd.album) ||
          clean(audd.isrc) || clean(audd.label) || clean(audd.releaseDate)),
        );
        case "id3": return Boolean(
          clean(id3?.title) || clean(id3?.artist) || clean(id3?.album) ||
          clean(id3?.isrc) || clean(id3?.label) || clean(id3?.releaseDate) ||
          genresFrom(id3?.genres).length,
        );
      }
    };

    for (const provider of ["spotify", "tidal", "audd", "id3"] as const) {
      if (providerHasData(provider)) sourceProviders.push(provider);
    }

    return freezeIdentity({
      title,
      artist,
      album,
      isrc,
      label,
      releaseDate,
      genres,
      sourceProviders,
    });
  }
}
