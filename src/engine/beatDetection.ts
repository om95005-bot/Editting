import type { BeatAnalysisResult, BeatMarker } from '../types/editor';

/**
 * In-place iterative Cooley-Tukey Radix-2 FFT.
 * `re` and `im` must have length equal to a power of 2.
 */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT size must be a power of 2, got ${n}`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Butterfly passes
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const idxEven = start + k;
        const idxOdd = idxEven + half;

        const tre = cos * re[idxOdd] - sin * im[idxOdd];
        const tim = sin * re[idxOdd] + cos * im[idxOdd];

        re[idxOdd] = re[idxEven] - tre;
        im[idxOdd] = im[idxEven] - tim;
        re[idxEven] += tre;
        im[idxEven] += tim;
      }
    }
  }
}

/**
 * Computes half-wave rectified spectral flux onset detection function (ODF)
 * with low-mid percussion emphasis (40 Hz – 4000 Hz) from mono PCM samples.
 */
export function computeSpectralFlux(
  pcm: Float32Array,
  sampleRate: number,
  frameSize = 1024,
  hopSize = 512
): { flux: Float32Array; hopDurationSec: number } {
  const numFrames = Math.max(0, Math.floor((pcm.length - frameSize) / hopSize) + 1);
  const flux = new Float32Array(numFrames);
  const hopDurationSec = hopSize / sampleRate;

  if (numFrames === 0) return { flux, hopDurationSec };

  const hann = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const halfBins = frameSize >> 1;
  const prevMag = new Float32Array(halfBins);

  // Weight bass/kick/snare transient bins more heavily
  const binWeights = new Float32Array(halfBins);
  for (let b = 0; b < halfBins; b++) {
    const freq = (b * sampleRate) / frameSize;
    if (freq >= 40 && freq <= 180) binWeights[b] = 1.65; // Kick fundamental
    else if (freq > 180 && freq <= 2500) binWeights[b] = 1.15; // Snare / body
    else if (freq > 2500 && freq <= 7000) binWeights[b] = 0.85; // Hi-hat / clap
    else binWeights[b] = 0.35;
  }

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    for (let i = 0; i < frameSize; i++) {
      re[i] = pcm[offset + i] * hann[i];
      im[i] = 0;
    }

    fftRadix2(re, im);

    let sumFlux = 0;
    for (let b = 1; b < halfBins; b++) {
      // Log compression emphasizes perceptual transient onsets
      const mag = Math.log1p(Math.hypot(re[b], im[b]) * 4);
      const diff = mag - prevMag[b];
      if (diff > 0) {
        sumFlux += diff * binWeights[b];
      }
      prevMag[b] = mag;
    }
    flux[f] = sumFlux;
  }

  // Normalize to 0..1
  let maxFlux = 0;
  for (let i = 0; i < flux.length; i++) {
    if (flux[i] > maxFlux) maxFlux = flux[i];
  }
  if (maxFlux > 1e-6) {
    for (let i = 0; i < flux.length; i++) {
      flux[i] /= maxFlux;
    }
  }

  return { flux, hopDurationSec };
}

/**
 * Estimates BPM using autocorrelation of the spectral flux envelope across
 * musical tempo range (65–190 BPM) with harmonic reinforcement (octave-aware).
 */
export function estimateBPMFromFlux(
  flux: Float32Array,
  hopDurationSec: number
): { bpm: number; confidence: number } {
  const minBpm = 68;
  const maxBpm = 188;
  const minLag = Math.max(2, Math.floor(60 / (maxBpm * hopDurationSec)));
  const maxLag = Math.min(flux.length - 1, Math.ceil(60 / (minBpm * hopDurationSec)));

  if (maxLag <= minLag || flux.length < minLag * 2) {
    return { bpm: 120, confidence: 0.25 };
  }

  // Mean-center flux
  let mean = 0;
  for (let i = 0; i < flux.length; i++) mean += flux[i];
  mean /= flux.length;

  const centered = new Float32Array(flux.length);
  let energy = 0;
  for (let i = 0; i < flux.length; i++) {
    centered[i] = flux[i] - mean;
    energy += centered[i] * centered[i];
  }
  if (energy <= 1e-8) return { bpm: 120, confidence: 0.1 };

  const acf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const len = flux.length - lag;
    for (let i = 0; i < len; i++) {
      sum += centered[i] * centered[i + lag];
    }
    acf[lag] = Math.max(0, sum / energy);
  }

  // Score each candidate lag with Gaussian preference centered around 120 BPM
  // and harmonic reinforcement at 2*lag (half-time bar alignment)
  let bestLag = minLag;
  let bestScore = -1;
  let totalScore = 0;
  let count = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    const candidateBpm = 60 / (lag * hopDurationSec);
    // Gentle prior favoring 90–155 BPM to avoid double/half-tempo octave errors
    const tempoPrior = Math.exp(-0.5 * Math.pow((Math.log2(candidateBpm / 122)) / 0.55, 2));
    const doubleLag = lag * 2;
    const harmonicBonus = doubleLag <= maxLag ? acf[doubleLag] * 0.4 : 0;
    const score = (acf[lag] + harmonicBonus) * (0.7 + 0.3 * tempoPrior);
    totalScore += score;
    count++;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Parabolic interpolation around bestLag for sub-frame BPM accuracy
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = acf[bestLag - 1];
    const y1 = acf[bestLag];
    const y2 = acf[bestLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-6) {
      const delta = 0.5 * (y0 - y2) / denom;
      if (Math.abs(delta) < 1) {
        refinedLag = bestLag + delta;
      }
    }
  }

  const bpm = Math.round((60 / (refinedLag * hopDurationSec)) * 10) / 10;
  const avgScore = count > 0 ? totalScore / count : 0.001;
  const confidence = Math.max(0.15, Math.min(0.99, bestScore / (avgScore * 3.5 + 0.05)));
  return { bpm, confidence };
}

/**
 * Full offline audio beat detection pipeline.
 * Runs STFT spectral flux -> BPM estimation -> adaptive peak picking ->
 * strong/weak accent & 4/4 downbeat classification.
 */
export function detectBeatsFromPCM(
  pcm: Float32Array,
  sampleRate: number,
  options?: {
    sensitivity?: number; // 0.1..1.0 (higher = more beats detected)
    manualBpmOverride?: number | null;
  }
): BeatAnalysisResult {
  const sensitivity = options?.sensitivity ?? 0.65;
  const frameSize = 1024;
  const hopSize = 512;

  const { flux, hopDurationSec } = computeSpectralFlux(pcm, sampleRate, frameSize, hopSize);
  const estimated = estimateBPMFromFlux(flux, hopDurationSec);
  const activeBpm = options?.manualBpmOverride && options.manualBpmOverride > 30
    ? options.manualBpmOverride
    : estimated.bpm;

  const beatIntervalSec = 60 / activeBpm;
  const minPeakSpacingFrames = Math.max(2, Math.floor((beatIntervalSec * 0.42) / hopDurationSec));

  // Adaptive local mean + delta threshold
  const windowRadius = Math.max(4, Math.round(0.35 / hopDurationSec));
  const thresholdMultiplier = 1.85 - sensitivity * 0.85; // 1.0 to 1.76
  const minAbsoluteEnergy = 0.14 - sensitivity * 0.08;

  const rawPeaks: { frame: number; time: number; strength: number }[] = [];
  let lastPeakFrame = -minPeakSpacingFrames;

  for (let i = 1; i < flux.length - 1; i++) {
    const val = flux[i];
    if (val <= flux[i - 1] || val < flux[i + 1]) continue;
    if (val < minAbsoluteEnergy) continue;

    let localSum = 0;
    let localCount = 0;
    const start = Math.max(0, i - windowRadius);
    const end = Math.min(flux.length - 1, i + windowRadius);
    for (let j = start; j <= end; j++) {
      localSum += flux[j];
      localCount++;
    }
    const localAvg = localSum / Math.max(1, localCount);
    const threshold = localAvg * thresholdMultiplier + minAbsoluteEnergy * 0.5;

    if (val >= threshold) {
      if (i - lastPeakFrame < minPeakSpacingFrames) {
        // Keep the stronger of two very close transients
        const prev = rawPeaks[rawPeaks.length - 1];
        if (prev && val > prev.strength) {
          rawPeaks[rawPeaks.length - 1] = {
            frame: i,
            time: Math.round(i * hopDurationSec * 1000) / 1000,
            strength: Math.min(1, val),
          };
          lastPeakFrame = i;
        }
      } else {
        rawPeaks.push({
          frame: i,
          time: Math.round(i * hopDurationSec * 1000) / 1000,
          strength: Math.min(1, val),
        });
        lastPeakFrame = i;
      }
    }
  }

  // Classify strong vs weak beats and musical bars (4/4)
  const strengths = rawPeaks.map((p) => p.strength).sort((a, b) => a - b);
  const medianStrength = strengths.length > 0 ? strengths[Math.floor(strengths.length * 0.55)] : 0.5;

  // Estimate phase of downbeat (0..3) that maximizes average beat strength on beat 1
  const phaseEnergy = [0, 0, 0, 0];
  rawPeaks.forEach((p, idx) => {
    phaseEnergy[idx % 4] += p.strength;
  });
  let downbeatPhase = 0;
  for (let p = 1; p < 4; p++) {
    if (phaseEnergy[p] > phaseEnergy[downbeatPhase]) downbeatPhase = p;
  }

  const beats: BeatMarker[] = rawPeaks.map((p, idx) => {
    const shifted = (idx - downbeatPhase + 4000) % 4;
    const isDownbeat = shifted === 0;
    const isStrong = isDownbeat || p.strength >= medianStrength;
    return {
      id: `beat_${idx}_${Math.round(p.time * 1000)}`,
      time: p.time,
      strength: Math.round(p.strength * 1000) / 1000,
      isStrong,
      isDownbeat,
      barIndex: Math.floor((idx - downbeatPhase + 4000) / 4) - 1000 + 1,
      beatInBar: shifted + 1,
      selected: isStrong,
    };
  });

  return {
    bpm: estimated.bpm,
    manualBpmOverride: options?.manualBpmOverride ?? null,
    confidence: Math.round(estimated.confidence * 100) / 100,
    beatIntervalSec: Math.round(beatIntervalSec * 1000) / 1000,
    beats,
    analyzedAt: Date.now(),
  };
}

/**
 * Extracts normalized RMS/peak bars for crisp audio waveform timeline rendering.
 */
export function extractWaveformPeaks(pcm: Float32Array, barCount = 160): number[] {
  if (pcm.length === 0 || barCount <= 0) return [];
  const blockSize = Math.max(1, Math.floor(pcm.length / barCount));
  const peaks: number[] = new Array(barCount);
  let maxVal = 0.001;

  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize;
    const end = Math.min(pcm.length, start + blockSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    peaks[b] = peak;
    if (peak > maxVal) maxVal = peak;
  }

  return peaks.map((v) => Math.round((v / maxVal) * 1000) / 1000);
}
