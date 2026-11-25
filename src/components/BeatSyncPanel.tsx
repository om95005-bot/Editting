import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Gauge,
  Music,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import type {
  BeatAnalysisResult,
  BeatRampStyle,
  BeatSyncConfig,
  BeatSyncPattern,
  Clip,
  Project,
} from '../types/editor';
import { generateBeatSyncSpeedCurve } from '../engine/speedRemap';

interface BeatSyncPanelProps {
  project: Project;
  selectedClip: Clip | null;
  currentTime: number;
  isAnalyzing: boolean;
  canUndoBeatSyncSpeed?: boolean;
  onDetectBeats: (audioClipId: string, sensitivity: number, manualBpm?: number | null) => void;
  onUpdateBeatSync: (next: BeatSyncConfig) => void;
  onUpdateAudioBeatAnalysis: (audioClipId: string, next: BeatAnalysisResult) => void;
  onApplyBeatSync: (scope: 'selected' | 'all') => void;
  onUndoBeatSyncSpeed: () => void;
  onPreviewBeatSync: () => void;
  onOpenSpeedGraph?: () => void;
  onAddBuiltinAudio: (bpm: number) => void;
  onImportAudioFile: () => void;
}

const PATTERNS: { id: BeatSyncPattern; label: string }[] = [
  { id: 'every', label: 'Every beat' },
  { id: 'every2', label: 'Every 2nd' },
  { id: 'every4', label: 'Every 4th' },
  { id: 'strongOnly', label: 'Strong beats only' },
  { id: 'selected', label: 'Selected beats' },
];

const SPEED_MODES: { id: BeatRampStyle; label: string; desc: string }[] = [
  { id: 'speedUpOnBeat', label: 'Speed up on beat', desc: 'Accelerates sharply right at each beat' },
  { id: 'slowDownOnBeat', label: 'Slow down on beat', desc: 'Drops into dramatic slow-mo on each beat' },
  { id: 'beatSlowFast', label: 'Slow-to-fast ramp', desc: 'Slow anticipation ramping up to fast accent' },
  { id: 'beatFastSlow', label: 'Fast-to-slow ramp', desc: 'Fast surge landing into slow-motion impact' },
  { id: 'customBeatRamp', label: 'Custom', desc: 'Balanced beat-anchored editable curve' },
];

