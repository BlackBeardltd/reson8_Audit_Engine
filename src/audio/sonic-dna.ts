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
  const maxAnalysisSamples = 3_000_000;
  const stride = Math.max(1, Math.ceil(samples.length / maxAnalysisSamples));
  const analysisSamples = stride === 1
    ? samples
    : Float32Array.from({ length: Math.ceil(samples.length / stride) }, (_, i) => samples[i * stride]);
  const analysisSampleRate = sampleRate / stride;
  const energy = rms(analysisSamples);
  let crossings = 0;
  for (let i = 1; i < analysisSamples.length; i++) {
    if ((samples[i - 1] < 0 && samples[i] >= 0) || (samples[i - 1] >= 0 && samples[i] < 0)) crossings++;
  }

  // Keep full-track scalar measurements O(n), but bound spectral work to a
  // small, representative set of windows. The previous implementation ran
  // a nested DFT across every overlapping window and could take minutes on a
  // normal full-length WAV.
  const fftWindow = 2048;
  const decimation = 4;
  const bins = 128;
  const availableWindows = Math.max(1, Math.floor((analysisSamples.length - fftWindow) / (fftWindow / 2)) + 1);
  const windowCount = Math.min(12, availableWindows);
  let centroidSum = 0;
  let bandwidthSum = 0;
  let rolloffSum = 0;
  let spectralWeight = 0;
  let analyzedWindows = 0;

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const start = windowCount === 1
      ? 0
      : Math.floor((windowIndex * (availableWindows - 1)) / (windowCount - 1)) * Math.floor(fftWindow / 2);
    if (start + fftWindow > analysisSamples.length) continue;

    const magnitudes: number[] = [];
    let total = 0;
    let weighted = 0;

    for (let bin = 1; bin <= bins; bin++) {
      const frequency = (bin * analysisSampleRate) / (fftWindow * decimation);
      let real = 0;
      let imag = 0;
      for (let n = 0; n < fftWindow; n += decimation) {
        const angle = (2 * Math.PI * bin * n) / fftWindow;
        const value = analysisSamples[start + n];
        real += value * Math.cos(angle);
        imag -= value * Math.sin(angle);
      }
      const magnitude = Math.hypot(real, imag);
      magnitudes.push(magnitude);
      total += magnitude;
      weighted += frequency * magnitude;
    }

    if (total <= EPSILON) continue;

    const centroid = weighted / total;
    let variance = 0;
    let cumulative = 0;
    let rolloffFrequency = 0;
    const rolloffTarget = total * 0.85;

    for (let i = 0; i < magnitudes.length; i++) {
      const frequency = ((i + 1) * analysisSampleRate) / (fftWindow * decimation);
      variance += ((frequency - centroid) ** 2) * magnitudes[i];
      cumulative += magnitudes[i];
      if (!rolloffFrequency && cumulative >= rolloffTarget) rolloffFrequency = frequency;
    }

    centroidSum += centroid;
    bandwidthSum += Math.sqrt(variance / total);
    rolloffSum += rolloffFrequency;
    spectralWeight += total;
    analyzedWindows++;
  }

  const spectralCentroidHz = analyzedWindows ? centroidSum / analyzedWindows : 0;
  const spectralBandwidthHz = analyzedWindows ? bandwidthSum / analyzedWindows : 0;
  const spectralRolloffHz = analyzedWindows ? rolloffSum / analyzedWindows : 0;

  const windowRms: number[] = [];
  const frame = Math.max(256, Math.floor(analysisSampleRate * 0.05));
  for (let start = 0; start < analysisSamples.length; start += frame) {
    const end = Math.min(analysisSamples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += analysisSamples[i] * analysisSamples[i];
    windowRms.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  windowRms.sort((a, b) => a - b);
  const p10 = Math.max(EPSILON, percentile(windowRms, 0.1));
  const p95 = Math.max(p10, percentile(windowRms, 0.95));

  const lufs = 20 * Math.log10(Math.max(EPSILON, energy)) - 0.691;
  const dynamicRangeDb = 20 * Math.log10(p95 / p10);

  const bpm = estimateTempo(analysisSamples, analysisSampleRate);
  const tags: string[] = [];
  if (energy > 0.15) tags.push("High Energy");
  else if (energy < 0.04) tags.push("Low Energy");
  else tags.push("Moderate Energy");
  if (crossings / Math.max(1, analysisSamples.length) > 0.08) tags.push("Bright/Noisy Texture");
  if (spectralCentroidHz > 3000) tags.push("Bright Timbre");
  else if (spectralCentroidHz < 1000) tags.push("Dark Timbre");

  return {
    sampleRate,
    channels: 1,
    durationSeconds: samples.length / sampleRate,
    bpm,
    key: null,
    mode: null,
    loudnessLufs: lufs,
    rmsEnergy: energy,
    dynamicRangeDb,
    spectralCentroidHz,
    spectralBandwidthHz,
    spectralRolloffHz,
    zeroCrossingRate: crossings / Math.max(1, samples.length - 1),
    moodTags: tags,
    genreContext: classifyGenreFromBpm(bpm),
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
