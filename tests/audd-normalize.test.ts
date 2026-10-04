import { describe, expect, it } from "vitest";
import { normalizeAuddRecognition } from "../src/providers/audd/normalize.js";

describe("normalizeAuddRecognition", () => {
  it("normalizes a matched AudD result into the audit engine evidence shape", () => {
    const result = normalizeAuddRecognition({
      artist: "Tems",
      title: "Free Mind",
      album: "For Broken Ears",
      release_date: "2020-10-01",
      label: "Leading Vibe",
      song_link: "https://audd.tech/track",
      timecode: "00:07",
      spotify: { external_urls: { spotify: "https://open.spotify.com/track/example" } },
      apple_music: { url: "https://music.apple.com/ng/song/example" },
    });

    expect(result).toEqual({
      matched: true,
      artist: "Tems",
      title: "Free Mind",
      album: "For Broken Ears",
      releaseDate: "2020-10-01",
      label: "Leading Vibe",
      songLink: "https://audd.tech/track",
      timecode: "00:07",
      spotifyUrl: "https://open.spotify.com/track/example",
      appleMusicUrl: "https://music.apple.com/ng/song/example",
    });
  });

  it("returns an explicit unmatched result instead of inventing metadata", () => {
    expect(normalizeAuddRecognition(null)).toEqual({ matched: false });
  });
});
