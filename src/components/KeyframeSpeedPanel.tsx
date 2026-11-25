import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Diamond,
  Gauge,
  Lock,
  Pause,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  BezierHandles,
  Clip,
  EasingType,
  Keyframe,
  KeyframeProperty,
  SpeedConfig,
  SpeedPresetId,
} from '../types/editor';
import {
  DEFAULT_BEZIER_HANDLES,
  deleteKeyframeById,
  evaluateKeyframeTrack,
  getClipPropertyBaseValue,
  hasKeyframeAtTime,
  KEYFRAME_PROPERTY_META,
  makeEffectParamKeyframeKey,
  solveCubicBezier,
  upsertKeyframe,
} from '../engine/keyframes';
import { EFFECTS_CATALOG } from '../engine/effectsCatalog';
import {
  evaluateSpeedAtNormalizedTime,
  getPresetCurvePoints,
  SPEED_PRESETS,
  updateSpeedCurvePointPreservingBeatAlignment,
} from '../engine/speedRemap';

interface KeyframePanelProps {
  clip: Clip;
  currentTime: number;
  onSeek: (globalTime: number) => void;
  onUpdateClip: (updater: (c: Clip) => Clip) => void;
}

const PRIMARY_CURVES: { id: EasingType; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeInOut', label: 'Ease' },
  { id: 'cubicBezier', label: 'Bézier' },
  { id: 'bounce', label: 'Bounce' },
];

const EXTRA_CURVES: { id: EasingType; label: string }[] = [
  { id: 'easeIn', label: 'Ease In' },
  { id: 'easeOut', label: 'Ease Out' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'overshoot', label: 'Overshoot' },
];

const BASE_PROPS: Exclude<KeyframeProperty, `fx:${string}:${string}`>[] = [
  'positionX',
  'positionY',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'anchorX',
  'anchorY',
  'cropTop',
  'cropBottom',
  'cropLeft',
  'cropRight',
  'volume',
  'speed',
  'maskX',
  'maskY',
  'maskFeather',
  'brightness',
  'contrast',
  'blur',
  'sharpen',
  'textSize',
];

