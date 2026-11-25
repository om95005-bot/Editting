import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateEasing,
  evaluateKeyframeTrack,
  hasKeyframeAtTime,
  makeEffectParamKeyframeKey,
  solveCubicBezier,
  toggleKeyframeAtTime,
  upsertKeyframe,
} from './keyframes';
import {
  computeAverageSpeed,
  createDefaultSpeedConfig,
  evaluateSpeedAtNormalizedTime,
  generateBeatSyncSpeedCurve,
  mapLocalTimeToSourceTime,
  updateSpeedCurvePointPreservingBeatAlignment,
} from './speedRemap';
import {
  detectBeatsFromPCM,
  extractWaveformPeaks,
  fftRadix2,
} from './beatDetection';
import { synthesizeRhythmicPCM } from './mediaGenerator';
import {
  rgbaToGrayscale,
  trackingPointsToKeyframes,
  trackPatchInFrame,
} from './motionTracking';
import {
  buildInstancesFromCustomEffect,
  EFFECTS_CATALOG,
  parseCubeLut,
} from './effectsCatalog';
import { resolveKeyframedEffects } from './pixelProcessor';
import {
  getFpsDisableReason,
  getResolutionDisableReason,
} from './videoExporter';
import {
  applyBeatSyncToProject,
  createDefaultBeatSyncConfig,
  createDefaultMask,
  createDefaultTracks,
  createDefaultTransform,
  createDefaultTransition,
  duplicateClips,
  snapTimeToTargets,
  splitClipAtTime,
  trimClipEdge,
} from './timelineOps';
import type { Clip, DeviceCapabilities, Project } from '../types/editor';

test('Cubic Bézier solver matches endpoints and ease curves accurately', () => {
  assert.equal(solveCubicBezier(0, 0.42, 0, 0.58, 1), 0);
  assert.equal(solveCubicBezier(1, 0.42, 0, 0.58, 1), 1);
  const mid = solveCubicBezier(0.5, 0.42, 0, 0.58, 1);
  assert.ok(Math.abs(mid - 0.5) < 0.01, `Expected symmetric mid ~0.5, got ${mid}`);
  const overshoot = evaluateEasing(0.6, 'overshoot');
  assert.ok(overshoot > 0.9, `Expected overshoot curve > 0.9 at t=0.6, got ${overshoot}`);
});

test('Keyframe track evaluation interpolates and upserts cleanly', () => {
  let track = upsertKeyframe([], 0, 1.0, 'linear');
  track = upsertKeyframe(track, 2, 3.0, 'linear');
  assert.equal(track.length, 2);
  assert.ok(Math.abs(evaluateKeyframeTrack(track, 1, 0) - 2.0) < 0.001);
  assert.equal(evaluateKeyframeTrack(track, -1, 0), 1.0);
  assert.equal(evaluateKeyframeTrack(track, 5, 0), 3.0);
});

test('Radix-2 FFT detects exact sinusoidal frequency bin', () => {
  const n = 256;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const targetBin = 12;
  for (let i = 0; i < n; i++) {
    re[i] = Math.cos((2 * Math.PI * targetBin * i) / n);
  }
  fftRadix2(re, im);
  let peakBin = 0;
  let peakMag = 0;
  for (let b = 1; b < n / 2; b++) {
    const mag = Math.hypot(re[b], im[b]);
    if (mag > peakMag) {
      peakMag = mag;
      peakBin = b;
    }
  }
  assert.equal(peakBin, targetBin);
});

test('Offline DSP Beat Detection accurately detects 128 BPM and beat timestamps from synthesized PCM', () => {
  const sampleRate = 22050;
  const pcm = synthesizeRhythmicPCM(128, 10, sampleRate);
  const result = detectBeatsFromPCM(pcm, sampleRate, { sensitivity: 0.65 });

  assert.ok(
    Math.abs(result.bpm - 128) <= 3.5,
    `Expected BPM close to 128, detected ${result.bpm}`
  );
  assert.ok(result.beats.length >= 16, `Expected >= 16 beats in 10s @ 128 BPM, got ${result.beats.length}`);
  assert.ok(result.beats.some((b) => b.isDownbeat), 'Should identify downbeats');
  assert.ok(result.beats.some((b) => b.isStrong), 'Should identify strong beats');

  const peaks = extractWaveformPeaks(pcm, 100);
  assert.equal(peaks.length, 100);
  assert.ok(Math.max(...peaks) <= 1 && Math.max(...peaks) > 0.9);
});

