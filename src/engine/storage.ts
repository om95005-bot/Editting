import type { Clip, CustomEffectDefinition, CustomPreset, Project } from '../types/editor';
import { createEffectInstance } from './effectsCatalog';
import { createBuiltinAudioAsset, createBuiltinVideoAsset } from './mediaGenerator';
import { detectBeatsFromPCM } from './beatDetection';
import { createDefaultSpeedConfig } from './speedRemap';
import {
  createDefaultBeatSyncConfig,
  createDefaultExportSettings,
  createDefaultMask,
  createDefaultTracks,
  createDefaultTransform,
  createDefaultTransition,
} from './timelineOps';

const PROJECTS_KEY = 'allcut_projects_v1';
const PRESETS_KEY = 'allcut_presets_v1';
const CUSTOM_EFFECTS_KEY = 'allcut_custom_effects_v1';
const FAVORITES_KEY = 'allcut_favorite_fx_v1';
const SETTINGS_KEY = 'allcut_settings_v1';
const RECOVERY_KEY = 'allcut_autosave_recovery_v1';

export const BUILTIN_CUSTOM_EFFECTS: CustomEffectDefinition[] = [
  {
    id: 'cust_gold_prism',
    name: 'Gold Prism Warp',
    description: 'Kaleidoscope symmetry + Sobel Gold Outline + luminous Bloom',
    createdAt: 1730000100000,
    updatedAt: 1730000100000,
    layers: [
      { id: 'l1', effectId: 'kaleidoscope', params: { segments: 6, rotation: 15 }, exposedParamKeys: ['segments', 'rotation'] },
      { id: 'l2', effectId: 'outline', params: { threshold: 40, mix: 75, goldTint: 90 }, exposedParamKeys: ['mix'] },
      { id: 'l3', effectId: 'glow', params: { intensity: 50, radius: 12, threshold: 150 }, exposedParamKeys: ['intensity'] },
    ],
  },
  {
    id: 'cust_kinetic_echo',
    name: 'Kinetic Echo Halftone',
    description: 'Echo clones + Chromatic dispersion + Film Grain',
    createdAt: 1730000101000,
    updatedAt: 1730000101000,
    layers: [
      { id: 'l1', effectId: 'echo', params: { copies: 4, spread: 14, decay: 62 }, exposedParamKeys: ['spread', 'decay'] },
      { id: 'l2', effectId: 'chromaticAberration', params: { offset: 7 }, exposedParamKeys: ['offset'] },
      { id: 'l3', effectId: 'noise', params: { amount: 26, monochrome: 1 }, exposedParamKeys: ['amount'] },
    ],
  },
];

export interface AppSettings {
  proxyPreview: boolean;
  lowMemoryMode: boolean;
  previewQuality: 'high' | 'medium' | 'proxy';
  autosaveEnabled: boolean;
  cacheLimitMb: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  proxyPreview: false,
  lowMemoryMode: false,
  previewQuality: 'high',
  autosaveEnabled: true,
  cacheLimitMb: 512,
};