export const KeyframePanel: React.FC<KeyframePanelProps> = ({
  clip,
  currentTime,
  onSeek,
  onUpdateClip,
}) => {
  const [prop, setProp] = useState<KeyframeProperty>('scaleX');
  const [copiedKeyframes, setCopiedKeyframes] = useState<Keyframe[] | null>(null);
  const [dragHandle, setDragHandle] = useState<'p1' | 'p2' | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const localTime = Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));

  // Build full list of animatable tracks including active clip effect parameters
  const propertyItems = useMemo(() => {
    const items: {
      key: KeyframeProperty;
      label: string;
      min: number;
      max: number;
      step: number;
      unit: string;
    }[] = BASE_PROPS.map((p) => ({
      key: p,
      ...KEYFRAME_PROPERTY_META[p],
    }));

    for (const fx of clip.effects) {
      const def = EFFECTS_CATALOG.find((d) => d.id === fx.effectId);
      if (!def) continue;
      for (const param of def.params) {
        const key = makeEffectParamKeyframeKey(fx.instanceId, param.key);
        items.push({
          key,
          label: `${fx.name}: ${param.label}`,
          min: param.min,
          max: param.max,
          step: param.step,
          unit: param.unit ?? '',
        });
      }
    }
    return items;
  }, [clip.effects]);

  const activeItem = propertyItems.find((i) => i.key === prop) ?? propertyItems[0];
  const activeKey = activeItem.key;

  const track = useMemo(
    () => [...(clip.keyframes[activeKey] ?? [])].sort((a, b) => a.time - b.time),
    [clip.keyframes, activeKey]
  );

  const currentVal = evaluateKeyframeTrack(track, localTime, getClipPropertyBaseValue(clip, activeKey));
  const atPlayheadKf = track.find((k) => Math.abs(k.time - localTime) <= 0.04) ?? null;
  const activeKf = atPlayheadKf ?? track[0] ?? null;
  const activeEasing: EasingType = activeKf?.easing ?? 'easeInOut';
  const bezier: BezierHandles =
    activeKf?.bezier ?? DEFAULT_BEZIER_HANDLES[activeEasing] ?? DEFAULT_BEZIER_HANDLES.easeInOut;

  const setTrack = (nextTrack: Keyframe[]) => {
    onUpdateClip((c) => ({
      ...c,
      keyframes: { ...c.keyframes, [activeKey]: nextTrack },
    }));
  };

  const handleAddOrUpdateKf = (val: number) => {
    setTrack(upsertKeyframe(track, localTime, val, activeEasing, activeKf?.bezier));
  };

  const handleSetEasing = (easing: EasingType) => {
    if (!activeKf) {
      setTrack(upsertKeyframe(track, localTime, currentVal, easing, DEFAULT_BEZIER_HANDLES[easing]));
      return;
    }
    setTrack(
      track.map((k) =>
        k.id === activeKf.id
          ? { ...k, easing, bezier: easing === 'cubicBezier' ? { ...bezier } : DEFAULT_BEZIER_HANDLES[easing] }
          : k
      )
    );
  };

  const handleUpdateBezier = (next: BezierHandles) => {
    if (!activeKf) {
      setTrack(upsertKeyframe(track, localTime, currentVal, 'cubicBezier', next));
      return;
    }
    setTrack(
      track.map((k) =>
        k.id === activeKf.id ? { ...k, easing: 'cubicBezier', bezier: next } : k
      )
    );
  };

  // Interactive SVG Bézier drag
  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragHandle || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left - 16) / (rect.width - 32)));
    const ny = Math.max(-0.5, Math.min(1.6, 1 - (e.clientY - rect.top - 16) / (rect.height - 32)));
    if (dragHandle === 'p1') {
      handleUpdateBezier({ ...bezier, x1: Math.round(nx * 100) / 100, y1: Math.round(ny * 100) / 100 });
    } else {
      handleUpdateBezier({ ...bezier, x2: Math.round(nx * 100) / 100, y2: Math.round(ny * 100) / 100 });
    }
  };

  // Generate sampled curve SVG path
  const curvePolyline = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      const y = solveCubicBezier(u, bezier.x1, bezier.y1, bezier.x2, bezier.y2);
      const sx = 16 + u * 168;
      const sy = 104 - y * 88;
      pts.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [bezier]);

  const jumpKeyframe = (dir: -1 | 1) => {
    if (track.length === 0) return;
    const target =
      dir < 0
        ? [...track].reverse().find((k) => k.time < localTime - 0.03)
        : track.find((k) => k.time > localTime + 0.03);
    if (target) onSeek(clip.startTime + target.time);
  };

  return (
    <div className="space-y-3.5">
      {/* Property Selector */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {propertyItems.map((item) => {
          const count = clip.keyframes[item.key]?.length ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setProp(item.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                activeKey === item.key
                  ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                  : count > 0
                    ? 'bg-[#1D1A12] text-[#F0D264] border-[#D4AF37]/40'
                    : 'bg-[#171717] text-neutral-300 border-[#282828] hover:border-neutral-500'
              }`}
            >
              {item.label}
              {count > 0 && <span className="ml-1 font-mono opacity-85">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Value Slider + Prev/Next/Add/Delete/Copy/Paste Keyframe Controls */}
      <div className="bg-[#141414] border border-[#242424] rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-neutral-300 truncate">
            {activeItem.label}{' '}
            <span className="font-mono tabular-nums text-[#D4AF37] ml-1">
              {currentVal.toFixed(activeItem.step < 1 ? 2 : 0)}
              {activeItem.unit}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => jumpKeyframe(-1)}
              aria-label="Previous keyframe"
              title="Previous keyframe"
              className="p-1.5 rounded-lg bg-[#1C1C1C] text-neutral-300 hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleAddOrUpdateKf(currentVal)}
              className="px-2.5 py-1.5 rounded-lg bg-[#D4AF37] text-[#080808] text-[11px] font-bold flex items-center gap-1"
            >
              <Diamond className={`w-3 h-3 ${atPlayheadKf ? 'fill-current' : ''}`} />
              {atPlayheadKf ? 'Update' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => jumpKeyframe(1)}
              aria-label="Next keyframe"
              title="Next keyframe"
              className="p-1.5 rounded-lg bg-[#1C1C1C] text-neutral-300 hover:text-white"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {activeKf && (
              <button
                type="button"
                onClick={() => setTrack(deleteKeyframeById(track, activeKf.id))}
                aria-label="Delete keyframe"
                title="Delete keyframe"
                className="p-1.5 rounded-lg bg-[#1C1C1C] text-red-400 hover:bg-red-950/60"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <input
          type="range"
          min={activeItem.min}
          max={activeItem.max}
          step={activeItem.step}
          value={currentVal}
          onChange={(e) => handleAddOrUpdateKf(Number(e.target.value))}
          className="w-full allcut-slider"
        />

        {/* Keyframe list chips + copy/paste */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {track.length === 0 ? (
              <span className="text-[11px] text-neutral-500">No keyframes yet — tap Add or move slider</span>
            ) : (
              track.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onSeek(clip.startTime + k.time)}
                  className={`shrink-0 px-2 py-1 rounded text-[10px] font-mono tabular-nums border ${
                    Math.abs(k.time - localTime) <= 0.04
                      ? 'bg-[#D4AF37]/25 border-[#D4AF37] text-[#F7E396]'
                      : 'bg-[#1B1B1B] border-[#2A2A2A] text-neutral-300'
                  }`}
                >
                  ◆ {k.time.toFixed(2)}s → {k.value.toFixed(activeItem.step < 1 ? 2 : 0)}
                </button>
              ))
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCopiedKeyframes(track.map((k) => ({ ...k })))}
              className="px-2 py-1 rounded bg-[#1D1D1D] text-[10px] text-neutral-300 hover:text-white flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
            {copiedKeyframes && (
              <button
                type="button"
                onClick={() =>
                  setTrack(
                    copiedKeyframes.map((k, idx) => ({
                      ...k,
                      id: `kf_paste_${Date.now()}_${idx}`,
                    }))
                  )
                }
                className="px-2 py-1 rounded bg-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-semibold"
              >
                Paste
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Curve Picker (Linear, Ease, Bézier, Bounce + presets) + Interactive Graph Editor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#121212] border border-[#242424] rounded-xl p-3">
          <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
            <span>Graph Editor (drag gold handles)</span>
            <span className="font-mono text-[#D4AF37]">
              ({bezier.x1}, {bezier.y1}) ({bezier.x2}, {bezier.y2})
            </span>
          </div>
          <svg
            ref={svgRef}
            viewBox="0 0 200 120"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={() => setDragHandle(null)}
            onPointerLeave={() => setDragHandle(null)}
            className="w-full h-28 bg-[#0C0C0C] rounded-lg border border-[#1E1E1E] touch-none"
          >
            <rect x="16" y="16" width="168" height="88" fill="none" stroke="#222222" />
            <line x1="16" y1="104" x2="184" y2="16" stroke="#252525" strokeDasharray="3 3" />
            <line x1="16" y1="104" x2={16 + bezier.x1 * 168} y2={104 - bezier.y1 * 88} stroke="#8A6A22" strokeWidth="1.2" />
            <line x1="184" y1="16" x2={16 + bezier.x2 * 168} y2={104 - bezier.y2 * 88} stroke="#8A6A22" strokeWidth="1.2" />
            <polyline fill="none" stroke="#D4AF37" strokeWidth="2.5" points={curvePolyline} />
            <circle cx="16" cy="104" r="3.5" fill="#FFFFFF" />
            <circle cx="184" cy="16" r="3.5" fill="#FFFFFF" />
            <circle
              cx={16 + bezier.x1 * 168}
              cy={104 - bezier.y1 * 88}
              r="6"
              fill="#D4AF37"
              stroke="#080808"
              strokeWidth="2"
              className="cursor-grab"
              onPointerDown={() => setDragHandle('p1')}
            />
            <circle
              cx={16 + bezier.x2 * 168}
              cy={104 - bezier.y2 * 88}
              r="6"
              fill="#F7E396"
              stroke="#080808"
              strokeWidth="2"
              className="cursor-grab"
              onPointerDown={() => setDragHandle('p2')}
            />
          </svg>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-neutral-300">Curve Picker</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRIMARY_CURVES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetEasing(opt.id)}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold border text-left transition-colors ${
                  activeEasing === opt.id
                    ? 'bg-[#D4AF37] border-[#D4AF37] text-[#080808]'
                    : 'bg-[#171717] border-[#262626] text-neutral-200 hover:border-neutral-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {EXTRA_CURVES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetEasing(opt.id)}
                className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-medium border text-left transition-colors ${
                  activeEasing === opt.id
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#F7E396]'
                    : 'bg-[#141414] border-[#242424] text-neutral-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface SpeedPanelProps {
  clip: Clip;
  currentTime: number;
  onUpdateSpeed: (next: SpeedConfig) => void;
  onToggleSpeedKeyframe?: (currentSpeedVal: number) => void;
}

export const SpeedPanel: React.FC<SpeedPanelProps> = ({
  clip,
  currentTime,
  onUpdateSpeed,
  onToggleSpeedKeyframe,
}) => {
  const speed = clip.speed;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(speed.curvePoints[0]?.id ?? null);

  const localTime = Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));
  const localU = Math.max(0, Math.min(1, localTime / Math.max(0.1, clip.duration)));
  const liveSpeed =
    speed.mode === 'constant' && clip.keyframes.speed && clip.keyframes.speed.length > 0
      ? evaluateKeyframeTrack(clip.keyframes.speed, localTime, speed.constantSpeed)
      : evaluateSpeedAtNormalizedTime(speed, localU);
  const hasSpeedKf = hasKeyframeAtTime(clip.keyframes.speed, localTime);

  const sortedPoints = useMemo(
    () => [...speed.curvePoints].sort((a, b) => a.time - b.time),
    [speed.curvePoints]
  );

  const beatLockedCount = useMemo(
    () => sortedPoints.filter((p) => p.lockedBeatTime !== undefined || p.beatId).length,
    [sortedPoints]
  );

  const sampledPolyline = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const u = i / 96;
      const spd = evaluateSpeedAtNormalizedTime({ ...speed, mode: 'curve' }, u);
      const x = 18 + u * 604;
      const y = 104 - Math.min(1, (spd - 0.1) / 5.9) * 88;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [speed]);

  const handleDragPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingId || !svgRef.current) return;
    const svg = svgRef.current;
    const ctm = svg.getScreenCTM();
    let svgX = 18;
    let svgY = 104;
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      svgX = local.x;
      svgY = local.y;
    } else {
      const rect = svg.getBoundingClientRect();
      svgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 640;
      svgY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 120;
    }
    const u = Math.max(0, Math.min(1, (svgX - 18) / 604));
    const normY = Math.max(0, Math.min(1, (104 - svgY) / 88));
    const nextSpd = Math.round((0.1 + normY * 5.9) * 100) / 100;

    // Preserves exact beat timestamp alignment on beat-synced control points!
    const nextPoints = updateSpeedCurvePointPreservingBeatAlignment(
      speed.curvePoints,
      draggingId,
      u,
      nextSpd
    );

    onUpdateSpeed({
      ...speed,
      mode: 'curve',
      presetId: 'custom',
      curvePoints: nextPoints,
    });
  };

  const handleAddPointAtPlayhead = () => {
    const newPt = {
      id: `sp_${Date.now()}`,
      time: Math.round(localU * 1000) / 1000,
      speed: Math.round(Math.max(0.2, Math.min(6, liveSpeed)) * 100) / 100,
    };
    setSelectedPointId(newPt.id);
    onUpdateSpeed({
      ...speed,
      mode: 'curve',
      presetId: 'custom',
      curvePoints: [...speed.curvePoints, newPt].sort((a, b) => a.time - b.time),
    });
  };

  const handleDeleteSelectedPoint = () => {
    if (!selectedPointId || speed.curvePoints.length <= 2) return;
    onUpdateSpeed({
      ...speed,
      curvePoints: speed.curvePoints.filter((p) => p.id !== selectedPointId),
    });
    setSelectedPointId(null);
  };

  return (
    <div className="space-y-3.5">
      {/* Mode Switch + Live Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl overflow-hidden border border-[#2B2B2B] text-xs">
          <button
            type="button"
            onClick={() => onUpdateSpeed({ ...speed, mode: 'constant' })}
            className={`px-4 py-2 font-semibold ${
              speed.mode === 'constant' ? 'bg-[#D4AF37] text-[#080808]' : 'bg-[#161616] text-neutral-300'
            }`}
          >
            Normal Speed
          </button>
          <button
            type="button"
            onClick={() => onUpdateSpeed({ ...speed, mode: 'curve' })}
            className={`px-4 py-2 font-semibold ${
              speed.mode === 'curve' ? 'bg-[#D4AF37] text-[#080808]' : 'bg-[#161616] text-neutral-300'
            }`}
          >
            Speed Graph
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Gauge className="w-4 h-4 text-[#D4AF37]" />
          <span className="font-mono tabular-nums font-bold text-white">{liveSpeed.toFixed(2)}x</span>
        </div>
      </div>

      {speed.mode === 'constant' ? (
        <div className="bg-[#141414] border border-[#242424] rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-300">Constant Playback Speed</span>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-[#D4AF37] font-bold">
                {liveSpeed.toFixed(2)}x
              </span>
              {onToggleSpeedKeyframe && (
                <button
                  type="button"
                  aria-label="Toggle speed keyframe"
                  aria-pressed={hasSpeedKf}
                  onClick={() => onToggleSpeedKeyframe(liveSpeed)}
                  className={`p-1 rounded transition-colors ${
                    hasSpeedKf ? 'text-[#D4AF37] bg-[#D4AF37]/15' : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  <Diamond className={`w-3.5 h-3.5 ${hasSpeedKf ? 'fill-current' : ''}`} />
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.05}
            value={speed.constantSpeed}
            onChange={(e) => onUpdateSpeed({ ...speed, constantSpeed: Number(e.target.value) })}
            className="w-full allcut-slider"
          />
          <div className="grid grid-cols-6 gap-1.5">
            {[0.25, 0.5, 1, 2, 4, 8].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onUpdateSpeed({ ...speed, constantSpeed: val })}
                className={`min-h-[32px] rounded-lg text-[11px] font-mono tabular-nums border ${
                  Math.abs(speed.constantSpeed - val) < 0.01
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#F7E396]'
                    : 'bg-[#1B1B1B] border-[#2A2A2A] text-neutral-300'
                }`}
              >
                {val}x
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Speed Curve Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {(Object.keys(SPEED_PRESETS) as Exclude<SpeedPresetId, 'constant' | 'custom'>[]).map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() =>
                  onUpdateSpeed({
                    ...speed,
                    mode: 'curve',
                    presetId: pid,
                    beatSynced: false,
                    curvePoints: getPresetCurvePoints(pid),
                  })
                }
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border ${
                  speed.presetId === pid
                    ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-bold'
                    : 'bg-[#171717] text-neutral-300 border-[#282828] hover:border-neutral-500'
                }`}
              >
                {SPEED_PRESETS[pid].label}
              </button>
            ))}
          </div>

          {/* Interactive Speed Curve Graph Editor */}
          <div className="bg-[#121212] border border-[#242424] rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-neutral-400 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span>Speed Graph (drag points)</span>
                {beatLockedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#F0D264] font-semibold">
                    <Lock className="w-2.5 h-2.5" /> {beatLockedCount} Beat-Locked
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddPointAtPlayhead}
                  className="px-2 py-1 rounded bg-[#1E1E1E] text-white hover:text-[#D4AF37] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Point
                </button>
                <button
                  type="button"
                  disabled={!selectedPointId || speed.curvePoints.length <= 2}
                  onClick={handleDeleteSelectedPoint}
                  className="px-2 py-1 rounded bg-[#1E1E1E] text-red-400 disabled:opacity-40 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>

            <svg
              ref={svgRef}
              data-testid="speed-graph-svg"
              viewBox="0 0 640 120"
              onPointerMove={handleDragPoint}
              onPointerUp={() => setDraggingId(null)}
              onPointerLeave={() => setDraggingId(null)}
              className="w-full h-32 bg-[#0B0B0B] rounded-lg border border-[#1E1E1E] touch-none"
            >
              {/* 1x baseline */}
              <line x1="18" y1="90.6" x2="622" y2="90.6" stroke="#2D2D2D" strokeDasharray="4 4" />
              <text x="22" y="87" fill="#666" fontSize="9" fontFamily="monospace">1.0x</text>
              <text x="22" y="22" fill="#666" fontSize="9" fontFamily="monospace">6.0x</text>

              {/* Beat-locked vertical alignment lines */}
              {sortedPoints
                .filter((p) => p.lockedBeatTime !== undefined || p.beatId)
                .map((p) => {
                  const bx = 18 + p.time * 604;
                  return (
                    <line
                      key={`bl_${p.id}`}
                      x1={bx}
                      y1="10"
                      x2={bx}
                      y2="110"
                      stroke="rgba(212,175,55,0.28)"
                      strokeDasharray="2 2"
                    />
                  );
                })}

              {/* Playhead vertical cursor */}
              <line
                x1={18 + localU * 604}
                y1="10"
                x2={18 + localU * 604}
                y2="110"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1"
              />

              {/* Curve path */}
              <polyline fill="none" stroke="#D4AF37" strokeWidth="2.2" points={sampledPolyline} />

              {/* Control Points */}
              {sortedPoints.map((pt) => {
                const cx = 18 + pt.time * 604;
                const cy = 104 - Math.min(1, (pt.speed - 0.1) / 5.9) * 88;
                const isSel = selectedPointId === pt.id;
                const isBeatLocked = pt.lockedBeatTime !== undefined || Boolean(pt.beatId);
                return (
                  <g key={pt.id}>
                    {isBeatLocked && (
                      <circle cx={cx} cy={cy} r="7.5" fill="none" stroke="rgba(212,175,55,0.55)" strokeWidth="1.1" />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSel ? 5.5 : 4.2}
                      fill={isSel ? '#FFFFFF' : isBeatLocked ? '#F7E396' : '#D4AF37'}
                      stroke="#080808"
                      strokeWidth="1.6"
                      className={isBeatLocked ? 'cursor-ns-resize' : 'cursor-grab'}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedPointId(pt.id);
                        setDraggingId(pt.id);
                      }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Reverse, Freeze Frame & Frame Interpolation */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onUpdateSpeed({ ...speed, reverse: !speed.reverse })}
          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
            speed.reverse
              ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
              : 'bg-[#171717] text-neutral-200 border-[#2A2A2A]'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reverse {speed.reverse ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          onClick={() =>
            onUpdateSpeed({
              ...speed,
              freezeAt: speed.freezeAt !== null ? null : Math.max(0, currentTime - clip.startTime),
            })
          }
          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
            speed.freezeAt !== null
              ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
              : 'bg-[#171717] text-neutral-200 border-[#2A2A2A]'
          }`}
        >
          <Pause className="w-3.5 h-3.5" /> {speed.freezeAt !== null ? 'Unfreeze' : 'Freeze Frame'}
        </button>

        <select
          aria-label="Slow-motion interpolation mode"
          value={speed.frameBlending}
          onChange={(e) =>
            onUpdateSpeed({
              ...speed,
              frameBlending: e.target.value as SpeedConfig['frameBlending'],
            })
          }
          className="min-h-[38px] bg-[#171717] border border-[#2A2A2A] rounded-xl px-3 text-xs text-neutral-200 outline-none focus:border-[#D4AF37]"
        >
          <option value="none">Frame Interpolation: None</option>
          <option value="blend">Frame Blending</option>
          <option value="opticalFlow">Optical Flow Smooth</option>
        </select>
      </div>
    </div>
  );
};
