import { describe, expect, it } from "vitest";
import { buildSongEvidence } from "../src/jobs/song-evidence.js";

describe("Song Evidence Object", () => {
  it("marks a multi-source identity as verified", () => {
    const evidence = buildSongEvidence({
      matched: true,
      artist: "Artist",
      title: "Song",
      isrc: "NGABC2600001",
      spotifyId: "track123",
      musicbrainzId: "recording123",
    });

    expect(evidence.status).toBe("verified");
    expect(evidence.confidence).toBe(1);
    expect(evidence.sources).toEqual(["audd", "spotify", "musicbrainz"]);
  });

  it("keeps unmatched recordings explicitly unresolved", () => {
    const evidence = buildSongEvidence({ matched: false });
    expect(evidence.status).toBe("unresolved");
    expect(evidence.confidence).toBeNull();
  });
});
