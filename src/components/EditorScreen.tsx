import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Captions,
  ChevronDown,
  Crosshair,
  Download,
  Gauge,
  Layers,
  Maximize,
  Minimize,
  Monitor,
  Music,
  Pause,
  Play,
  Redo2,
  Scissors,
  Search,
  Shapes,
  Sliders,
  Smile,
  Sparkles,
  SunMedium,
  Type,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  AspectRatioKey,
  BeatAnalysisResult,
  BeatSyncConfig,
  Clip,
  ClipInspectorTab,
  CustomEffectDefinition,
  DeviceCapabilities,
  EditorToolId,
  EffectInstance,
  ExportSettings,
  Project,
  SpeedConfig,
  TrackingPoint,
} from '../types/editor';
import {
  applyBeatSyncToProject,
  computeProjectDuration,
  createDefaultMask,
  createDefaultTransform,
  createDefaultTransition,
  deleteClips,
  duplicateClips,
  getAspectDimensions,
  moveClip,
  splitClipAtTime,
  trimClipEdge,
} from '../engine/timelineOps';
import { createDefaultSpeedConfig } from '../engine/speedRemap';
import { buildInstancesFromCustomEffect } from '../engine/effectsCatalog';
import { detectBeatsFromPCM } from '../engine/beatDetection';
import {
  createBuiltinAudioAsset,
  createBuiltinVideoAsset,
  decodeMediaFileToPCM,
  importLocalMediaFile,
  synthesizeRhythmicPCM,
} from '../engine/mediaGenerator';
import {
  renderTimelineFrame,
  type MediaSourceRegistry,
} from '../engine/pixelProcessor';
import { rgbaToGrayscale, trackPatchInFrame } from '../engine/motionTracking';
import {
  exportCanvasSnapshot,
  getFpsDisableReason,
  getResolutionDisableReason,
} from '../engine/videoExporter';
import { TimelineView } from './TimelineView';
import { EditorToolPanels } from './EditorToolPanels';
import { CoverMakerModal, ExportModal, ShootRecordModal } from './EditorModals';

interface EditorScreenProps {
  project: Project;
  capabilities: DeviceCapabilities;
  initialTool?: EditorToolId | null;
  pcmStore: Map<string, { pcm: Float32Array; sampleRate: number }>;
  proxyEnabled: boolean;
  favoriteEffects: string[];
  customEffects: CustomEffectDefinition[];
  onToggleProxy: () => void;
  onToggleFavoriteEffect: (id: string) => void;
  onSaveProject: (project: Project) => void;
  onSavePreset: (name: string, effects: EffectInstance[]) => void;
  onSaveCustomEffect: (def: CustomEffectDefinition) => void;
  onDeleteCustomEffect: (id: string) => void;
  onRenameCustomEffect: (id: string, name: string) => void;
  onExit: () => void;
}

const ALL_RESOLUTIONS: ExportSettings['resolution'][] = ['720p', '1080p', '1440p', '4K'];
const ALL_FPS: ExportSettings['fps'][] = [24, 25, 30, 48, 50, 60, 90, 120];

// Keyframes now live inside the Clip Inspector & inline diamonds — no separate Keyframe button here
const BOTTOM_TOOLS: {
  id: EditorToolId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresClip: boolean;
}[] = [
  { id: 'edit', label: 'Edit', icon: Scissors, requiresClip: true },
  { id: 'audio', label: 'Audio', icon: Music, requiresClip: false },
  { id: 'text', label: 'Text', icon: Type, requiresClip: false },
  { id: 'effects', label: 'Effects', icon: Sparkles, requiresClip: true },
  { id: 'overlay', label: 'Overlay', icon: Layers, requiresClip: false },
  { id: 'speed', label: 'Speed', icon: Gauge, requiresClip: true },
  { id: 'beatSync', label: 'Beat Sync', icon: Activity, requiresClip: false },
  { id: 'tracking', label: 'Tracking', icon: Crosshair, requiresClip: true },
  { id: 'transition', label: 'Transition', icon: Wand2, requiresClip: true },
  { id: 'mask', label: 'Mask', icon: Shapes, requiresClip: true },
  { id: 'filters', label: 'Filters', icon: SunMedium, requiresClip: true },
  { id: 'adjust', label: 'Adjust', icon: Sliders, requiresClip: true },
  { id: 'sharpen', label: 'Sharpen', icon: Monitor, requiresClip: true },
  { id: 'stickers', label: 'Stickers', icon: Smile, requiresClip: false },
  { id: 'captions', label: 'Captions', icon: Captions, requiresClip: false },
];

