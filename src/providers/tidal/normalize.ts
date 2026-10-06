import type { CatalogMetadata } from "../dsp/catalog.js";

type TidalResource = {
  type?: unknown;
  id?: unknown;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

type TidalDocument = {
  data?: TidalResource;
  included?: TidalResource[];
  links?: { self?: unknown };
};

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizedIsrc = (value: unknown): string | null => {
  const valueString = stringValue(value);
  return valueString ? valueString.replace(/[\s-]/g, "").toUpperCase() : null;
};

function includedResource(
  document: TidalDocument,
  type: string,
  id: string | null,
): TidalResource | null {
  if (!id) return null;
  return document.included?.find(
    (entry) => entry.type === type && String(entry.id) === id,
  ) ?? null;
}

export function normalizeTidalTrack(
  sourceUrl: string,
  documentInput: Record<string, unknown>,
): CatalogMetadata {
  const document = documentInput as TidalDocument;
  const track = document.data;
  const attributes = track?.attributes ?? {};

  const artistRelationship = (
    track?.relationships as Record<string, unknown> | undefined
  )?.artists as { data?: TidalResource[] } | undefined;
  const albumRelationship = (
    track?.relationships as Record<string, unknown> | undefined
  )?.albums as { data?: TidalResource[] } | undefined;

  const artistRef = artistRelationship?.data?.[0];
  const albumRef = albumRelationship?.data?.[0];

  const artist = includedResource(
    document,
    "artists",
    artistRef?.id ? String(artistRef.id) : null,
  );
  const album = includedResource(
    document,
    "albums",
    albumRef?.id ? String(albumRef.id) : null,
  );

  const title = stringValue(attributes.title);
  const artistName = stringValue(artist?.attributes?.name);
  const albumTitle = stringValue(album?.attributes?.title);

  const tidalId = stringValue(track?.id);
  const canonicalUrl = sourceUrl;

  const releaseDate =
    stringValue(attributes.releaseDate) ??
    stringValue(album?.attributes?.releaseDate);

  const isrc = normalizedIsrc(attributes.isrc);

  return {
    platform: "tidal",
    sourceUrl,
    canonicalUrl,
    catalogId: tidalId,
    artist: artistName,
    title,
    album: albumTitle,
    releaseDate,
    isrc,
    upc: null,
    label: stringValue(attributes.label),
    genre: stringValue(attributes.genre),
    artworkUrl: null,
    previewUrl: null,
    externalIds: tidalId ? { tidal: tidalId } : {},
    raw: documentInput,
    evidenceStatus: title && artistName ? "verified" : "partial",
  };
}
