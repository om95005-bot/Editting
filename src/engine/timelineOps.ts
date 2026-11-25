import type {
  BeatMarker,
  BeatSyncConfig,
  Clip,
  ExportSettings,
  MaskConfig,
  Project,
  Track,
  TransformState,
  TransitionConfig,
} from '../types/editor';
import { createDefaultSpeedConfig, filterBeatsForSync, generateBeatSyncSpeedCurve } from './speedRemap';
import { upsertKeyframe } from './keyframes';

export function createDefaultTransform(): TransformState {
  return {
    positionX: 0,
    positionY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
  };
}

export function createDefaultMask(): MaskConfig {
  return {
    shape: 'none',
    x: 0.5,
    y: 0.5,
    width: 0.65,
    height: 0.65,
    rotation: 0,
    feather: 8,
    expansion: 0,
    inverted: false,
    points: [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.8, y: 0.75 },
      { x: 0.2, y: 0.75 },
    ],
    chromaKey: {
      enabled: false,
      keyColor: '#00D94A',
      similarity: 0.35,
      smoothness: 0.15,
      spillSuppression: 0.4,
    },
  };
}

export function createDefaultTransition(): TransitionConfig {
  return {
    type: 'none',
    duration: 0.5,
    intensity: 0.75,
    direction: 'left',
    easing: 'easeInOut',
    beatSynced: false,
  };
}

export function createDefaultBeatSyncConfig(): BeatSyncConfig {
  return {
    enabled: false,
    pattern: 'every',
    rampStyle: 'speedUpOnBeat',
    sensitivity: 0.65,
    strengthThreshold: 0.25,
    speedMultiplier: 1.0,
    minSpeed: 0.4,
    maxSpeed: 3.4,
    rampDuration: 0.16,
    rampSmoothness: 0.65,
    curveIntensity: 0.8,
    beatOffsetMs: 0,
    rangeStartSec: 0,
    rangeEndSec: null,
    applyScope: 'selected',
    syncCuts: false,
    syncTransitions: false,
    syncZoom: true,
    syncKeyframes: false,
  };
}

export function createDefaultExportSettings(): ExportSettings {
  return {
    resolution: '1080p',
    fps: 60,
    codec: 'H.264',
    videoBitrateMbps: 18,
    audioBitrateKbps: 256,
    audioCodec: 'AAC',
    format: 'MP4',
  };
}

export function createDefaultTracks(): Track[] {
  return [
    { id: 'track_video_main', name: 'Main Video', type: 'video', muted: false, locked: false, visible: true, height: 64 },
    { id: 'track_overlay_1', name: 'Overlay / PiP', type: 'overlay', muted: false, locked: false, visible: true, height: 50 },
    { id: 'track_text_1', name: 'Text & Subtitles', type: 'text', muted: false, locked: false, visible: true, height: 42 },
    { id: 'track_effect_1', name: 'Adjustment / FX', type: 'adjustment', muted: false, locked: false, visible: true, height: 38 },
    { id: 'track_audio_1', name: 'Audio & Music', type: 'audio', muted: false, locked: false, visible: true, height: 54 },
  ];
}

export function computeProjectDuration(clips: Clip[]): number {
  if (clips.length === 0) return 0;
  return clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
}

export function snapTimeToTargets(
  rawTime: number,
  targets: number[],
  thresholdSec = 0.12
): { time: number; snapped: boolean; snappedTo?: number } {
  let closest = rawTime;
  let minDiff = thresholdSec;
  let snapped = false;
  let snappedTo: number | undefined;

  for (const t of targets) {
    const diff = Math.abs(rawTime - t);
    if (diff < minDiff) {
      minDiff = diff;
      closest = t;
      snapped = true;
      snappedTo = t;
    }
  }
  return { time: Math.max(0, Math.round(closest * 1000) / 1000), snapped, snappedTo };
}

/**
 * Splits a clip at `splitTime` (global timeline time) into two clips,
 * preserving trimmed source bounds, effects, keyframes, and speed curve segments.
 */
