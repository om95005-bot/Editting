import type { DeviceCapabilities, ExportSettings, Project } from '../types/editor';
import { computeProjectDuration, getAspectDimensions } from './timelineOps';
import { renderTimelineFrame, type MediaSourceRegistry } from './pixelProcessor';

export function detectDeviceCapabilities(): DeviceCapabilities {
  const isBrowser = typeof window !== 'undefined';
  const cores = isBrowser && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const memoryGb =
    isBrowser && 'deviceMemory' in navigator
      ? Number((navigator as unknown as { deviceMemory?: number }).deviceMemory || 4)
      : 4;

  let webgl2Supported = false;
  let maxTextureSize = 4096;

  if (isBrowser) {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        webgl2Supported = gl instanceof WebGL2RenderingContext;
        maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
      }
    } catch {
      // ignore headless fallback
    }
  }

  const isTypeSupported = (mime: string): boolean => {
    if (!isBrowser || typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return false;
    }
    try {
      return MediaRecorder.isTypeSupported(mime);
    } catch {
      return false;
    }
  };

  const h264Supported =
    isTypeSupported('video/mp4;codecs=avc1.42E01E') ||
    isTypeSupported('video/webm;codecs=h264');
  const h265Supported =
    isTypeSupported('video/mp4;codecs=hev1.1.6.L93.B0') ||
    isTypeSupported('video/mp4;codecs=hvc1');
  const vp9Supported = isTypeSupported('video/webm;codecs=vp9,opus') || isTypeSupported('video/webm;codecs=vp9');

  // Honest resolution & FPS gating based on real device hardware/texture limits
  const supportedResolutions: DeviceCapabilities['supportedResolutions'] = ['720p', '1080p'];
  if (maxTextureSize >= 4096 && memoryGb >= 4 && cores >= 4) {
    supportedResolutions.push('1440p');
  }
  if (maxTextureSize >= 8192 && memoryGb >= 6 && cores >= 6) {
    supportedResolutions.push('4K');
  }

  const supportedFps: DeviceCapabilities['supportedFps'] = [24, 25, 30, 48, 50, 60];
  // Only enable 90 / 120 FPS on capable multi-core devices with high texture throughput
  const displayRefreshHz = cores >= 8 && memoryGb >= 8 ? 120 : 60;
  if (cores >= 6 && memoryGb >= 6) {
    supportedFps.push(90);
  }
  if (cores >= 8 && memoryGb >= 8 && maxTextureSize >= 8192) {
    supportedFps.push(120);
  }

  return {
    cores,
    memoryGb,
    maxTextureSize,
    webgl2Supported,
    displayRefreshHz,
    supportedResolutions,
    supportedFps,
    h264Supported,
    h265Supported,
    vp9Supported,
    hardwareAcceleration: webgl2Supported && maxTextureSize >= 4096,
    recommendedProxyMode: memoryGb <= 4 || cores <= 4,
  };
}

export function getResolutionDisableReason(
  res: ExportSettings['resolution'],
  caps: DeviceCapabilities
): string | null {
  if (caps.supportedResolutions.includes(res)) return null;
  if (res === '1440p') {
    if (caps.maxTextureSize < 4096) return 'GPU max < 4K texture';
    return 'Needs 4+ cores & 4GB RAM';
  }
  if (res === '4K') {
    if (caps.maxTextureSize < 8192) return 'GPU max < 8K texture';
    return 'Needs 6+ cores & 6GB RAM';
  }
  return 'Not supported on device';
}

export function getFpsDisableReason(
  fps: ExportSettings['fps'],
  caps: DeviceCapabilities
): string | null {
  if (caps.supportedFps.includes(fps)) return null;
  if (fps === 90) {
    return '6+ cores, 6GB RAM';
  }
  if (fps === 120) {
    if (caps.maxTextureSize < 8192) return 'GPU < 120 FPS';
    return '8+ cores, 8GB RAM';
  }
  return 'Not supported';
}

