import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCatalogMetadata } from "../src/providers/dsp/catalog.js";

describe("TIDAL deep catalog ingestion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.TIDAL_CLIENT_ID;
    delete process.env.TIDAL_CLIENT_SECRET;
  });

  it("uses TIDAL OAuth client credentials and normalizes the track resource", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "tidal-access-token",
        token_type: "Bearer",
        expires_in: 86400,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          type: "tracks",
          id: "12345",
          attributes: {
            title: "Dock of the Bay",
            isrc: "USAT26600001",
            duration: 167,
            releaseDate: "1968-07-01",
            explicit: false,
            popularity: 61,
            audioQuality: "LOSSLESS",
          },
          relationships: {
            artists: {
              data: [{ type: "artists", id: "artist-123" }],
            },
            albums: {
              data: [{ type: "albums", id: "album-123" }],
            },
          },
        },
        included: [
          {
            type: "artists",
            id: "artist-123",
            attributes: { name: "Otis Redding" },
          },
          {
            type: "albums",
            id: "album-123",
            attributes: {
              title: "The Dock of the Bay",
              releaseDate: "1968-07-01",
              numberOfVolumes: 1,
            },
          },
        ],
        links: {
          self: "https://openapi.tidal.com/v2/tracks/12345?countryCode=US",
        },
      }), { status: 200, headers: { "content-type": "application/vnd.api+json" } }));

    vi.stubGlobal("fetch", fetchMock);
    process.env.TIDAL_CLIENT_ID = "client-id";
    process.env.TIDAL_CLIENT_SECRET = "client-secret";

    const result = await collectCatalogMetadata(
      "https://tidal.com/browse/track/12345",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://auth.tidal.com/v1/oauth2/token",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://openapi.tidal.com/v2/tracks/12345?countryCode=US",
    );
    expect(result).toMatchObject({
      platform: "tidal",
      catalogId: "12345",
      artist: "Otis Redding",
      title: "Dock of the Bay",
      album: "The Dock of the Bay",
      releaseDate: "1968-07-01",
      isrc: "USAT26600001",
      canonicalUrl: "https://tidal.com/browse/track/12345",
      externalIds: { tidal: "12345" },
      evidenceStatus: "verified",
    });
    expect(result.raw).toMatchObject({
      data: {
        id: "12345",
        type: "tracks",
      },
    });
  });

  it("fails closed when TIDAL credentials are not configured", async () => {
    await expect(
      collectCatalogMetadata("https://tidal.com/browse/track/12345"),
    ).rejects.toThrow("TIDAL client credentials are required");
  });

  it("surfaces TIDAL HTTP failures without returning partial placeholder metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }),
    );

    vi.stubGlobal("fetch", fetchMock);
    process.env.TIDAL_CLIENT_ID = "client-id";
    process.env.TIDAL_CLIENT_SECRET = "client-secret";

    await expect(
      collectCatalogMetadata("https://tidal.com/browse/track/12345"),
    ).rejects.toThrow("TIDAL token request failed with HTTP 401");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
