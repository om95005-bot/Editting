import type {
  Clip,
  EffectInstance,
  MaskConfig,
  MediaAsset,
  Project,
  SyntheticSceneType,
  TransitionConfig,
} from '../types/editor';
import { evaluateClipTransform, evaluateEasing, evaluateKeyframeTrack, makeEffectParamKeyframeKey } from './keyframes';
import { evaluateTrackingAtTime } from './motionTracking';
import { evaluateSpeedAtNormalizedTime, mapLocalTimeToSourceTime } from './speedRemap';

export function resolveKeyframedEffects(clip: Clip, localTime: number): EffectInstance[] {
  if (clip.effects.length === 0) return clip.effects;
  return clip.effects.map((fx) => {
    let changed = false;
    const nextParams: Record<string, number> = { ...fx.params };
    for (const key of Object.keys(fx.params)) {
      const kfKey = makeEffectParamKeyframeKey(fx.instanceId, key);
      const track = clip.keyframes[kfKey];
      if (track && track.length > 0) {
        nextParams[key] = evaluateKeyframeTrack(track, localTime, fx.params[key]);
        changed = true;
      }
    }
    return changed ? { ...fx, params: nextParams } : fx;
  });
}

export interface MediaSourceRegistry {
  videos: Map<string, HTMLVideoElement>;
  images: Map<string, HTMLImageElement>;
}

/**
 * Draws rich, deterministic, high-contrast procedural motion footage for built-in
 * offline studio scenes (used when user creates from built-in footage or tests
 * tracking/sharpening/speed ramping without uploading external files).
 */