test('Speed curve integration and Beat Sync speed ramp generation align to beat timestamps', () => {
  const pcm = synthesizeRhythmicPCM(120, 6, 22050);
  const analysis = detectBeatsFromPCM(pcm, 22050, { sensitivity: 0.65 });
  const cfg = {
    ...createDefaultBeatSyncConfig(),
    rampStyle: 'beatSlowFast' as const,
    pattern: 'every' as const,
    minSpeed: 0.4,
    maxSpeed: 3.5,
  };

  const curve = generateBeatSyncSpeedCurve(analysis.beats, 0, 6, cfg);
  assert.ok(curve.length > 5, 'Beat Sync should create multiple speed curve control points');

  // Verify points are strictly non-decreasing in normalized time
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].time >= curve[i - 1].time, 'Speed curve points must be sorted');
  }

  const speedCfg = {
    ...createDefaultSpeedConfig(),
    mode: 'curve' as const,
    curvePoints: curve,
  };
  const avg = computeAverageSpeed(speedCfg);
  assert.ok(avg >= 0.4 && avg <= 3.5);
  const midSpeed = evaluateSpeedAtNormalizedTime(speedCfg, 0.5);
  assert.ok(midSpeed >= 0.4 && midSpeed <= 3.5);
  const mapped = mapLocalTimeToSourceTime(3, 6, 0, 12, speedCfg);
  assert.ok(mapped > 0 && mapped <= 12);
});

test('ZNCC pixel motion tracking tracks a shifted high-contrast target accurately', () => {
  const w = 120;
  const h = 120;
  const makeFrame = (cx: number, cy: number) => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const dist = Math.hypot(x - cx, y - cy);
        const val = dist < 10 ? 245 : dist < 15 ? 40 : 12;
        rgba[idx] = val;
        rgba[idx + 1] = val;
        rgba[idx + 2] = val;
        rgba[idx + 3] = 255;
      }
    }
    return rgbaToGrayscale(rgba, w, h);
  };

  const f1 = makeFrame(50, 60);
  const f2 = makeFrame(58, 65);
  const res = trackPatchInFrame(f1, f2, 50 / w, 60 / h, 24 / w, 24 / h, 18);

  const trackedX = res.x * w;
  const trackedY = res.y * h;
  assert.ok(Math.abs(trackedX - 58) <= 1.2, `Expected tracked X ~58, got ${trackedX}`);
  assert.ok(Math.abs(trackedY - 65) <= 1.2, `Expected tracked Y ~65, got ${trackedY}`);
  assert.ok(res.confidence > 0.85, `Expected high confidence > 0.85, got ${res.confidence}`);

  const kfs = trackingPointsToKeyframes([
    { time: 0, x: 0.5, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
    { time: 1, x: 0.7, y: 0.4, scale: 1.1, rotation: 5, confidence: 0.95 },
  ]);
  assert.equal(kfs.positionX.length, 2);
  assert.ok(Math.abs(kfs.positionX[1].value - 0.2) < 0.001);
});

