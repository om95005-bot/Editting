import type { MediaAsset, SyntheticSceneType } from '../types/editor';
import { extractWaveformPeaks } from './beatDetection';
import { renderSyntheticScene } from './pixelProcessor';

/**
 * Generates genuine offline rhythmic PCM audio (Kick on 1/3, Snare on 2/4, Hi-hat 8ths,
 * and deep sub-bass pulse) at the specified BPM so Detect Beats runs real FFT spectral
 * flux analysis offline with authentic transients.
 */
export function synthesizeRhythmicPCM(
  bpm = 128,
  durationSec = 12,
  sampleRate = 22050
): Float32Array {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const pcm = new Float32Array(totalSamples);
  const beatInterval = 60 / bpm;

  // Deterministic pseudo-random noise for snare & hi-hat bursts
  let seed = 1337;
  const nextNoise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 1073741823.5) - 1;
  };

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatFloat = t / beatInterval;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatInterval; // seconds since beat onset
    const eighthPhase = ((beatFloat * 2) - Math.floor(beatFloat * 2)) * (beatInterval * 0.5);
    const beatInBar = beatIndex % 4;

    let sample = 0;

    // Kick drum on every quarter note (stronger on downbeat 1 and beat 3)
    if (beatPhase < 0.18) {
      const kickEnv = Math.exp(-beatPhase * 24);
      const kickFreq = 135 * Math.exp(-beatPhase * 28) + 46;
      const kickAccent = beatInBar === 0 ? 1.0 : beatInBar === 2 ? 0.85 : 0.65;
      sample += Math.sin(2 * Math.PI * kickFreq * beatPhase) * kickEnv * 0.72 * kickAccent;
    }

    // Crisp snare/clap transient on beats 2 & 4
    if ((beatInBar === 1 || beatInBar === 3) && beatPhase < 0.14) {
      const snareEnv = Math.exp(-beatPhase * 32);
      const body = Math.sin(2 * Math.PI * 210 * beatPhase) * 0.35;
      sample += (nextNoise() * 0.55 + body) * snareEnv * 0.68;
    }

    // Crisp hi-hat on 8th notes
    if (eighthPhase < 0.045) {
      const hatEnv = Math.exp(-eighthPhase * 85);
      sample += nextNoise() * hatEnv * 0.16;
    }

    // Sub-bass melodic pulse
    const barNotes = [55, 55, 65.41, 73.42];
    const bassFreq = barNotes[Math.floor(beatIndex / 4) % barNotes.length];
    const sidechain = Math.min(1, beatPhase / 0.09);
    sample += Math.sin(2 * Math.PI * bassFreq * t) * 0.22 * sidechain;

    pcm[i] = Math.max(-0.98, Math.min(0.98, sample));
  }

  return pcm;
}

/**
 * Encodes mono Float32Array PCM into a playable WAV Blob URL completely offline.
 */
export function pcmToWavBlobUrl(pcm: Float32Array, sampleRate = 22050): string {
  const numSamples = pcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * Generates filmstrip thumbnails for a synthetic video scene.
 */
export function generateSyntheticThumbnails(
  scene: SyntheticSceneType,
  duration: number,
  count = 6
): string[] {
  if (typeof document === 'undefined') return [];
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const thumbs: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / Math.max(1, count - 1)) * duration;
    renderSyntheticScene(ctx, scene, canvas.width, canvas.height, t);
    thumbs.push(canvas.toDataURL('image/jpeg', 0.65));
  }
  return thumbs;
}

export function createBuiltinVideoAsset(
  id: string,
  name: string,
  scene: SyntheticSceneType,
  duration = 8
): MediaAsset {
  return {
    id,
    name,
    kind: 'video',
    mimeType: 'video/synthetic',
    duration,
    width: 1080,
    height: 1920,
    syntheticScene: scene,
    thumbnails: generateSyntheticThumbnails(scene, duration, 6),
  };
}

