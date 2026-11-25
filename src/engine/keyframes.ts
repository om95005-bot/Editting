import type {
  BezierHandles,
  Clip,
  EasingType,
  Keyframe,
  KeyframeProperty,
  TransformState,
} from '../types/editor';

export const DEFAULT_BEZIER_HANDLES: Record<EasingType, BezierHandles> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  cubicBezier: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  smooth: { x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
  overshoot: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  bounce: { x1: 0.25, y1: 1.35, x2: 0.5, y2: 1 },
};

function sampleCurve(a: number, b: number, c: number, t: number): number {
  return ((a * t + b) * t + c) * t;
}

function sampleCurveDerivative(a: number, b: number, c: number, t: number): number {
  return (3 * a * t + 2 * b) * t + c;
}

/**
 * Solves cubic Bézier curve y(x) for x in [0, 1] using Newton-Raphson
 * with bisection fallback for guaranteed convergence.
 */
export function solveCubicBezier(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const clampedX = Math.max(0, Math.min(1, x));
  if (clampedX === 0 || clampedX === 1) return clampedX;
  if (x1 === y1 && x2 === y2) return clampedX;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  let t = clampedX;
  for (let i = 0; i < 8; i++) {
    const err = sampleCurve(ax, bx, cx, t) - clampedX;
    if (Math.abs(err) < 1e-6) break;
    const d = sampleCurveDerivative(ax, bx, cx, t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }

  if (t < 0 || t > 1 || Number.isNaN(t)) {
    let lo = 0;
    let hi = 1;
    t = clampedX;
    for (let i = 0; i < 16; i++) {
      const val = sampleCurve(ax, bx, cx, t);
      if (Math.abs(val - clampedX) < 1e-6) break;
      if (clampedX > val) lo = t;
      else hi = t;
      t = (lo + hi) * 0.5;
    }
  }

  return sampleCurve(ay, by, cy, Math.max(0, Math.min(1, t)));
}

function easeBounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  } else if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  } else {
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  }
}

export function evaluateEasing(
  t: number,
  easing: EasingType,
  bezier?: BezierHandles
): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (easing === 'linear') return clamped;
  if (easing === 'bounce' && !bezier) return easeBounceOut(clamped);
  const h = bezier ?? DEFAULT_BEZIER_HANDLES[easing] ?? DEFAULT_BEZIER_HANDLES.easeInOut;
  return solveCubicBezier(clamped, h.x1, h.y1, h.x2, h.y2);
}

/**
 * Evaluates a sorted or unsorted array of keyframes for a single property at localTime.
 */
export function evaluateKeyframeTrack(
  keyframes: Keyframe[] | undefined,
  localTime: number,
  fallbackValue: number
): number {
  if (!keyframes || keyframes.length === 0) return fallbackValue;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  if (localTime <= sorted[0].time) return sorted[0].value;
  if (localTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i];
    const k1 = sorted[i + 1];
    if (localTime >= k0.time && localTime <= k1.time) {
      const span = k1.time - k0.time;
      if (span <= 1e-6) return k1.value;
      const rawT = (localTime - k0.time) / span;
      const easedT = evaluateEasing(rawT, k0.easing, k0.bezier);
      return k0.value + (k1.value - k0.value) * easedT;
    }
  }

  return fallbackValue;
}

export function evaluateClipTransform(clip: Clip, localTime: number): TransformState {
  const kf = clip.keyframes;
  const base = clip.transform;
  return {
    positionX: evaluateKeyframeTrack(kf.positionX, localTime, base.positionX),
    positionY: evaluateKeyframeTrack(kf.positionY, localTime, base.positionY),
    scaleX: evaluateKeyframeTrack(kf.scaleX, localTime, base.scaleX),
    scaleY: evaluateKeyframeTrack(kf.scaleY, localTime, base.scaleY),
    rotation: evaluateKeyframeTrack(kf.rotation, localTime, base.rotation),
    opacity: Math.max(0, Math.min(1, evaluateKeyframeTrack(kf.opacity, localTime, base.opacity))),
    anchorX: evaluateKeyframeTrack(kf.anchorX, localTime, base.anchorX),
    anchorY: evaluateKeyframeTrack(kf.anchorY, localTime, base.anchorY),
    cropTop: Math.max(0, Math.min(0.45, evaluateKeyframeTrack(kf.cropTop, localTime, base.cropTop))),
    cropBottom: Math.max(0, Math.min(0.45, evaluateKeyframeTrack(kf.cropBottom, localTime, base.cropBottom))),
    cropLeft: Math.max(0, Math.min(0.45, evaluateKeyframeTrack(kf.cropLeft, localTime, base.cropLeft))),
    cropRight: Math.max(0, Math.min(0.45, evaluateKeyframeTrack(kf.cropRight, localTime, base.cropRight))),
  };
}

export function upsertKeyframe(
  existing: Keyframe[] | undefined,
  time: number,
  value: number,
  easing: EasingType = 'easeInOut',
  bezier?: BezierHandles,
  snapThresholdSec = 0.03
): Keyframe[] {
  const list = existing ? [...existing] : [];
  const roundedTime = Math.max(0, Math.round(time * 1000) / 1000);
  const idx = list.findIndex((k) => Math.abs(k.time - roundedTime) <= snapThresholdSec);

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      value,
      easing: easing ?? list[idx].easing,
      bezier: bezier ?? list[idx].bezier,
    };
  } else {
    list.push({
      id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: roundedTime,
      value,
      easing,
      bezier: bezier ?? (easing === 'cubicBezier' ? { ...DEFAULT_BEZIER_HANDLES.cubicBezier } : undefined),
    });
  }

  return list.sort((a, b) => a.time - b.time);
}