export const BUILTIN_PRESETS: CustomPreset[] = [
  {
    id: 'preset_gold_noir',
    name: 'Gold Noir Cinema',
    category: 'color',
    description: 'Rich obsidian shadows, warm metallic gold highlights, crisp clarity',
    createdAt: 1730000000000,
    builtIn: true,
    effects: [
      { ...createEffectInstance('contrast'), params: { amount: 24 } },
      { ...createEffectInstance('temperature'), params: { kelvin: 16 } },
      { ...createEffectInstance('colorGrading'), params: { shadowHue: 220, highlightHue: 44, intensity: 48 } },
      { ...createEffectInstance('clarity'), params: { amount: 28, radius: 5 } },
    ],
  },
  {
    id: 'preset_hyper_sharp',
    name: 'Pro Structure & Micro-Sharp',
    category: 'sharpen',
    description: 'Halo-clamped Smart Sharpen + Structure + Fine Detail Recovery',
    createdAt: 1730000001000,
    builtIn: true,
    effects: [
      { ...createEffectInstance('smartSharpen'), params: { strength: 80, radius: 2, haloSuppress: 78 } },
      { ...createEffectInstance('structure'), params: { strength: 45, detail: 3 } },
      { ...createEffectInstance('fineDetailRecovery'), params: { amount: 42, threshold: 6 } },
    ],
  },
  {
    id: 'preset_velocity_beat',
    name: '128 BPM Beat Velocity',
    category: 'beatSync',
    description: 'Automatic strong-beat velocity burst with zoom keyframes',
    createdAt: 1730000002000,
    builtIn: true,
    beatSync: {
      pattern: 'every',
      rampStyle: 'beatVelocity',
      minSpeed: 0.35,
      maxSpeed: 3.8,
      rampDuration: 0.14,
      syncZoom: true,
    },
  },
  {
    id: 'preset_chromatic_glitch',
    name: 'Kinetic Glitch & Bloom',
    category: 'effects',
    description: 'Chromatic dispersion, golden bloom glow, and subtle camera shake',
    createdAt: 1730000003000,
    builtIn: true,
    effects: [
      { ...createEffectInstance('chromaticAberration'), params: { offset: 7 } },
      { ...createEffectInstance('glow'), params: { intensity: 52, radius: 14, threshold: 145 } },
      { ...createEffectInstance('cameraShake'), params: { intensity: 28, frequency: 14 } },
    ],
  },
  {
    id: 'preset_cinematic_ramp',
    name: 'Cinematic Slow-Fast Ramp',
    category: 'speed',
    description: 'Smooth 0.45x anticipation bursting into 4.2x impact',
    createdAt: 1730000004000,
    builtIn: true,
    speed: {
      mode: 'curve',
      presetId: 'cinematicRamp',
    },
  },
];

export function createStarterProject(
  mode: 'video' | 'photo' = 'video',
  title?: string,
  includeStarterMedia = true
): { project: Project; pcmStore: Map<string, { pcm: Float32Array; sampleRate: number }> } {
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tracks = createDefaultTracks();
  const assets: Project['assets'] = {};
  const clips: Clip[] = [];
  const pcmStore = new Map<string, { pcm: Float32Array; sampleRate: number }>();

  if (includeStarterMedia) {
    if (mode === 'photo') {
      const photoAsset = createBuiltinVideoAsset('asset_studio_portrait', 'Studio Portrait RAW', 'portraitLight', 5);
      photoAsset.kind = 'image';
      assets[photoAsset.id] = photoAsset;
      clips.push({
        id: 'clip_photo_main',
        trackId: tracks[0].id,
        assetId: photoAsset.id,
        name: 'Studio Portrait',
        kind: 'image',
        startTime: 0,
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
      });
    } else {
      const v1 = createBuiltinVideoAsset('asset_orbit_1', 'Golden Orbit 4K', 'goldenStudio', 6);
      const v2 = createBuiltinVideoAsset('asset_drift_2', 'Night Drift 60fps', 'urbanDrift', 6);
      const audioPkg = createBuiltinAudioAsset('asset_beat_128', 'ALL CUT Pulse (128 BPM)', 128, 12);

      assets[v1.id] = v1;
      assets[v2.id] = v2;
      assets[audioPkg.asset.id] = audioPkg.asset;
      pcmStore.set(audioPkg.asset.id, { pcm: audioPkg.pcm, sampleRate: audioPkg.sampleRate });

      const initialAnalysis = detectBeatsFromPCM(audioPkg.pcm, audioPkg.sampleRate, { sensitivity: 0.65 });

      clips.push(
        {
          id: 'clip_vid_1',
          trackId: tracks[0].id,
          assetId: v1.id,
          name: 'Golden Orbit',
          kind: 'video',
          startTime: 0,
          duration: 6,
          sourceStart: 0,
          sourceDuration: 6,
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
        },
        {
          id: 'clip_vid_2',
          trackId: tracks[0].id,
          assetId: v2.id,
          name: 'Night Drift',
          kind: 'video',
          startTime: 6,
          duration: 6,
          sourceStart: 0,
          sourceDuration: 6,
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
          transitionIn: {
            type: 'zoomIn',
            duration: 0.45,
            intensity: 0.75,
            direction: 'left',
            easing: 'easeOut',
            beatSynced: false,
          },
        },
        {
          id: 'clip_audio_1',
          trackId: tracks[4].id,
          assetId: audioPkg.asset.id,
          name: 'ALL CUT Pulse (128 BPM)',
          kind: 'audio',
          startTime: 0,
          duration: 12,
          sourceStart: 0,
          sourceDuration: 12,
          muted: false,
          volume: 0.9,
          fadeIn: 0.1,
          fadeOut: 0.4,
          transform: createDefaultTransform(),
          blendMode: 'source-over',
          effects: [],
          keyframes: {},
          speed: createDefaultSpeedConfig(),
          mask: createDefaultMask(),
          transitionIn: createDefaultTransition(),
          beatAnalysis: initialAnalysis,
        }
      );
    }
  }

  return {
    project: {
      id,
      name: title ?? (mode === 'photo' ? 'Photo Studio Edit' : 'Untitled Sequence'),
      mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: '9:16',
      customWidth: 1080,
      customHeight: 1920,
      fps: 60,
      tracks,
      clips,
      assets,
      beatSync: createDefaultBeatSyncConfig(),
      exportSettings: createDefaultExportSettings(),
    },
    pcmStore,
  };
}