export function createBuiltinAudioAsset(
  id: string,
  name: string,
  bpm = 128,
  duration = 12
): { asset: MediaAsset; pcm: Float32Array; sampleRate: number } {
  const sampleRate = 22050;
  const pcm = synthesizeRhythmicPCM(bpm, duration, sampleRate);
  const waveformPeaks = extractWaveformPeaks(pcm, 140);
  const objectUrl = typeof URL !== 'undefined' && typeof Blob !== 'undefined'
    ? pcmToWavBlobUrl(pcm, sampleRate)
    : undefined;

  return {
    asset: {
      id,
      name,
      kind: 'audio',
      mimeType: 'audio/wav',
      duration,
      width: 0,
      height: 0,
      objectUrl,
      syntheticAudioBpm: bpm,
      waveformPeaks,
    },
    pcm,
    sampleRate,
  };
}

/**
 * Decodes any user-imported audio or video file into mono Float32Array PCM samples
 * completely offline using Web Audio API `decodeAudioData`.
 */
export async function decodeMediaFileToPCM(
  url: string
): Promise<{ pcm: Float32Array; sampleRate: number; duration: number }> {
  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    const len = audioBuffer.length;
    const mono = new Float32Array(len);
    const numCh = audioBuffer.numberOfChannels;
    for (let ch = 0; ch < numCh; ch++) {
      const chData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        mono[i] += chData[i] / numCh;
      }
    }
    return { pcm: mono, sampleRate: audioBuffer.sampleRate, duration: audioBuffer.duration };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Imports a real user local File (video, image, or audio) into a MediaAsset
 * with real metadata, video thumbnails, or decoded audio waveform peaks.
 */
export async function importLocalMediaFile(
  file: File
): Promise<{ asset: MediaAsset; pcm?: Float32Array; sampleRate?: number }> {
  const objectUrl = URL.createObjectURL(file);
  const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (file.type.startsWith('image/')) {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1080, h: img.naturalHeight || 1920 });
      img.onerror = () => resolve({ w: 1080, h: 1920 });
      img.src = objectUrl;
    });
    return {
      asset: {
        id,
        name: file.name,
        kind: 'image',
        mimeType: file.type,
        duration: 5,
        width: dims.w,
        height: dims.h,
        objectUrl,
        thumbnails: [objectUrl],
      },
    };
  }

  if (file.type.startsWith('audio/')) {
    let duration = 10;
    let waveformPeaks: number[] = [];
    let pcm: Float32Array | undefined;
    let sampleRate: number | undefined;
    try {
      const decoded = await decodeMediaFileToPCM(objectUrl);
      pcm = decoded.pcm;
      sampleRate = decoded.sampleRate;
      duration = decoded.duration;
      waveformPeaks = extractWaveformPeaks(pcm, 150);
    } catch {
      // Fallback duration via audio element
      duration = await new Promise<number>((resolve) => {
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 10);
        a.onerror = () => resolve(10);
        a.src = objectUrl;
      });
    }
    return {
      asset: {
        id,
        name: file.name,
        kind: 'audio',
        mimeType: file.type,
        duration,
        width: 0,
        height: 0,
        objectUrl,
        waveformPeaks,
      },
      pcm,
      sampleRate,
    };
  }

  // Video file
  const meta = await new Promise<{ w: number; h: number; dur: number; thumbs: string[] }>((resolve) => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.preload = 'auto';
    vid.src = objectUrl;
    vid.onloadeddata = () => {
      const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 6;
      const w = vid.videoWidth || 1080;
      const h = vid.videoHeight || 1920;
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 128;
      const cctx = c.getContext('2d');
      const thumbs: string[] = [];
      if (cctx) {
        cctx.drawImage(vid, 0, 0, c.width, c.height);
        thumbs.push(c.toDataURL('image/jpeg', 0.65));
      }
      resolve({ w, h, dur, thumbs });
    };
    vid.onerror = () => resolve({ w: 1080, h: 1920, dur: 6, thumbs: [] });
  });

  return {
    asset: {
      id,
      name: file.name,
      kind: 'video',
      mimeType: file.type || 'video/mp4',
      duration: Math.round(meta.dur * 100) / 100,
      width: meta.w,
      height: meta.h,
      objectUrl,
      thumbnails: meta.thumbs,
    },
  };
}
