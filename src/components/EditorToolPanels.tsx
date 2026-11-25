import React, { useState } from 'react';
import {
  ClipboardPaste,
  Copy,
  Crosshair,
  Diamond,
  Layers,
  Maximize2,
  Minimize2,
  Music,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AspectRatioKey,
  BeatAnalysisResult,
  BeatSyncConfig,
  BlendMode,
  Clip,
  ClipInspectorTab,
  CustomEffectDefinition,
  EditorToolId,
  EffectInstance,
  KeyframeProperty,
  MaskConfig,
  MaskShape,
  Project,
  SpeedConfig,
  TransitionConfig,
  TransitionType,
} from '../types/editor';
import { BeatSyncPanel } from './BeatSyncPanel';
import { KeyframePanel, SpeedPanel } from './KeyframeSpeedPanel';
import { EffectsLibraryPanel } from './EffectsLibraryPanel';
import { trackingPointsToKeyframes } from '../engine/motionTracking';
import { hasKeyframeAtTime, toggleKeyframeAtTime } from '../engine/keyframes';

interface EditorToolPanelsProps {
  activeTool: EditorToolId | null;
  inspectorTab: ClipInspectorTab | null;
  onSelectInspectorTab: (tab: ClipInspectorTab) => void;
  project: Project;
  selectedClip: Clip | null;
  selectedClipIds: string[];
  currentTime: number;
  expandedFull: boolean;
  favoriteEffects: string[];
  customEffects: CustomEffectDefinition[];
  compareSplit: number | null;
  isAnalyzingBeats: boolean;
  canUndoBeatSyncSpeed: boolean;
  isTracking: boolean;
  trackingProgress: number;
  hasClipboardClip: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onSeek: (time: number) => void;
  onSplitAtPlayhead: () => void;
  onDuplicateSelected: () => void;
  onCopySelected: () => void;
  onPasteClipboard: () => void;
  onDeleteSelected: () => void;
  onReplaceSelectedMedia: () => void;
  onUpdateClip: (clipId: string, updater: (c: Clip) => Clip) => void;
  onUpdateAspectRatio: (ar: AspectRatioKey, customW?: number, customH?: number) => void;
  onToggleFavoriteEffect: (fxId: string) => void;
  onToggleCompareSplit: () => void;
  onApplyEffectsToAll: (effects: EffectInstance[]) => void;
  onSavePreset: (name: string, effects: EffectInstance[]) => void;
  onSaveCustomEffect: (def: CustomEffectDefinition) => void;
  onDeleteCustomEffect: (id: string) => void;
  onRenameCustomEffect: (id: string, name: string) => void;
  onApplyCustomEffect: (def: CustomEffectDefinition, scope: 'selected' | 'all') => void;
  onDetectBeats: (audioClipId: string, sensitivity: number, manualBpm?: number | null) => void;
  onUpdateBeatSync: (cfg: BeatSyncConfig) => void;
  onUpdateAudioAnalysis: (audioClipId: string, analysis: BeatAnalysisResult) => void;
  onApplyBeatSync: (scope: 'selected' | 'all') => void;
  onUndoBeatSyncSpeed: () => void;
  onPreviewBeatSync: () => void;
  onOpenSpeedGraph: () => void;
  onAddBuiltinAudio: (bpm: number) => void;
  onImportMedia: (kind: 'video' | 'image' | 'audio' | 'overlay') => void;
  onAddBuiltinOverlay: () => void;
  onAddAdjustmentLayer: () => void;
  onAddTextClip: (content: string, isCaption: boolean) => void;
  onAddStickerClip: (glyph: string) => void;
  onRunMotionTracking: (clipId: string, direction: 'forward' | 'backward') => void;
  onAttachClipToTracker: (hostClipId: string, childClipId: string) => void;
  onInitTrackerOnClip: (clipId: string) => void;
}

const TOOL_TITLES: Record<EditorToolId, string> = {
  edit: 'Edit & Transform',
  audio: 'Audio & Music',
  text: 'Text Editor',
  effects: 'Effects Library',
  overlay: 'Overlay & Adjustment Layers',
  keyframe: 'Keyframes',
  speed: 'Speed & Time Remapping',
  beatSync: 'Beat Sync & Audio Intelligence',
  tracking: 'Motion Tracking',
  transition: 'Transitions',
  mask: 'Masks & Chroma Key',
  filters: 'Color & LUT Filters',
  adjust: 'Color & Tone Adjustments',
  sharpen: 'Sharpening & Structure Engine',
  stickers: 'Stickers & Graphics',
  captions: 'Subtitles & Captions',
};

const INSPECTOR_TAB_LABELS: Record<ClipInspectorTab, string> = {
  basic: 'Basic',
  keyframes: 'Keyframes',
  effects: 'Effects',
  speed: 'Speed',
  mask: 'Mask',
  audio: 'Audio',
};

