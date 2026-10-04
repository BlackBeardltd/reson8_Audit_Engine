import { describe, expect, it } from "vitest";
import { detectDspPlatform } from "../src/providers/dsp/catalog.js";

describe("DSP catalog URL detection", () => {
  it("detects supported track hosts", () => {
    expect(detectDspPlatform("https://open.spotify.com/track/123")).toBe("spotify");
    expect(detectDspPlatform("https://music.apple.com/us/album/x/1?i=2")).toBe("apple_music");
    expect(detectDspPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube_music");
    expect(detectDspPlatform("https://www.deezer.com/track/123")).toBe("deezer");
    expect(detectDspPlatform("https://tidal.com/browse/track/123")).toBe("tidal");
  });
  it("rejects unsupported or unsafe URLs", () => {
    expect(detectDspPlatform("http://open.spotify.com/track/123")).toBe("unknown");
    expect(detectDspPlatform("https://example.com/track/123")).toBe("unknown");
    expect(detectDspPlatform("https://user:pass@open.spotify.com/track/123")).toBe("unknown");
  });
});
