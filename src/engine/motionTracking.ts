import type { Keyframe, TrackingPoint } from '../types/editor';

export interface GrayscaleFrame {
  width: number;
  height: number;
  luma: Uint8ClampedArray;
}

/**
 * Converts RGBA ImageData pixels into single-channel Rec.709 luminance.
 */
export function rgbaToGrayscale(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): GrayscaleFrame {
  const luma = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (rgba[p] * 54 + rgba[p + 1] * 183 + rgba[p + 2] * 19) >> 8;
  }
  return { width, height, luma };
}

/**
 * Extracts a rectangular grayscale patch centered at (cx, cy).
 */
export function extractTemplatePatch(
  frame: GrayscaleFrame,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): { data: Float32Array; width: number; height: number; mean: number; std: number } {
  const w = halfW * 2 + 1;
  const h = halfH * 2 + 1;
  const data = new Float32Array(w * h);
  let sum = 0;

  for (let dy = -halfH; dy <= halfH; dy++) {
    const sy = Math.max(0, Math.min(frame.height - 1, Math.round(cy + dy)));
    const rowOff = sy * frame.width;
    const outRow = (dy + halfH) * w;
    for (let dx = -halfW; dx <= halfW; dx++) {
      const sx = Math.max(0, Math.min(frame.width - 1, Math.round(cx + dx)));
      const v = frame.luma[rowOff + sx];
      data[outRow + (dx + halfW)] = v;
      sum += v;
    }
  }

  const mean = sum / data.length;
  let variance = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i] - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / data.length) + 1e-4;

  return { data, width: w, height: h, mean, std };
}

/**
 * Tracks a template patch in the next grayscale frame using Zero-Mean Normalized
 * Cross-Correlation (ZNCC) inside a local search window, plus sub-pixel parabolic
 * peak refinement. Returns updated normalized coordinates and tracking confidence (0..1).
 */