export function getInspectorTabsForClip(clip: Clip): ClipInspectorTab[] {
  switch (clip.kind) {
    case 'audio':
      return ['basic', 'keyframes', 'audio'];
    case 'text':
      return ['basic', 'keyframes', 'effects', 'mask'];
    case 'adjustment':
    case 'effect':
      return ['basic', 'keyframes', 'effects'];
    default:
      return ['basic', 'keyframes', 'effects', 'speed', 'mask', 'audio'];
  }
}

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'darken', label: 'Darken' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'difference', label: 'Difference' },
];

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'zoomIn', label: 'Zoom In' },
  { id: 'zoomOut', label: 'Zoom Out' },
  { id: 'spin', label: 'Spin' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'blur', label: 'Blur' },
  { id: 'flash', label: 'Flash' },
  { id: 'shake', label: 'Shake' },
  { id: 'slideLeft', label: 'Slide' },
  { id: 'pushRight', label: 'Push' },
  { id: 'pullDown', label: 'Pull' },
  { id: 'whipPan', label: 'Whip Pan' },
  { id: 'motionBlur', label: 'Motion Blur' },
  { id: 'maskWipe', label: 'Mask Wipe' },
  { id: 'flip3D', label: '3D Flip' },
];

const STICKERS = ['★', '◆', '⚡', '✦', '▲', '●', '▶', '◎', '❖', '✧', '⬢', '⬡'];