export const EditorScreen: React.FC<EditorScreenProps> = ({
  project: initialProject,
  capabilities,
  initialTool = null,
  pcmStore,
  proxyEnabled,
  favoriteEffects,
  customEffects,
  onToggleProxy,
  onToggleFavoriteEffect,
  onSaveProject,
  onSavePreset,
  onSaveCustomEffect,
  onDeleteCustomEffect,
  onRenameCustomEffect,
  onExit,
}) => {
  const [project, setProject] = useState<Project>(initialProject);
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(
    initialProject.clips[0] ? [initialProject.clips[0].id] : []
  );
  const [activeTool, setActiveTool] = useState<EditorToolId | null>(
    initialTool === 'keyframe' ? null : initialTool
  );
  const [inspectorTab, setInspectorTab] = useState<ClipInspectorTab | null>(
    initialTool === 'keyframe' ? 'keyframes' : null
  );
  const [beatSyncSpeedSnapshot, setBeatSyncSpeedSnapshot] = useState<Record<string, SpeedConfig> | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [zoomPps, setZoomPps] = useState(72);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResMenu, setShowResMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [showShootModal, setShowShootModal] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);
  const [isAnalyzingBeats, setIsAnalyzingBeats] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importTargetRef = useRef<'video' | 'image' | 'audio' | 'overlay' | 'replace'>('video');
  const sourcesRef = useRef<MediaSourceRegistry>({ videos: new Map(), images: new Map() });
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const projectRef = useRef(project);
  projectRef.current = project;

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 2400);
  }, []);

  // Push history helper so every timeline & editing operation supports Undo/Redo
  const commitProject = useCallback(
    (updater: (prev: Project) => Project, recordHistory = true) => {
      setProject((prev) => {
        const next = { ...updater(prev), updatedAt: Date.now() };
        if (recordHistory) {
          setUndoStack((st) => [...st.slice(-39), prev]);
          setRedoStack([]);
        }
        return next;
      });
    },
    []
  );

  // Autosave project changes upward
  useEffect(() => {
    const id = window.setTimeout(() => {
      onSaveProject(project);
    }, 450);
    return () => window.clearTimeout(id);
  }, [project, onSaveProject]);

  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setRedoStack((r) => [...r, projectRef.current]);
      setProject(previous);
      return stack.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setUndoStack((u) => [...u, projectRef.current]);
      setProject(next);
      return stack.slice(0, -1);
    });
  }, []);

  // Sync HTMLVideoElement / HTMLImageElement / HTMLAudioElement caches for real assets
  useEffect(() => {
    for (const asset of Object.values(project.assets)) {
      if (asset.kind === 'video' && asset.objectUrl && !sourcesRef.current.videos.has(asset.id)) {
        const v = document.createElement('video');
        v.src = asset.objectUrl;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        sourcesRef.current.videos.set(asset.id, v);
      } else if (asset.kind === 'image' && asset.objectUrl && !sourcesRef.current.images.has(asset.id)) {
        const img = new Image();
        img.src = asset.objectUrl;
        sourcesRef.current.images.set(asset.id, img);
      } else if (asset.kind === 'audio' && asset.objectUrl && !audioElsRef.current.has(asset.id)) {
        const a = new Audio(asset.objectUrl);
        a.preload = 'auto';
        audioElsRef.current.set(asset.id, a);
      }
    }
  }, [project.assets]);

  const totalDuration = useMemo(
    () => Math.max(0.1, computeProjectDuration(project.clips)),
    [project.clips]
  );

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipIds[0]) ?? null,
    [project.clips, selectedClipIds]
  );

  // Preview canvas dimensions (respects Proxy ON/OFF for fast preview rendering)
  const previewDims = useMemo(() => {
    const shortEdge = proxyEnabled ? 270 : 480;
    return getAspectDimensions(project.aspectRatio, shortEdge, project.customWidth, project.customHeight);
  }, [project.aspectRatio, project.customWidth, project.customHeight, proxyEnabled]);

  // Render live frame whenever timeline state or playhead changes
  const drawFrameNow = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      renderTimelineFrame(canvas, projectRef.current, timeSec, sourcesRef.current, {
        compareSplit,
        selectedClipId: selectedClipIds[0] ?? null,
        showTrackingOverlay: activeTool === 'tracking',
      });
    },
    [compareSplit, selectedClipIds, activeTool]
  );

  useEffect(() => {
    drawFrameNow(currentTime);
  }, [project, currentTime, previewDims, compareSplit, activeTool, selectedClipIds, drawFrameNow]);

  // Synchronized playback loop + WebAudio playback
  useEffect(() => {
    if (!isPlaying) {
      audioElsRef.current.forEach((a) => a.pause());
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    let t = currentTime;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      t += dt;
      const maxDur = Math.max(0.5, computeProjectDuration(projectRef.current.clips));
      if (t >= maxDur) {
        t = 0;
      }

      // Sync audio tracks with playhead
      const audioTrackMuted = projectRef.current.tracks.find((tr) => tr.type === 'audio')?.muted ?? false;
      for (const clip of projectRef.current.clips) {
        if (clip.kind !== 'audio') continue;
        const el = audioElsRef.current.get(clip.assetId);
        if (!el) continue;
        const active = !audioTrackMuted && !clip.muted && t >= clip.startTime && t < clip.startTime + clip.duration;
        if (active) {
          el.volume = Math.max(0, Math.min(1, clip.volume));
          const targetAudioTime = clip.sourceStart + (t - clip.startTime);
          if (Math.abs(el.currentTime - targetAudioTime) > 0.22) {
            el.currentTime = targetAudioTime;
          }
          if (el.paused) el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      }

      // Sync HTMLVideoElement playheads for real imported video clips
      for (const clip of projectRef.current.clips) {
        if (clip.kind !== 'video') continue;
        const vid = sourcesRef.current.videos.get(clip.assetId);
        if (!vid || vid.readyState < 2) continue;
        if (t >= clip.startTime && t <= clip.startTime + clip.duration) {
          const targetVidTime = clip.sourceStart + (t - clip.startTime);
          if (Math.abs(vid.currentTime - targetVidTime) > 0.15) {
            vid.currentTime = targetVidTime;
          }
        }
      }

      setCurrentTime(Math.round(t * 1000) / 1000);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioElsRef.current.forEach((a) => a.pause());
    };
  }, [isPlaying]);

  // Keyboard shortcuts (Space play/pause, Ctrl+Z undo, Delete)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 'ArrowLeft') {
        setCurrentTime((t) => Math.max(0, Math.round((t - 1 / project.fps) * 1000) / 1000));
      } else if (e.key === 'ArrowRight') {
        setCurrentTime((t) => Math.min(totalDuration, Math.round((t + 1 / project.fps) * 1000) / 1000));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, project.fps, totalDuration]);

  // Media Import Handler (Storage Access / File Picker)
  const triggerImport = (kind: 'video' | 'image' | 'audio' | 'overlay' | 'replace') => {
    importTargetRef.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.accept =
        kind === 'audio' ? 'audio/*' : kind === 'image' ? 'image/*' : 'video/*,image/*,audio/*';
      fileInputRef.current.click();
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const { asset, pcm, sampleRate } = await importLocalMediaFile(file);
    if (pcm && sampleRate) {
      pcmStore.set(asset.id, { pcm, sampleRate });
    }

    const mode = importTargetRef.current;
    if (mode === 'replace' && selectedClip) {
      commitProject((prev) => ({
        ...prev,
        assets: { ...prev.assets, [asset.id]: asset },
        clips: prev.clips.map((c) =>
          c.id === selectedClip.id
            ? {
                ...c,
                assetId: asset.id,
                name: asset.name,
                kind: asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video',
                sourceStart: 0,
                sourceDuration: asset.duration,
              }
            : c
        ),
      }));
      notify(`Replaced clip media with ${asset.name}`);
      return;
    }

    const targetTrack =
      asset.kind === 'audio'
        ? project.tracks.find((t) => t.type === 'audio')
        : mode === 'overlay'
          ? project.tracks.find((t) => t.type === 'overlay')
          : project.tracks.find((t) => t.type === 'video');

    const trackId = targetTrack?.id ?? project.tracks[0].id;
    const endOfTrack = project.clips
      .filter((c) => c.trackId === trackId)
      .reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);

    const newClip: Clip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId,
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind,
      startTime: asset.kind === 'audio' || mode === 'overlay' ? currentTime : endOfTrack,
      duration: asset.duration,
      sourceStart: 0,
      sourceDuration: asset.duration,
      muted: false,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: mode === 'overlay' ? { ...createDefaultTransform(), scaleX: 0.55, scaleY: 0.55 } : createDefaultTransform(),
      blendMode: 'source-over',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
    };

    commitProject((prev) => ({
      ...prev,
      assets: { ...prev.assets, [asset.id]: asset },
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipIds([newClip.id]);
    notify(`Added ${asset.name} to timeline`);
  };

  const handleAddBuiltinAudio = (bpm: number) => {
    const id = `asset_beat_${bpm}_${Date.now()}`;
    const pkg = createBuiltinAudioAsset(id, `Studio Beat (${bpm} BPM)`, bpm, 12);
    pcmStore.set(pkg.asset.id, { pcm: pkg.pcm, sampleRate: pkg.sampleRate });
    const audioTrack = project.tracks.find((t) => t.type === 'audio') ?? project.tracks[project.tracks.length - 1];
    const newClip: Clip = {
      id: `clip_audio_${Date.now()}`,
      trackId: audioTrack.id,
      assetId: pkg.asset.id,
      name: pkg.asset.name,
      kind: 'audio',
      startTime: 0,
      duration: pkg.asset.duration,
      sourceStart: 0,
      sourceDuration: pkg.asset.duration,
      muted: false,
      volume: 0.9,
      fadeIn: 0.1,
      fadeOut: 0.3,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
    };
    commitProject((prev) => ({
      ...prev,
      assets: { ...prev.assets, [pkg.asset.id]: pkg.asset },
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipIds([newClip.id]);
    notify(`Added ${bpm} BPM track — ready for Detect Beats`);
  };

  // Real offline FFT beat detection on actual PCM samples
  const handleDetectBeats = async (
    audioClipId: string,
    sensitivity: number,
    manualBpm?: number | null
  ) => {
    const clip = project.clips.find((c) => c.id === audioClipId);
    if (!clip) return;
    const asset = project.assets[clip.assetId];
    if (!asset) return;

    setIsAnalyzingBeats(true);
    try {
      let cached = pcmStore.get(asset.id);
      if (!cached) {
        if (asset.syntheticAudioBpm) {
          const sampleRate = 22050;
          const pcm = synthesizeRhythmicPCM(asset.syntheticAudioBpm, asset.duration, sampleRate);
          cached = { pcm, sampleRate };
          pcmStore.set(asset.id, cached);
        } else if (asset.objectUrl) {
          const decoded = await decodeMediaFileToPCM(asset.objectUrl);
          cached = { pcm: decoded.pcm, sampleRate: decoded.sampleRate };
          pcmStore.set(asset.id, cached);
        }
      }
      if (!cached) {
        notify('Unable to decode PCM for this audio clip');
        return;
      }

      const analysis = detectBeatsFromPCM(cached.pcm, cached.sampleRate, {
        sensitivity,
        manualBpmOverride: manualBpm ?? null,
      });

      commitProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => (c.id === audioClipId ? { ...c, beatAnalysis: analysis } : c)),
      }));
      notify(`Detected ${analysis.beats.length} beats at ${analysis.manualBpmOverride ?? analysis.bpm} BPM`);
    } finally {
      setIsAnalyzingBeats(false);
    }
  };

  const handleApplyBeatSync = (scopeOverride?: 'selected' | 'all') => {
    const audioClip = project.clips.find((c) => c.kind === 'audio' && c.beatAnalysis);
    if (!audioClip?.beatAnalysis) {
      notify('Run Detect Beats on an audio track first');
      return;
    }
    const globalBeats = audioClip.beatAnalysis.beats.map((b) => ({
      ...b,
      time: b.time + audioClip.startTime,
    }));
    const targetIds =
      selectedClipIds.length > 0
        ? selectedClipIds
        : project.clips.filter((c) => c.kind === 'video' || c.kind === 'image').map((c) => c.id);

    // Save snapshot of clip speeds before applying Beat Sync so "Undo Beat Sync speed" restores cleanly
    const speedSnap: Record<string, SpeedConfig> = {};
    for (const c of project.clips) {
      speedSnap[c.id] = structuredClone(c.speed);
    }
    setBeatSyncSpeedSnapshot(speedSnap);

    commitProject((prev) => applyBeatSyncToProject(prev, globalBeats, targetIds, scopeOverride));
    notify(
      scopeOverride === 'all'
        ? 'Applied Beat Sync speed curve to all clips'
        : 'Applied Beat Sync speed curve to selected clip'
    );
  };

  const handleUndoBeatSyncSpeed = () => {
    if (!beatSyncSpeedSnapshot) return;
    commitProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        beatSyncSpeedSnapshot[c.id] ? { ...c, speed: structuredClone(beatSyncSpeedSnapshot[c.id]) } : c
      ),
    }));
    setBeatSyncSpeedSnapshot(null);
    notify('Reverted Beat Sync speed curve');
  };

  const handleApplyCustomEffect = (def: CustomEffectDefinition, scope: 'selected' | 'all') => {
    commitProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        const shouldApply =
          scope === 'all'
            ? c.kind === 'video' || c.kind === 'image'
            : selectedClipIds.includes(c.id);
        if (!shouldApply) return c;
        const freshInstances = buildInstancesFromCustomEffect(def);
        return { ...c, effects: [...c.effects, ...freshInstances] };
      }),
    }));
    notify(
      scope === 'all'
        ? `Applied "${def.name}" to all clips`
        : `Applied "${def.name}" to clip`
    );
  };

  const updateExportSettingsTwoWay = (nextSettings: ExportSettings) => {
    commitProject(
      (prev) => ({
        ...prev,
        fps: nextSettings.fps,
        exportSettings: nextSettings,
      }),
      false
    );
  };

  // Real frame-by-frame ZNCC motion tracking on rendered footage
  const handleRunMotionTracking = async (clipId: string, direction: 'forward' | 'backward') => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip?.tracking) return;
    setIsTracking(true);
    setTrackingProgress(0);

    try {
      const trk = clip.tracking;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 240;
      offCanvas.height = Math.round((240 * previewDims.height) / Math.max(1, previewDims.width));
      const octx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!octx) return;

      const localStart = Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));
      const existingAtStart =
        trk.points.reduce(
          (best, p) => (Math.abs(p.time - localStart) < Math.abs(best.time - localStart) ? p : best),
          trk.points[0] ?? { time: localStart, x: 0.5, y: 0.42, scale: 1, rotation: 0, confidence: 1 }
        );

      const stepSec = 0.12;
      const endLocal = direction === 'forward' ? clip.duration : 0;
      const totalSteps = Math.max(1, Math.min(48, Math.ceil(Math.abs(endLocal - localStart) / stepSec)));
      const signedStep = direction === 'forward' ? stepSec : -stepSec;

      const renderAt = (localT: number) => {
        renderTimelineFrame(offCanvas, projectRef.current, clip.startTime + localT, sourcesRef.current, {
          skipEffects: true,
          showTrackingOverlay: false,
        });
        const img = octx.getImageData(0, 0, offCanvas.width, offCanvas.height);
        return rgbaToGrayscale(img.data, offCanvas.width, offCanvas.height);
      };

      let prevFrame = renderAt(localStart);
      let curX = existingAtStart.x;
      let curY = existingAtStart.y;
      const newPoints: TrackingPoint[] = [
        { time: Math.round(localStart * 1000) / 1000, x: curX, y: curY, scale: 1, rotation: 0, confidence: 1 },
      ];

      for (let i = 1; i <= totalSteps; i++) {
        const nextT = Math.max(0, Math.min(clip.duration, localStart + i * signedStep));
        const nextFrame = renderAt(nextT);
        const res = trackPatchInFrame(
          prevFrame,
          nextFrame,
          curX,
          curY,
          trk.boxWidth,
          trk.boxHeight,
          18
        );
        curX = res.x;
        curY = res.y;
        prevFrame = nextFrame;

        newPoints.push({
          time: Math.round(nextT * 1000) / 1000,
          x: curX,
          y: curY,
          scale: 1,
          rotation: 0,
          confidence: res.confidence,
        });

        setTrackingProgress(Math.round((i / totalSteps) * 100));
        if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      const merged = [
        ...trk.points.filter((p) =>
          direction === 'forward' ? p.time < localStart - 0.02 : p.time > localStart + 0.02
        ),
        ...newPoints,
      ].sort((a, b) => a.time - b.time);

      commitProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === clipId && c.tracking ? { ...c, tracking: { ...c.tracking, points: merged } } : c
        ),
      }));
      notify(`Tracked ${newPoints.length} frames (${direction})`);
    } finally {
      setIsTracking(false);
    }
  };

  // Click on Preview Canvas to reposition Motion Tracker target
  const handlePreviewCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'tracking' || !selectedClip) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    const localT = Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime));

    commitProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => {
        if (c.id !== selectedClip.id) return c;
        const baseTrk = c.tracking ?? {
          id: `trk_${Date.now()}`,
          label: 'Track Point 1',
          mode: 'object' as const,
          trackPosition: true,
          trackRotation: false,
          trackScale: false,
          boxWidth: 0.2,
          boxHeight: 0.14,
          points: [],
          attachedClipIds: [],
        };
        const updatedPts = [
          ...baseTrk.points.filter((p) => Math.abs(p.time - localT) > 0.05),
          { time: Math.round(localT * 1000) / 1000, x: nx, y: ny, scale: 1, rotation: 0, confidence: 1, manual: true },
        ].sort((a, b) => a.time - b.time);
        return { ...c, tracking: { ...baseTrk, points: updatedPts } };
      }),
    }));
  };

  const handleAddTextClip = (content: string, isCaption: boolean) => {
    const textTrack = project.tracks.find((t) => t.type === 'text') ?? project.tracks[2];
    const newClip: Clip = {
      id: `clip_txt_${Date.now()}`,
      trackId: textTrack.id,
      assetId: '',
      name: content.slice(0, 18) || 'Text',
      kind: 'text',
      startTime: currentTime,
      duration: 3.5,
      sourceStart: 0,
      sourceDuration: 3.5,
      muted: false,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
      text: {
        content,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: isCaption ? 30 : 48,
        color: isCaption ? '#FFFFFF' : '#F7E396',
        strokeColor: '#080808',
        strokeWidth: 4,
        backgroundColor: isCaption ? 'rgba(8,8,8,0.75)' : 'transparent',
        bold: true,
        italic: false,
        align: 'center',
        letterSpacing: 1,
        isCaption,
      },
    };
    commitProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipIds([newClip.id]);
    setActiveTool(isCaption ? 'captions' : 'text');
  };

  const handleAddStickerClip = (glyph: string) => {
    const overlayTrack = project.tracks.find((t) => t.type === 'overlay') ?? project.tracks[1];
    const newClip: Clip = {
      id: `clip_stk_${Date.now()}`,
      trackId: overlayTrack.id,
      assetId: '',
      name: `Sticker ${glyph}`,
      kind: 'sticker',
      startTime: currentTime,
      duration: 4,
      sourceStart: 0,
      sourceDuration: 4,
      muted: false,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
      stickerGlyph: glyph,
    };
    commitProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipIds([newClip.id]);
  };

  const handleAddBuiltinOverlay = () => {
    const id = `asset_prism_${Date.now()}`;
    const asset = createBuiltinVideoAsset(id, 'Chromatic Prism', 'chromaticPrism', 5);
    const overlayTrack = project.tracks.find((t) => t.type === 'overlay') ?? project.tracks[1];
    const newClip: Clip = {
      id: `clip_ov_${Date.now()}`,
      trackId: overlayTrack.id,
      assetId: asset.id,
      name: asset.name,
      kind: 'video',
      startTime: currentTime,
      duration: 5,
      sourceStart: 0,
      sourceDuration: 5,
      muted: true,
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
      transform: { ...createDefaultTransform(), scaleX: 0.52, scaleY: 0.52, positionX: 0.2, positionY: -0.18 },
      blendMode: 'screen',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
    };
    commitProject((prev) => ({
      ...prev,
      assets: { ...prev.assets, [asset.id]: asset },
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipIds([newClip.id]);
  };

  const handleAddAdjustmentLayer = () => {
    const adjTrack = project.tracks.find((t) => t.type === 'adjustment') ?? project.tracks[3];
    const newClip: Clip = {
      id: `clip_adj_${Date.now()}`,
      trackId: adjTrack.id,
      assetId: '',
      name: 'Adjustment Layer',
      kind: 'adjustment',
      startTime: currentTime,
      duration: 5,
      sourceStart: 0,
      sourceDuration: 5,
      muted: false,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      transform: createDefaultTransform(),
      blendMode: 'source-over',
      effects: [],
      keyframes: {},
      speed: createDefaultSpeedConfig(),
      mask: createDefaultMask(),
      transitionIn: createDefaultTransition(),
    };
    commitProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipIds([newClip.id]);
    setActiveTool('effects');
  };

  const handlePhotoSaveExport = () => {
    if (project.mode === 'photo' && canvasRef.current) {
      exportCanvasSnapshot(canvasRef.current, `${project.name.replace(/\s+/g, '_')}.png`, 'image/png');
      notify('Exported full-quality PNG photo');
    } else {
      setShowExportModal(true);
    }
  };

  const matchedTools = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return BOTTOM_TOOLS;
    return BOTTOM_TOOLS.filter((t) => t.label.toLowerCase().includes(q));
  }, [quickSearchQuery]);

  return (
    <div
      data-testid="editor-screen"
      className="fixed inset-0 bg-[#080808] text-white flex flex-col overflow-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* TOP BAR (matches Section 18B & Screenshot 2: X, Search | Resolution dropdown, gold Export) */}
      <header className="h-14 px-3 sm:px-4 flex items-center justify-between border-b border-[#191919] bg-[#080808] shrink-0 z-30">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onSaveProject(project);
              onExit();
            }}
            aria-label="Close editor and return home"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-200 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowQuickSearch((s) => !s)}
            aria-label="Search tools and effects"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-200 hover:bg-white/10 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          <span className="hidden md:inline-block ml-2 text-xs font-medium text-neutral-400 truncate max-w-[200px]">
            {project.name}
          </span>
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Combined Resolution + FPS Dropdown Sheet (synced two-way with ExportModal) */}
          <div className="relative">
            <button
              type="button"
              data-testid="res-fps-trigger"
              onClick={() => setShowResMenu((v) => !v)}
              aria-label="Select export resolution and frame rate"
              className="min-h-[38px] px-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs font-semibold text-white flex items-center gap-1.5 hover:border-[#D4AF37]/60 whitespace-nowrap"
            >
              <span className="font-mono tabular-nums">
                {project.exportSettings.resolution} · {project.exportSettings.fps} FPS
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>
            {showResMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowResMenu(false)}
                />
                <div
                  data-testid="res-fps-sheet"
                  role="dialog"
                  aria-label="Resolution and FPS settings"
                  className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-[#141414] border border-[#2C2C2C] shadow-2xl p-4 space-y-4 z-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-white">Resolution & Frame Rate</span>
                    <button
                      type="button"
                      onClick={() => setShowResMenu(false)}
                      aria-label="Close resolution and FPS sheet"
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Resolution Picker */}
                  <div>
                    <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Resolution</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ALL_RESOLUTIONS.map((res) => {
                        const reason = getResolutionDisableReason(res, capabilities);
                        const active = project.exportSettings.resolution === res;
                        return (
                          <button
                            key={res}
                            type="button"
                            disabled={reason !== null}
                            onClick={() =>
                              updateExportSettingsTwoWay({ ...project.exportSettings, resolution: res })
                            }
                            className={`px-2.5 py-2 rounded-xl border text-left transition-colors ${
                              active
                                ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
                                : reason === null
                                  ? 'bg-[#1B1B1B] text-white border-[#2C2C2C] hover:border-[#D4AF37]/60'
                                  : 'bg-[#101010] text-neutral-600 border-[#1D1D1D] cursor-not-allowed'
                            }`}
                          >
                            <div className="text-xs font-bold">{res}</div>
                            {reason && <div className="text-[9px] text-neutral-500 mt-0.5 leading-tight">{reason}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* FPS Picker */}
                  <div>
                    <div className="text-[11px] font-medium text-neutral-400 mb-1.5">Frame Rate (FPS)</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {ALL_FPS.map((fps) => {
                        const reason = getFpsDisableReason(fps, capabilities);
                        const active = project.exportSettings.fps === fps;
                        return (
                          <button
                            key={fps}
                            type="button"
                            disabled={reason !== null}
                            title={reason ?? `${fps} FPS`}
                            onClick={() =>
                              updateExportSettingsTwoWay({ ...project.exportSettings, fps })
                            }
                            className={`px-1.5 py-2 rounded-lg border text-center transition-colors ${
                              active
                                ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
                                : reason === null
                                  ? 'bg-[#1B1B1B] text-white border-[#2C2C2C] hover:border-[#D4AF37]/60'
                                  : 'bg-[#101010] text-neutral-600 border-[#1D1D1D] cursor-not-allowed'
                            }`}
                          >
                            <div className="text-xs font-mono font-bold tabular-nums">{fps}</div>
                            {reason && (
                              <div className="text-[8px] text-neutral-500 leading-tight mt-0.5 line-clamp-2">
                                {reason}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Primary Gold Export CTA */}
          <button
            type="button"
            onClick={handlePhotoSaveExport}
            className="min-h-[38px] px-4 rounded-xl bg-gradient-to-r from-[#C89F28] via-[#D4AF37] to-[#F0D264] text-[#080808] font-bold text-xs tracking-wide hover:brightness-105 active:scale-[0.98] transition-all flex items-center gap-1.5 whitespace-nowrap"
          >
            {project.mode === 'photo' && <Download className="w-3.5 h-3.5" />}
            Export
          </button>
        </div>
      </header>

      {/* Quick Tool Search Dropdown */}
      {showQuickSearch && (
        <div className="px-4 py-2.5 bg-[#121212] border-b border-[#242424] flex flex-col gap-2 z-20">
          <input
            type="search"
            autoFocus
            value={quickSearchQuery}
            onChange={(e) => setQuickSearchQuery(e.target.value)}
            placeholder="Jump to any editing tool (Beat Sync, Effects, Sharpen, Mask…)"
            className="w-full px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white outline-none focus:border-[#D4AF37]"
          />
          <div className="flex flex-wrap gap-1.5">
            {matchedTools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setInspectorTab(null);
                  setActiveTool(t.id);
                  setShowQuickSearch(false);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#1B1B1B] border border-[#2A2A2A] text-[11px] text-neutral-200 hover:border-[#D4AF37] hover:text-[#D4AF37]"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CENTERED VIDEO PREVIEW CANVAS */}
      <div
        className={`relative bg-[#080808] flex items-center justify-center px-3 py-2 transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 bg-black p-4'
            : (activeTool || inspectorTab) && panelExpanded
              ? 'h-[20vh] shrink-0'
              : activeTool || inspectorTab
                ? 'h-[30vh] shrink-0'
                : 'h-[43vh] sm:h-[46vh] shrink-0'
        }`}
      >
        <div className="relative h-full flex items-center justify-center max-w-full">
          <canvas
            ref={canvasRef}
            data-testid="editor-preview-canvas"
            width={previewDims.width}
            height={previewDims.height}
            onClick={handlePreviewCanvasClick}
            className={`max-h-full max-w-full object-contain bg-black rounded-lg border border-[#1E1E1E] shadow-2xl ${
              activeTool === 'tracking' ? 'cursor-crosshair' : ''
            }`}
          />

          {/* Before/After Comparison Slider Overlay */}
          {compareSplit !== null && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-44 bg-black/75 border border-[#D4AF37]/40 rounded-full px-3 py-1 flex items-center gap-2">
              <input
                type="range"
                aria-label="Before and after comparison split"
                min={0.05}
                max={0.95}
                step={0.01}
                value={compareSplit}
                onChange={(e) => setCompareSplit(Number(e.target.value))}
                className="w-full allcut-slider"
              />
            </div>
          )}

          {isFullscreen && (
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              aria-label="Exit fullscreen preview"
              className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-full bg-black/75 border border-white/20 text-white flex items-center justify-center"
            >
              <Minimize className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Transient feedback toast */}
        {toastMsg && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-xl bg-[#181818]/95 border border-[#D4AF37]/50 text-xs font-medium text-[#F7E396] shadow-xl pointer-events-none">
            {toastMsg}
          </div>
        )}
      </div>

      {/* PLAYBACK ROW (matches Section 18B & Screenshot 2: left fullscreen | center play/pause | right proxy ON/OFF, undo, redo) */}
      <div className="h-11 px-3 sm:px-4 flex items-center justify-between border-t border-[#181818] bg-[#0B0B0B] shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            aria-label="Toggle fullscreen preview"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-white/10"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-neutral-500 font-mono hidden sm:inline">
            {project.aspectRatio} · {project.fps}fps
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          aria-label={isPlaying ? 'Pause playback' : 'Play preview'}
          className="min-w-[44px] min-h-[40px] flex items-center justify-center rounded-full text-white hover:text-[#D4AF37] transition-colors"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleProxy}
            aria-label="Toggle proxy preview quality"
            title="Proxy preview resolution (ON/OFF)"
            className={`min-h-[34px] px-2 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
              proxyEnabled
                ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]'
                : 'bg-[#161616] border-[#262626] text-neutral-400 hover:text-white'
            }`}
          >
            PROXY {proxyEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            aria-label="Undo"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-neutral-200 hover:bg-white/10 disabled:opacity-30"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            aria-label="Redo"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-neutral-200 hover:bg-white/10 disabled:opacity-30"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MULTITRACK TIMELINE (stays visible above expandable tool panel!) */}
      <TimelineView
        project={project}
        currentTime={currentTime}
        selectedClipIds={selectedClipIds}
        zoomPps={zoomPps}
        snapEnabled={snapEnabled}
        multiSelectMode={multiSelectMode}
        onSeek={(t) => {
          setIsPlaying(false);
          setCurrentTime(t);
        }}
        onZoomChange={setZoomPps}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onToggleMultiSelect={() => setMultiSelectMode((m) => !m)}
        onSelectClip={(id, additive) => {
          if (additive) {
            setSelectedClipIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            );
          } else {
            setSelectedClipIds([id]);
            setActiveTool(null);
            setInspectorTab((cur) => cur ?? 'basic');
          }
        }}
        onClearSelection={() => {
          setSelectedClipIds([]);
          setInspectorTab(null);
        }}
        onMoveClip={(clipId, newStart, newTrackId) =>
          commitProject((prev) => ({ ...prev, clips: moveClip(prev.clips, clipId, newStart, newTrackId) }), false)
        }
        onTrimClip={(clipId, edge, newTime) =>
          commitProject((prev) => ({ ...prev, clips: trimClipEdge(prev.clips, clipId, edge, newTime) }), false)
        }
        onToggleMuteMain={() =>
          commitProject((prev) => ({
            ...prev,
            tracks: prev.tracks.map((t) => (t.type === 'video' ? { ...t, muted: !t.muted } : t)),
          }))
        }
        onOpenCoverMaker={() => setShowCoverModal(true)}
        onAddMediaClick={() => triggerImport('video')}
        onAddAudioPrompt={() => {
          setInspectorTab(null);
          setActiveTool('audio');
        }}
        onAddTextPrompt={() => handleAddTextClip('ALL CUT', false)}
        onStepFrame={(delta) => {
          setIsPlaying(false);
          setCurrentTime((t) =>
            Math.max(0, Math.min(totalDuration, Math.round((t + delta / project.fps) * 1000) / 1000))
          );
        }}
      />

      {/* EXPANDABLE CLIP INSPECTOR OR BOTTOM TOOL PANEL */}
      {(activeTool || (inspectorTab && selectedClip)) && (
        <EditorToolPanels
          activeTool={activeTool}
          inspectorTab={inspectorTab}
          onSelectInspectorTab={setInspectorTab}
          project={project}
          selectedClip={selectedClip}
          selectedClipIds={selectedClipIds}
          currentTime={currentTime}
          expandedFull={panelExpanded}
          favoriteEffects={favoriteEffects}
          customEffects={customEffects}
          compareSplit={compareSplit}
          isAnalyzingBeats={isAnalyzingBeats}
          canUndoBeatSyncSpeed={beatSyncSpeedSnapshot !== null}
          isTracking={isTracking}
          trackingProgress={trackingProgress}
          hasClipboardClip={clipboardClip !== null}
          onToggleExpand={() => setPanelExpanded((v) => !v)}
          onClose={() => {
            setActiveTool(null);
            setInspectorTab(null);
            setPanelExpanded(false);
          }}
          onSeek={(t) => {
            setIsPlaying(false);
            setCurrentTime(t);
          }}
          onSplitAtPlayhead={() => {
            if (!selectedClip) return;
            const before = project.clips.length;
            const nextClips = splitClipAtTime(project.clips, selectedClip.id, currentTime);
            if (nextClips.length > before) {
              commitProject((prev) => ({ ...prev, clips: nextClips }));
              notify('Split clip at playhead');
            } else {
              notify('Move playhead inside the selected clip to split');
            }
          }}
          onDuplicateSelected={() => {
            if (selectedClipIds.length === 0) return;
            const res = duplicateClips(project.clips, selectedClipIds);
            commitProject((prev) => ({ ...prev, clips: res.clips }));
            setSelectedClipIds(res.newIds);
            notify('Duplicated selected clip');
          }}
          onCopySelected={() => {
            if (!selectedClip) return;
            setClipboardClip(structuredClone(selectedClip));
            notify('Copied clip to clipboard');
          }}
          onPasteClipboard={() => {
            if (!clipboardClip) return;
            const pasted: Clip = {
              ...structuredClone(clipboardClip),
              id: `clip_paste_${Date.now()}`,
              startTime: currentTime,
            };
            commitProject((prev) => ({ ...prev, clips: [...prev.clips, pasted] }));
            setSelectedClipIds([pasted.id]);
            notify('Pasted clip at playhead');
          }}
          onDeleteSelected={() => {
            if (selectedClipIds.length === 0) return;
            commitProject((prev) => ({ ...prev, clips: deleteClips(prev.clips, selectedClipIds) }));
            setSelectedClipIds([]);
            setInspectorTab(null);
            notify('Deleted selected clip');
          }}
          onReplaceSelectedMedia={() => triggerImport('replace')}
          onUpdateClip={(clipId, updater) =>
            commitProject((prev) => ({
              ...prev,
              clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
            }))
          }
          onUpdateAspectRatio={(ar: AspectRatioKey) =>
            commitProject((prev) => ({ ...prev, aspectRatio: ar }))
          }
          onToggleFavoriteEffect={onToggleFavoriteEffect}
          onToggleCompareSplit={() => setCompareSplit((v) => (v === null ? 0.5 : null))}
          onApplyEffectsToAll={(effects) => {
            commitProject((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.kind === 'video' || c.kind === 'image'
                  ? {
                      ...c,
                      effects: effects.map((e, i) => ({
                        ...e,
                        instanceId: `fx_all_${Date.now()}_${i}`,
                        params: { ...e.params },
                      })),
                    }
                  : c
              ),
            }));
            notify('Applied effects stack to all video clips');
          }}
          onSavePreset={(name, effects) => {
            onSavePreset(name, effects);
            notify(`Saved preset "${name}"`);
          }}
          onSaveCustomEffect={onSaveCustomEffect}
          onDeleteCustomEffect={onDeleteCustomEffect}
          onRenameCustomEffect={onRenameCustomEffect}
          onApplyCustomEffect={handleApplyCustomEffect}
          onDetectBeats={handleDetectBeats}
          onUpdateBeatSync={(cfg: BeatSyncConfig) =>
            commitProject((prev) => ({ ...prev, beatSync: cfg }), false)
          }
          onUpdateAudioAnalysis={(audioClipId: string, analysis: BeatAnalysisResult) =>
            commitProject((prev) => ({
              ...prev,
              clips: prev.clips.map((c) => (c.id === audioClipId ? { ...c, beatAnalysis: analysis } : c)),
            }))
          }
          onApplyBeatSync={(scope) => handleApplyBeatSync(scope)}
          onUndoBeatSyncSpeed={handleUndoBeatSyncSpeed}
          onPreviewBeatSync={() => {
            handleApplyBeatSync('selected');
            setCurrentTime(0);
            setIsPlaying(true);
          }}
          onOpenSpeedGraph={() => {
            setActiveTool(null);
            if (!selectedClip) {
              const firstVid = project.clips.find((c) => c.kind === 'video' || c.kind === 'image');
              if (firstVid) setSelectedClipIds([firstVid.id]);
            }
            setInspectorTab('speed');
          }}
          onAddBuiltinAudio={handleAddBuiltinAudio}
          onImportMedia={(kind) => triggerImport(kind)}
          onAddBuiltinOverlay={handleAddBuiltinOverlay}
          onAddAdjustmentLayer={handleAddAdjustmentLayer}
          onAddTextClip={handleAddTextClip}
          onAddStickerClip={handleAddStickerClip}
          onRunMotionTracking={handleRunMotionTracking}
          onAttachClipToTracker={(hostId, childId) => {
            commitProject((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === childId ? { ...c, attachedToTrackClipId: hostId } : c
              ),
            }));
            notify('Attached layer to tracked subject motion');
          }}
          onInitTrackerOnClip={(clipId) => {
            commitProject((prev) => ({
              ...prev,
              clips: prev.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      tracking: {
                        id: `trk_${Date.now()}`,
                        label: 'Track Subject',
                        mode: 'object',
                        trackPosition: true,
                        trackRotation: false,
                        trackScale: false,
                        boxWidth: 0.22,
                        boxHeight: 0.14,
                        points: [{ time: Math.max(0, currentTime - c.startTime), x: 0.5, y: 0.42, scale: 1, rotation: 0, confidence: 1 }],
                        attachedClipIds: [],
                      },
                    }
                  : c
              ),
            }));
          }}
        />
      )}

      {/* HORIZONTALLY SCROLLABLE BOTTOM TOOLBAR (no separate Keyframe button — keyframes live inside Clip Inspector) */}
      <nav
        aria-label="Editing tools"
        data-testid="editor-bottom-toolbar"
        className="h-16 bg-[#080808] border-t border-[#1D1D1D] flex items-center overflow-x-auto no-scrollbar px-1.5 shrink-0"
      >
        {BOTTOM_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const disabled = tool.requiresClip && !selectedClip;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                setInspectorTab(null);
                setActiveTool((cur) => (cur === tool.id ? null : tool.id));
              }}
              className={`min-w-[62px] min-h-[52px] px-2 flex flex-col items-center justify-center gap-1 rounded-xl shrink-0 transition-colors ${
                active
                  ? 'text-[#D4AF37] bg-[#D4AF37]/12'
                  : disabled
                    ? 'text-neutral-600 opacity-45 cursor-not-allowed'
                    : 'text-neutral-200 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium whitespace-nowrap">{tool.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {showExportModal && (
        <ExportModal
          project={project}
          capabilities={capabilities}
          sources={sourcesRef.current}
          onUpdateSettings={updateExportSettingsTwoWay}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showCoverModal && (
        <CoverMakerModal
          project={project}
          currentTime={currentTime}
          sources={sourcesRef.current}
          onSaveCover={(coverDataUrl, coverTimestamp) => {
            commitProject((prev) => ({ ...prev, coverDataUrl, coverTimestamp }));
            notify('Saved custom project cover');
          }}
          onClose={() => setShowCoverModal(false)}
        />
      )}

      {showShootModal && (
        <ShootRecordModal
          onRecordedFile={async (file) => {
            const { asset } = await importLocalMediaFile(file);
            const mainTrack = project.tracks[0];
            const newClip: Clip = {
              id: `clip_rec_${Date.now()}`,
              trackId: mainTrack.id,
              assetId: asset.id,
              name: asset.name,
              kind: 'video',
              startTime: totalDuration,
              duration: asset.duration,
              sourceStart: 0,
              sourceDuration: asset.duration,
              muted: false,
              volume: 1,
              fadeIn: 0,
              fadeOut: 0,
              transform: createDefaultTransform(),
              blendMode: 'source-over',
              effects: [],
              keyframes: {},
              speed: createDefaultSpeedConfig(),
              mask: createDefaultMask(),
              transitionIn: createDefaultTransition(),
            };
            commitProject((prev) => ({
              ...prev,
              assets: { ...prev.assets, [asset.id]: asset },
              clips: [...prev.clips, newClip],
            }));
          }}
          onClose={() => setShowShootModal(false)}
        />
      )}
    </div>
  );
};
