import type {
  BeatMarker,
  BeatSyncConfig,
  SpeedConfig,
  SpeedCurvePoint,
  SpeedPresetId,
} from '../types/editor';

export function createDefaultSpeedConfig(): SpeedConfig {
  return {
    mode: 'constant',
    constantSpeed: 1,
    reverse: false,
    freezeAt: null,
    frameBlending: 'blend',
    presetId: 'constant',
    curvePoints: [
      { id: 'sp_0', time: 0, speed: 1 },
      { id: 'sp_1', time: 1, speed: 1 },
    ],
  };
}

export const SPEED_PRESETS: Record<
  Exclude<SpeedPresetId, 'constant' | 'custom'>,
  { label: string; description: string; points: { time: number; speed: number }[] }
> = {
  slowToFast: {
    label: 'Slow to Fast',
    description: 'Gradual acceleration from 0.35x into a 3.2x burst',
    points: [
      { time: 0, speed: 0.35 },
      { time: 0.35, speed: 0.5 },
      { time: 0.7, speed: 2.2 },
      { time: 1, speed: 3.2 },
    ],
  },
  fastToSlow: {
    label: 'Fast to Slow',
    description: 'High-energy 3.4x entry settling into smooth 0.35x slow motion',
    points: [
      { time: 0, speed: 3.4 },
      { time: 0.3, speed: 2.1 },
      { time: 0.65, speed: 0.5 },
      { time: 1, speed: 0.35 },
    ],
  },
  slowFastSlow: {
    label: 'Slow-Fast-Slow',
    description: 'Hero slow-mo framing a punchy mid-clip speed ramp',
    points: [
      { time: 0, speed: 0.45 },
      { time: 0.28, speed: 0.5 },
      { time: 0.5, speed: 3.8 },
      { time: 0.72, speed: 0.5 },
      { time: 1, speed: 0.45 },
    ],
  },
  fastSlowFast: {
    label: 'Fast-Slow-Fast',
    description: 'Flash whip-in, dramatic slow focus center, fast exit',
    points: [
      { time: 0, speed: 3.2 },
      { time: 0.26, speed: 2.6 },
      { time: 0.5, speed: 0.3 },
      { time: 0.74, speed: 2.6 },
      { time: 1, speed: 3.2 },
    ],
  },
  smoothVelocity: {
    label: 'Smooth Velocity',
    description: 'Rhythmic wave velocity curve with gentle peaks',
    points: [
      { time: 0, speed: 0.8 },
      { time: 0.25, speed: 2.8 },
      { time: 0.5, speed: 0.45 },
      { time: 0.75, speed: 2.9 },
      { time: 1, speed: 0.75 },
    ],
  },
  cinematicRamp: {
    label: 'Cinematic Speed Ramp',
    description: 'Subtle 0.5x anticipation, crisp 4.2x impact, silky 0.4x hold',
    points: [
      { time: 0, speed: 0.55 },
      { time: 0.32, speed: 0.45 },
      { time: 0.46, speed: 4.2 },
      { time: 0.58, speed: 0.42 },
      { time: 1, speed: 0.7 },
    ],
  },
};

export function getPresetCurvePoints(presetId: SpeedPresetId): SpeedCurvePoint[] {
  if (presetId === 'constant' || presetId === 'custom') {
    return [
      { id: 'sp_0', time: 0, speed: 1 },
      { id: 'sp_1', time: 1, speed: 1 },
    ];
  }
  const preset = SPEED_PRESETS[presetId];
  return preset.points.map((p, idx) => ({
    id: `sp_${presetId}_${idx}`,
    time: p.time,
    speed: p.speed,
  }));
}

/**
 * Evaluates instantaneous playback speed at normalized clip time u in [0, 1].
 * Uses smooth Hermite (smoothstep) interpolation between control points so speed
 * transitions are silky rather than jagged.
 */
export function evaluateSpeedAtNormalizedTime(
  speedConfig: SpeedConfig,
  u: number
): number {
  if (speedConfig.freezeAt !== null) return 0;
  if (speedConfig.mode === 'constant') {
    return Math.max(0.1, Math.min(10, speedConfig.constantSpeed));
  }
  const pts = [...speedConfig.curvePoints].sort((a, b) => a.time - b.time);
  if (pts.length === 0) return 1;
  const clamped = Math.max(0, Math.min(1, u));
  if (clamped <= pts[0].time) return pts[0].speed;
  if (clamped >= pts[pts.length - 1].time) return pts[pts.length - 1].speed;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (clamped >= p0.time && clamped <= p1.time) {
      const span = p1.time - p0.time;
      if (span <= 1e-6) return p1.speed;
      const t = (clamped - p0.time) / span;
      // Cubic smoothstep for natural speed ramp acceleration
      const smoothT = t * t * (3 - 2 * t);
      return p0.speed + (p1.speed - p0.speed) * smoothT;
    }
  }
  return 1;
}

/**
 * Computes average speed across the clip via Simpson/trapezoidal numerical integration.
 */