export function trackPatchInFrame(
  prevFrame: GrayscaleFrame,
  nextFrame: GrayscaleFrame,
  prevNormX: number,
  prevNormY: number,
  boxNormW: number,
  boxNormH: number,
  searchRadiusPx = 20
): { x: number; y: number; confidence: number; dx: number; dy: number } {
  const w = prevFrame.width;
  const h = prevFrame.height;
  const prevCx = prevNormX * w;
  const prevCy = prevNormY * h;

  const halfW = Math.max(4, Math.min(18, Math.round((boxNormW * w) * 0.5)));
  const halfH = Math.max(4, Math.min(18, Math.round((boxNormH * h) * 0.5)));

  const tpl = extractTemplatePatch(prevFrame, prevCx, prevCy, halfW, halfH);
  const tplW = tpl.width;
  const tplH = tpl.height;
  const nPixels = tpl.data.length;

  // Coarse 2px step search then fine 1px refinement around best match
  const evaluateZNCC = (candCx: number, candCy: number): number => {
    let sum = 0;
    let sumSq = 0;
    let cross = 0;
    let idx = 0;

    for (let dy = -halfH; dy <= halfH; dy++) {
      const sy = Math.max(0, Math.min(h - 1, Math.round(candCy + dy)));
      const rowOff = sy * w;
      for (let dx = -halfW; dx <= halfW; dx++) {
        const sx = Math.max(0, Math.min(w - 1, Math.round(candCx + dx)));
        const val = nextFrame.luma[rowOff + sx];
        sum += val;
        sumSq += val * val;
        cross += val * (tpl.data[idx++] - tpl.mean);
      }
    }

    const candMean = sum / nPixels;
    const candVar = Math.max(0, sumSq / nPixels - candMean * candMean);
    const candStd = Math.sqrt(candVar) + 1e-4;
    const zncc = cross / (nPixels * candStd * tpl.std);
    return Math.max(-1, Math.min(1, zncc));
  };

  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -2;

  // Coarse pass (step 2)
  for (let dy = -searchRadiusPx; dy <= searchRadiusPx; dy += 2) {
    for (let dx = -searchRadiusPx; dx <= searchRadiusPx; dx += 2) {
      const score = evaluateZNCC(prevCx + dx, prevCy + dy);
      if (score > bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // Fine pass (step 1 around coarse winner)
  const coarseDx = bestDx;
  const coarseDy = bestDy;
  for (let dy = coarseDy - 2; dy <= coarseDy + 2; dy++) {
    for (let dx = coarseDx - 2; dx <= coarseDx + 2; dx++) {
      const score = evaluateZNCC(prevCx + dx, prevCy + dy);
      if (score > bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // Sub-pixel parabolic refinement
  const left = evaluateZNCC(prevCx + bestDx - 1, prevCy + bestDy);
  const right = evaluateZNCC(prevCx + bestDx + 1, prevCy + bestDy);
  const up = evaluateZNCC(prevCx + bestDx, prevCy + bestDy - 1);
  const down = evaluateZNCC(prevCx + bestDx, prevCy + bestDy + 1);

  const denomX = left - 2 * bestScore + right;
  const denomY = up - 2 * bestScore + down;
  const subX = Math.abs(denomX) > 1e-5 ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denomX)) : 0;
  const subY = Math.abs(denomY) > 1e-5 ? Math.max(-0.5, Math.min(0.5, 0.5 * (up - down) / denomY)) : 0;

  const finalDx = bestDx + subX;
  const finalDy = bestDy + subY;
  const nextX = Math.max(0.02, Math.min(0.98, (prevCx + finalDx) / w));
  const nextY = Math.max(0.02, Math.min(0.98, (prevCy + finalDy) / h));
  const confidence = Math.max(0, Math.min(1, (bestScore + 1) * 0.5));

  return {
    x: Math.round(nextX * 10000) / 10000,
    y: Math.round(nextY * 10000) / 10000,
    confidence: Math.round(confidence * 100) / 100,
    dx: finalDx,
    dy: finalDy,
  };
}

/**
 * Evaluates a tracked path at a given local time using linear interpolation
 * between tracked sample points.
 */
export function evaluateTrackingAtTime(
  points: TrackingPoint[],
  localTime: number
): TrackingPoint | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) return sorted[0];
  if (localTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[i];
    const p1 = sorted[i + 1];
    if (localTime >= p0.time && localTime <= p1.time) {
      const span = p1.time - p0.time;
      const t = span > 1e-6 ? (localTime - p0.time) / span : 0;
      return {
        time: localTime,
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
        scale: p0.scale + (p1.scale - p0.scale) * t,
        rotation: p0.rotation + (p1.rotation - p0.rotation) * t,
        confidence: p0.confidence + (p1.confidence - p0.confidence) * t,
      };
    }
  }
  return sorted[0];
}

/**
 * Converts motion tracking path points into editable Position/Scale/Rotation keyframes
 * centered relative to canvas coordinates (-0.5..+0.5 offset).
 */
export function trackingPointsToKeyframes(points: TrackingPoint[]): {
  positionX: Keyframe[];
  positionY: Keyframe[];
  scaleX: Keyframe[];
  scaleY: Keyframe[];
  rotation: Keyframe[];
} {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  return {
    positionX: sorted.map((p, i) => ({
      id: `tk_px_${i}_${Math.round(p.time * 1000)}`,
      time: p.time,
      value: Math.round((p.x - 0.5) * 1000) / 1000,
      easing: 'linear',
    })),
    positionY: sorted.map((p, i) => ({
      id: `tk_py_${i}_${Math.round(p.time * 1000)}`,
      time: p.time,
      value: Math.round((p.y - 0.5) * 1000) / 1000,
      easing: 'linear',
    })),
    scaleX: sorted.map((p, i) => ({
      id: `tk_sx_${i}_${Math.round(p.time * 1000)}`,
      time: p.time,
      value: p.scale,
      easing: 'linear',
    })),
    scaleY: sorted.map((p, i) => ({
      id: `tk_sy_${i}_${Math.round(p.time * 1000)}`,
      time: p.time,
      value: p.scale,
      easing: 'linear',
    })),
    rotation: sorted.map((p, i) => ({
      id: `tk_rot_${i}_${Math.round(p.time * 1000)}`,
      time: p.time,
      value: p.rotation,
      easing: 'linear',
    })),
  };
}