export function splitClipAtTime(clips: Clip[], clipId: string, splitTime: number): Clip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return clips;
  const clip = clips[idx];
  const localSplit = splitTime - clip.startTime;
  if (localSplit <= 0.1 || localSplit >= clip.duration - 0.1) {
    return clips;
  }

  const ratio = localSplit / clip.duration;
  const leftDuration = Math.round(localSplit * 1000) / 1000;
  const rightDuration = Math.round((clip.duration - leftDuration) * 1000) / 1000;

  // Partition keyframes accurately across left and right clips
  const leftKeyframes: Clip['keyframes'] = {};
  const rightKeyframes: Clip['keyframes'] = {};
  for (const [prop, list] of Object.entries(clip.keyframes)) {
    if (!list) continue;
    const kProp = prop as keyof Clip['keyframes'];
    leftKeyframes[kProp] = list.filter((k) => k.time <= leftDuration).map((k) => ({ ...k }));
    rightKeyframes[kProp] = list
      .filter((k) => k.time >= leftDuration)
      .map((k) => ({
        ...k,
        id: `${k.id}_r`,
        time: Math.round((k.time - leftDuration) * 1000) / 1000,
      }));
  }

  const leftClip: Clip = {
    ...clip,
    duration: leftDuration,
    keyframes: leftKeyframes,
  };

  const rightClip: Clip = {
    ...clip,
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    startTime: Math.round((clip.startTime + leftDuration) * 1000) / 1000,
    duration: rightDuration,
    sourceStart: Math.round((clip.sourceStart + clip.duration * ratio) * 1000) / 1000,
    keyframes: rightKeyframes,
    effects: clip.effects.map((e) => ({
      ...e,
      instanceId: `${e.instanceId}_r`,
      params: { ...e.params },
    })),
    speed: {
      ...clip.speed,
      curvePoints: clip.speed.curvePoints.map((p) => ({ ...p })),
    },
    mask: {
      ...clip.mask,
      points: clip.mask.points.map((pt) => ({ ...pt })),
      chromaKey: { ...clip.mask.chromaKey },
    },
    transitionIn: { ...clip.transitionIn },
  };

  const next = [...clips];
  next.splice(idx, 1, leftClip, rightClip);
  return next;
}

/**
 * Trims either the left or right edge of a clip while keeping source offsets valid.
 */
export function trimClipEdge(
  clips: Clip[],
  clipId: string,
  edge: 'left' | 'right',
  newGlobalTime: number,
  minDuration = 0.2
): Clip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    if (edge === 'left') {
      const maxStart = clip.startTime + clip.duration - minDuration;
      const clampedStart = Math.max(0, Math.min(maxStart, newGlobalTime));
      const delta = clampedStart - clip.startTime;
      const nextSourceStart = Math.max(0, Math.min(clip.sourceDuration - minDuration, clip.sourceStart + delta));
      const appliedDelta = nextSourceStart - clip.sourceStart;
      return {
        ...clip,
        startTime: Math.round((clip.startTime + appliedDelta) * 1000) / 1000,
        duration: Math.max(minDuration, Math.round((clip.duration - appliedDelta) * 1000) / 1000),
        sourceStart: Math.round(nextSourceStart * 1000) / 1000,
      };
    } else {
      const maxDur = clip.kind === 'image' || clip.kind === 'text' || clip.kind === 'adjustment' || clip.kind === 'sticker'
        ? 120
        : Math.max(minDuration, (clip.sourceDuration - clip.sourceStart) / Math.max(0.1, clip.speed.constantSpeed) * 4);
      const nextDur = Math.max(minDuration, Math.min(maxDur, newGlobalTime - clip.startTime));
      return {
        ...clip,
        duration: Math.round(nextDur * 1000) / 1000,
      };
    }
  });
}

export function duplicateClips(clips: Clip[], selectedIds: string[]): { clips: Clip[]; newIds: string[] } {
  const newClips: Clip[] = [];
  const newIds: string[] = [];

  for (const id of selectedIds) {
    const src = clips.find((c) => c.id === id);
    if (!src) continue;
    const dupId = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    newIds.push(dupId);
    newClips.push({
      ...structuredClone(src),
      id: dupId,
      name: `${src.name} Copy`,
      startTime: Math.round((src.startTime + src.duration) * 1000) / 1000,
    });
  }

  return { clips: [...clips, ...newClips], newIds };
}

export function deleteClips(clips: Clip[], selectedIds: string[]): Clip[] {
  const set = new Set(selectedIds);
  return clips.filter((c) => !set.has(c.id));
}

export function moveClip(
  clips: Clip[],
  clipId: string,
  newStartTime: number,
  newTrackId?: string
): Clip[] {
  return clips.map((c) => {
    if (c.id !== clipId) return c;
    return {
      ...c,
      startTime: Math.max(0, Math.round(newStartTime * 1000) / 1000),
      trackId: newTrackId ?? c.trackId,
    };
  });
}

/**
 * Applies full Beat Sync automation to target video/image clips:
 * 1) Generates beat-synced Speed Curves
 * 2) Optionally splits clips on beats (syncCuts)
 * 3) Optionally places beat-synced Transitions (syncTransitions)
 * 4) Optionally injects beat-synced Zoom keyframes (syncZoom / syncKeyframes)
 */