export const BeatSyncPanel: React.FC<BeatSyncPanelProps> = ({
  project,
  selectedClip,
  currentTime,
  isAnalyzing,
  canUndoBeatSyncSpeed = false,
  onDetectBeats,
  onUpdateBeatSync,
  onUpdateAudioBeatAnalysis,
  onApplyBeatSync,
  onUndoBeatSyncSpeed,
  onPreviewBeatSync,
  onOpenSpeedGraph,
  onAddBuiltinAudio,
  onImportAudioFile,
}) => {
  const audioClips = project.clips.filter((c) => c.kind === 'audio');
  const [selectedAudioId, setSelectedAudioId] = useState<string>(audioClips[0]?.id ?? '');
  const activeAudio = audioClips.find((c) => c.id === selectedAudioId) ?? audioClips[0] ?? null;
  const cfg = project.beatSync;
  const analysis = activeAudio?.beatAnalysis;
  const [manualBpmInput, setManualBpmInput] = useState<string>(
    analysis?.manualBpmOverride ? String(analysis.manualBpmOverride) : ''
  );

  // Compute preview speed curve for the visual chart
  const previewClip =
    selectedClip && (selectedClip.kind === 'video' || selectedClip.kind === 'image')
      ? selectedClip
      : project.clips.find((c) => c.kind === 'video' || c.kind === 'image') ?? null;

  const previewCurve = useMemo(() => {
    if (!analysis || !previewClip) return [];
    const globalBeats = analysis.beats.map((b) => ({
      ...b,
      time: b.time + (activeAudio?.startTime ?? 0),
    }));
    return generateBeatSyncSpeedCurve(globalBeats, previewClip.startTime, previewClip.duration, cfg);
  }, [analysis, previewClip, activeAudio?.startTime, cfg]);

  const handleToggleBeatSelect = (beatId: string) => {
    if (!activeAudio || !analysis) return;
    onUpdateAudioBeatAnalysis(activeAudio.id, {
      ...analysis,
      beats: analysis.beats.map((b) => (b.id === beatId ? { ...b, selected: !b.selected } : b)),
    });
  };

  const handleDeleteBeat = (beatId: string) => {
    if (!activeAudio || !analysis) return;
    onUpdateAudioBeatAnalysis(activeAudio.id, {
      ...analysis,
      beats: analysis.beats.filter((b) => b.id !== beatId),
    });
  };

  const handleAddManualBeat = () => {
    if (!activeAudio) return;
    const localTime = Math.max(0, Math.min(activeAudio.duration, currentTime - activeAudio.startTime));
    const currentBeats = analysis?.beats ?? [];
    const newBeat = {
      id: `beat_man_${Date.now()}`,
      time: Math.round(localTime * 1000) / 1000,
      strength: 1,
      isStrong: true,
      isDownbeat: true,
      barIndex: Math.floor(currentBeats.length / 4) + 1,
      beatInBar: 1,
      selected: true,
      manual: true,
    };
    const nextBeats = [...currentBeats, newBeat].sort((a, b) => a.time - b.time);
    onUpdateAudioBeatAnalysis(activeAudio.id, {
      bpm: analysis?.bpm ?? 120,
      manualBpmOverride: analysis?.manualBpmOverride ?? null,
      confidence: analysis?.confidence ?? 0.9,
      beatIntervalSec: analysis?.beatIntervalSec ?? 0.5,
      beats: nextBeats,
      analyzedAt: Date.now(),
    });
  };

  if (!activeAudio) {
    return (
      <div className="space-y-4 text-center py-4">
        <Music className="w-8 h-8 text-[#D4AF37] mx-auto" />
        <div>
          <h4 className="text-sm font-semibold text-white">No Audio Track Detected</h4>
          <p className="text-xs text-neutral-400 mt-1">
            Import a local music file or add an offline rhythmic studio track to run FFT beat analysis.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onImportAudioFile}
            className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> Import Music File
          </button>
          <button
            type="button"
            onClick={() => onAddBuiltinAudio(128)}
            className="min-h-[42px] px-4 rounded-xl bg-[#1D1D1D] border border-[#2E2E2E] text-white text-xs font-semibold hover:border-[#D4AF37]"
          >
            + Add 128 BPM Studio Track
          </button>
        </div>
      </div>
    );
  }

  const strongCount = analysis?.beats.filter((b) => b.isStrong).length ?? 0;
  const downbeatCount = analysis?.beats.filter((b) => b.isDownbeat).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Audio source selector & Detect Beats CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <select
            aria-label="Audio track for beat detection"
            value={activeAudio.id}
            onChange={(e) => setSelectedAudioId(e.target.value)}
            className="bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white rounded-lg px-2.5 py-2 outline-none focus:border-[#D4AF37]"
          >
            {audioClips.map((ac) => (
              <option key={ac.id} value={ac.id}>
                {ac.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onImportAudioFile}
            aria-label="Import new music track"
            className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-neutral-300 hover:text-white"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          disabled={isAnalyzing}
          onClick={() => {
            const overrideNum = Number(manualBpmInput);
            onDetectBeats(
              activeAudio.id,
              cfg.sensitivity,
              manualBpmInput.trim() && overrideNum >= 40 ? overrideNum : null
            );
          }}
          className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#C89F28] to-[#F0D264] text-[#080808] font-bold text-xs flex items-center gap-1.5 hover:brightness-105 disabled:opacity-60"
        >
          <Activity className="w-4 h-4" />
          {isAnalyzing ? 'Analyzing Audio…' : 'Detect Beats'}
        </button>
      </div>

      {/* Analysis Readout + Manual BPM Override */}
      {analysis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#141414] border border-[#232323] rounded-xl p-3">
          <div>
            <div className="text-[10px] text-neutral-500">Detected BPM</div>
            <div className="font-mono tabular-nums text-base font-bold text-[#D4AF37]">
              {analysis.manualBpmOverride ?? analysis.bpm}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">Beat Interval</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-white">
              {Math.round(analysis.beatIntervalSec * 1000)} ms
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">Beats / Strong</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-white">
              {analysis.beats.length} / <span className="text-[#D4AF37]">{strongCount}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-500">Downbeats · Conf</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-white">
              {downbeatCount} · {Math.round(analysis.confidence * 100)}%
            </div>
          </div>
        </div>
      )}

      {/* Manual BPM Override & Beat Marker Editing */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-[#161616] border border-[#262626] rounded-lg px-2.5 py-1.5">
          <label htmlFor="manual-bpm-input" className="text-[11px] text-neutral-400">
            BPM Override
          </label>
          <input
            id="manual-bpm-input"
            type="number"
            min={40}
            max={240}
            placeholder={analysis ? String(analysis.bpm) : '128'}
            value={manualBpmInput}
            onChange={(e) => setManualBpmInput(e.target.value)}
            className="w-16 bg-transparent text-xs font-mono tabular-nums text-white outline-none text-right"
          />
        </div>
        <button
          type="button"
          onClick={handleAddManualBeat}
          className="min-h-[34px] px-3 rounded-lg bg-[#1A1A1A] border border-[#2B2B2B] text-[11px] font-medium text-white hover:border-[#D4AF37] flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5 text-[#D4AF37]" /> Add Beat at Playhead
        </button>
      </div>

      {/* Interactive Beat Markers Strip */}
      {analysis && analysis.beats.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
            <span>Beat Markers (tap to toggle selection)</span>
            <span className="font-mono tabular-nums">{analysis.beats.filter((b) => b.selected).length} selected</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
            {analysis.beats.slice(0, 48).map((beat, idx) => (
              <div
                key={beat.id}
                className={`shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-mono tabular-nums ${
                  beat.selected
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#F7E396]'
                    : 'bg-[#161616] border-[#262626] text-neutral-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggleBeatSelect(beat.id)}
                  className="hover:text-white"
                  title={`Bar ${beat.barIndex} Beat ${beat.beatInBar} (${Math.round(beat.strength * 100)}% energy)`}
                >
                  #{idx + 1} {beat.time.toFixed(2)}s{beat.isDownbeat ? ' ★' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBeat(beat.id)}
                  aria-label={`Remove beat ${idx + 1}`}
                  className="text-neutral-500 hover:text-red-400 ml-0.5"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== BEAT SYNC SPEED SECTION ==================== */}
      <div
        data-testid="beat-sync-speed-section"
        className="rounded-xl bg-[#131313] border border-[#D4AF37]/30 p-3.5 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[#D4AF37]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Speed</h4>
            <span className="text-[10px] text-neutral-400">Beat-locked speed control points</span>
          </div>
          {onOpenSpeedGraph && (
            <button
              type="button"
              onClick={onOpenSpeedGraph}
              className="text-[11px] font-semibold text-[#D4AF37] hover:text-[#F7E396]"
            >
              Open Speed Graph →
            </button>
          )}
        </div>

        {/* Mode: Speed up on beat · Slow down on beat · Slow-to-fast ramp · Fast-to-slow ramp · Custom */}
        <div>
          <div className="text-[11px] font-medium text-neutral-300 mb-1.5">Mode</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {SPEED_MODES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onUpdateBeatSync({ ...cfg, rampStyle: st.id })}
                className={`text-left p-2 rounded-xl border transition-colors ${
                  cfg.rampStyle === st.id
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white'
                    : 'bg-[#171717] border-[#262626] text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <div className="text-[11px] font-semibold leading-tight">{st.label}</div>
                <div className="text-[9px] text-neutral-400 mt-0.5 line-clamp-1">{st.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Apply on: every beat · every 2nd · every 4th · strong beats only · selected beats */}
        <div>
          <div className="text-[11px] font-medium text-neutral-300 mb-1.5">Apply on</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {PATTERNS.map((pat) => (
              <button
                key={pat.id}
                type="button"
                onClick={() => onUpdateBeatSync({ ...cfg, pattern: pat.id })}
                className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                  cfg.pattern === pat.id
                    ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
                    : 'bg-[#171717] text-neutral-300 border-[#282828] hover:border-[#D4AF37]/50'
                }`}
              >
                {pat.label}
              </button>
            ))}
          </div>
        </div>

        {/* All 6 Speed Sliders: min speed, max speed, ramp duration, smoothness, intensity, beat offset */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Min speed</span>
              <span className="font-mono tabular-nums text-white">{cfg.minSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={cfg.minSpeed}
              onChange={(e) => onUpdateBeatSync({ ...cfg, minSpeed: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Max speed</span>
              <span className="font-mono tabular-nums text-[#D4AF37]">{cfg.maxSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={1.2}
              max={8}
              step={0.1}
              value={cfg.maxSpeed}
              onChange={(e) => onUpdateBeatSync({ ...cfg, maxSpeed: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Ramp duration</span>
              <span className="font-mono tabular-nums text-white">{Math.round(cfg.rampDuration * 1000)} ms</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.01}
              value={cfg.rampDuration}
              onChange={(e) => onUpdateBeatSync({ ...cfg, rampDuration: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Smoothness</span>
              <span className="font-mono tabular-nums text-white">{Math.round(cfg.rampSmoothness * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={cfg.rampSmoothness}
              onChange={(e) => onUpdateBeatSync({ ...cfg, rampSmoothness: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Intensity</span>
              <span className="font-mono tabular-nums text-white">{Math.round(cfg.curveIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={cfg.curveIntensity}
              onChange={(e) => onUpdateBeatSync({ ...cfg, curveIntensity: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-neutral-400">Beat offset</span>
              <span className="font-mono tabular-nums text-white">{cfg.beatOffsetMs} ms</span>
            </div>
            <input
              type="range"
              min={-200}
              max={200}
              step={5}
              value={cfg.beatOffsetMs}
              onChange={(e) => onUpdateBeatSync({ ...cfg, beatOffsetMs: Number(e.target.value) })}
              className="w-full allcut-slider"
            />
          </div>
        </div>

        {/* Live Preview of Generated Beat-Synced Speed Curve */}
        {previewCurve.length > 1 && (
          <div className="bg-[#0D0D0D] border border-[#242424] rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
              <span>Speed Control Points ({previewCurve.length} pts · beat-locked)</span>
              <span className="font-mono text-[#D4AF37]">
                {cfg.minSpeed.toFixed(2)}x – {(cfg.maxSpeed * cfg.speedMultiplier).toFixed(1)}x
              </span>
            </div>
            <svg viewBox="0 0 320 72" className="w-full h-14 overflow-visible">
              <line x1="0" y1="50" x2="320" y2="50" stroke="#262626" strokeDasharray="3 3" />
              <polyline
                fill="none"
                stroke="#D4AF37"
                strokeWidth="2.2"
                strokeLinejoin="round"
                points={previewCurve
                  .map((p) => {
                    const x = p.time * 320;
                    const y = 66 - Math.min(1, p.speed / 6) * 58;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ')}
              />
              {previewCurve
                .filter((p) => p.beatId || p.lockedBeatTime !== undefined)
                .map((p) => {
                  const x = p.time * 320;
                  const y = 66 - Math.min(1, p.speed / 6) * 58;
                  return <circle key={p.id} cx={x} cy={y} r="3" fill="#FFFFFF" stroke="#D4AF37" strokeWidth="1.5" />;
                })}
            </svg>
          </div>
        )}

        {/* Speed Action Buttons: Preview, Apply to selected clip, Apply to all clips, Undo Beat Sync speed */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={onPreviewBeatSync}
            className="min-h-[38px] px-3.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E] text-xs font-semibold text-white hover:border-[#D4AF37] flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-[#D4AF37]" /> Preview
          </button>

          <button
            type="button"
            data-testid="apply-beat-speed-selected"
            onClick={() => onApplyBeatSync('selected')}
            className="flex-1 min-h-[38px] px-3 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-105"
          >
            <Check className="w-3.5 h-3.5" /> Apply to selected clip
          </button>

          <button
            type="button"
            data-testid="apply-beat-speed-all"
            onClick={() => onApplyBeatSync('all')}
            className="min-h-[38px] px-3 rounded-xl bg-white text-[#080808] text-xs font-bold hover:bg-[#F0D264]"
          >
            Apply to all clips
          </button>

          <button
            type="button"
            data-testid="undo-beat-speed-btn"
            disabled={!canUndoBeatSyncSpeed}
            onClick={onUndoBeatSyncSpeed}
            className="min-h-[38px] px-3 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-neutral-200 hover:border-[#D4AF37] disabled:opacity-40 flex items-center gap-1.5 text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Undo Beat Sync speed
          </button>
        </div>
      </div>

      {/* Extra Beat Sync Automation & Detection Tuning */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        {[
          { key: 'syncZoom' as const, label: 'Beat Zoom Punch' },
          { key: 'syncCuts' as const, label: 'Auto Cut on Beats' },
          { key: 'syncTransitions' as const, label: 'Beat Transitions' },
          { key: 'syncKeyframes' as const, label: 'Sync Keyframes' },
        ].map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-2 p-2 rounded-lg bg-[#161616] border border-[#242424] text-neutral-200 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={cfg[item.key]}
              onChange={(e) => onUpdateBeatSync({ ...cfg, [item.key]: e.target.checked })}
              className="accent-[#D4AF37]"
            />
            <span className="truncate">{item.label}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-neutral-400">Detection Sensitivity</span>
            <span className="font-mono tabular-nums text-white">{Math.round(cfg.sensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={cfg.sensitivity}
            onChange={(e) => onUpdateBeatSync({ ...cfg, sensitivity: Number(e.target.value) })}
            className="w-full allcut-slider"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-neutral-400">Strength Threshold</span>
            <span className="font-mono tabular-nums text-white">{Math.round(cfg.strengthThreshold * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.95}
            step={0.05}
            value={cfg.strengthThreshold}
            onChange={(e) => onUpdateBeatSync({ ...cfg, strengthThreshold: Number(e.target.value) })}
            className="w-full allcut-slider"
          />
        </div>
      </div>
    </div>
  );
};