test('Timeline operations: split, trim, duplicate, snap, and Beat Sync project update', () => {
  const tracks = createDefaultTracks();
  const baseClip: Clip = {
    id: 'c1',
    trackId: tracks[0].id,
    assetId: 'a1',
    name: 'Test Clip',
    kind: 'video',
    startTime: 0,
    duration: 6,
    sourceStart: 0,
    sourceDuration: 10,
    muted: false,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: createDefaultTransform(),
    blendMode: 'source-over',
    effects: [],
    keyframes: {
      scaleX: upsertKeyframe(upsertKeyframe([], 1, 1.0), 4, 1.5),
    },
    speed: createDefaultSpeedConfig(),
    mask: createDefaultMask(),
    transitionIn: createDefaultTransition(),
  };

  // Split at 2.5s
  const split = splitClipAtTime([baseClip], 'c1', 2.5);
  assert.equal(split.length, 2);
  assert.equal(split[0].duration, 2.5);
  assert.equal(split[1].startTime, 2.5);
  assert.equal(split[1].duration, 3.5);
  assert.equal(split[1].keyframes.scaleX?.[0]?.time, 1.5);

  // Trim right edge
  const trimmed = trimClipEdge(split, 'c1', 'right', 2.0);
  assert.equal(trimmed[0].duration, 2.0);

  // Duplicate
  const dup = duplicateClips(trimmed, ['c1']);
  assert.equal(dup.clips.length, 3);

  // Snapping
  const snap = snapTimeToTargets(2.45, [0, 2.5, 6.0], 0.12);
  assert.equal(snap.snapped, true);
  assert.equal(snap.time, 2.5);

  // Apply Beat Sync to project
  const proj: Project = {
    id: 'p1',
    name: 'Test',
    mode: 'video',
    createdAt: 0,
    updatedAt: 0,
    aspectRatio: '9:16',
    customWidth: 1080,
    customHeight: 1920,
    fps: 60,
    tracks,
    clips: [baseClip],
    assets: {},
    beatSync: { ...createDefaultBeatSyncConfig(), syncZoom: true, syncCuts: true },
    exportSettings: {
      resolution: '1080p',
      fps: 60,
      codec: 'H.264',
      videoBitrateMbps: 18,
      audioBitrateKbps: 256,
      audioCodec: 'AAC',
      format: 'MP4',
    },
  };
  const beats = [
    { id: 'b1', time: 1.0, strength: 0.9, isStrong: true, isDownbeat: true, barIndex: 1, beatInBar: 1, selected: true },
    { id: 'b2', time: 2.0, strength: 0.85, isStrong: true, isDownbeat: false, barIndex: 1, beatInBar: 2, selected: true },
    { id: 'b3', time: 3.0, strength: 0.95, isStrong: true, isDownbeat: false, barIndex: 1, beatInBar: 3, selected: true },
  ];
  const synced = applyBeatSyncToProject(proj, beats, ['c1']);
  assert.equal(synced.beatSync.enabled, true);
  assert.ok(synced.clips.length >= 2, 'Beat sync cuts should split clip on beat timestamps');
  assert.equal(synced.clips[0].speed.mode, 'curve');
});

test('.cube 3D LUT parser parses valid LUT tables cleanly', () => {
  const sampleCube = [
    'TITLE "Gold Noir Mini"',
    'LUT_3D_SIZE 2',
    '0.0 0.0 0.0',
    '1.0 0.0 0.0',
    '0.0 1.0 0.0',
    '1.0 1.0 0.0',
    '0.0 0.0 1.0',
    '1.0 0.0 1.0',
    '0.0 1.0 1.0',
    '1.0 1.0 1.0',
  ].join('\n');

  const parsed = parseCubeLut(sampleCube);
  assert.equal(parsed.size, 2);
  assert.equal(parsed.title, 'Gold Noir Mini');
  assert.equal(parsed.data.length, 24);
});

test('Inline keyframe toggle and effect-parameter keyframes evaluate per frame', () => {
  let track = toggleKeyframeAtTime(undefined, 1.25, 1.5, 'easeInOut');
  assert.equal(track.length, 1);
  assert.equal(hasKeyframeAtTime(track, 1.25), true);
  assert.equal(hasKeyframeAtTime(track, 2.0), false);

  // Toggling again at the same timestamp removes the keyframe
  track = toggleKeyframeAtTime(track, 1.26, 1.5, 'easeInOut');
  assert.equal(track.length, 0);
  assert.equal(hasKeyframeAtTime(track, 1.25), false);

  // Effect parameter keyframe resolution
  const fxKey = makeEffectParamKeyframeKey('fx_1', 'amount');
  assert.equal(fxKey, 'fx:fx_1:amount');
  const clip: Clip = {
    id: 'c_fx',
    trackId: 'track_video_main',
    assetId: 'a1',
    name: 'FX Clip',
    kind: 'video',
    startTime: 0,
    duration: 4,
    sourceStart: 0,
    sourceDuration: 4,
    muted: false,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: createDefaultTransform(),
    blendMode: 'source-over',
    effects: [
      {
        instanceId: 'fx_1',
        effectId: 'waveWarp',
        name: 'Wave Warp',
        category: 'stylize',
        enabled: true,
        params: { amount: 10, frequency: 4, phase: 0 },
      },
    ],
    keyframes: {
      [fxKey]: upsertKeyframe(upsertKeyframe([], 0, 0, 'linear'), 2, 40, 'linear'),
    },
    speed: createDefaultSpeedConfig(),
    mask: createDefaultMask(),
    transitionIn: createDefaultTransition(),
  };

  const resolvedAtMid = resolveKeyframedEffects(clip, 1);
  assert.ok(
    Math.abs(resolvedAtMid[0].params.amount - 20) < 0.01,
    `Expected interpolated effect param ~20 at t=1s, got ${resolvedAtMid[0].params.amount}`
  );
  assert.equal(resolvedAtMid[0].params.frequency, 4);
});