export function applyBeatSyncToProject(
  project: Project,
  beats: BeatMarker[],
  selectedClipIds: string[],
  scopeOverride?: 'selected' | 'all'
): Project {
  const effectiveScope = scopeOverride ?? project.beatSync.applyScope;
  const cfg = { ...project.beatSync, applyScope: effectiveScope };
  const targetFilter = (c: Clip) =>
    (c.kind === 'video' || c.kind === 'image') &&
    (effectiveScope === 'all' || selectedClipIds.includes(c.id));

  let updatedClips = project.clips.map((clip) => {
    if (!targetFilter(clip)) return clip;

    const curvePoints = generateBeatSyncSpeedCurve(beats, clip.startTime, clip.duration, cfg);
    let nextKeyframes = { ...clip.keyframes };

    if (cfg.syncZoom || cfg.syncKeyframes) {
      const filteredBeats = filterBeatsForSync(beats, cfg, clip.startTime, clip.duration);
      let sx = nextKeyframes.scaleX ? [...nextKeyframes.scaleX] : [];
      let sy = nextKeyframes.scaleY ? [...nextKeyframes.scaleY] : [];
      for (const b of filteredBeats) {
        const localT = b.time - clip.startTime;
        if (localT < 0.05 || localT > clip.duration - 0.05) continue;
        const punch = 1 + (b.isStrong ? 0.16 : 0.09) * cfg.curveIntensity;
        sx = upsertKeyframe(sx, Math.max(0, localT - 0.08), 1, 'easeIn');
        sx = upsertKeyframe(sx, localT, Math.round(punch * 100) / 100, 'easeOut');
        sx = upsertKeyframe(sx, Math.min(clip.duration, localT + 0.18), 1, 'smooth');
        sy = upsertKeyframe(sy, Math.max(0, localT - 0.08), 1, 'easeIn');
        sy = upsertKeyframe(sy, localT, Math.round(punch * 100) / 100, 'easeOut');
        sy = upsertKeyframe(sy, Math.min(clip.duration, localT + 0.18), 1, 'smooth');
      }
      nextKeyframes = { ...nextKeyframes, scaleX: sx, scaleY: sy };
    }

    return {
      ...clip,
      speed: {
        ...clip.speed,
        mode: 'curve' as const,
        presetId: 'custom' as const,
        curvePoints,
        beatSynced: true,
      },
      keyframes: nextKeyframes,
    };
  });

  // Optionally split clips at filtered beat timestamps and attach beat transitions
  if (cfg.syncCuts) {
    const targetsToCut = updatedClips.filter(targetFilter);
    for (const target of targetsToCut) {
      const cutBeats = filterBeatsForSync(beats, cfg, target.startTime, target.duration);
      let currentClips = updatedClips;
      for (const beat of cutBeats) {
        const piece = currentClips.find(
          (c) =>
            c.trackId === target.trackId &&
            beat.time > c.startTime + 0.35 &&
            beat.time < c.startTime + c.duration - 0.35
        );
        if (piece) {
          currentClips = splitClipAtTime(currentClips, piece.id, beat.time);
        }
      }
      updatedClips = currentClips;
    }
  }

  if (cfg.syncTransitions) {
    updatedClips = updatedClips.map((clip, idx) => {
      if ((clip.kind === 'video' || clip.kind === 'image') && idx > 0) {
        return {
          ...clip,
          transitionIn: {
            type: idx % 2 === 0 ? 'zoomIn' : 'whipPan',
            duration: Math.max(0.2, Math.min(0.5, cfg.rampDuration * 1.8)),
            intensity: 0.85,
            direction: 'left',
            easing: 'easeOut',
            beatSynced: true,
          },
        };
      }
      return clip;
    });
  }

  return {
    ...project,
    updatedAt: Date.now(),
    beatSync: { ...cfg, enabled: true },
    clips: updatedClips,
  };
}

export function formatTimecode(seconds: number, showFrames = false, fps = 30): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (!showFrames) return `${mm}:${ss}`;
  const ff = String(Math.floor((safe % 1) * fps)).padStart(2, '0');
  return `${mm}:${ss}:${ff}`;
}

export function getAspectDimensions(
  aspectRatio: Project['aspectRatio'],
  baseShortEdge = 720,
  customW = 1080,
  customH = 1920
): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: baseShortEdge, height: Math.round((baseShortEdge * 16) / 9) };
    case '16:9':
      return { width: Math.round((baseShortEdge * 16) / 9), height: baseShortEdge };
    case '1:1':
      return { width: baseShortEdge, height: baseShortEdge };
    case '4:5':
      return { width: baseShortEdge, height: Math.round((baseShortEdge * 5) / 4) };
    case 'custom': {
      const ratio = Math.max(0.25, Math.min(4, customW / Math.max(1, customH)));
      return ratio >= 1
        ? { width: Math.round(baseShortEdge * ratio), height: baseShortEdge }
        : { width: baseShortEdge, height: Math.round(baseShortEdge / ratio) };
    }
  }
}