function sanitizeProjectForStorage(project: Project): Project {
  const cleanAssets: Project['assets'] = {};
  for (const [k, asset] of Object.entries(project.assets)) {
    // Strip transient blob URLs for uploaded files so reload marks them for media relinking,
    // while synthetic assets regenerate seamlessly offline!
    const isBlob = asset.objectUrl?.startsWith('blob:');
    cleanAssets[k] = {
      ...asset,
      objectUrl: isBlob ? undefined : asset.objectUrl,
      missing: Boolean(isBlob && !asset.syntheticScene && !asset.syntheticAudioBpm),
      thumbnails: asset.thumbnails?.slice(0, 4),
    };
  }
  return { ...project, assets: cleanAssets };
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    const sanitized = projects.map(sanitizeProjectForStorage);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(sanitized));
  } catch {
    // Handle storage quota gracefully by trimming thumbnails
    try {
      const compact = projects.map((p) => {
        const clean = sanitizeProjectForStorage(p);
        for (const a of Object.values(clean.assets)) {
          a.thumbnails = [];
        }
        return clean;
      });
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(compact));
    } catch {
      // ignore
    }
  }
}

export function saveAutosaveRecovery(project: Project): void {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(sanitizeProjectForStorage(project)));
  } catch {
    // ignore
  }
}

export function loadAutosaveRecovery(): Project | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    return raw ? (JSON.parse(raw) as Project) : null;
  } catch {
    return null;
  }
}

export function clearAutosaveRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // ignore
  }
}

export function loadPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return BUILTIN_PRESETS;
    const saved = JSON.parse(raw) as CustomPreset[];
    const savedIds = new Set(saved.map((s) => s.id));
    return [...saved, ...BUILTIN_PRESETS.filter((b) => !savedIds.has(b.id))];
  } catch {
    return BUILTIN_PRESETS;
  }
}

export function savePresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function loadCustomEffects(): CustomEffectDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_EFFECTS_KEY);
    if (!raw) return BUILTIN_CUSTOM_EFFECTS;
    const parsed = JSON.parse(raw) as CustomEffectDefinition[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : BUILTIN_CUSTOM_EFFECTS;
  } catch {
    return BUILTIN_CUSTOM_EFFECTS;
  }
}

export function saveCustomEffects(customEffects: CustomEffectDefinition[]): void {
  try {
    localStorage.setItem(CUSTOM_EFFECTS_KEY, JSON.stringify(customEffects));
  } catch {
    // ignore
  }
}

export function loadFavoriteEffects(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : ['smartSharpen', 'structure', 'glow', 'lutApply'];
  } catch {
    return ['smartSharpen', 'structure', 'glow', 'lutApply'];
  }
}

export function saveFavoriteEffects(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } : DEFAULT_APP_SETTINGS;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function estimateCacheSizeKb(): number {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('allcut_')) {
        bytes += (localStorage.getItem(key)?.length ?? 0) * 2;
      }
    }
  } catch {
    // ignore
  }
  return Math.round(bytes / 1024);
}