export const EditorToolPanels: React.FC<EditorToolPanelsProps> = (props) => {
  const { activeTool, inspectorTab, project, selectedClip, currentTime, expandedFull } = props;
  const [newTextDraft, setNewTextDraft] = useState('ALL CUT PRO');

  const isInspectorMode = inspectorTab !== null && selectedClip !== null && activeTool === null;
  const availableTabs = selectedClip ? getInspectorTabsForClip(selectedClip) : [];
  const effectiveInspectorTab: ClipInspectorTab | null =
    isInspectorMode && inspectorTab
      ? availableTabs.includes(inspectorTab)
        ? inspectorTab
        : availableTabs[0] ?? 'basic'
      : null;

  const localTime = selectedClip
    ? Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime))
    : 0;

  const updateSelected = (updater: (c: Clip) => Clip) => {
    if (!selectedClip) return;
    props.onUpdateClip(selectedClip.id, updater);
  };

  const togglePropKeyframe = (propKey: KeyframeProperty, value: number) => {
    if (!selectedClip) return;
    updateSelected((c) => {
      const nextTrack = toggleKeyframeAtTime(c.keyframes[propKey], localTime, value, 'easeInOut');
      return {
        ...c,
        keyframes: { ...c.keyframes, [propKey]: nextTrack },
      };
    });
  };

  const renderKfDiamond = (propKey: KeyframeProperty, label: string, currentValue: number) => {
    if (!selectedClip) return null;
    const filled = hasKeyframeAtTime(selectedClip.keyframes[propKey], localTime);
    return (
      <button
        type="button"
        data-testid={`kf-diamond-${propKey}`}
        aria-label={`Toggle keyframe for ${label}`}
        aria-pressed={filled}
        title={filled ? `Remove ${label} keyframe at playhead` : `Add ${label} keyframe at playhead`}
        onClick={() => togglePropKeyframe(propKey, currentValue)}
        className={`p-1 rounded transition-colors ${
          filled
            ? 'text-[#D4AF37] bg-[#D4AF37]/15'
            : 'text-neutral-500 hover:text-white'
        }`}
      >
        <Diamond className={`w-3 h-3 ${filled ? 'fill-current' : ''}`} />
      </button>
    );
  };

  const renderBasicTransformControls = (clip: Clip) => {
    const tf = clip.transform;
    return (
      <div className="space-y-3.5">
        {/* Primary Clip Actions */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={props.onSplitAtPlayhead}
            className="min-h-[36px] px-3 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
          >
            <Scissors className="w-3.5 h-3.5" /> Split
          </button>
          <button
            type="button"
            onClick={props.onDuplicateSelected}
            className="min-h-[36px] px-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white flex items-center gap-1.5 hover:border-[#D4AF37]"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button
            type="button"
            onClick={props.onCopySelected}
            className="min-h-[36px] px-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white hover:border-[#D4AF37]"
          >
            Copy
          </button>
          {props.hasClipboardClip && (
            <button
              type="button"
              onClick={props.onPasteClipboard}
              className="min-h-[36px] px-3 rounded-xl bg-[#1A1A1A] border border-[#D4AF37]/60 text-xs text-[#D4AF37] flex items-center gap-1"
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste
            </button>
          )}
          <button
            type="button"
            onClick={props.onReplaceSelectedMedia}
            className="min-h-[36px] px-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white flex items-center gap-1.5 hover:border-[#D4AF37]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Replace
          </button>
          <button
            type="button"
            onClick={props.onDeleteSelected}
            className="min-h-[36px] px-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-1.5 hover:bg-red-900/50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-neutral-400 mr-1">Canvas Ratio:</span>
          {(['9:16', '16:9', '1:1', '4:5', 'custom'] as AspectRatioKey[]).map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => props.onUpdateAspectRatio(ar)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                project.aspectRatio === ar
                  ? 'bg-white text-[#080808] border-white font-bold'
                  : 'bg-[#171717] text-neutral-400 border-[#282828]'
              }`}
            >
              {ar === 'custom' ? 'Custom' : ar}
            </button>
          ))}
        </div>

        {/* Text quick editor when inspecting a Text clip in Basic tab */}
        {clip.kind === 'text' && clip.text && (
          <div className="bg-[#141414] border border-[#242424] rounded-xl p-3 space-y-2.5">
            <textarea
              rows={2}
              value={clip.text.content}
              onChange={(e) =>
                updateSelected((c) => ({
                  ...c,
                  name: e.target.value.slice(0, 18) || 'Text',
                  text: c.text ? { ...c.text, content: e.target.value } : undefined,
                }))
              }
              aria-label="Edit selected text"
              className="w-full p-2 rounded-lg bg-[#1A1A1A] border border-[#2D2D2D] text-xs text-white outline-none focus:border-[#D4AF37]"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Font Size ({clip.text.fontSize}px)</span>
              {renderKfDiamond('textSize', 'Text Size', clip.text.fontSize)}
            </div>
            <input
              type="range"
              min={16}
              max={96}
              step={1}
              value={clip.text.fontSize}
              onChange={(e) =>
                updateSelected((c) => ({
                  ...c,
                  text: c.text ? { ...c.text, fontSize: Number(e.target.value) } : undefined,
                }))
              }
              className="w-full allcut-slider"
            />
          </div>
        )}

        {/* Audio Volume with inline diamond if audio clip */}
        {clip.kind === 'audio' ? (
          <div className="bg-[#141414] border border-[#242424] rounded-xl p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300 font-medium">Audio Volume</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[#D4AF37]">{Math.round(clip.volume * 100)}%</span>
                {renderKfDiamond('volume', 'Volume', clip.volume)}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.volume}
              onChange={(e) => updateSelected((c) => ({ ...c, volume: Number(e.target.value) }))}
              className="w-full allcut-slider"
            />
          </div>
        ) : (
          /* Full Animatable Transform, Anchor & Crop Sliders with Inline Keyframe Diamonds */
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-xs bg-[#141414] border border-[#242424] rounded-xl p-3">
              {[
                { key: 'positionX' as const, label: 'Position X', min: -1, max: 1, step: 0.02 },
                { key: 'positionY' as const, label: 'Position Y', min: -1, max: 1, step: 0.02 },
                { key: 'scaleX' as const, label: 'Scale X', min: 0.1, max: 3.5, step: 0.02 },
                { key: 'scaleY' as const, label: 'Scale Y', min: 0.1, max: 3.5, step: 0.02 },
                { key: 'rotation' as const, label: 'Rotation', min: -180, max: 180, step: 1 },
                { key: 'opacity' as const, label: 'Opacity', min: 0, max: 1, step: 0.02 },
                { key: 'anchorX' as const, label: 'Anchor X', min: 0, max: 1, step: 0.02 },
                { key: 'anchorY' as const, label: 'Anchor Y', min: 0, max: 1, step: 0.02 },
              ].map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="text-neutral-400 truncate">{s.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-mono tabular-nums text-white text-[11px]">
                        {s.key === 'rotation' ? `${tf[s.key]}°` : tf[s.key].toFixed(2)}
                      </span>
                      {renderKfDiamond(s.key, s.label, tf[s.key])}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={tf[s.key]}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        transform: { ...c.transform, [s.key]: Number(e.target.value) },
                      }))
                    }
                    className="w-full allcut-slider"
                  />
                </div>
              ))}
            </div>

            {/* Crop Controls with Inline Keyframe Diamonds */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs bg-[#141414] border border-[#242424] rounded-xl p-3">
              {[
                { key: 'cropTop' as const, label: 'Crop Top' },
                { key: 'cropBottom' as const, label: 'Crop Bottom' },
                { key: 'cropLeft' as const, label: 'Crop Left' },
                { key: 'cropRight' as const, label: 'Crop Right' },
              ].map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="text-neutral-400 truncate">{s.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-mono tabular-nums text-white text-[11px]">
                        {Math.round(tf[s.key] * 100)}%
                      </span>
                      {renderKfDiamond(s.key, s.label, tf[s.key])}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.45}
                    step={0.01}
                    value={tf[s.key]}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        transform: { ...c.transform, [s.key]: Number(e.target.value) },
                      }))
                    }
                    className="w-full allcut-slider"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMaskControls = (clip: Clip) => {
    const mask = clip.mask;
    const updateMask = (patch: Partial<MaskConfig>) =>
      updateSelected((c) => ({ ...c, mask: { ...c.mask, ...patch } }));

    return (
      <div className="space-y-3.5">
        <div className="flex flex-wrap gap-1.5">
          {(['none', 'rectangle', 'circle', 'freehand', 'bezier'] as MaskShape[]).map((sh) => (
            <button
              key={sh}
              type="button"
              onClick={() => updateMask({ shape: sh })}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-medium capitalize border ${
                mask.shape === sh
                  ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                  : 'bg-[#171717] text-neutral-300 border-[#282828]'
              }`}
            >
              {sh}
            </button>
          ))}
          <button
            type="button"
            onClick={() => updateMask({ inverted: !mask.inverted })}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium border ${
              mask.inverted
                ? 'bg-white text-[#080808] border-white font-semibold'
                : 'bg-[#171717] text-neutral-300 border-[#282828]'
            }`}
          >
            Invert: {mask.inverted ? 'ON' : 'OFF'}
          </button>
        </div>

        {mask.shape !== 'none' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs bg-[#141414] border border-[#242424] rounded-xl p-3">
            {[
              { key: 'x' as const, kf: 'maskX' as const, label: 'Center X', min: 0, max: 1, step: 0.01 },
              { key: 'y' as const, kf: 'maskY' as const, label: 'Center Y', min: 0, max: 1, step: 0.01 },
              { key: 'width' as const, kf: 'maskWidth' as const, label: 'Width', min: 0.05, max: 1, step: 0.01 },
              { key: 'height' as const, kf: 'maskHeight' as const, label: 'Height', min: 0.05, max: 1, step: 0.01 },
              { key: 'feather' as const, kf: 'maskFeather' as const, label: 'Feather (px)', min: 0, max: 80, step: 1 },
              { key: 'expansion' as const, kf: null, label: 'Expansion', min: -50, max: 50, step: 1 },
            ].map((s) => (
              <div key={s.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-400">{s.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-white">{mask[s.key]}</span>
                    {s.kf && renderKfDiamond(s.kf, `Mask ${s.label}`, mask[s.key])}
                  </div>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={mask[s.key]}
                  onChange={(e) => updateMask({ [s.key]: Number(e.target.value) })}
                  className="w-full allcut-slider"
                />
              </div>
            ))}
          </div>
        )}

        {/* Chroma Key / Green Screen Removal */}
        <div className="bg-[#141414] border border-[#242424] rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
              <input
                type="checkbox"
                checked={mask.chromaKey.enabled}
                onChange={(e) =>
                  updateMask({ chromaKey: { ...mask.chromaKey, enabled: e.target.checked } })
                }
                className="accent-[#D4AF37]"
              />
              Chroma Key / Green Screen Removal
            </label>
            <input
              type="color"
              aria-label="Chroma key color"
              value={mask.chromaKey.keyColor}
              onChange={(e) =>
                updateMask({ chromaKey: { ...mask.chromaKey, keyColor: e.target.value } })
              }
              className="w-8 h-6 rounded bg-transparent cursor-pointer"
            />
          </div>

          {mask.chromaKey.enabled && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Similarity</span>
                  <span className="font-mono text-white">{Math.round(mask.chromaKey.similarity * 100)}%</span>
                </div>
                <input
                  type="range" min={0.05} max={0.95} step={0.02}
                  value={mask.chromaKey.similarity}
                  onChange={(e) =>
                    updateMask({ chromaKey: { ...mask.chromaKey, similarity: Number(e.target.value) } })
                  }
                  className="w-full allcut-slider"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Smoothness</span>
                  <span className="font-mono text-white">{Math.round(mask.chromaKey.smoothness * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={0.8} step={0.02}
                  value={mask.chromaKey.smoothness}
                  onChange={(e) =>
                    updateMask({ chromaKey: { ...mask.chromaKey, smoothness: Number(e.target.value) } })
                  }
                  className="w-full allcut-slider"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Spill Guard</span>
                  <span className="font-mono text-white">{Math.round(mask.chromaKey.spillSuppression * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={mask.chromaKey.spillSuppression}
                  onChange={(e) =>
                    updateMask({ chromaKey: { ...mask.chromaKey, spillSuppression: Number(e.target.value) } })
                  }
                  className="w-full allcut-slider"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderClipAudioControls = (clip: Clip) => (
    <div className="bg-[#141414] border border-[#242424] rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Music className="w-4 h-4 text-[#D4AF37]" /> {clip.name} Audio
        </div>
        <button
          type="button"
          onClick={() => updateSelected((c) => ({ ...c, muted: !c.muted }))}
          className="px-2.5 py-1 rounded-lg bg-[#1E1E1E] text-xs text-neutral-300 flex items-center gap-1"
        >
          {clip.muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-[#D4AF37]" />}
          {clip.muted ? 'Muted' : 'Active'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-neutral-400">Volume</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[#D4AF37]">{Math.round(clip.volume * 100)}%</span>
              {renderKfDiamond('volume', 'Volume', clip.volume)}
            </div>
          </div>
          <input
            type="range" min={0} max={2} step={0.05}
            value={clip.volume}
            onChange={(e) => updateSelected((c) => ({ ...c, volume: Number(e.target.value) }))}
            className="w-full allcut-slider"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-neutral-400">Fade In</span>
            <span className="font-mono text-white">{clip.fadeIn.toFixed(1)}s</span>
          </div>
          <input
            type="range" min={0} max={3} step={0.1}
            value={clip.fadeIn}
            onChange={(e) => updateSelected((c) => ({ ...c, fadeIn: Number(e.target.value) }))}
            className="w-full allcut-slider"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-neutral-400">Fade Out</span>
            <span className="font-mono text-white">{clip.fadeOut.toFixed(1)}s</span>
          </div>
          <input
            type="range" min={0} max={3} step={0.1}
            value={clip.fadeOut}
            onChange={(e) => updateSelected((c) => ({ ...c, fadeOut: Number(e.target.value) }))}
            className="w-full allcut-slider"
          />
        </div>
      </div>
    </div>
  );

  const renderEffectsForClip = (clip: Clip, initialCategory: 'all' | 'color' | 'sharpen' = 'all') => (
    <EffectsLibraryPanel
      clip={clip}
      currentTime={currentTime}
      initialCategory={initialCategory}
      favoriteIds={props.favoriteEffects}
      compareSplit={props.compareSplit}
      customEffects={props.customEffects}
      onToggleFavorite={props.onToggleFavoriteEffect}
      onToggleCompareSplit={props.onToggleCompareSplit}
      onUpdateClipEffects={(nextFx) => updateSelected((c) => ({ ...c, effects: nextFx }))}
      onApplyEffectsToAllClips={props.onApplyEffectsToAll}
      onSavePresetFromClip={props.onSavePreset}
      onSaveCustomEffect={props.onSaveCustomEffect}
      onDeleteCustomEffect={props.onDeleteCustomEffect}
      onRenameCustomEffect={props.onRenameCustomEffect}
      onApplyCustomEffect={props.onApplyCustomEffect}
      onToggleEffectParamKeyframe={(instanceId, paramKey, val) =>
        togglePropKeyframe(`fx:${instanceId}:${paramKey}`, val)
      }
    />
  );

  const renderBody = () => {
    // 1) Clip Inspector Mode (opened by tapping any clip/layer on the timeline)
    if (isInspectorMode && selectedClip && effectiveInspectorTab) {
      switch (effectiveInspectorTab) {
        case 'basic':
          return renderBasicTransformControls(selectedClip);
        case 'keyframes':
          return (
            <KeyframePanel
              clip={selectedClip}
              currentTime={currentTime}
              onSeek={props.onSeek}
              onUpdateClip={updateSelected}
            />
          );
        case 'effects':
          return renderEffectsForClip(selectedClip, 'all');
        case 'speed':
          return (
            <SpeedPanel
              clip={selectedClip}
              currentTime={currentTime}
              onUpdateSpeed={(next: SpeedConfig) => updateSelected((c) => ({ ...c, speed: next }))}
              onToggleSpeedKeyframe={(val) => togglePropKeyframe('speed', val)}
            />
          );
        case 'mask':
          return renderMaskControls(selectedClip);
        case 'audio':
          return renderClipAudioControls(selectedClip);
      }
    }

    if (!activeTool) return null;

    // 2) Standalone Bottom-Toolbar Panels
    if (activeTool === 'beatSync') {
      return (
        <BeatSyncPanel
          project={project}
          selectedClip={selectedClip}
          currentTime={currentTime}
          isAnalyzing={props.isAnalyzingBeats}
          canUndoBeatSyncSpeed={props.canUndoBeatSyncSpeed}
          onDetectBeats={props.onDetectBeats}
          onUpdateBeatSync={props.onUpdateBeatSync}
          onUpdateAudioBeatAnalysis={props.onUpdateAudioAnalysis}
          onApplyBeatSync={props.onApplyBeatSync}
          onUndoBeatSyncSpeed={props.onUndoBeatSyncSpeed}
          onPreviewBeatSync={props.onPreviewBeatSync}
          onOpenSpeedGraph={props.onOpenSpeedGraph}
          onAddBuiltinAudio={props.onAddBuiltinAudio}
          onImportAudioFile={() => props.onImportMedia('audio')}
        />
      );
    }

    if (activeTool === 'audio') {
      const audioClips = project.clips.filter((c) => c.kind === 'audio');
      const activeAudio = selectedClip?.kind === 'audio' ? selectedClip : audioClips[0] ?? null;
      return (
        <div className="space-y-3.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => props.onImportMedia('audio')}
              className="min-h-[40px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> Import Local Audio
            </button>
            {[110, 128, 140].map((bpm) => (
              <button
                key={bpm}
                type="button"
                onClick={() => props.onAddBuiltinAudio(bpm)}
                className="min-h-[40px] px-3 rounded-xl bg-[#191919] border border-[#2C2C2C] text-xs text-white hover:border-[#D4AF37]"
              >
                + {bpm} BPM Studio Beat
              </button>
            ))}
          </div>

          {activeAudio && (
            <div className="bg-[#141414] border border-[#242424] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Music className="w-4 h-4 text-[#D4AF37]" /> {activeAudio.name}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    props.onUpdateClip(activeAudio.id, (c) => ({ ...c, muted: !c.muted }))
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#1E1E1E] text-xs text-neutral-300 flex items-center gap-1"
                >
                  {activeAudio.muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-[#D4AF37]" />}
                  {activeAudio.muted ? 'Muted' : 'Active'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Volume</span>
                    <span className="font-mono text-[#D4AF37]">{Math.round(activeAudio.volume * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={2} step={0.05}
                    value={activeAudio.volume}
                    onChange={(e) => props.onUpdateClip(activeAudio.id, (c) => ({ ...c, volume: Number(e.target.value) }))}
                    className="w-full allcut-slider"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Fade In</span>
                    <span className="font-mono text-white">{activeAudio.fadeIn.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range" min={0} max={3} step={0.1}
                    value={activeAudio.fadeIn}
                    onChange={(e) => props.onUpdateClip(activeAudio.id, (c) => ({ ...c, fadeIn: Number(e.target.value) }))}
                    className="w-full allcut-slider"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Fade Out</span>
                    <span className="font-mono text-white">{activeAudio.fadeOut.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range" min={0} max={3} step={0.1}
                    value={activeAudio.fadeOut}
                    onChange={(e) => props.onUpdateClip(activeAudio.id, (c) => ({ ...c, fadeOut: Number(e.target.value) }))}
                    className="w-full allcut-slider"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTool === 'text' || activeTool === 'captions') {
      const isCaptionMode = activeTool === 'captions';
      const activeTextClip = selectedClip?.kind === 'text' ? selectedClip : null;
      return (
        <div className="space-y-3.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTextDraft}
              onChange={(e) => setNewTextDraft(e.target.value)}
              placeholder={isCaptionMode ? 'Enter subtitle caption line…' : 'Enter title text…'}
              aria-label="New text content"
              className="flex-1 px-3 py-2 rounded-xl bg-[#161616] border border-[#2B2B2B] text-xs text-white outline-none focus:border-[#D4AF37]"
            />
            <button
              type="button"
              onClick={() => props.onAddTextClip(newTextDraft.trim() || 'ALL CUT', isCaptionMode)}
              className="min-h-[40px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> {isCaptionMode ? 'Add Subtitle' : 'Add Text'}
            </button>
          </div>

          {activeTextClip?.text && (
            <div className="bg-[#141414] border border-[#242424] rounded-xl p-3.5 space-y-3">
              <textarea
                rows={2}
                value={activeTextClip.text.content}
                onChange={(e) =>
                  updateSelected((c) => ({
                    ...c,
                    name: e.target.value.slice(0, 18) || 'Text',
                    text: c.text ? { ...c.text, content: e.target.value } : undefined,
                  }))
                }
                aria-label="Edit selected text"
                className="w-full p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2D2D2D] text-xs text-white outline-none focus:border-[#D4AF37]"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-neutral-400">Size ({activeTextClip.text.fontSize}px)</span>
                    {renderKfDiamond('textSize', 'Text Size', activeTextClip.text.fontSize)}
                  </div>
                  <input
                    type="range" min={16} max={96} step={1}
                    value={activeTextClip.text.fontSize}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        text: c.text ? { ...c.text, fontSize: Number(e.target.value) } : undefined,
                      }))
                    }
                    className="w-full allcut-slider"
                  />
                </div>
                <div>
                  <span className="text-neutral-400 block mb-1">Stroke ({activeTextClip.text.strokeWidth}px)</span>
                  <input
                    type="range" min={0} max={10} step={0.5}
                    value={activeTextClip.text.strokeWidth}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        text: c.text ? { ...c.text, strokeWidth: Number(e.target.value) } : undefined,
                      }))
                    }
                    className="w-full allcut-slider"
                  />
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-neutral-400">Text Color</span>
                  <input
                    type="color"
                    value={activeTextClip.text.color}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        text: c.text ? { ...c.text, color: e.target.value } : undefined,
                      }))
                    }
                    className="h-8 w-full rounded bg-transparent cursor-pointer"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-neutral-400">Stroke Color</span>
                  <input
                    type="color"
                    value={activeTextClip.text.strokeColor}
                    onChange={(e) =>
                      updateSelected((c) => ({
                        ...c,
                        text: c.text ? { ...c.text, strokeColor: e.target.value } : undefined,
                      }))
                    }
                    className="h-8 w-full rounded bg-transparent cursor-pointer"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['Plus Jakarta Sans', 'DM Sans', 'JetBrains Mono', 'Georgia'] as const).map((fam) => (
                  <button
                    key={fam}
                    type="button"
                    onClick={() =>
                      updateSelected((c) => ({
                        ...c,
                        text: c.text ? { ...c.text, fontFamily: fam } : undefined,
                      }))
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] border ${
                      activeTextClip.text?.fontFamily === fam
                        ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                        : 'bg-[#1B1B1B] text-neutral-300 border-[#2B2B2B]'
                    }`}
                  >
                    {fam.split(' ')[0]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateSelected((c) => ({
                      ...c,
                      text: c.text
                        ? {
                            ...c.text,
                            backgroundColor:
                              c.text.backgroundColor === 'transparent' ? 'rgba(8,8,8,0.75)' : 'transparent',
                          }
                        : undefined,
                    }))
                  }
                  className="px-2.5 py-1.5 rounded-lg text-[11px] bg-[#1B1B1B] border border-[#2B2B2B] text-neutral-200"
                >
                  Bg Box: {activeTextClip.text.backgroundColor === 'transparent' ? 'OFF' : 'ON'}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTool === 'overlay') {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => props.onImportMedia('overlay')}
              className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> Add Video / Image Overlay
            </button>
            <button
              type="button"
              onClick={props.onAddBuiltinOverlay}
              className="min-h-[42px] px-4 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white font-semibold hover:border-[#D4AF37] flex items-center gap-1.5"
            >
              <Layers className="w-4 h-4 text-[#D4AF37]" /> + Studio Prism Overlay
            </button>
            <button
              type="button"
              onClick={props.onAddAdjustmentLayer}
              className="min-h-[42px] px-4 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white font-semibold hover:border-[#D4AF37] flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37]" /> + Adjustment Layer
            </button>
          </div>
          {selectedClip && (
            <div className="grid grid-cols-2 gap-3 bg-[#141414] border border-[#242424] rounded-xl p-3 text-xs">
              <div>
                <label className="text-neutral-400 block mb-1">Blend Mode</label>
                <select
                  value={selectedClip.blendMode}
                  onChange={(e) => updateSelected((c) => ({ ...c, blendMode: e.target.value as BlendMode }))}
                  className="w-full bg-[#1C1C1C] border border-[#2E2E2E] rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {BLEND_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-400">Layer Opacity</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[#D4AF37]">{Math.round(selectedClip.transform.opacity * 100)}%</span>
                    {renderKfDiamond('opacity', 'Opacity', selectedClip.transform.opacity)}
                  </div>
                </div>
                <input
                  type="range" min={0} max={1} step={0.02}
                  value={selectedClip.transform.opacity}
                  onChange={(e) =>
                    updateSelected((c) => ({
                      ...c,
                      transform: { ...c.transform, opacity: Number(e.target.value) },
                    }))
                  }
                  className="w-full allcut-slider mt-1"
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTool === 'stickers') {
      return (
        <div className="space-y-2.5">
          <div className="text-xs text-neutral-400">Tap a geometric graphic sticker to add to the timeline (can be attached to Motion Tracking)</div>
          <div className="grid grid-cols-6 gap-2">
            {STICKERS.map((glyph) => (
              <button
                key={glyph}
                type="button"
                onClick={() => props.onAddStickerClip(glyph)}
                className="min-h-[48px] rounded-xl bg-[#171717] border border-[#282828] hover:border-[#D4AF37] text-xl text-[#D4AF37] flex items-center justify-center transition-colors"
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (!selectedClip) {
      return (
        <div className="py-6 text-center text-xs text-neutral-400">
          Select a clip on the timeline above to edit with {TOOL_TITLES[activeTool]}.
        </div>
      );
    }

    if (activeTool === 'effects' || activeTool === 'filters' || activeTool === 'adjust' || activeTool === 'sharpen') {
      const cat =
        activeTool === 'sharpen'
          ? 'sharpen'
          : activeTool === 'filters' || activeTool === 'adjust'
            ? 'color'
            : 'all';
      return renderEffectsForClip(selectedClip, cat);
    }

    if (activeTool === 'keyframe') {
      return (
        <KeyframePanel
          clip={selectedClip}
          currentTime={currentTime}
          onSeek={props.onSeek}
          onUpdateClip={updateSelected}
        />
      );
    }

    if (activeTool === 'speed') {
      return (
        <SpeedPanel
          clip={selectedClip}
          currentTime={currentTime}
          onUpdateSpeed={(next: SpeedConfig) => updateSelected((c) => ({ ...c, speed: next }))}
          onToggleSpeedKeyframe={(val) => togglePropKeyframe('speed', val)}
        />
      );
    }

    if (activeTool === 'edit') {
      return renderBasicTransformControls(selectedClip);
    }

    if (activeTool === 'tracking') {
      const trk = selectedClip.tracking;
      const attachableClips = project.clips.filter(
        (c) => c.id !== selectedClip.id && c.kind !== 'audio'
      );

      return (
        <div className="space-y-3.5">
          {!trk ? (
            <div className="text-center py-4 space-y-2.5">
              <Crosshair className="w-7 h-7 text-[#D4AF37] mx-auto" />
              <p className="text-xs text-neutral-300">
                Initialize a ZNCC pixel motion tracker on <strong>{selectedClip.name}</strong>, then tap the preview canvas to lock onto a moving subject.
              </p>
              <button
                type="button"
                onClick={() => props.onInitTrackerOnClip(selectedClip.id)}
                className="min-h-[42px] px-5 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold"
              >
                Place Tracker on Preview
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(['point', 'object', 'region'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        updateSelected((c) => ({
                          ...c,
                          tracking: c.tracking ? { ...c.tracking, mode } : undefined,
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize border ${
                        trk.mode === mode
                          ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                          : 'bg-[#171717] text-neutral-300 border-[#2A2A2A]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={props.isTracking}
                    onClick={() => props.onRunMotionTracking(selectedClip.id, 'backward')}
                    className="min-h-[36px] px-3 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white hover:border-[#D4AF37] disabled:opacity-50"
                  >
                    ◀ Track Backward
                  </button>
                  <button
                    type="button"
                    disabled={props.isTracking}
                    onClick={() => props.onRunMotionTracking(selectedClip.id, 'forward')}
                    className="min-h-[36px] px-3.5 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {props.isTracking ? `Tracking ${props.trackingProgress}%` : 'Track Forward'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {[
                  { key: 'trackPosition' as const, label: 'Position' },
                  { key: 'trackRotation' as const, label: 'Rotation' },
                  { key: 'trackScale' as const, label: 'Scale' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[#161616] border border-[#252525] text-neutral-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={trk[opt.key]}
                      onChange={(e) =>
                        updateSelected((c) => ({
                          ...c,
                          tracking: c.tracking ? { ...c.tracking, [opt.key]: e.target.checked } : undefined,
                        }))
                      }
                      className="accent-[#D4AF37]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#141414] border border-[#242424] rounded-xl p-3 text-xs">
                <div>
                  <span className="text-neutral-400">Tracked Frames: </span>
                  <strong className="font-mono text-[#D4AF37]">{trk.points.length}</strong>
                  <span className="text-neutral-500 ml-2">Tip: Tap preview canvas to re-center target</span>
                </div>
                <button
                  type="button"
                  disabled={trk.points.length < 2}
                  onClick={() => {
                    const kfs = trackingPointsToKeyframes(trk.points);
                    updateSelected((c) => ({
                      ...c,
                      keyframes: {
                        ...c.keyframes,
                        positionX: kfs.positionX,
                        positionY: kfs.positionY,
                        scaleX: kfs.scaleX,
                        scaleY: kfs.scaleY,
                        rotation: kfs.rotation,
                      },
                    }));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1F1F1F] border border-[#D4AF37]/50 text-[#D4AF37] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40"
                >
                  <Diamond className="w-3 h-3" /> Convert to Keyframes
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-300">Attach Layer to Tracked Path:</span>
                {attachableClips.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => props.onAddTextClip('TRACKED TARGET', false)}
                    className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-[#D4AF37] flex items-center gap-1"
                  >
                    <Type className="w-3.5 h-3.5" /> + Add Text Layer to Attach
                  </button>
                ) : (
                  <select
                    aria-label="Attach timeline layer to tracker"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) props.onAttachClipToTracker(selectedClip.id, e.target.value);
                    }}
                    className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Select layer to attach…</option>
                    {attachableClips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.kind}){c.attachedToTrackClipId === selectedClip.id ? ' ✓ Attached' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    if (activeTool === 'mask') {
      return renderMaskControls(selectedClip);
    }

    if (activeTool === 'transition') {
      const tr = selectedClip.transitionIn;
      const updateTr = (patch: Partial<TransitionConfig>) =>
        updateSelected((c) => ({ ...c, transitionIn: { ...c.transitionIn, ...patch } }));

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {TRANSITIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => updateTr({ type: t.id })}
                className={`min-h-[36px] px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                  tr.type === t.id
                    ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                    : 'bg-[#171717] text-neutral-300 border-[#282828] hover:border-neutral-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tr.type !== 'none' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#141414] border border-[#242424] rounded-xl p-3 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Duration</span>
                  <span className="font-mono text-[#D4AF37]">{tr.duration.toFixed(2)}s</span>
                </div>
                <input
                  type="range" min={0.15} max={2} step={0.05}
                  value={tr.duration}
                  onChange={(e) => updateTr({ duration: Number(e.target.value) })}
                  className="w-full allcut-slider"
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Intensity</span>
                  <span className="font-mono text-white">{Math.round(tr.intensity * 100)}%</span>
                </div>
                <input
                  type="range" min={0.1} max={1} step={0.05}
                  value={tr.intensity}
                  onChange={(e) => updateTr({ intensity: Number(e.target.value) })}
                  className="w-full allcut-slider"
                />
              </div>
              <label className="flex items-center gap-2 text-neutral-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tr.beatSynced}
                  onChange={(e) => updateTr({ beatSynced: e.target.checked })}
                  className="accent-[#D4AF37]"
                />
                Beat-Synced Timing
              </label>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      data-testid={isInspectorMode ? 'clip-inspector-panel' : 'editor-tool-panel'}
      className={`bg-[#101010] border-t border-[#262626] flex flex-col transition-all duration-200 ${
        expandedFull ? 'max-h-[58vh] min-h-[42vh]' : 'max-h-[38vh] min-h-[200px]'
      }`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1E1E1E] shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isInspectorMode && selectedClip ? (
            <>
              <span className="font-display text-xs font-bold text-[#D4AF37] tracking-wide truncate">
                {selectedClip.name}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0">
                {selectedClip.kind}
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-xs font-bold text-white tracking-wide">
                {activeTool ? TOOL_TITLES[activeTool] : 'Inspector'}
              </span>
              {selectedClip && (
                <span className="text-[11px] text-neutral-500 truncate">· {selectedClip.name}</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={props.onToggleExpand}
            aria-label={expandedFull ? 'Collapse panel to half height' : 'Expand panel to full height'}
            className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
          >
            {expandedFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close panel"
            className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Clip Inspector Tab Bar (Basic · Keyframes · Effects · Speed · Mask · Audio — varying by clip type) */}
      {isInspectorMode && selectedClip && effectiveInspectorTab && (
        <div
          role="tablist"
          aria-label="Clip inspector tabs"
          className="flex items-center gap-1 px-3 py-1.5 border-b border-[#1A1A1A] bg-[#0D0D0D] overflow-x-auto no-scrollbar shrink-0"
        >
          {availableTabs.map((tab) => {
            const active = effectiveInspectorTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`inspector-tab-${tab}`}
                onClick={() => props.onSelectInspectorTab(tab)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#D4AF37] text-[#080808]'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {INSPECTOR_TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable Panel Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">{renderBody()}</div>
    </div>
  );
};