export function computeAverageSpeed(speedConfig: SpeedConfig, steps = 64): number {
  if (speedConfig.mode === 'constant') {
    return Math.max(0.1, Math.min(10, speedConfig.constantSpeed));
  }
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const weight = i === 0 || i === steps ? 0.5 : 1;
    sum += weight * evaluateSpeedAtNormalizedTime(speedConfig, u);
  }
  return Math.max(0.1, sum / steps);
}

/**
 * Maps a timeline local offset (0..clipDuration) to the exact source media timestamp
 * by integrating the speed curve v(t) dt, respecting reverse & freeze frame.
 */
export function mapLocalTimeToSourceTime(
  localTime: number,
  clipDuration: number,
  sourceStart: number,
  sourceDuration: number,
  speedConfig: SpeedConfig
): number {
  const safeDuration = Math.max(0.05, clipDuration);
  const clampedLocal = Math.max(0, Math.min(safeDuration, localTime));

  if (speedConfig.freezeAt !== null) {
    return Math.max(0, Math.min(sourceDuration, sourceStart + speedConfig.freezeAt));
  }

  let integratedSourceOffset: number;
  if (speedConfig.mode === 'constant') {
    integratedSourceOffset = clampedLocal * Math.max(0.1, speedConfig.constantSpeed);
  } else {
    const uTarget = clampedLocal / safeDuration;
    const steps = Math.max(8, Math.ceil(uTarget * 64));
    const du = uTarget / steps;
    let integral = 0;
    for (let i = 0; i < steps; i++) {
      const u0 = i * du;
      const u1 = (i + 1) * du;
      const v0 = evaluateSpeedAtNormalizedTime(speedConfig, u0);
      const v1 = evaluateSpeedAtNormalizedTime(speedConfig, u1);
      integral += 0.5 * (v0 + v1) * du * safeDuration;
    }
    integratedSourceOffset = integral;
  }

  const maxSpan = Math.max(0.05, sourceDuration - sourceStart);
  const wrappedOffset = integratedSourceOffset % maxSpan;

  if (speedConfig.reverse) {
    return Math.max(sourceStart, sourceStart + maxSpan - wrappedOffset);
  }
  return Math.min(sourceDuration, sourceStart + wrappedOffset);
}

/**
 * Filters detected beat markers according to BeatSyncConfig rules.
 */
export function filterBeatsForSync(
  beats: BeatMarker[],
  config: BeatSyncConfig,
  clipStart: number,
  clipDuration: number
): BeatMarker[] {
  const offsetSec = config.beatOffsetMs / 1000;
  const clipEnd = clipStart + clipDuration;
  const rangeStart = Math.max(clipStart, config.rangeStartSec);
  const rangeEnd = config.rangeEndSec !== null ? Math.min(clipEnd, config.rangeEndSec) : clipEnd;

  const inRange = beats
    .map((b) => ({ ...b, time: b.time + offsetSec }))
    .filter((b) => b.time >= rangeStart && b.time <= rangeEnd)
    .filter((b) => b.strength >= config.strengthThreshold || b.manual || b.selected);

  switch (config.pattern) {
    case 'every':
      return inRange;
    case 'every2':
      return inRange.filter((_, idx) => idx % 2 === 0);
    case 'every4':
      return inRange.filter((_, idx) => idx % 4 === 0);
    case 'strongOnly':
      return inRange.filter((b) => b.isStrong || b.isDownbeat);
    case 'selected':
      return inRange.filter((b) => b.selected);
  }
}

/**
 * Automatically generates editable SpeedCurvePoint[] synchronized precisely
 * to detected audio beat timestamps.
 */
