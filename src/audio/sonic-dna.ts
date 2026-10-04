export interface SonicDnaFeatures {
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  bpm: number | null;
  key: string | null;
  mode: "major" | "minor" | null;
  loudnessLufs: number;
  rmsEnergy: number;
  dynamicRangeDb: number;
  spectralCentroidHz: number;
  spectralBandwidthHz: number;
  spectralRolloffHz: number;
  zeroCrossingRate: number;
  moodTags: string[];
  genreContext: string[];
}

const EPSILON = 1e-12;

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / samples.length);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function analyzePcm(samples: Float32Array, sampleRate: number): SonicDnaFeatures {
  const energy = rms(samples);
  let crossings = 0;
  const powers: number[] = [];

  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] < 0 && samples[i] >= 0) || (samples[i - 1] >= 0 && samples[i] < 0)) crossings++;
    powers.push(samples[i] * samples[i]);
  }

  const windowSize = Math.min(4096, Math.max(256, 2 ** Math.floor(Math.log2(Math.max(256, samples.length)))));
  const half = Math.floor(windowSize / 2);
  let centroidSum = 0;
  let bandwidthSum = 0;
  let rolloff = 0;
  let spectralWeight = 0;

  for (let start = 0; start + windowSize <= samples.length; start += half) {
    for (let bin = 1; bin < windowSize / 2; bin++) {
      const frequency = (bin * sampleRate) / windowSize;
      let real = 0;
      let imag = 0;
      for (let n = 0; n < windowSize; n += 8) {
        const angle = (2 * Math.PI * bin * n) / windowSize;
        real += samples[start + n] * Math.cos(angle);
        imag -= samples[start + n] * Math.sin(angle);
      }
      const magnitude = Math.hypot(real, imag);
      spectralWeight += magnitude;
      centroidSum += frequency * magnitude;
    }
  }

  const centroid = spectralWeight ? centroidSum / spectralWeight : 0;

  // A robust dynamic-range proxy: peak-to-10th-percentile RMS in short windows.
  const windowRms: number[] = [];
  const frame = Math.max(256, Math.floor(sampleRate * 0.05));
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    windowRms.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  windowRms.sort((a, b) => a - b);
  const p10 = Math.max(EPSILON, percentile(windowRms, 0.1));
  const p95 = Math.max(p10, percentile(windowRms, 0.95));

  const lufs = 20 * Math.log10(Math.max(EPSILON, energy)) - 0.691;
  const dynamicRangeDb = 20 * Math.log10(p95 / p10);

  const tags: string[] = [];
  if (energy > 0.15) tags.push("High Energy");
  else if (energy < 0.04) tags.push("Low Energy");
  else tags.push("Moderate Energy");
  if (crossings / Math.max(1, samples.length) > 0.08) tags.push("Bright/Noisy Texture");
  if (centroid > 3000) tags.push("Bright Timbre");
  else if (centroid < 1000) tags.push("Dark Timbre");

  return {
    sampleRate,
    channels: 1,
    durationSeconds: samples.length / sampleRate,
    bpm: estimateTempo(samples, sampleRate),
    key: null,
    mode: null,
    loudnessLufs: lufs,
    rmsEnergy: energy,
    dynamicRangeDb,
    spectralCentroidHz: centroid,
    spectralBandwidthHz: 0,
    spectralRolloffHz: 0,
    zeroCrossingRate: crossings / Math.max(1, samples.length - 1),
    moodTags: tags,
    genreContext: classifyGenreFromBpm(estimateTempo(samples, sampleRate)),
  };
}

export function estimateTempo(samples: Float32Array, sampleRate: number): number | null {
  if (samples.length < sampleRate * 4) return null;

  const hop = Math.max(1, Math.floor(sampleRate / 100));
  const envelope: number[] = [];
  for (let start = 0; start + hop <= samples.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + hop; i++) sum += Math.abs(samples[i]);
    envelope.push(sum / hop);
  }

  const diff = envelope.map((value, i) => Math.max(0, value - (envelope[i - 1] ?? value)));
  let bestLag = 0;
  let bestScore = -Infinity;

  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = Math.max(1, Math.round((60 / bpm) * sampleRate / hop));
    let score = 0;
    for (let i = lag; i < diff.length; i++) score += diff[i] * diff[i - lag];
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestLag ? Math.round((60 * sampleRate) / (bestLag * hop)) : null;
}

export function classifyGenreFromBpm(bpm: number | null): string[] {
  if (bpm === null) return [];
  const matches: string[] = [];
  if (bpm >= 60 && bpm <= 90) matches.push("Ambient", "R&B", "Reggae");
  if (bpm >= 70 && bpm <= 100) matches.push("Hip-Hop/Lo-Fi", "Reggaeton");
  if (bpm >= 90 && bpm <= 140) matches.push("Country/Folk");
  if (bpm >= 100 && bpm <= 130) matches.push("Pop");
  if (bpm >= 108 && bpm <= 118) matches.push("Amapiano");
  if (bpm >= 100 && bpm <= 120) matches.push("Afrobeats");
  return [...new Set(matches)];
}
