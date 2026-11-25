export type TrackType =
  | 'video'
  | 'overlay'
  | 'image'
  | 'text'
  | 'audio'
  | 'adjustment'
  | 'effect'
  | 'mask';

export type AspectRatioKey = '9:16' | '16:9' | '1:1' | '4:5' | 'custom';

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'cubicBezier'
  | 'smooth'
  | 'overshoot'
  | 'bounce';

export interface BezierHandles {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type KeyframeProperty =
  | 'positionX'
  | 'positionY'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'anchorX'
  | 'anchorY'
  | 'cropTop'
  | 'cropBottom'
  | 'cropLeft'
  | 'cropRight'
  | 'maskX'
  | 'maskY'
  | 'maskWidth'
  | 'maskHeight'
  | 'maskFeather'
  | 'brightness'
  | 'contrast'
  | 'blur'
  | 'sharpen'
  | 'volume'
  | 'speed'
  | 'textSize'
  | `fx:${string}:${string}`;

export interface Keyframe {
  id: string;
  time: number; // local time within clip in seconds
  value: number;
  easing: EasingType;
  bezier?: BezierHandles;
}

export type KeyframeMap = Record<string, Keyframe[] | undefined>;

export type EffectCategory =
  | 'color'
  | 'blur'
  | 'motion'
  | 'sharpen'
  | 'stylize';

export interface EffectParamSchema {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export interface EffectDefinition {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  params: EffectParamSchema[];
}

export interface EffectInstance {
  instanceId: string;
  effectId: string;
  name: string;
  category: EffectCategory;
  enabled: boolean;
  params: Record<string, number>;
  lutName?: string;
  lutData?: number[]; // flattened RGB 3D LUT table
  lutSize?: number;
  customEffectId?: string;
  customEffectName?: string;
  exposedParams?: string[]; // keys exposed when part of a custom effect
}

export interface CustomEffectLayerSpec {
  id: string;
  effectId: string;
  params: Record<string, number>;
  exposedParamKeys: string[];
}

export interface CustomEffectDefinition {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  layers: CustomEffectLayerSpec[];
}

export interface SpeedCurvePoint {
  id: string;
  time: number; // normalized 0..1 along clip timeline
  speed: number; // 0.1 to 10.0
  beatId?: string;
  lockedBeatTime?: number; // exact normalized beat position locked so manual speed edits don't drift beat alignment
}

export type SpeedPresetId =
  | 'constant'
  | 'slowToFast'
  | 'fastToSlow'
  | 'slowFastSlow'
  | 'fastSlowFast'
  | 'smoothVelocity'
  | 'cinematicRamp'
  | 'custom';

export interface SpeedConfig {
  mode: 'constant' | 'curve';
  constantSpeed: number; // 0.1..10
  reverse: boolean;
  freezeAt: number | null; // seconds if freeze frame active
  frameBlending: 'none' | 'blend' | 'opticalFlow';
  presetId: SpeedPresetId;
  curvePoints: SpeedCurvePoint[];
  beatSynced?: boolean;
}

export interface BeatMarker {
  id: string;
  time: number; // seconds in audio track
  strength: number; // 0..1 normalized onset energy
  isStrong: boolean;
  isDownbeat: boolean;
  barIndex: number;
  beatInBar: number;
  selected: boolean;
  manual?: boolean;
}

export interface BeatAnalysisResult {
  bpm: number;
  manualBpmOverride: number | null;
  confidence: number; // 0..1
  beatIntervalSec: number;
  beats: BeatMarker[];
  analyzedAt: number;
}

export type BeatSyncPattern =
  | 'every'
  | 'every2'
  | 'every4'
  | 'strongOnly'
  | 'selected';

export type BeatRampStyle =
  | 'speedUpOnBeat'
  | 'slowDownOnBeat'
  | 'beatSlowFast'
  | 'beatFastSlow'
  | 'customBeatRamp'
  | 'beatVelocity'
  | 'cinematicBeat';

export interface BeatSyncConfig {
  enabled: boolean;
  pattern: BeatSyncPattern;
  rampStyle: BeatRampStyle;
  sensitivity: number; // 0.1..1.0
  strengthThreshold: number; // 0.1..0.95
  speedMultiplier: number; // 0.5..4.0
  minSpeed: number; // 0.1..1.0
  maxSpeed: number; // 1.2..8.0
  rampDuration: number; // 0.05..0.6 sec
  rampSmoothness: number; // 0..1
  curveIntensity: number; // 0.1..1.0
  beatOffsetMs: number; // -200..200 ms
  rangeStartSec: number;
  rangeEndSec: number | null;
  applyScope: 'selected' | 'all';
  syncCuts: boolean;
  syncTransitions: boolean;
  syncZoom: boolean;
  syncKeyframes: boolean;
}

export type ClipInspectorTab =
  | 'basic'
  | 'keyframes'
  | 'effects'
  | 'speed'
  | 'mask'
  | 'audio';

export type MaskShape = 'none' | 'rectangle' | 'circle' | 'freehand' | 'bezier';

export type BlendMode =
  | 'source-over'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'darken'
  | 'difference'
  | 'color-dodge'
  | 'soft-light';

export interface ChromaKeyConfig {
  enabled: boolean;
  keyColor: string; // hex e.g. #00FF00
  similarity: number; // 0..1
  smoothness: number; // 0..1
  spillSuppression: number; // 0..1
}

export interface MaskConfig {
  shape: MaskShape;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  width: number; // 0..1
  height: number; // 0..1
  rotation: number; // degrees
  feather: number; // 0..100 px
  expansion: number; // -50..50 px
  inverted: boolean;
  points: { x: number; y: number }[]; // normalized 0..1 for freehand / bezier
  chromaKey: ChromaKeyConfig;
}

export type TransitionType =
  | 'none'
  | 'zoomIn'
  | 'zoomOut'
  | 'spin'
  | 'rotation'
  | 'blur'
  | 'flash'
  | 'shake'
  | 'slideLeft'
  | 'pushRight'
  | 'pullDown'
  | 'whipPan'
  | 'motionBlur'
  | 'maskWipe'
  | 'flip3D';

export interface TransitionConfig {
  type: TransitionType;
  duration: number; // 0.15..2.0s
  intensity: number; // 0..1
  direction: 'left' | 'right' | 'up' | 'down';
  easing: EasingType;
  beatSynced: boolean;
}

export interface TrackingPoint {
  time: number; // seconds relative to clip start
  x: number; // 0..1 normalized canvas coords
  y: number; // 0..1 normalized canvas coords
  scale: number;
  rotation: number;
  confidence: number; // 0..1
  manual?: boolean;
}

export interface TrackingData {
  id: string;
  label: string;
  mode: 'point' | 'object' | 'region';
  trackPosition: boolean;
  trackRotation: boolean;
  trackScale: boolean;
  boxWidth: number; // normalized 0..1
  boxHeight: number; // normalized 0..1
  points: TrackingPoint[];
  attachedClipIds: string[];
}

export interface TextConfig {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  isCaption?: boolean;
}

export interface TransformState {
  positionX: number; // -1..1 normalized offset
  positionY: number; // -1..1 normalized offset
  scaleX: number; // 0.1..5
  scaleY: number; // 0.1..5
  rotation: number; // degrees
  opacity: number; // 0..1
  anchorX: number; // 0..1
  anchorY: number; // 0..1
  cropTop: number; // 0..0.45
  cropBottom: number; // 0..0.45
  cropLeft: number; // 0..0.45
  cropRight: number; // 0..0.45
}

export type SyntheticSceneType =
  | 'neonOrbit'
  | 'goldenStudio'
  | 'urbanDrift'
  | 'chromaticPrism'
  | 'portraitLight';

export interface MediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  mimeType: string;
  duration: number; // seconds (for image default 5s)
  width: number;
  height: number;
  objectUrl?: string; // blob URL for imported files
  syntheticScene?: SyntheticSceneType; // procedural frame generator for offline demo/starter media
  syntheticAudioBpm?: number; // procedural rhythmic audio generator
  waveformPeaks?: number[]; // normalized 0..1 bars
  thumbnails?: string[]; // data URLs for timeline filmstrip
  missing?: boolean; // true if needs media relinking after import/reopen
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  name: string;
  kind: 'video' | 'image' | 'audio' | 'text' | 'adjustment' | 'effect' | 'sticker';
  startTime: number; // timeline start in seconds
  duration: number; // timeline duration in seconds
  sourceStart: number; // trim start in source media seconds
  sourceDuration: number; // full source media duration
  muted: boolean;
  volume: number; // 0..2
  fadeIn: number;
  fadeOut: number;
  transform: TransformState;
  blendMode: BlendMode;
  effects: EffectInstance[];
  keyframes: KeyframeMap;
  speed: SpeedConfig;
  mask: MaskConfig;
  transitionIn: TransitionConfig;
  text?: TextConfig;
  stickerGlyph?: string;
  tracking?: TrackingData;
  attachedToTrackClipId?: string;
  attachedToTrackId?: string;
  beatAnalysis?: BeatAnalysisResult;
  colorTag?: string;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  height: number;
}

export interface ExportSettings {
  resolution: '720p' | '1080p' | '1440p' | '4K';
  fps: 24 | 25 | 30 | 48 | 50 | 60 | 90 | 120;
  codec: 'H.264' | 'H.265' | 'VP9';
  videoBitrateMbps: number;
  audioBitrateKbps: 128 | 192 | 256 | 320;
  audioCodec: 'AAC' | 'Opus';
  format: 'MP4' | 'WebM';
}

export interface Project {
  id: string;
  name: string;
  mode: 'video' | 'photo';
  createdAt: number;
  updatedAt: number;
  aspectRatio: AspectRatioKey;
  customWidth: number;
  customHeight: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  assets: Record<string, MediaAsset>;
  beatSync: BeatSyncConfig;
  exportSettings: ExportSettings;
  coverDataUrl?: string;
  coverTimestamp?: number;
}

export interface CustomPreset {
  id: string;
  name: string;
  category: 'effects' | 'color' | 'sharpen' | 'speed' | 'beatSync' | 'bundle';
  description: string;
  createdAt: number;
  builtIn?: boolean;
  effects?: EffectInstance[];
  speed?: Partial<SpeedConfig>;
  beatSync?: Partial<BeatSyncConfig>;
  transition?: TransitionConfig;
  mask?: Partial<MaskConfig>;
}

export interface DeviceCapabilities {
  cores: number;
  memoryGb: number;
  maxTextureSize: number;
  webgl2Supported: boolean;
  displayRefreshHz: number;
  supportedResolutions: ('720p' | '1080p' | '1440p' | '4K')[];
  supportedFps: (24 | 25 | 30 | 48 | 50 | 60 | 90 | 120)[];
  h264Supported: boolean;
  h265Supported: boolean;
  vp9Supported: boolean;
  hardwareAcceleration: boolean;
  recommendedProxyMode: boolean;
}

export type EditorToolId =
  | 'edit'
  | 'audio'
  | 'text'
  | 'effects'
  | 'overlay'
  | 'keyframe'
  | 'speed'
  | 'beatSync'
  | 'tracking'
  | 'transition'
  | 'mask'
  | 'filters'
  | 'adjust'
  | 'sharpen'
  | 'stickers'
  | 'captions';

export type HomeTabId = 'edit' | 'discover' | 'presets' | 'projects' | 'me';