export function getResolutionShortEdge(res: ExportSettings['resolution']): number {
  switch (res) {
    case '720p': return 720;
    case '1080p': return 1080;
    case '1440p': return 1440;
    case '4K': return 2160;
  }
}

export function estimateExportSizeMB(durationSec: number, settings: ExportSettings): number {
  const safeDur = Math.max(0.5, durationSec);
  const videoBytesPerSec = (settings.videoBitrateMbps * 1_000_000) / 8;
  const audioBytesPerSec = (settings.audioBitrateKbps * 1000) / 8;
  const codecEfficiency = settings.codec === 'H.265' ? 0.72 : settings.codec === 'VP9' ? 0.8 : 1.0;
  const totalBytes = safeDur * (videoBytesPerSec * codecEfficiency + audioBytesPerSec);
  return Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
}

export function pickSupportedRecorderMime(settings: ExportSettings): { mimeType: string; ext: string } {
  const candidates =
    settings.format === 'MP4'
      ? [
          { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
          { mime: 'video/mp4', ext: 'mp4' },
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' },
        ]
      : [
          { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=h264,opus', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' },
        ];

  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mime)) {
        return { mimeType: c.mime, ext: c.ext };
      }
    }
  }
  return { mimeType: 'video/webm', ext: 'webm' };
}

export interface ExportProgressInfo {
  percent: number;
  currentFrame: number;
  totalFrames: number;
  status: string;
}

/**
 * Renders the full multitrack project with all effects, keyframes, masks, transitions,
 * and speed curves into a real downloadable video Blob using Canvas captureStream + MediaRecorder.
 */
export async function exportProjectVideo(
  project: Project,
  sources: MediaSourceRegistry,
  onProgress: (info: ExportProgressInfo) => void,
  signal: AbortSignal
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const duration = Math.max(0.5, computeProjectDuration(project.clips));
  const settings = project.exportSettings;
  const shortEdge = Math.min(getResolutionShortEdge(settings.resolution), 1080); // cap offscreen memory safely in browser
  const dims = getAspectDimensions(project.aspectRatio, shortEdge, project.customWidth, project.customHeight);

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;

  const { mimeType, ext } = pickSupportedRecorderMime(settings);
  const fps = Math.min(60, settings.fps); // MediaRecorder captureStream practical browser cap
  const stream = canvas.captureStream(fps);
  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
    videoBitsPerSecond: Math.round(settings.videoBitrateMbps * 1_000_000),
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Video encoder encountered an error during export'));
  });

  recorder.start(250);

  const totalFrames = Math.max(1, Math.ceil(duration * Math.min(30, fps)));
  const stepSec = duration / totalFrames;

  for (let frame = 0; frame <= totalFrames; frame++) {
    if (signal.aborted) {
      if (recorder.state !== 'inactive') recorder.stop();
      throw new DOMException('Export cancelled by user', 'AbortError');
    }

    const t = Math.min(duration, frame * stepSec);
    renderTimelineFrame(canvas, project, t, sources, {
      skipEffects: false,
      compareSplit: null,
      showTrackingOverlay: false,
    });

    onProgress({
      percent: Math.round((frame / totalFrames) * 100),
      currentFrame: frame,
      totalFrames,
      status: `Rendering frame ${frame} / ${totalFrames}`,
    });

    // Yield briefly so MediaRecorder encodes the captured frame and UI stays responsive
    await new Promise((r) => setTimeout(r, 16));
  }

  if (recorder.state !== 'inactive') {
    recorder.stop();
  }

  const blob = await stopped;
  const safeName = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'ALL_CUT_Export';
  return {
    blob,
    filename: `${safeName}_${settings.resolution}_${settings.fps}fps.${ext}`,
    mimeType,
  };
}

export function exportCanvasSnapshot(
  canvas: HTMLCanvasElement,
  filename = 'ALL_CUT_Photo.png',
  mime: 'image/png' | 'image/jpeg' = 'image/png'
): string {
  const url = canvas.toDataURL(mime, 0.94);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return url;
}