test('All 5 Beat Sync Speed modes generate beat-locked points and manual edits preserve beat alignment', () => {
  const beats = [
    { id: 'b1', time: 1.0, strength: 0.95, isStrong: true, isDownbeat: true, barIndex: 1, beatInBar: 1, selected: true },
    { id: 'b2', time: 2.0, strength: 0.85, isStrong: true, isDownbeat: false, barIndex: 1, beatInBar: 2, selected: true },
    { id: 'b3', time: 3.0, strength: 0.9, isStrong: true, isDownbeat: false, barIndex: 1, beatInBar: 3, selected: true },
  ];
  const modes = ['speedUpOnBeat', 'slowDownOnBeat', 'beatSlowFast', 'beatFastSlow', 'customBeatRamp'] as const;

  for (const mode of modes) {
    const curve = generateBeatSyncSpeedCurve(beats, 0, 4, {
      ...createDefaultBeatSyncConfig(),
      rampStyle: mode,
      minSpeed: 0.35,
      maxSpeed: 3.5,
    });
    const lockedPoints = curve.filter((p) => p.beatId && p.lockedBeatTime !== undefined);
    assert.ok(lockedPoints.length >= 3, `Mode ${mode} should lock points to all 3 beat timestamps`);

    // Attempt manual edit dragging both X (time) and Y (speed) on a beat-locked point
    const target = lockedPoints[0];
    const origTime = target.time;
    const edited = updateSpeedCurvePointPreservingBeatAlignment(curve, target.id, origTime + 0.18, 4.8);
    const updatedTarget = edited.find((p) => p.id === target.id)!;
    assert.equal(updatedTarget.time, origTime, `Manual edit in ${mode} must not shift locked beat time`);
    assert.equal(updatedTarget.speed, 4.8, 'Manual edit should still allow speed adjustment');
  }
});

test('All 15 stylize shader effects exist in catalog and custom effect builder produces stacked instances', () => {
  const requiredStylizeIds = [
    'waveWarp',
    'twirl',
    'bulge',
    'mirror',
    'kaleidoscope',
    'tile',
    'halftone',
    'mosaic',
    'posterize',
    'emboss',
    'outline',
    'noise',
    'gradientOverlay',
    'echo',
    'trails',
  ];

  for (const id of requiredStylizeIds) {
    const def = EFFECTS_CATALOG.find((e) => e.id === id);
    assert.ok(def, `Missing stylize effect in EFFECTS_CATALOG: ${id}`);
    assert.equal(def.category, 'stylize');
    assert.ok(def.params.length > 0, `Effect ${id} should have adjustable parameters`);
  }

  const instances = buildInstancesFromCustomEffect({
    id: 'cust_test_1',
    name: 'Prism Outline Stack',
    layers: [
      { effectId: 'kaleidoscope', params: { segments: 8, rotation: 30, zoom: 1.1 }, exposedParamKeys: ['segments', 'rotation'] },
      { effectId: 'outline', params: { strength: 75, threshold: 25, glow: 40 }, exposedParamKeys: ['strength'] },
    ],
  });
  assert.equal(instances.length, 2);
  assert.equal(instances[0].customEffectId, 'cust_test_1');
  assert.equal(instances[0].params.segments, 8);
  assert.deepEqual(instances[0].exposedParams, ['segments', 'rotation']);
  assert.equal(instances[1].effectId, 'outline');
});

test('Device capability gating returns clear disable reasons for unsupported resolutions and FPS', () => {
  const midTierCaps: DeviceCapabilities = {
    cores: 4,
    memoryGb: 4,
    maxTextureSize: 4096,
    webgl2Supported: true,
    displayRefreshHz: 60,
    supportedResolutions: ['720p', '1080p', '1440p'],
    supportedFps: [24, 25, 30, 48, 50, 60],
    h264Supported: true,
    h265Supported: false,
    vp9Supported: true,
    hardwareAcceleration: true,
    recommendedProxyMode: true,
  };

  assert.equal(getResolutionDisableReason('1080p', midTierCaps), null);
  assert.equal(getResolutionDisableReason('1440p', midTierCaps), null);
  assert.ok(getResolutionDisableReason('4K', midTierCaps), '4K should report a short disable reason on 4K-texture/4-core device');

  assert.equal(getFpsDisableReason(60, midTierCaps), null);
  assert.ok(getFpsDisableReason(90, midTierCaps), '90 FPS should report a short disable reason');
  assert.ok(getFpsDisableReason(120, midTierCaps), '120 FPS should report a short disable reason');
});