export function deleteKeyframeById(existing: Keyframe[] | undefined, id: string): Keyframe[] {
  if (!existing) return [];
  return existing.filter((k) => k.id !== id);
}

export function getAllClipKeyframeTimes(clip: Clip): number[] {
  const set = new Set<number>();
  for (const prop of Object.keys(clip.keyframes)) {
    const list = clip.keyframes[prop];
    if (!list) continue;
    for (const kf of list) {
      set.add(Math.round(kf.time * 100) / 100);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function makeEffectParamKeyframeKey(instanceId: string, paramKey: string): `fx:${string}:${string}` {
  return `fx:${instanceId}:${paramKey}`;
}

export function hasKeyframeAtTime(
  existing: Keyframe[] | undefined,
  localTime: number,
  thresholdSec = 0.04
): boolean {
  if (!existing || existing.length === 0) return false;
  return existing.some((k) => Math.abs(k.time - localTime) <= thresholdSec);
}

export function toggleKeyframeAtTime(
  existing: Keyframe[] | undefined,
  localTime: number,
  value: number,
  easing: EasingType = 'easeInOut',
  thresholdSec = 0.04
): Keyframe[] {
  const list = existing ? [...existing] : [];
  const idx = list.findIndex((k) => Math.abs(k.time - localTime) <= thresholdSec);
  if (idx >= 0) {
    return list.filter((_, i) => i !== idx);
  }
  return upsertKeyframe(list, localTime, value, easing, undefined, thresholdSec);
}

export function getClipPropertyBaseValue(clip: Clip, prop: KeyframeProperty): number {
  if (prop.startsWith('fx:')) {
    const [, instanceId, paramKey] = prop.split(':');
    const fx = clip.effects.find((e) => e.instanceId === instanceId);
    return fx?.params[paramKey] ?? 0;
  }
  switch (prop) {
    case 'positionX': return clip.transform.positionX;
    case 'positionY': return clip.transform.positionY;
    case 'scaleX': return clip.transform.scaleX;
    case 'scaleY': return clip.transform.scaleY;
    case 'rotation': return clip.transform.rotation;
    case 'opacity': return clip.transform.opacity;
    case 'anchorX': return clip.transform.anchorX;
    case 'anchorY': return clip.transform.anchorY;
    case 'cropTop': return clip.transform.cropTop;
    case 'cropBottom': return clip.transform.cropBottom;
    case 'cropLeft': return clip.transform.cropLeft;
    case 'cropRight': return clip.transform.cropRight;
    case 'maskX': return clip.mask.x;
    case 'maskY': return clip.mask.y;
    case 'maskWidth': return clip.mask.width;
    case 'maskHeight': return clip.mask.height;
    case 'maskFeather': return clip.mask.feather;
    case 'volume': return clip.volume;
    case 'speed': return clip.speed.constantSpeed;
    case 'textSize': return clip.text?.fontSize ?? 42;
    case 'brightness': return 0;
    case 'contrast': return 0;
    case 'blur': return 0;
    case 'sharpen': return 0;
    default: return 0;
  }
}

export const KEYFRAME_PROPERTY_META: Record<
  string,
  { label: string; min: number; max: number; step: number; unit: string }
> = {
  positionX: { label: 'Position X', min: -1, max: 1, step: 0.01, unit: '' },
  positionY: { label: 'Position Y', min: -1, max: 1, step: 0.01, unit: '' },
  scaleX: { label: 'Scale X', min: 0.1, max: 4, step: 0.02, unit: 'x' },
  scaleY: { label: 'Scale Y', min: 0.1, max: 4, step: 0.02, unit: 'x' },
  rotation: { label: 'Rotation', min: -360, max: 360, step: 1, unit: '°' },
  opacity: { label: 'Opacity', min: 0, max: 1, step: 0.01, unit: '' },
  anchorX: { label: 'Anchor X', min: 0, max: 1, step: 0.01, unit: '' },
  anchorY: { label: 'Anchor Y', min: 0, max: 1, step: 0.01, unit: '' },
  cropTop: { label: 'Crop Top', min: 0, max: 0.45, step: 0.01, unit: '' },
  cropBottom: { label: 'Crop Bottom', min: 0, max: 0.45, step: 0.01, unit: '' },
  cropLeft: { label: 'Crop Left', min: 0, max: 0.45, step: 0.01, unit: '' },
  cropRight: { label: 'Crop Right', min: 0, max: 0.45, step: 0.01, unit: '' },
  maskX: { label: 'Mask X', min: 0, max: 1, step: 0.01, unit: '' },
  maskY: { label: 'Mask Y', min: 0, max: 1, step: 0.01, unit: '' },
  maskWidth: { label: 'Mask Width', min: 0.05, max: 1, step: 0.01, unit: '' },
  maskHeight: { label: 'Mask Height', min: 0.05, max: 1, step: 0.01, unit: '' },
  maskFeather: { label: 'Mask Feather', min: 0, max: 80, step: 1, unit: 'px' },
  brightness: { label: 'Brightness', min: -100, max: 100, step: 1, unit: '' },
  contrast: { label: 'Contrast', min: -100, max: 100, step: 1, unit: '' },
  blur: { label: 'Blur', min: 0, max: 40, step: 0.5, unit: 'px' },
  sharpen: { label: 'Sharpen', min: 0, max: 100, step: 1, unit: '%' },
  volume: { label: 'Audio Volume', min: 0, max: 2, step: 0.02, unit: 'x' },
  speed: { label: 'Playback Speed', min: 0.1, max: 10, step: 0.05, unit: 'x' },
  textSize: { label: 'Text Size', min: 14, max: 120, step: 1, unit: 'px' },
};