export function renderSyntheticScene(
  ctx: CanvasRenderingContext2D,
  scene: SyntheticSceneType,
  width: number,
  height: number,
  sourceTime: number
): void {
  const t = sourceTime;
  ctx.save();

  if (scene === 'neonOrbit' || scene === 'goldenStudio') {
    // Deep studio backdrop with sweeping architectural light planes
    const bg = ctx.createLinearGradient(0, 0, width, height);
    if (scene === 'goldenStudio') {
      bg.addColorStop(0, '#0D0B07');
      bg.addColorStop(0.5, '#1D160A');
      bg.addColorStop(1, '#09090B');
    } else {
      bg.addColorStop(0, '#070B14');
      bg.addColorStop(0.5, '#121826');
      bg.addColorStop(1, '#0A0810');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Fine architectural perspective grid (great for sharpening, structure & clarity verification)
    ctx.strokeStyle = scene === 'goldenStudio' ? 'rgba(212,175,55,0.16)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const horizonY = height * 0.62;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(width * 0.5 + i * width * 0.04, horizonY);
      ctx.lineTo(width * 0.5 + i * width * 0.28, height);
      ctx.stroke();
    }
    for (let r = 0; r < 10; r++) {
      const z = ((r / 10) + (t * 0.45) % 0.1);
      const y = horizonY + Math.pow(z, 1.8) * (height - horizonY);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Trackable hero moving subject (high-contrast metallic emblem + geometric rings)
    const cx = width * (0.5 + 0.24 * Math.sin(t * 1.45));
    const cy = height * (0.42 + 0.14 * Math.cos(t * 1.05));
    const rad = Math.min(width, height) * (0.14 + 0.02 * Math.sin(t * 2.5));

    // Ambient halo
    const glow = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad * 2.4);
    glow.addColorStop(0, scene === 'goldenStudio' ? 'rgba(212,175,55,0.42)' : 'rgba(240,210,100,0.35)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Rotating crystalline core (sharp crisp edges for motion tracking & sharpening)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.85);
    const bodyGrad = ctx.createLinearGradient(-rad, -rad, rad, rad);
    bodyGrad.addColorStop(0, '#FFF4CC');
    bodyGrad.addColorStop(0.45, '#D4AF37');
    bodyGrad.addColorStop(1, '#5E450B');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = (k * Math.PI) / 3;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // Inner precision crosshair & concentric ring
    ctx.strokeStyle = '#080808';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-rad * 0.7, 0);
    ctx.lineTo(rad * 0.7, 0);
    ctx.moveTo(0, -rad * 0.7);
    ctx.lineTo(0, rad * 0.7);
    ctx.stroke();
    ctx.restore();

    // Orbiting speed beacons (visual cue for speed ramping!)
    for (let s = 0; s < 5; s++) {
      const ang = t * 2.2 + (s * Math.PI * 2) / 5;
      const bx = width * 0.5 + Math.cos(ang) * width * 0.36;
      const by = height * 0.45 + Math.sin(ang * 1.3) * height * 0.22;
      ctx.fillStyle = s % 2 === 0 ? '#FFFFFF' : '#D4AF37';
      ctx.beginPath();
      ctx.arc(bx, by, 5 + (s % 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp fine-detail studio timecode bars at top/bottom margins
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 18; i++) {
      const barH = 6 + ((Math.sin(t * 5 + i * 0.7) + 1) * 10);
      ctx.fillRect(width * 0.1 + i * (width * 0.8 / 18), height * 0.86 - barH, 3, barH);
    }
  } else if (scene === 'urbanDrift') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0C121D');
    sky.addColorStop(0.55, '#2A1D12');
    sky.addColorStop(1, '#0A0A0D');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Parallax city skyline silhouettes
    for (let layer = 0; layer < 3; layer++) {
      const speed = (layer + 1) * 35;
      const baseY = height * (0.48 + layer * 0.1);
      ctx.fillStyle = layer === 0 ? '#161B24' : layer === 1 ? '#11141B' : '#08090C';
      for (let b = -1; b < 10; b++) {
        const bw = width * 0.14;
        const bx = ((b * bw - (t * speed) % bw) + width + bw) % (width + bw) - bw;
        const bh = height * (0.14 + ((b * 37 + layer * 19) % 10) * 0.022);
        ctx.fillRect(bx, baseY - bh, bw - 4, bh + height * 0.35);
        // Lit windows
        ctx.fillStyle = 'rgba(240, 210, 100, 0.45)';
        for (let wy = baseY - bh + 10; wy < baseY; wy += 14) {
          for (let wx = bx + 6; wx < bx + bw - 12; wx += 10) {
            if (((Math.floor(wx + wy + b)) % 3) === 0) {
              ctx.fillRect(wx, wy, 4, 6);
            }
          }
        }
        ctx.fillStyle = layer === 0 ? '#161B24' : layer === 1 ? '#11141B' : '#08090C';
      }
    }

    // Moving high-speed tail light ribbons
    const carX = width * (0.5 + 0.3 * Math.sin(t * 1.9));
    const carY = height * 0.74;
    ctx.fillStyle = '#E53935';
    ctx.fillRect(carX - 42, carY, 26, 8);
    ctx.fillRect(carX + 16, carY, 26, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(carX - 36, carY + 2, 14, 3);
    ctx.fillRect(carX + 22, carY + 2, 14, 3);
  } else if (scene === 'chromaticPrism') {
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, width, height);
    const colors = ['#D4AF37', '#FFFFFF', '#4A90E2', '#E06C75', '#2EC4B6'];
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(t * 0.6 * (i % 2 === 0 ? 1 : -1) + i * 0.5);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 4;
      const sz = Math.min(width, height) * (0.14 + i * 0.08);
      ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
  } else {
    // portraitLight — clean editorial studio portrait silhouette & fine hair/fabric lines
    const grad = ctx.createRadialGradient(width * 0.5, height * 0.35, 10, width * 0.5, height * 0.5, height * 0.7);
    grad.addColorStop(0, '#3D311E');
    grad.addColorStop(0.5, '#19140E');
    grad.addColorStop(1, '#080808');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const headX = width * (0.5 + 0.04 * Math.sin(t * 1.2));
    const headY = height * 0.36;
    const headR = Math.min(width, height) * 0.16;

    // Warm rim light portrait form
    const skin = ctx.createLinearGradient(headX - headR, headY - headR, headX + headR, headY + headR);
    skin.addColorStop(0, '#E8C49A');
    skin.addColorStop(0.55, '#B7845A');
    skin.addColorStop(1, '#4C321F');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(headX, headY, headR * 0.82, headR, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoulders
    ctx.fillStyle = '#1E1A16';
    ctx.beginPath();
    ctx.ellipse(headX, headY + headR * 2.1, headR * 2.2, headR * 1.4, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Subtle fabric texture lines for sharpening/clarity check
    ctx.strokeStyle = 'rgba(212,175,55,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(headX + i * 16, headY + headR * 1.15);
      ctx.lineTo(headX + i * 24, height);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Separable horizontal+vertical box blur used for Unsharp Mask, Structure,
 * Clarity, Local Contrast, and Gaussian approximation.
 */
function boxBlurLuma(luma: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.min(12, Math.round(radius)));
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = luma[row] * (r + 1);
    for (let x = 1; x <= r; x++) acc += luma[row + Math.min(w - 1, x)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * inv;
      const addX = Math.min(w - 1, x + r + 1);
      const subX = Math.max(0, x - r);
      acc += luma[row + addX] - luma[row + subX];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let acc = tmp[x] * (r + 1);
    for (let y = 1; y <= r; y++) acc += tmp[Math.min(h - 1, y) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * inv;
      const addY = Math.min(h - 1, y + r + 1);
      const subY = Math.max(0, y - r);
      acc += tmp[addY * w + x] - tmp[subY * w + x];
    }
  }

  return out;
}

function sample3DLut(
  r: number,
  g: number,
  b: number,
  lutData: number[],
  lutSize: number
): [number, number, number] {
  const maxIdx = lutSize - 1;
  const ri = Math.min(maxIdx, Math.max(0, Math.round((r / 255) * maxIdx)));
  const gi = Math.min(maxIdx, Math.max(0, Math.round((g / 255) * maxIdx)));
  const bi = Math.min(maxIdx, Math.max(0, Math.round((b / 255) * maxIdx)));
  const offset = (bi * lutSize * lutSize + gi * lutSize + ri) * 3;
  return [
    clampByte((lutData[offset] ?? r / 255) * 255),
    clampByte((lutData[offset + 1] ?? g / 255) * 255),
    clampByte((lutData[offset + 2] ?? b / 255) * 255),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clampByte(hue2rgb(p, q, h + 1 / 3) * 255),
    clampByte(hue2rgb(p, q, h) * 255),
    clampByte(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Applies EVERY active effect in `effects` to actual canvas pixel data.
 */
export function applyEffectsPipeline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effects: EffectInstance[],
  localTime: number,
  keyframeOverrides?: { brightness?: number; contrast?: number; blur?: number; sharpen?: number }
): void {
  const active = effects.filter((e) => e.enabled);
  const kfBright = keyframeOverrides?.brightness ?? 0;
  const kfContrast = keyframeOverrides?.contrast ?? 0;
  const kfBlur = keyframeOverrides?.blur ?? 0;
  const kfSharpen = keyframeOverrides?.sharpen ?? 0;

  if (active.length === 0 && kfBright === 0 && kfContrast === 0 && kfBlur === 0 && kfSharpen === 0) {
    return;
  }

  // First handle fast canvas-level blur / zoom / motion-graphics overlays
  if (kfBlur > 0.2) {
    ctx.save();
    ctx.filter = `blur(${kfBlur}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
  }

  for (const fx of active) {
    const p = fx.params;
    if (fx.effectId === 'gaussianBlur' && (p.radius ?? 0) > 0) {
      ctx.save();
      ctx.filter = `blur(${p.radius}px)`;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    } else if (fx.effectId === 'directionalBlur' || fx.effectId === 'motionBlur') {
      const dist = fx.effectId === 'directionalBlur' ? (p.distance ?? 10) : ((p.strength ?? 45) * 0.22);
      const rad = ((p.angle ?? 0) * Math.PI) / 180;
      const steps = 6;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      snap.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalAlpha = 1 / steps;
      for (let i = 1; i <= steps; i++) {
        const frac = (i / steps - 0.5) * dist;
        ctx.drawImage(snap, Math.cos(rad) * frac, Math.sin(rad) * frac);
      }
      ctx.restore();
    } else if (fx.effectId === 'zoomBlur' || fx.effectId === 'radialBlur') {
      const strength = (p.strength ?? p.amount ?? 35) / 100;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      snap.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      const samples = 5;
      for (let i = 1; i <= samples; i++) {
        ctx.save();
        ctx.globalAlpha = 0.22 * strength;
        ctx.translate(width / 2, height / 2);
        if (fx.effectId === 'zoomBlur') {
          const sc = 1 + (i / samples) * 0.14 * strength;
          ctx.scale(sc, sc);
        } else {
          ctx.rotate((i / samples) * 0.12 * strength * (i % 2 === 0 ? 1 : -1));
        }
        ctx.drawImage(snap, -width / 2, -height / 2);
        ctx.restore();
      }
      ctx.restore();
    } else if (fx.effectId === 'lensBlur') {
      const blurPx = p.radius ?? 6;
      const focusY = ((p.focusY ?? 50) / 100) * height;
      const blurred = document.createElement('canvas');
      blurred.width = width;
      blurred.height = height;
      const bctx = blurred.getContext('2d');
      if (bctx) {
        bctx.filter = `blur(${blurPx}px)`;
        bctx.drawImage(ctx.canvas, 0, 0);
        // Mask top and bottom out-of-focus regions
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.drawImage(blurred, 0, 0, width, Math.max(1, focusY - height * 0.18), 0, 0, width, Math.max(1, focusY - height * 0.18));
        const botStart = Math.min(height - 1, focusY + height * 0.18);
        ctx.drawImage(blurred, 0, botStart, width, height - botStart, 0, botStart, width, height - botStart);
        ctx.restore();
      }
    } else if (fx.effectId === 'pixelate') {
      const size = Math.max(2, Math.round(p.size ?? 10));
      const sw = Math.max(1, Math.floor(width / size));
      const sh = Math.max(1, Math.floor(height / size));
      const tmp = document.createElement('canvas');
      tmp.width = sw;
      tmp.height = sh;
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.drawImage(ctx.canvas, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, width, height);
        ctx.restore();
      }
    } else if (fx.effectId === 'motionTrails') {
      const copies = Math.max(2, Math.round(p.copies ?? 4));
      const decay = (p.decay ?? 55) / 100;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      snap.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 1; i <= copies; i++) {
        ctx.globalAlpha = (decay * 0.35) / i;
        ctx.drawImage(snap, -i * 7 * Math.cos(localTime * 3), -i * 4 * Math.sin(localTime * 2));
      }
      ctx.restore();
    } else if (fx.effectId === 'glow') {
      const intensity = (p.intensity ?? 55) / 100;
      const rad = p.radius ?? 12;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      const sctx = snap.getContext('2d');
      if (sctx) {
        sctx.filter = `blur(${rad}px) brightness(${1 + intensity * 0.6})`;
        sctx.drawImage(ctx.canvas, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = intensity * 0.65;
        ctx.drawImage(snap, 0, 0);
        ctx.restore();
      }
    } else if (fx.effectId === 'lightLeaks') {
      const intensity = (p.intensity ?? 50) / 100;
      const spd = p.speed ?? 1.2;
      const lx = width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(localTime * spd)));
      const ly = height * (0.25 + 0.4 * (0.5 + 0.5 * Math.cos(localTime * spd * 0.7)));
      const g = ctx.createRadialGradient(lx, ly, 5, lx, ly, Math.max(width, height) * 0.65);
      g.addColorStop(0, `rgba(255, 215, 110, ${0.7 * intensity})`);
      g.addColorStop(0.45, `rgba(212, 130, 35, ${0.35 * intensity})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (fx.effectId === 'particles') {
      const count = Math.round(p.density ?? 45);
      const sz = p.size ?? 3;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < count; i++) {
        const seed = i * 97.13;
        const px = ((Math.sin(seed) * 0.5 + 0.5) * width + localTime * (15 + (i % 7) * 8)) % width;
        const py = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * height - localTime * (22 + (i % 5) * 10) + height * 10) % height;
        const alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(localTime * 3 + seed));
        ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(212,175,55,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, sz * (0.5 + (i % 3) * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (fx.effectId === 'flash') {
      const intensity = (p.intensity ?? 65) / 100;
      const rate = p.rate ?? 2;
      const phase = (localTime * rate) % 1;
      const pulse = Math.max(0, 1 - phase * 4.5) * intensity;
      if (pulse > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 252, 240, ${pulse * 0.85})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } else if (fx.effectId === 'velocityFx') {
      const intensity = (p.intensity ?? 50) / 100;
      const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(212,175,55,${0.28 * intensity})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (fx.effectId === 'gradientOverlay') {
      const opacity = (p.opacity ?? 45) / 100;
      const rad = ((p.angle ?? 135) * Math.PI) / 180;
      const dx = Math.cos(rad) * width * 0.5;
      const dy = Math.sin(rad) * height * 0.5;
      const [rA, gA, bA] = hslToRgb(((p.hueA ?? 44) % 360) / 360, 0.78, 0.54);
      const [rB, gB, bB] = hslToRgb(((p.hueB ?? 220) % 360) / 360, 0.72, 0.42);
      const grad = ctx.createLinearGradient(width * 0.5 - dx, height * 0.5 - dy, width * 0.5 + dx, height * 0.5 + dy);
      grad.addColorStop(0, `rgba(${rA},${gA},${bA},${opacity})`);
      grad.addColorStop(1, `rgba(${rB},${gB},${bB},${opacity})`);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (fx.effectId === 'echo') {
      const copies = Math.max(2, Math.round(p.copies ?? 4));
      const spread = p.spread ?? 14;
      const decay = (p.decay ?? 62) / 100;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      snap.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 1; i <= copies; i++) {
        ctx.save();
        ctx.globalAlpha = Math.pow(decay, i) * 0.6;
        const sc = 1 + i * 0.035;
        ctx.translate(width * 0.5 + Math.cos(localTime * 2 + i) * spread * i * 0.45, height * 0.5 + Math.sin(localTime * 1.6 + i) * spread * i * 0.35);
        ctx.scale(sc, sc);
        ctx.drawImage(snap, -width * 0.5, -height * 0.5);
        ctx.restore();
      }
      ctx.restore();
    } else if (fx.effectId === 'trails') {
      const len = Math.max(2, Math.round(p.length ?? 7));
      const intensity = (p.intensity ?? 60) / 100;
      const rad = ((p.angle ?? 15) * Math.PI) / 180;
      const snap = document.createElement('canvas');
      snap.width = width;
      snap.height = height;
      snap.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighten';
      for (let i = 1; i <= len; i++) {
        ctx.globalAlpha = intensity * (1 - i / (len + 1)) * 0.55;
        ctx.drawImage(snap, -Math.cos(rad) * i * 4.5, -Math.sin(rad) * i * 4.5);
      }
      ctx.restore();
    }
  }

  // Pixel-level passes: Color, Distortion, Stylize Shaders, Sharpening & Structure Engine
  const needsPixelPass =
    kfBright !== 0 ||
    kfContrast !== 0 ||
    kfSharpen > 0 ||
    active.some((e) =>
      e.category === 'color' ||
      e.category === 'sharpen' ||
      e.category === 'stylize' ||
      e.effectId === 'chromaticAberration' ||
      e.effectId === 'glitch' ||
      e.effectId === 'waveDistortion' ||
      e.effectId === 'ripple' ||
      e.effectId === 'displacement'
    );

  if (!needsPixelPass) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1) Color & Adjustment effects
  let brightDelta = kfBright * 2.1;
  let contrastFactor = kfContrast !== 0 ? (259 * (kfContrast + 255)) / (255 * (259 - kfContrast)) : 1;
  let exposureGain = 1;
  let satDelta = 0;
  let vibDelta = 0;
  let tempDelta = 0;
  let tintDelta = 0;
  let highlightsDelta = 0;
  let shadowsDelta = 0;
  let rgbR = 1, rgbG = 1, rgbB = 1;
  let hslHue = 0, hslSat = 0, hslLight = 0;
  let curveBlacks = 0, curveMids = 0, curveWhites = 0;
  let gradeShadowHue = 0, gradeHighlightHue = 0, gradeIntensity = 0;
  let lutEffect: EffectInstance | null = null;

  for (const fx of active) {
    const p = fx.params;
    switch (fx.effectId) {
      case 'brightness': brightDelta += (p.amount ?? 0) * 2.2; break;
      case 'contrast': {
        const c = (p.amount ?? 0) * 1.8;
        contrastFactor *= (259 * (c + 255)) / (255 * (259 - c));
        break;
      }
      case 'exposure': exposureGain *= Math.pow(2, p.ev ?? 0); break;
      case 'saturation': satDelta += (p.amount ?? 0) / 100; break;
      case 'vibrance': vibDelta += (p.amount ?? 0) / 100; break;
      case 'temperature': tempDelta += (p.kelvin ?? 0) * 0.7; break;
      case 'tint': tintDelta += (p.amount ?? 0) * 0.6; break;
      case 'highlights': highlightsDelta += (p.amount ?? 0) * 0.85; break;
      case 'shadows': shadowsDelta += (p.amount ?? 0) * 0.85; break;
      case 'rgbAdjust':
        rgbR *= 1 + (p.red ?? 0) / 100;
        rgbG *= 1 + (p.green ?? 0) / 100;
        rgbB *= 1 + (p.blue ?? 0) / 100;
        break;
      case 'hslAdjust':
        hslHue += (p.hue ?? 0) / 360;
        hslSat += (p.sat ?? 0) / 100;
        hslLight += (p.light ?? 0) / 100;
        break;
      case 'colorCurves':
        curveBlacks += p.blacks ?? 0;
        curveMids += p.midtones ?? 0;
        curveWhites += p.whites ?? 0;
        break;
      case 'colorGrading':
        gradeShadowHue = (p.shadowHue ?? 215) / 360;
        gradeHighlightHue = (p.highlightHue ?? 42) / 360;
        gradeIntensity = (p.intensity ?? 40) / 100;
        break;
      case 'lutApply':
        lutEffect = fx;
        break;
    }
  }

  const hasColorWork =
    brightDelta !== 0 || contrastFactor !== 1 || exposureGain !== 1 ||
    satDelta !== 0 || vibDelta !== 0 || tempDelta !== 0 || tintDelta !== 0 ||
    highlightsDelta !== 0 || shadowsDelta !== 0 || rgbR !== 1 || rgbG !== 1 || rgbB !== 1 ||
    hslHue !== 0 || hslSat !== 0 || hslLight !== 0 ||
    curveBlacks !== 0 || curveMids !== 0 || curveWhites !== 0 ||
    gradeIntensity > 0 || lutEffect !== null;

  if (hasColorWork) {
    const [shR, shG, shB] = gradeIntensity > 0 ? hslToRgb(gradeShadowHue, 0.7, 0.5) : [0, 0, 0];
    const [hiR, hiG, hiB] = gradeIntensity > 0 ? hslToRgb(gradeHighlightHue, 0.7, 0.5) : [0, 0, 0];

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * exposureGain * rgbR + tempDelta + brightDelta;
      let g = data[i + 1] * exposureGain * rgbG - tintDelta * 0.5 + brightDelta;
      let b = data[i + 2] * exposureGain * rgbB - tempDelta + tintDelta * 0.5 + brightDelta;

      if (contrastFactor !== 1) {
        r = (r - 128) * contrastFactor + 128;
        g = (g - 128) * contrastFactor + 128;
        b = (b - 128) * contrastFactor + 128;
      }

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const normL = Math.max(0, Math.min(1, luma / 255));

      if (highlightsDelta !== 0 && normL > 0.5) {
        const w = (normL - 0.5) * 2;
        const d = highlightsDelta * w;
        r += d; g += d; b += d;
      }
      if (shadowsDelta !== 0 && normL < 0.5) {
        const w = (0.5 - normL) * 2;
        const d = shadowsDelta * w;
        r += d; g += d; b += d;
      }

      if (curveBlacks !== 0 || curveMids !== 0 || curveWhites !== 0) {
        const shW = Math.pow(1 - normL, 2);
        const hiW = Math.pow(normL, 2);
        const midW = 4 * normL * (1 - normL);
        const d = curveBlacks * shW + curveMids * midW + curveWhites * hiW;
        r += d; g += d; b += d;
      }

      if (satDelta !== 0 || vibDelta !== 0) {
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const curSat = maxC > 0 ? (maxC - minC) / maxC : 0;
        const totalSat = 1 + satDelta + vibDelta * (1 - curSat);
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * totalSat;
        g = gray + (g - gray) * totalSat;
        b = gray + (b - gray) * totalSat;
      }

      if (hslHue !== 0 || hslSat !== 0 || hslLight !== 0) {
        const [h, s, l] = rgbToHsl(clampByte(r), clampByte(g), clampByte(b));
        const [nr, ng, nb] = hslToRgb(
          (h + hslHue + 1) % 1,
          Math.max(0, Math.min(1, s + hslSat)),
          Math.max(0, Math.min(1, l + hslLight))
        );
        r = nr; g = ng; b = nb;
      }

      if (gradeIntensity > 0) {
        const mixSh = (1 - normL) * gradeIntensity * 0.35;
        const mixHi = normL * gradeIntensity * 0.35;
        r = r * (1 - mixSh - mixHi) + shR * mixSh + hiR * mixHi;
        g = g * (1 - mixSh - mixHi) + shG * mixSh + hiG * mixHi;
        b = b * (1 - mixSh - mixHi) + shB * mixSh + hiB * mixHi;
      }

      if (lutEffect) {
        const strength = (lutEffect.params.strength ?? 80) / 100;
        let lr = r, lg = g, lb = b;
        if (lutEffect.lutData && lutEffect.lutSize) {
          [lr, lg, lb] = sample3DLut(clampByte(r), clampByte(g), clampByte(b), lutEffect.lutData, lutEffect.lutSize);
        } else {
          const preset = Math.round(lutEffect.params.preset ?? 0);
          if (preset === 0) {
            // Gold Noir
            lr = r * 1.08 + 8; lg = g * 1.02 + 2; lb = b * 0.84 - 6;
          } else if (preset === 1) {
            // Teal & Amber
            lr = normL > 0.45 ? r * 1.15 : r * 0.85;
            lg = g * 1.02;
            lb = normL < 0.5 ? b * 1.18 + 10 : b * 0.86;
          } else if (preset === 2) {
            // Fuji Crisp 400
            lr = r * 1.02; lg = g * 1.07 + 4; lb = b * 1.05 + 6;
          } else if (preset === 3) {
            // Bleach Bypass
            const gr = 0.299 * r + 0.587 * g + 0.114 * b;
            lr = (gr * 0.55 + r * 0.45 - 128) * 1.35 + 128;
            lg = (gr * 0.55 + g * 0.45 - 128) * 1.35 + 128;
            lb = (gr * 0.55 + b * 0.45 - 128) * 1.35 + 128;
          } else {
            // Obsidian Monochrome
            const gr = (0.299 * r + 0.587 * g + 0.114 * b - 128) * 1.25 + 128;
            lr = gr * 1.03; lg = gr * 1.0; lb = gr * 0.94;
          }
        }
        r = r + (lr - r) * strength;
        g = g + (lg - g) * strength;
        b = b + (lb - b) * strength;
      }

      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
    }
  }

  // 2) Sharpening & Structure Engine (edge-aware, halo-clamped, noise-gated)
  const sharpenFxList = active.filter((e) => e.category === 'sharpen');
  if (sharpenFxList.length > 0 || kfSharpen > 0) {
    const pixelCount = width * height;
    const luma = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      luma[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    }

    const deltaLuma = new Float32Array(pixelCount);

    if (kfSharpen > 0) {
      const blur1 = boxBlurLuma(luma, width, height, 1);
      const gain = (kfSharpen / 100) * 1.4;
      for (let i = 0; i < pixelCount; i++) {
        const diff = luma[i] - blur1[i];
        if (Math.abs(diff) > 3) deltaLuma[i] += Math.max(-28, Math.min(28, diff * gain));
      }
    }

    for (const fx of sharpenFxList) {
      const p = fx.params;
      if (fx.effectId === 'noiseReduction' || fx.effectId === 'denoising') {
        const strength = (p.strength ?? 45) / 100;
        const edgeGuard = (p.preserveEdge ?? 65) * 0.45 + 8;
        const smoothed = boxBlurLuma(luma, width, height, 2);
        for (let i = 0; i < pixelCount; i++) {
          const diff = smoothed[i] - luma[i];
          if (Math.abs(diff) < edgeGuard) {
            deltaLuma[i] += diff * strength;
          }
        }
      } else {
        const radius =
          fx.effectId === 'clarity' || fx.effectId === 'localContrast'
            ? (p.radius ?? 5)
            : fx.effectId === 'structure'
              ? (p.detail ?? 3)
              : fx.effectId === 'fineDetailRecovery' || fx.effectId === 'texture'
                ? 1
                : (p.radius ?? 2);
        const blurred = boxBlurLuma(luma, width, height, radius);
        const threshold = p.threshold ?? 4;
        const rawStrength =
          fx.effectId === 'unsharpMask'
            ? (p.amount ?? 85) / 60
            : fx.effectId === 'smartSharpen'
              ? (p.strength ?? 75) / 55
              : fx.effectId === 'selectiveSharpening'
                ? (p.amount ?? 70) / 55
                : (p.intensity ?? p.strength ?? p.amount ?? p.detail ?? 45) / 48;

        const haloClamp =
          fx.effectId === 'smartSharpen'
            ? Math.max(10, 42 - (p.haloSuppress ?? 70) * 0.3)
            : 34;

        for (let i = 0; i < pixelCount; i++) {
          const diff = luma[i] - blurred[i];
          if (Math.abs(diff) < threshold) continue;

          let weight = 1;
          if (fx.effectId === 'selectiveSharpening') {
            const norm = luma[i] / 255;
            const shGuard = (p.shadowProtect ?? 60) / 100;
            const hiGuard = (p.highlightProtect ?? 55) / 100;
            if (norm < 0.25) weight *= 1 - shGuard * (1 - norm / 0.25);
            if (norm > 0.75) weight *= 1 - hiGuard * ((norm - 0.75) / 0.25);
          } else if (fx.effectId === 'edgeEnhancement') {
            weight = Math.min(1.3, Math.abs(diff) / Math.max(8, threshold * 2));
          }

          const boost = Math.max(-haloClamp, Math.min(haloClamp, diff * rawStrength * weight));
          deltaLuma[i] += boost;
        }
      }
    }

    // Apply luminance-only delta back to RGB to avoid chromatic noise & color shifts
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      const d = deltaLuma[i];
      if (d !== 0) {
        data[p] = clampByte(data[p] + d);
        data[p + 1] = clampByte(data[p + 1] + d);
        data[p + 2] = clampByte(data[p + 2] + d);
      }
    }
  }

  // 3) Spatial Distortion & Generative Stylize Shader effects
  const spatialFx = active.filter(
    (e) =>
      e.effectId === 'chromaticAberration' ||
      e.effectId === 'glitch' ||
      e.effectId === 'waveDistortion' ||
      e.effectId === 'ripple' ||
      e.effectId === 'displacement' ||
      e.effectId === 'waveWarp' ||
      e.effectId === 'twirl' ||
      e.effectId === 'bulge' ||
      e.effectId === 'mirror' ||
      e.effectId === 'kaleidoscope' ||
      e.effectId === 'tile' ||
      e.effectId === 'halftone' ||
      e.effectId === 'mosaic' ||
      e.effectId === 'posterize' ||
      e.effectId === 'emboss' ||
      e.effectId === 'outline' ||
      e.effectId === 'noise'
  );

  if (spatialFx.length > 0) {
    const srcCopy = new Uint8ClampedArray(data);
    for (const fx of spatialFx) {
      const p = fx.params;
      if (fx.effectId === 'chromaticAberration') {
        const shift = Math.round(p.offset ?? 6);
        for (let y = 0; y < height; y++) {
          const row = y * width;
          for (let x = 0; x < width; x++) {
            const rx = Math.min(width - 1, x + shift);
            const bx = Math.max(0, x - shift);
            const dst = (row + x) * 4;
            data[dst] = srcCopy[(row + rx) * 4];
            data[dst + 2] = srcCopy[(row + bx) * 4 + 2];
          }
        }
      } else if (fx.effectId === 'glitch') {
        const intensity = (p.intensity ?? 45) / 100;
        const freq = p.speed ?? 8;
        const maxShift = Math.round(width * 0.08 * intensity);
        for (let y = 0; y < height; y++) {
          const band = Math.floor(y / 14);
          const trigger = Math.sin(band * 12.9898 + Math.floor(localTime * freq) * 78.233);
          const shift = trigger > 0.65 ? Math.round(Math.sin(band * 4.3 + localTime * 15) * maxShift) : 0;
          if (shift === 0) continue;
          const row = y * width;
          for (let x = 0; x < width; x++) {
            const sx = (x + shift + width) % width;
            const sxR = (x + shift + 4 + width) % width;
            const dst = (row + x) * 4;
            data[dst] = srcCopy[(row + sxR) * 4];
            data[dst + 1] = srcCopy[(row + sx) * 4 + 1];
            data[dst + 2] = srcCopy[(row + sx) * 4 + 2];
          }
        }
      } else if (fx.effectId === 'waveDistortion' || fx.effectId === 'ripple' || fx.effectId === 'displacement') {
        const amp = p.amplitude ?? p.strength ?? 12;
        const freq = p.frequency ?? p.wavelength ?? p.scale ?? 8;
        const cx = width * 0.5;
        const cy = height * 0.5;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let sx = x;
            let sy = y;
            if (fx.effectId === 'waveDistortion') {
              sx = x + Math.sin((y / height) * freq * Math.PI * 2 + localTime * 4) * amp;
            } else if (fx.effectId === 'ripple') {
              const dx = x - cx;
              const dy = y - cy;
              const dist = Math.hypot(dx, dy) + 0.001;
              const wave = Math.sin((dist / Math.max(width, height)) * freq * Math.PI * 2 - localTime * 5) * amp;
              sx = x + (dx / dist) * wave;
              sy = y + (dy / dist) * wave;
            } else {
              sx = x + Math.sin(x * 0.03 * freq + localTime * 2) * amp * 0.7;
              sy = y + Math.cos(y * 0.03 * freq - localTime * 2) * amp * 0.7;
            }
            const ix = Math.max(0, Math.min(width - 1, Math.round(sx)));
            const iy = Math.max(0, Math.min(height - 1, Math.round(sy)));
            const dst = (y * width + x) * 4;
            const src = (iy * width + ix) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'waveWarp') {
        const mag = p.magnitude ?? 16;
        const spacing = Math.max(1, p.spacing ?? 5);
        const rad = ((p.angle ?? 25) * Math.PI) / 180;
        const phase = (p.phase ?? 0) + localTime * 3.5;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const proj = (x * cosA + y * sinA) / Math.max(width, height);
            const disp = Math.sin(proj * spacing * Math.PI * 2 + phase) * mag;
            const ix = Math.max(0, Math.min(width - 1, Math.round(x - sinA * disp)));
            const iy = Math.max(0, Math.min(height - 1, Math.round(y + cosA * disp)));
            const dst = (y * width + x) * 4;
            const src = (iy * width + ix) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'twirl') {
        const maxAngle = ((p.angle ?? 135) * Math.PI) / 180;
        const maxRad = (Math.min(width, height) * 0.5) * ((p.radius ?? 65) / 100);
        const cx = width * 0.5;
        const cy = height * 0.5;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy);
            let ix = x;
            let iy = y;
            if (dist < maxRad && maxRad > 1) {
              const frac = 1 - dist / maxRad;
              const twist = frac * frac * maxAngle;
              const c = Math.cos(twist);
              const s = Math.sin(twist);
              ix = Math.max(0, Math.min(width - 1, Math.round(cx + dx * c - dy * s)));
              iy = Math.max(0, Math.min(height - 1, Math.round(cy + dx * s + dy * c)));
            }
            const dst = (y * width + x) * 4;
            const src = (iy * width + ix) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'bulge') {
        const strength = (p.strength ?? 48) / 100;
        const maxRad = (Math.min(width, height) * 0.5) * ((p.radius ?? 62) / 100);
        const cx = width * 0.5;
        const cy = height * 0.5;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.hypot(dx, dy);
            let ix = x;
            let iy = y;
            if (dist < maxRad && maxRad > 1) {
              const rn = dist / maxRad;
              const scale = strength >= 0
                ? Math.pow(rn, 1 + strength * 0.85) / Math.max(0.0001, rn)
                : Math.pow(rn, 1 / (1 - strength * 0.85)) / Math.max(0.0001, rn);
              ix = Math.max(0, Math.min(width - 1, Math.round(cx + dx * scale)));
              iy = Math.max(0, Math.min(height - 1, Math.round(cy + dy * scale)));
            }
            const dst = (y * width + x) * 4;
            const src = (iy * width + ix) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'mirror') {
        const mode = Math.round(p.mode ?? 0);
        const offX = Math.round(((p.offset ?? 0) / 100) * width);
        const offY = Math.round(((p.offset ?? 0) / 100) * height);
        const midX = Math.max(1, Math.min(width - 2, Math.floor(width * 0.5) + offX));
        const midY = Math.max(1, Math.min(height - 2, Math.floor(height * 0.5) + offY));
        for (let y = 0; y < height; y++) {
          const sy = (mode === 1 || mode === 2) && y > midY ? Math.max(0, Math.min(height - 1, midY - (y - midY))) : y;
          for (let x = 0; x < width; x++) {
            const sx = (mode === 0 || mode === 2) && x > midX ? Math.max(0, Math.min(width - 1, midX - (x - midX))) : x;
            const dst = (y * width + x) * 4;
            const src = (sy * width + sx) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'kaleidoscope') {
        const segs = Math.max(3, Math.round(p.segments ?? 6));
        const rotRad = ((p.rotation ?? 15) * Math.PI) / 180;
        const sector = (Math.PI * 2) / segs;
        const cx = width * 0.5;
        const cy = height * 0.5;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const r = Math.hypot(dx, dy);
            let ang = Math.atan2(dy, dx) + rotRad;
            if (ang < 0) ang += Math.PI * 2;
            let folded = ang % sector;
            if (folded > sector * 0.5) folded = sector - folded;
            const ix = Math.max(0, Math.min(width - 1, Math.round(cx + Math.cos(folded) * r)));
            const iy = Math.max(0, Math.min(height - 1, Math.round(cy + Math.sin(folded) * r)));
            const dst = (y * width + x) * 4;
            const src = (iy * width + ix) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'tile') {
        const count = Math.max(1, Math.round(p.count ?? 2));
        const mirrorEdge = Math.round(p.mirrorEdge ?? 1) === 1;
        for (let y = 0; y < height; y++) {
          const ty = (y * count) / height;
          const fy = ty - Math.floor(ty);
          const cyF = mirrorEdge && Math.floor(ty) % 2 === 1 ? 1 - fy : fy;
          const sy = Math.min(height - 1, Math.floor(cyF * height));
          for (let x = 0; x < width; x++) {
            const tx = (x * count) / width;
            const fxU = tx - Math.floor(tx);
            const cxF = mirrorEdge && Math.floor(tx) % 2 === 1 ? 1 - fxU : fxU;
            const sx = Math.min(width - 1, Math.floor(cxF * width));
            const dst = (y * width + x) * 4;
            const src = (sy * width + sx) * 4;
            data[dst] = srcCopy[src];
            data[dst + 1] = srcCopy[src + 1];
            data[dst + 2] = srcCopy[src + 2];
          }
        }
      } else if (fx.effectId === 'halftone') {
        const pitch = Math.max(3, Math.round(p.dotSize ?? 6));
        const contrast = (p.contrast ?? 115) / 100;
        const half = pitch * 0.5;
        for (let y = 0; y < height; y++) {
          const cy = Math.floor(y / pitch) * pitch + half;
          const sy = Math.min(height - 1, Math.round(cy));
          for (let x = 0; x < width; x++) {
            const cx = Math.floor(x / pitch) * pitch + half;
            const sx = Math.min(width - 1, Math.round(cx));
            const sIdx = (sy * width + sx) * 4;
            const luma = (0.299 * srcCopy[sIdx] + 0.587 * srcCopy[sIdx + 1] + 0.114 * srcCopy[sIdx + 2]) / 255;
            const normL = Math.max(0, Math.min(1, (luma - 0.5) * contrast + 0.5));
            const dist = Math.hypot(x - cx, y - cy);
            const dotR = half * 0.92 * Math.sqrt(normL);
            const dst = (y * width + x) * 4;
            if (dist <= dotR) {
              data[dst] = srcCopy[sIdx];
              data[dst + 1] = srcCopy[sIdx + 1];
              data[dst + 2] = srcCopy[sIdx + 2];
            } else {
              data[dst] = 10;
              data[dst + 1] = 10;
              data[dst + 2] = 12;
            }
          }
        }
      } else if (fx.effectId === 'mosaic') {
        const cell = Math.max(4, Math.round(p.cellSize ?? 12));
        const grout = (p.grout ?? 55) / 100;
        for (let y = 0; y < height; y++) {
          const cy = Math.min(height - 1, Math.floor(y / cell) * cell + Math.floor(cell * 0.5));
          const inYBorder = y % cell === 0;
          for (let x = 0; x < width; x++) {
            const cx = Math.min(width - 1, Math.floor(x / cell) * cell + Math.floor(cell * 0.5));
            const inXBorder = x % cell === 0;
            const dst = (y * width + x) * 4;
            const src = (cy * width + cx) * 4;
            const mult = inXBorder || inYBorder ? 1 - grout * 0.75 : 1;
            data[dst] = clampByte(srcCopy[src] * mult);
            data[dst + 1] = clampByte(srcCopy[src + 1] * mult);
            data[dst + 2] = clampByte(srcCopy[src + 2] * mult);
          }
        }
      } else if (fx.effectId === 'posterize') {
        const levels = Math.max(2, Math.round(p.levels ?? 5));
        const step = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = clampByte(Math.round(srcCopy[i] / step) * step);
          data[i + 1] = clampByte(Math.round(srcCopy[i + 1] / step) * step);
          data[i + 2] = clampByte(Math.round(srcCopy[i + 2] / step) * step);
        }
      } else if (fx.effectId === 'emboss') {
        const strength = ((p.strength ?? 65) / 100) * 1.8;
        const mix = (p.mix ?? 45) / 100;
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const tl = ((y - 1) * width + (x - 1)) * 4;
            const br = ((y + 1) * width + (x + 1)) * 4;
            const dst = (y * width + x) * 4;
            const dr = (srcCopy[br] - srcCopy[tl]) * strength + 128;
            const dg = (srcCopy[br + 1] - srcCopy[tl + 1]) * strength + 128;
            const db = (srcCopy[br + 2] - srcCopy[tl + 2]) * strength + 128;
            const gray = 0.299 * dr + 0.587 * dg + 0.114 * db;
            data[dst] = clampByte(gray * (1 - mix) + (srcCopy[dst] * 0.6 + dr * 0.4) * mix);
            data[dst + 1] = clampByte(gray * (1 - mix) + (srcCopy[dst + 1] * 0.6 + dg * 0.4) * mix);
            data[dst + 2] = clampByte(gray * (1 - mix) + (srcCopy[dst + 2] * 0.6 + db * 0.4) * mix);
          }
        }
      } else if (fx.effectId === 'outline') {
        const thresh = p.threshold ?? 42;
        const mix = (p.mix ?? 80) / 100;
        const gold = (p.goldTint ?? 85) / 100;
        const edgeR = 255 * (1 - gold) + 240 * gold;
        const edgeG = 255 * (1 - gold) + 200 * gold;
        const edgeB = 255 * (1 - gold) + 75 * gold;
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const l = (yy: number, xx: number) => {
              const idx = (yy * width + xx) * 4;
              return 0.299 * srcCopy[idx] + 0.587 * srcCopy[idx + 1] + 0.114 * srcCopy[idx + 2];
            };
            const gx = -l(y - 1, x - 1) + l(y - 1, x + 1) - 2 * l(y, x - 1) + 2 * l(y, x + 1) - l(y + 1, x - 1) + l(y + 1, x + 1);
            const gy = -l(y - 1, x - 1) - 2 * l(y - 1, x) - l(y - 1, x + 1) + l(y + 1, x - 1) + 2 * l(y + 1, x) + l(y + 1, x + 1);
            const mag = Math.hypot(gx, gy);
            const edgeAmt = mag > thresh ? Math.min(1, (mag - thresh) / 90) : 0;
            const dst = (y * width + x) * 4;
            data[dst] = clampByte(srcCopy[dst] * (1 - edgeAmt * mix) + edgeR * edgeAmt * mix);
            data[dst + 1] = clampByte(srcCopy[dst + 1] * (1 - edgeAmt * mix) + edgeG * edgeAmt * mix);
            data[dst + 2] = clampByte(srcCopy[dst + 2] * (1 - edgeAmt * mix) + edgeB * edgeAmt * mix);
          }
        }
      } else if (fx.effectId === 'noise') {
        const amp = ((p.amount ?? 32) / 100) * 68;
        const mono = Math.round(p.monochrome ?? 1) === 1;
        let seed = (Math.floor(localTime * 60) * 2654435761) >>> 0;
        for (let i = 0; i < data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const n1 = ((seed & 0xffff) / 32768 - 1) * amp;
          if (mono) {
            data[i] = clampByte(srcCopy[i] + n1);
            data[i + 1] = clampByte(srcCopy[i + 1] + n1);
            data[i + 2] = clampByte(srcCopy[i + 2] + n1);
          } else {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const n2 = ((seed & 0xffff) / 32768 - 1) * amp;
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const n3 = ((seed & 0xffff) / 32768 - 1) * amp;
            data[i] = clampByte(srcCopy[i] + n1);
            data[i + 1] = clampByte(srcCopy[i + 1] + n2);
            data[i + 2] = clampByte(srcCopy[i + 2] + n3);
          }
        }
      }
      srcCopy.set(data);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Applies Chroma Key (green/blue/custom screen removal) + alpha mask compositing.
 */
function applyMaskAndChroma(
  layerCanvas: HTMLCanvasElement,
  mask: MaskConfig,
  clip: Clip,
  localTime: number
): void {
  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const ctx = layerCanvas.getContext('2d');
  if (!ctx) return;

  // Chroma Key pass
  if (mask.chromaKey.enabled) {
    const [kr, kg, kb] = hexToRgb(mask.chromaKey.keyColor);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const sim = mask.chromaKey.similarity * 220;
    const smooth = Math.max(1, mask.chromaKey.smoothness * 140);
    const spill = mask.chromaKey.spillSuppression;

    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
      if (dist < sim) {
        d[i + 3] = 0;
      } else if (dist < sim + smooth) {
        const alpha = (dist - sim) / smooth;
        d[i + 3] = Math.round(d[i + 3] * alpha);
        if (spill > 0) {
          const avgRB = (d[i] + d[i + 2]) * 0.5;
          if (d[i + 1] > avgRB) {
            d[i + 1] = Math.round(d[i + 1] - (d[i + 1] - avgRB) * spill);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  if (mask.shape === 'none') return;

  const mx = evaluateKeyframeTrack(clip.keyframes.maskX, localTime, mask.x) * w;
  const my = evaluateKeyframeTrack(clip.keyframes.maskY, localTime, mask.y) * h;
  const mw = Math.max(8, evaluateKeyframeTrack(clip.keyframes.maskWidth, localTime, mask.width) * w + mask.expansion * 2);
  const mh = Math.max(8, evaluateKeyframeTrack(clip.keyframes.maskHeight, localTime, mask.height) * h + mask.expansion * 2);
  const feather = evaluateKeyframeTrack(clip.keyframes.maskFeather, localTime, mask.feather);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return;

  mctx.save();
  if (feather > 0) {
    mctx.filter = `blur(${feather * 0.45}px)`;
  }
  mctx.fillStyle = '#FFFFFF';
  mctx.beginPath();

  if (mask.shape === 'rectangle') {
    mctx.translate(mx, my);
    mctx.rotate((mask.rotation * Math.PI) / 180);
    mctx.rect(-mw / 2, -mh / 2, mw, mh);
  } else if (mask.shape === 'circle') {
    mctx.translate(mx, my);
    mctx.rotate((mask.rotation * Math.PI) / 180);
    mctx.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  } else if ((mask.shape === 'freehand' || mask.shape === 'bezier') && mask.points.length >= 3) {
    const pts = mask.points;
    mctx.moveTo(pts[0].x * w, pts[0].y * h);
    if (mask.shape === 'bezier') {
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        const midX = ((p0.x + p1.x) * 0.5) * w;
        const midY = ((p0.y + p1.y) * 0.5) * h;
        mctx.quadraticCurveTo(p0.x * w, p0.y * h, midX, midY);
      }
    } else {
      for (let i = 1; i < pts.length; i++) {
        mctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
    }
    mctx.closePath();
  }
  mctx.fill();
  mctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = mask.inverted ? 'destination-out' : 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

function computeTransitionTransform(
  transition: TransitionConfig,
  localTime: number,
  width: number,
  height: number
): {
  tx: number;
  ty: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blurPx: number;
  flashAlpha: number;
} {
  const neutral = { tx: 0, ty: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blurPx: 0, flashAlpha: 0 };
  if (transition.type === 'none' || localTime >= transition.duration || localTime < 0) {
    return neutral;
  }

  const rawP = Math.max(0, Math.min(1, localTime / Math.max(0.05, transition.duration)));
  const p = evaluateEasing(rawP, transition.easing);
  const inv = 1 - p;
  const k = transition.intensity;

  switch (transition.type) {
    case 'zoomIn':
      return { ...neutral, scaleX: 1 + inv * 1.4 * k, scaleY: 1 + inv * 1.4 * k, opacity: Math.min(1, p * 1.6), blurPx: inv * 10 * k };
    case 'zoomOut':
      return { ...neutral, scaleX: Math.max(0.25, 0.35 + p * 0.65), scaleY: Math.max(0.25, 0.35 + p * 0.65), opacity: p };
    case 'spin':
      return { ...neutral, rotation: inv * 180 * k, scaleX: 0.7 + p * 0.3, scaleY: 0.7 + p * 0.3, blurPx: inv * 8 * k };
    case 'rotation':
      return { ...neutral, rotation: inv * 65 * k, opacity: Math.min(1, p * 1.4) };
    case 'blur':
      return { ...neutral, blurPx: inv * 20 * k, opacity: Math.min(1, 0.3 + p * 0.7) };
    case 'flash':
      return { ...neutral, flashAlpha: Math.sin(rawP * Math.PI) * 0.9 * k };
    case 'shake':
      return {
        ...neutral,
        tx: Math.sin(rawP * 40) * inv * 32 * k,
        ty: Math.cos(rawP * 32) * inv * 22 * k,
      };
    case 'slideLeft':
      return { ...neutral, tx: inv * width };
    case 'pushRight':
      return { ...neutral, tx: -inv * width };
    case 'pullDown':
      return { ...neutral, ty: -inv * height };
    case 'whipPan':
      return { ...neutral, tx: inv * width * 0.85, blurPx: inv * 16 * k };
    case 'motionBlur':
      return { ...neutral, scaleX: 1 + inv * 0.4 * k, blurPx: inv * 18 * k };
    case 'maskWipe':
      return { ...neutral, opacity: Math.min(1, p * 1.5), scaleX: 0.92 + p * 0.08 };
    case 'flip3D':
      return { ...neutral, scaleX: Math.max(0.05, Math.cos(inv * Math.PI * 0.5)), opacity: p };
    default:
      return neutral;
  }
}

/**
 * Composites the complete multitrack timeline at `currentTime` onto `targetCanvas`.
 * Supports Before/After split comparison, motion-tracking attachments, masks,
 * blend modes, transitions, keyframes, speed curves, text/captions, and effects.
 */
export function renderTimelineFrame(
  targetCanvas: HTMLCanvasElement,
  project: Project,
  currentTime: number,
  sources: MediaSourceRegistry,
  options?: {
    proxyScale?: number;
    compareSplit?: number | null; // 0..1 split position for Before/After comparison
    skipEffects?: boolean;
    selectedClipId?: string | null;
    showTrackingOverlay?: boolean;
  }
): void {
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const w = targetCanvas.width;
  const h = targetCanvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Order tracks bottom-to-top: video -> image/overlay -> adjustment/effect -> text
  const trackOrder = ['video', 'image', 'overlay', 'mask', 'adjustment', 'effect', 'text'];
  const visibleTracks = [...project.tracks]
    .filter((t) => t.visible && t.type !== 'audio')
    .sort((a, b) => trackOrder.indexOf(a.type) - trackOrder.indexOf(b.type));

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = w;
  layerCanvas.height = h;
  const lctx = layerCanvas.getContext('2d', { willReadFrequently: true });
  if (!lctx) return;

  // Render helper that optionally skips effects (for Before/After comparison)
  const compositeAll = (destCtx: CanvasRenderingContext2D, disableEffects: boolean) => {
    destCtx.fillStyle = '#000000';
    destCtx.fillRect(0, 0, w, h);

    for (const track of visibleTracks) {
      const activeClips = project.clips.filter(
        (c) =>
          c.trackId === track.id &&
          currentTime >= c.startTime &&
          currentTime <= c.startTime + c.duration
      );

      for (const clip of activeClips) {
        const localTime = Math.max(0, currentTime - clip.startTime);
        const resolvedEffects = resolveKeyframedEffects(clip, localTime);

        // Adjustment layer applies its effects directly onto the composited canvas so far!
        if (clip.kind === 'adjustment' || clip.kind === 'effect') {
          if (!disableEffects) {
            applyEffectsPipeline(destCtx, w, h, resolvedEffects, localTime);
          }
          continue;
        }

        lctx.clearRect(0, 0, w, h);

        // Draw media content onto layerCanvas
        if (clip.kind === 'video' || clip.kind === 'image') {
          const asset: MediaAsset | undefined = project.assets[clip.assetId];
          const effectiveSpeed =
            clip.speed.mode === 'constant' && clip.keyframes.speed && clip.keyframes.speed.length > 0
              ? {
                  ...clip.speed,
                  constantSpeed: Math.max(
                    0.1,
                    Math.min(10, evaluateKeyframeTrack(clip.keyframes.speed, localTime, clip.speed.constantSpeed))
                  ),
                }
              : clip.speed;
          const sourceTime = mapLocalTimeToSourceTime(
            localTime,
            clip.duration,
            clip.sourceStart,
            clip.sourceDuration,
            effectiveSpeed
          );

          if (asset?.syntheticScene) {
            renderSyntheticScene(lctx, asset.syntheticScene, w, h, sourceTime);
          } else if (clip.kind === 'video') {
            const vid = sources.videos.get(clip.assetId);
            if (vid && vid.readyState >= 2) {
              // Cover-fit video into frame
              const vw = vid.videoWidth || w;
              const vh = vid.videoHeight || h;
              const scale = Math.max(w / vw, h / vh);
              const dw = vw * scale;
              const dh = vh * scale;
              lctx.drawImage(vid, (w - dw) / 2, (h - dh) / 2, dw, dh);
            } else {
              renderSyntheticScene(lctx, 'goldenStudio', w, h, sourceTime);
            }
          } else if (clip.kind === 'image') {
            const img = sources.images.get(clip.assetId);
            if (img && img.complete && img.naturalWidth > 0) {
              const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
              const dw = img.naturalWidth * scale;
              const dh = img.naturalHeight * scale;
              lctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
            } else {
              renderSyntheticScene(lctx, 'portraitLight', w, h, localTime);
            }
          }

          // Apply Clip Effects (unless Before comparison)
          if (!disableEffects) {
            const kfOverrides = {
              brightness: evaluateKeyframeTrack(clip.keyframes.brightness, localTime, 0),
              contrast: evaluateKeyframeTrack(clip.keyframes.contrast, localTime, 0),
              blur: evaluateKeyframeTrack(clip.keyframes.blur, localTime, 0),
              sharpen: evaluateKeyframeTrack(clip.keyframes.sharpen, localTime, 0),
            };
            applyEffectsPipeline(lctx, w, h, resolvedEffects, localTime, kfOverrides);
          }
        } else if (clip.kind === 'text' && clip.text) {
          const txt = clip.text;
          const fontSize = evaluateKeyframeTrack(clip.keyframes.textSize, localTime, txt.fontSize) * (w / 480);
          lctx.save();
          lctx.font = `${txt.italic ? 'italic ' : ''}${txt.bold ? '700 ' : '500 '}${Math.round(fontSize)}px "${txt.fontFamily}", sans-serif`;
          lctx.textAlign = txt.align;
          lctx.textBaseline = 'middle';
          const tx = txt.align === 'left' ? w * 0.12 : txt.align === 'right' ? w * 0.88 : w * 0.5;
          const ty = txt.isCaption ? h * 0.82 : h * 0.5;

          const lines = txt.content.split('\n');
          const lineH = fontSize * 1.25;
          const totalH = lines.length * lineH;

          if (txt.backgroundColor && txt.backgroundColor !== 'transparent') {
            const maxLineW = Math.max(...lines.map((l) => lctx.measureText(l).width));
            lctx.fillStyle = txt.backgroundColor;
            const padX = fontSize * 0.45;
            const padY = fontSize * 0.28;
            const bx = txt.align === 'left' ? tx - padX : txt.align === 'right' ? tx - maxLineW - padX : tx - maxLineW / 2 - padX;
            lctx.beginPath();
            lctx.roundRect(bx, ty - totalH / 2 - padY, maxLineW + padX * 2, totalH + padY * 2, 10);
            lctx.fill();
          }

          lines.forEach((line, idx) => {
            const ly = ty - totalH / 2 + lineH * (idx + 0.5);
            if (txt.strokeWidth > 0) {
              lctx.strokeStyle = txt.strokeColor;
              lctx.lineWidth = txt.strokeWidth * (w / 480);
              lctx.strokeText(line, tx, ly);
            }
            lctx.fillStyle = txt.color;
            lctx.fillText(line, tx, ly);
          });
          lctx.restore();
          if (!disableEffects && resolvedEffects.length > 0) {
            applyEffectsPipeline(lctx, w, h, resolvedEffects, localTime);
          }
        } else if (clip.kind === 'sticker') {
          lctx.save();
          lctx.font = `${Math.round(w * 0.22)}px sans-serif`;
          lctx.textAlign = 'center';
          lctx.textBaseline = 'middle';
          lctx.fillText(clip.stickerGlyph ?? '★', w * 0.5, h * 0.5);
          lctx.restore();
          if (!disableEffects && resolvedEffects.length > 0) {
            applyEffectsPipeline(lctx, w, h, resolvedEffects, localTime);
          }
        }

        // Apply Mask & Chroma Key
        if (!disableEffects) {
          applyMaskAndChroma(layerCanvas, clip.mask, clip, localTime);
        }

        // Evaluate Transform + Keyframes + Motion-Graphics dynamic offsets + Tracking Attachment
        const tf = evaluateClipTransform(clip, localTime);
        let dynTx = tf.positionX * w;
        let dynTy = tf.positionY * h;
        let dynSx = tf.scaleX;
        let dynSy = tf.scaleY;
        let dynRot = tf.rotation;

        // If attached to another clip's motion tracker, inherit tracked delta!
        if (clip.attachedToTrackClipId) {
          const host = project.clips.find((c) => c.id === clip.attachedToTrackClipId);
          if (host?.tracking && host.tracking.points.length > 0) {
            const hostLocal = currentTime - host.startTime;
            const pt = evaluateTrackingAtTime(host.tracking.points, hostLocal);
            if (pt) {
              if (host.tracking.trackPosition) {
                dynTx += (pt.x - 0.5) * w;
                dynTy += (pt.y - 0.5) * h;
              }
              if (host.tracking.trackScale) {
                dynSx *= pt.scale;
                dynSy *= pt.scale;
              }
              if (host.tracking.trackRotation) {
                dynRot += pt.rotation;
              }
            }
          }
        }

        // Dynamic motion-graphics effects (cameraShake, zoomPulse, rotationSpin, smoothZoom, transform3D)
        if (!disableEffects) {
          for (const fx of resolvedEffects) {
            if (!fx.enabled) continue;
            const p = fx.params;
            if (fx.effectId === 'cameraShake') {
              const amp = ((p.intensity ?? 35) / 100) * 18;
              const freq = p.frequency ?? 12;
              dynTx += Math.sin(localTime * freq * 1.7) * amp;
              dynTy += Math.cos(localTime * freq * 1.3) * amp;
              dynRot += Math.sin(localTime * freq) * (amp * 0.18);
            } else if (fx.effectId === 'zoomPulse') {
              const depth = ((p.amount ?? 28) / 100) * 0.35;
              const rate = p.rate ?? 2;
              const z = 1 + depth * Math.pow(0.5 + 0.5 * Math.sin(localTime * rate * Math.PI * 2), 2);
              dynSx *= z; dynSy *= z;
            } else if (fx.effectId === 'rotationSpin') {
              dynRot += Math.sin(localTime * (p.speed ?? 1.5) * Math.PI) * (p.angle ?? 18);
            } else if (fx.effectId === 'smoothZoom') {
              const prog = Math.min(1, localTime / Math.max(0.1, clip.duration));
              const eased = prog * prog * (3 - 2 * prog);
              const z = 1 + ((p.scale ?? 1.28) - 1) * eased;
              dynSx *= z; dynSy *= z;
            } else if (fx.effectId === 'transform3D') {
              const txRad = ((p.tiltX ?? 14) * Math.PI) / 180;
              const tyRad = ((p.tiltY ?? -10) * Math.PI) / 180;
              dynSx *= Math.max(0.4, Math.cos(tyRad));
              dynSy *= Math.max(0.4, Math.cos(txRad));
              dynRot += (p.tiltY ?? 0) * 0.25;
            }
          }
        }

        // Transition In
        const tr = computeTransitionTransform(clip.transitionIn, localTime, w, h);

        destCtx.save();
        destCtx.globalAlpha = Math.max(0, Math.min(1, tf.opacity * tr.opacity));
        destCtx.globalCompositeOperation = clip.blendMode;
        if (tr.blurPx > 0.5) {
          destCtx.filter = `blur(${tr.blurPx}px)`;
        }

        const ax = tf.anchorX * w;
        const ay = tf.anchorY * h;
        destCtx.translate(ax + dynTx + tr.tx, ay + dynTy + tr.ty);
        destCtx.rotate(((dynRot + tr.rotation) * Math.PI) / 180);
        destCtx.scale(dynSx * tr.scaleX, dynSy * tr.scaleY);

        // Apply Crop rectangle
        const cropL = tf.cropLeft * w;
        const cropR = tf.cropRight * w;
        const cropT = tf.cropTop * h;
        const cropB = tf.cropBottom * h;
        const cw = Math.max(4, w - cropL - cropR);
        const ch = Math.max(4, h - cropT - cropB);

        destCtx.drawImage(layerCanvas, cropL, cropT, cw, ch, -ax + cropL, -ay + cropT, cw, ch);
        destCtx.restore();

        if (tr.flashAlpha > 0.01) {
          destCtx.save();
          destCtx.fillStyle = `rgba(255,255,255,${tr.flashAlpha})`;
          destCtx.fillRect(0, 0, w, h);
          destCtx.restore();
        }
      }
    }
  };

  if (options?.compareSplit !== null && options?.compareSplit !== undefined) {
    // Render Before (left) and After (right) split comparison
    const splitX = Math.round(w * Math.max(0.05, Math.min(0.95, options.compareSplit)));
    const afterCanvas = document.createElement('canvas');
    afterCanvas.width = w;
    afterCanvas.height = h;
    const actx = afterCanvas.getContext('2d', { willReadFrequently: true });

    compositeAll(ctx, true); // Before (unprocessed)
    if (actx) {
      compositeAll(actx, false); // After (with effects)
      ctx.drawImage(afterCanvas, splitX, 0, w - splitX, h, splitX, 0, w - splitX, h);
    }

    // Gold split divider line
    ctx.save();
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, h);
    ctx.stroke();

    ctx.fillStyle = 'rgba(8,8,8,0.75)';
    ctx.fillRect(10, 12, 62, 22);
    ctx.fillRect(w - 64, 12, 54, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 11px "DM Sans", sans-serif';
    ctx.fillText('BEFORE', 18, 27);
    ctx.fillStyle = '#D4AF37';
    ctx.fillText('AFTER', w - 55, 27);
    ctx.restore();
  } else {
    compositeAll(ctx, Boolean(options?.skipEffects));
  }

  // Draw live motion tracking overlay path & tracker box if tracking tool is active
  if (options?.showTrackingOverlay && options.selectedClipId) {
    const sel = project.clips.find((c) => c.id === options.selectedClipId);
    if (sel?.tracking && currentTime >= sel.startTime && currentTime <= sel.startTime + sel.duration) {
      const trk = sel.tracking;
      const localT = currentTime - sel.startTime;
      const cur = evaluateTrackingAtTime(trk.points, localT);

      ctx.save();
      // Draw tracking path polyline
      if (trk.points.length > 1) {
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        trk.points.forEach((pt, idx) => {
          const px = pt.x * w;
          const py = pt.y * h;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        trk.points.forEach((pt) => {
          ctx.fillStyle = pt.confidence >= 0.7 ? '#D4AF37' : '#EF4444';
          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (cur) {
        const bx = cur.x * w;
        const by = cur.y * h;
        const bw = trk.boxWidth * w;
        const bh = trk.boxHeight * h;
        const confColor = cur.confidence >= 0.72 ? '#D4AF37' : cur.confidence >= 0.45 ? '#F59E0B' : '#EF4444';

        ctx.strokeStyle = confColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(bx - 10, by);
        ctx.lineTo(bx + 10, by);
        ctx.moveTo(bx, by - 10);
        ctx.lineTo(bx, by + 10);
        ctx.stroke();

        ctx.fillStyle = 'rgba(8,8,8,0.82)';
        ctx.fillRect(bx - bw / 2, by - bh / 2 - 20, 96, 18);
        ctx.fillStyle = confColor;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText(`CONF ${Math.round(cur.confidence * 100)}%`, bx - bw / 2 + 6, by - bh / 2 - 7);
      }
      ctx.restore();
    }
  }
}

export function getSpeedReadoutAtTime(clip: Clip, currentTime: number): number {
  const localTime = Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));
  const u = clip.duration > 0 ? localTime / clip.duration : 0;
  return evaluateSpeedAtNormalizedTime(clip.speed, u);
}
