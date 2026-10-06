import { describe, expect, it } from "vitest";
import { MetadataEngine, type TrackIdentity } from "../src/metadata/MetadataEngine.js";

describe("MetadataEngine", () => {
  it("prefers DSP metadata and fills missing fields from AudD and ID3", () => {
    const identity = MetadataEngine.normalize({
      spotify: {
        name: "Dock of the Bay",
        artists: [{ name: "Otis Redding" }],
        album: { name: "The Dock of the Bay" },
        external_ids: { isrc: "USAT2" },
        label: "Volt",
        release_date: "1968-07-01",
        genres: ["soul"],
      },
      audd: { matched: true, artist: "Wrong Artist", title: "Dock of the Bay", isrc: "USAT2" },
      id3: { title: "Fallback Title", artist: "Fallback Artist", album: "Fallback Album" },
      filename: "Fallback Artist - Fallback Title.mp3",
    });
    expect(identity.title).toBe("Dock of the Bay");
    expect(identity.artist).toBe("Otis Redding");
    expect(identity.album).toBe("The Dock of the Bay");
    expect(identity.isrc).toBe("USAT2");
    expect(identity.label).toBe("Volt");
    expect(identity.releaseDate).toBe("1968-07-01");
    expect(identity.genres).toEqual(["soul"]);
    expect(identity.sourceProviders).toEqual(["spotify", "audd", "id3"]);
  });

  it("uses Tidal when Spotify is absent and AudD when Tidal is incomplete", () => {
    const identity = MetadataEngine.normalize({
      tidal: { title: "Song", artist: "Artist", album: "Album", isrc: "GB1234567890" },
      audd: { matched: true, releaseDate: "2026-01-02", label: "Label" },
    });
    expect(identity.title).toBe("Song");
    expect(identity.artist).toBe("Artist");
    expect(identity.album).toBe("Album");
    expect(identity.isrc).toBe("GB1234567890");
    expect(identity.releaseDate).toBe("2026-01-02");
    expect(identity.label).toBe("Label");
    expect(identity.sourceProviders).toEqual(["tidal", "audd"]);
  });

  it("falls back to ID3 and then filename without inventing unavailable values", () => {
    const identity = MetadataEngine.normalize({
      id3: { title: "Tagged Title", artist: "Tagged Artist", album: "Tagged Album" },
      filename: "Filename Artist - Filename Title.mp3",
    });
    expect(identity.title).toBe("Tagged Title");
    expect(identity.artist).toBe("Tagged Artist");
    expect(identity.album).toBe("Tagged Album");
    expect(identity.isrc).toBeNull();
    expect(identity.label).toBeNull();
    expect(identity.releaseDate).toBeNull();
    expect(identity.genres).toEqual([]);
    expect(identity.sourceProviders).toEqual(["id3"]);
  });

  it("uses filename artist/title when no structured identity source exists", () => {
    const identity = MetadataEngine.normalize({ filename: "Filename Artist - Filename Title.mp3" });
    expect(identity.artist).toBe("Filename Artist");
    expect(identity.title).toBe("Filename Title");
    expect(identity.sourceProviders).toEqual([]);
  });

  it("ignores placeholder strings and normalizes ISRC", () => {
    const identity = MetadataEngine.normalize({
      spotify: { name: "Not available", artists: [{ name: "N/A" }], external_ids: { isrc: "us-at1-23-45678" } },
      audd: { matched: true, title: "Real Title", artist: "Real Artist" },
    });
    expect(identity.title).toBe("Real Title");
    expect(identity.artist).toBe("Real Artist");
    expect(identity.isrc).toBe("USAT12345678");
  });

  it("returns an immutable identity", () => {
    const identity: TrackIdentity = MetadataEngine.normalize({
      audd: { matched: true, title: "Title", artist: "Artist" },
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.genres)).toBe(true);
    expect(Object.isFrozen(identity.sourceProviders)).toBe(true);
  });
});
