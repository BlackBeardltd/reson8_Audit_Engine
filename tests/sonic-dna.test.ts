import { describe, expect, it } from "vitest";
import { analyzePcm, classifyGenreFromBpm, estimateTempo } from "../src/audio/sonic-dna.js";

describe("Sonic DNA", () => {
  it("measures non-zero energy and spectral features from real PCM samples", () => {
    const sampleRate = 8000;
    const samples = Float32Array.from({ length: sampleRate }, (_, i) =>
      Math.sin((2 * Math.PI * 440 * i) / sampleRate),
    );

    const result = analyzePcm(samples, sampleRate);

    expect(result.rmsEnergy).toBeGreaterThan(0);
    expect(result.loudnessLufs).toBeLessThan(0);
    expect(result.spectralCentroidHz).toBeGreaterThan(300);
    expect(result.spectralCentroidHz).toBeLessThan(600);
    expect(result.zeroCrossingRate).toBeGreaterThan(0.05);
  });

  it("keeps full-length spectral analysis bounded", () => {
    const sampleRate = 8000;
    const seconds = 60;
    const samples = Float32Array.from({ length: sampleRate * seconds }, (_, i) =>
      Math.sin((2 * Math.PI * 220 * i) / sampleRate),
    );

    const started = performance.now();
    const result = analyzePcm(samples, sampleRate);
    const elapsedMs = performance.now() - started;

    expect(result.durationSeconds).toBe(seconds);
    expect(result.spectralCentroidHz).toBeGreaterThan(100);
    expect(result.spectralCentroidHz).toBeLessThan(400);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it("estimates tempo from a regular pulse train", () => {
    const sampleRate = 8000;
    const bpm = 120;
    const seconds = 12;
    const samples = new Float32Array(sampleRate * seconds);

    for (let beat = 0; beat < seconds * bpm / 60; beat++) {
      const start = Math.round((beat * 60 / bpm) * sampleRate);
      for (let i = 0; i < Math.min(sampleRate * 0.02, samples.length - start); i++) {
        samples[start + i] += Math.exp(-i / 18);
      }
    }

    expect(estimateTempo(samples, sampleRate)).toBeGreaterThanOrEqual(115);
    expect(estimateTempo(samples, sampleRate)).toBeLessThanOrEqual(125);
  });

  it("maps measured tempo to genre context without claiming a genre as fact", () => {
    expect(classifyGenreFromBpm(75)).toContain("R&B");
    expect(classifyGenreFromBpm(112)).toContain("Amapiano");
    expect(classifyGenreFromBpm(128)).toContain("Pop");
    expect(classifyGenreFromBpm(999)).toEqual([]);
  });
});