export function generateBeatSyncSpeedCurve(
  beats: BeatMarker[],
  clipStart: number,
  clipDuration: number,
  config: BeatSyncConfig
): SpeedCurvePoint[] {
  const safeDur = Math.max(0.2, clipDuration);
  const targetBeats = filterBeatsForSync(beats, config, clipStart, safeDur);

  if (targetBeats.length === 0) {
    return [
      { id: 'bs_start', time: 0, speed: 1 },
      { id: 'bs_end', time: 1, speed: 1 },
    ];
  }

  const minSpd = Math.max(0.1, Math.min(1.0, config.minSpeed));
  const maxSpd = Math.max(
    1.2,
    Math.min(10, config.maxSpeed * config.speedMultiplier * (0.5 + 0.5 * config.curveIntensity))
  );
  const baseSpeed = Math.max(minSpd, Math.min(maxSpd, 1.0));
  const halfRampU = Math.min(0.12, Math.max(0.015, config.rampDuration / safeDur));

  const points: SpeedCurvePoint[] = [];
  const pushPoint = (u: number, speed: number, beatId?: string) => {
    const clampedU = Math.max(0, Math.min(1, Math.round(u * 10000) / 10000));
    const clampedSpeed = Math.max(0.1, Math.min(10, Math.round(speed * 100) / 100));
    const existingIdx = points.findIndex((p) => Math.abs(p.time - clampedU) < 0.004);
    if (existingIdx >= 0) {
      points[existingIdx] = {
        ...points[existingIdx],
        speed: clampedSpeed,
        beatId: beatId ?? points[existingIdx].beatId,
        lockedBeatTime: beatId ? clampedU : points[existingIdx].lockedBeatTime,
      };
    } else {
      points.push({
        id: `bs_${points.length}_${beatId ?? 'pt'}`,
        time: clampedU,
        speed: clampedSpeed,
        beatId,
        lockedBeatTime: beatId ? clampedU : undefined,
      });
    }
  };

  const initialSpeed =
    config.rampStyle === 'beatFastSlow' || config.rampStyle === 'slowDownOnBeat'
      ? Math.max(baseSpeed, maxSpd * 0.78)
      : minSpd;
  pushPoint(0, initialSpeed);

  for (let i = 0; i < targetBeats.length; i++) {
    const beat = targetBeats[i];
    const uBeat = (beat.time - clipStart) / safeDur;
    if (uBeat <= 0.01 || uBeat >= 0.99) continue;

    const accentScale = beat.isStrong ? 1 : 0.72;
    const peakSpeed = minSpd + (maxSpd - minSpd) * accentScale;

    const prevBeatU = i > 0 ? (targetBeats[i - 1].time - clipStart) / safeDur : 0;
    const nextBeatU = i < targetBeats.length - 1 ? (targetBeats[i + 1].time - clipStart) / safeDur : 1;
    const localPre = Math.min(halfRampU, (uBeat - prevBeatU) * 0.42);
    const localPost = Math.min(halfRampU * (1 + config.rampSmoothness * 0.6), (nextBeatU - uBeat) * 0.42);

    if (config.rampStyle === 'speedUpOnBeat' || config.rampStyle === 'beatVelocity') {
      // Punchy speed-up burst right on each beat, dipping smoothly between beats
      pushPoint(uBeat - localPre * 0.7, Math.max(minSpd, baseSpeed * 0.85));
      pushPoint(uBeat, peakSpeed, beat.id);
      const midU = (uBeat + nextBeatU) * 0.5;
      if (midU - uBeat > 0.025) {
        pushPoint(midU, minSpd);
      }
    } else if (config.rampStyle === 'slowDownOnBeat') {
      // High velocity approaching beat -> dramatic slow-motion dip locked right on the beat -> quick rebound
      pushPoint(uBeat - localPre, peakSpeed * 0.88);
      pushPoint(uBeat, minSpd, beat.id);
      pushPoint(uBeat + localPost, peakSpeed * 0.82);
    } else if (config.rampStyle === 'beatSlowFast') {
      // Slow-to-fast ramp: hold slow motion before beat -> accelerate cleanly -> peak right on beat
      pushPoint(uBeat - localPre * 1.15, minSpd);
      pushPoint(uBeat, peakSpeed, beat.id);
      pushPoint(uBeat + localPost, Math.max(minSpd, baseSpeed * 0.85));
    } else if (config.rampStyle === 'beatFastSlow') {
      // Fast-to-slow ramp: burst before beat -> drop into smooth slow motion on beat -> ease back
      pushPoint(uBeat - localPre, peakSpeed);
      pushPoint(uBeat, minSpd, beat.id);
      pushPoint(uBeat + localPost, Math.min(peakSpeed, baseSpeed * 1.15));
    } else if (config.rampStyle === 'customBeatRamp') {
      // Custom beat ramp: alternating high/low beat anchors for free manual sculpting while staying beat-locked
      const customTarget = i % 2 === 0 ? peakSpeed : minSpd;
      pushPoint(uBeat, customTarget, beat.id);
    } else {
      // cinematicBeat
      pushPoint(uBeat - localPre * 1.2, minSpd);
      pushPoint(uBeat - localPre * 0.35, minSpd * 1.15);
      pushPoint(uBeat, peakSpeed, beat.id);
      pushPoint(uBeat + localPost * 0.5, baseSpeed);
      pushPoint(uBeat + localPost * 1.15, Math.max(minSpd, baseSpeed * 0.75));
    }
  }

  pushPoint(1, baseSpeed);
  return points.sort((a, b) => a.time - b.time);
}

/**
 * Updates a speed curve point during manual graph editing while strictly preserving
 * beat alignment on any beat-locked point (`lockedBeatTime` stays exact).
 */
export function updateSpeedCurvePointPreservingBeatAlignment(
  points: SpeedCurvePoint[],
  pointId: string,
  nextTime: number,
  nextSpeed: number
): SpeedCurvePoint[] {
  const clampedSpeed = Math.max(0.1, Math.min(10, Math.round(nextSpeed * 100) / 100));
  const clampedTime = Math.max(0, Math.min(1, Math.round(nextTime * 1000) / 1000));

  return points
    .map((pt) => {
      if (pt.id !== pointId) return pt;
      const lockedTime = pt.lockedBeatTime !== undefined ? pt.lockedBeatTime : clampedTime;
      return {
        ...pt,
        time: lockedTime,
        speed: clampedSpeed,
      };
    })
    .sort((a, b) => a.time - b.time);
}
