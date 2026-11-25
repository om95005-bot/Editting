import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  Magnet,
  Music,
  Plus,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Clip, Project, Track } from '../types/editor';
import { getAllClipKeyframeTimes } from '../engine/keyframes';
import { computeProjectDuration, formatTimecode, snapTimeToTargets } from '../engine/timelineOps';

interface TimelineViewProps {
  project: Project;
  currentTime: number;
  selectedClipIds: string[];
  zoomPps: number; // pixels per second (30..240)
  snapEnabled: boolean;
  multiSelectMode: boolean;
  onSeek: (time: number) => void;
  onZoomChange: (pps: number) => void;
  onToggleSnap: () => void;
  onToggleMultiSelect: () => void;
  onSelectClip: (clipId: string, additive?: boolean) => void;
  onClearSelection: () => void;
  onMoveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  onTrimClip: (clipId: string, edge: 'left' | 'right', newGlobalTime: number) => void;
  onToggleMuteMain: () => void;
  onOpenCoverMaker: () => void;
  onAddMediaClick: () => void;
  onAddAudioPrompt: () => void;
  onAddTextPrompt: () => void;
  onStepFrame: (deltaFrames: number) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  project,
  currentTime,
  selectedClipIds,
  zoomPps,
  snapEnabled,
  multiSelectMode,
  onSeek,
  onZoomChange,
  onToggleSnap,
  onToggleMultiSelect,
  onSelectClip,
  onClearSelection,
  onMoveClip,
  onTrimClip,
  onToggleMuteMain,
  onOpenCoverMaker,
  onAddMediaClick,
  onAddAudioPrompt,
  onAddTextPrompt,
  onStepFrame,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<{
    clipId: string;
    mode: 'move' | 'trimLeft' | 'trimRight';
    startClientX: number;
    startClientY: number;
    origStart: number;
    origEnd: number;
    origTrackId: string;
  } | null>(null);

  const totalDuration = useMemo(() => computeProjectDuration(project.clips), [project.clips]);
  const rulerDuration = Math.max(16, Math.ceil(totalDuration + 6));

  const mainTrack = project.tracks.find((t) => t.type === 'video') ?? project.tracks[0];
  const mainMuted = mainTrack?.muted ?? false;

  const audioClips = project.clips.filter((c) => c.kind === 'audio');
  const textClips = project.clips.filter((c) => c.kind === 'text');
  const allBeatTimes = useMemo(() => {
    const times: number[] = [];
    for (const ac of audioClips) {
      if (ac.beatAnalysis) {
        for (const b of ac.beatAnalysis.beats) {
          times.push(ac.startTime + b.time);
        }
      }
    }
    return times;
  }, [audioClips]);

  // Keep scroll aligned when scrubbing via buttons/playback unless user is dragging
  const isProgrammaticScrollRef = useRef(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || dragging) return;
    const targetScrollLeft = currentTime * zoomPps;
    if (Math.abs(el.scrollLeft - targetScrollLeft) > 2) {
      isProgrammaticScrollRef.current = true;
      el.scrollLeft = targetScrollLeft;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  }, [currentTime, zoomPps, dragging]);

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const t = Math.max(0, el.scrollLeft / zoomPps);
    onSeek(Math.round(t * 1000) / 1000);
  };

  // Dragging clips (move / trim edges)
  React.useEffect(() => {
    if (!dragging) return;
    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragging.startClientX;
      const dy = e.clientY - dragging.startClientY;
      const dt = dx / zoomPps;

      // Collect snap targets (other clip edges + playhead + beat markers)
      const targets: number[] = [0, currentTime, ...allBeatTimes];
      for (const c of project.clips) {
        if (c.id === dragging.clipId) continue;
        targets.push(c.startTime, c.startTime + c.duration);
      }

      if (dragging.mode === 'move') {
        let nextStart = Math.max(0, dragging.origStart + dt);
        if (snapEnabled) {
          nextStart = snapTimeToTargets(nextStart, targets, 10 / zoomPps).time;
        }
        // Check vertical track switch
        let nextTrackId = dragging.origTrackId;
        if (Math.abs(dy) > 44) {
          const curIdx = project.tracks.findIndex((t) => t.id === dragging.origTrackId);
          const step = dy > 0 ? 1 : -1;
          const cand = project.tracks[curIdx + step];
          const movingClip = project.clips.find((c) => c.id === dragging.clipId);
          if (cand && movingClip) {
            const compatible =
              (movingClip.kind === 'audio' && cand.type === 'audio') ||
              (movingClip.kind === 'text' && cand.type === 'text') ||
              ((movingClip.kind === 'video' || movingClip.kind === 'image') &&
                (cand.type === 'video' || cand.type === 'overlay' || cand.type === 'image'));
            if (compatible) nextTrackId = cand.id;
          }
        }
        onMoveClip(dragging.clipId, nextStart, nextTrackId);
      } else if (dragging.mode === 'trimLeft') {
        let nextLeft = Math.max(0, dragging.origStart + dt);
        if (snapEnabled) nextLeft = snapTimeToTargets(nextLeft, targets, 10 / zoomPps).time;
        onTrimClip(dragging.clipId, 'left', nextLeft);
      } else {
        let nextRight = Math.max(0.2, dragging.origEnd + dt);
        if (snapEnabled) nextRight = snapTimeToTargets(nextRight, targets, 10 / zoomPps).time;
        onTrimClip(dragging.clipId, 'right', nextRight);
      }
    };

    const handlePointerUp = () => setDragging(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, zoomPps, currentTime, allBeatTimes, project.clips, project.tracks, snapEnabled, onMoveClip, onTrimClip]);

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const next = Math.max(30, Math.min(240, zoomPps - e.deltaY * 0.25));
      onZoomChange(Math.round(next));
    }
  };

  // Ruler tick interval adapts cleanly to zoom level
  const majorIntervalSec = zoomPps >= 120 ? 1 : zoomPps >= 60 ? 2 : 5;
  const ticks: { time: number; major: boolean }[] = [];
  for (let t = 0; t <= rulerDuration; t += majorIntervalSec / 2) {
    ticks.push({ time: t, major: Math.abs(t % majorIntervalSec) < 0.001 });
  }

  const getTrackIcon = (track: Track) => {
    switch (track.type) {
      case 'audio': return <Music className="w-3.5 h-3.5 text-[#D4AF37]" />;
      case 'text': return <Type className="w-3.5 h-3.5 text-neutral-300" />;
      case 'adjustment':
      case 'effect': return <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />;
      default: return <Layers className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const renderClipBlock = (clip: Clip) => {
    const isSelected = selectedClipIds.includes(clip.id);
    const asset = project.assets[clip.assetId];
    const leftPx = clip.startTime * zoomPps;
    const widthPx = Math.max(24, clip.duration * zoomPps);
    const kfTimes = getAllClipKeyframeTimes(clip);

    const bgStyle =
      clip.kind === 'audio'
        ? 'bg-[#17211D] border-[#2C5B46]'
        : clip.kind === 'text'
          ? 'bg-[#221A10] border-[#8A6A22]'
          : clip.kind === 'adjustment' || clip.kind === 'effect'
            ? 'bg-[#1F1824] border-[#6D4796]'
            : 'bg-[#1A1A1A] border-[#333333]';

    return (
      <div
        key={clip.id}
        data-testid={`timeline-clip-${clip.id}`}
        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelectClip(clip.id, e.shiftKey || e.metaKey || multiSelectMode);
          setDragging({
            clipId: clip.id,
            mode: 'move',
            startClientX: e.clientX,
            startClientY: e.clientY,
            origStart: clip.startTime,
            origEnd: clip.startTime + clip.duration,
            origTrackId: clip.trackId,
          });
        }}
        className={`absolute top-1 bottom-1 rounded-lg border overflow-hidden select-none cursor-grab active:cursor-grabbing transition-shadow ${bgStyle} ${
          isSelected ? 'ring-2 ring-[#D4AF37] border-[#D4AF37] z-20' : 'hover:border-neutral-400 z-10'
        }`}
      >
        {/* Filmstrip thumbnails for video/image */}
        {(clip.kind === 'video' || clip.kind === 'image') && asset?.thumbnails && asset.thumbnails.length > 0 && (
          <div className="absolute inset-0 flex opacity-80 pointer-events-none">
            {asset.thumbnails.map((thumb, idx) => (
              <img
                key={idx}
                src={thumb}
                alt=""
                draggable={false}
                className="h-full flex-1 object-cover border-r border-black/30 last:border-r-0"
              />
            ))}
          </div>
        )}

        {/* Audio Waveform + Detected Beat Markers */}
        {clip.kind === 'audio' && (
          <div className="absolute inset-0 flex items-center px-1 gap-[1.5px] pointer-events-none">
            {(asset?.waveformPeaks ?? []).map((pk, idx) => (
              <div
                key={idx}
                className="flex-1 bg-[#D4AF37]/70 rounded-full min-w-[1px]"
                style={{ height: `${Math.max(12, Math.round(pk * 82))}%` }}
              />
            ))}
            {clip.beatAnalysis?.beats.map((beat) => {
              const bx = (beat.time / Math.max(0.1, clip.duration)) * 100;
              if (bx < 0 || bx > 100) return null;
              return (
                <div
                  key={beat.id}
                  style={{ left: `${bx}%` }}
                  className="absolute top-0 bottom-0 flex flex-col items-center justify-end pb-0.5"
                >
                  <div
                    className={`w-[1.5px] flex-1 ${
                      beat.isDownbeat ? 'bg-[#F7E396]' : beat.isStrong ? 'bg-[#D4AF37]/80' : 'bg-white/35'
                    }`}
                  />
                  <div
                    className={`w-2 h-2 rounded-full ${
                      beat.selected
                        ? 'bg-[#D4AF37] ring-1 ring-white'
                        : 'bg-white/50'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Clip label & subtle speed/FX indicator */}
        <div
          className={`relative z-10 flex items-center justify-between py-0.5 bg-gradient-to-b from-black/75 to-transparent text-[10px] font-medium text-white truncate ${
            isSelected ? 'px-3.5' : 'px-2'
          }`}
        >
          <span className="truncate">{clip.text ? clip.text.content : clip.name}</span>
          <span className="ml-1.5 font-mono text-[9px] text-[#F0D264] shrink-0">
            {clip.speed.mode === 'curve'
              ? 'RAMP'
              : clip.speed.constantSpeed !== 1
                ? `${clip.speed.constantSpeed}x`
                : clip.effects.length > 0
                  ? `${clip.effects.length}FX`
                  : ''}
          </span>
        </div>

        {/* Transition-in wedge */}
        {clip.transitionIn.type !== 'none' && (
          <div
            title={`Transition: ${clip.transitionIn.type}`}
            className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-[#D4AF37]/80 to-transparent pointer-events-none"
          />
        )}

        {/* Keyframe diamond markers (shown on clip only while selected) */}
        {isSelected &&
          kfTimes.map((kt, idx) => {
            const leftPct = Math.min(98, Math.max(2, (kt / Math.max(0.1, clip.duration)) * 100));
            return (
              <div
                key={idx}
                data-testid="clip-kf-diamond"
                style={{ left: `${leftPct}%` }}
                className="absolute bottom-1.5 -translate-x-1/2 w-2 h-2 bg-[#F0D264] border border-black rotate-45 pointer-events-none z-20"
              />
            );
          })}

        {/* Trim handles when selected */}
        {isSelected && (
          <>
            <div
              aria-label={`Trim start of ${clip.name}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragging({
                  clipId: clip.id,
                  mode: 'trimLeft',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origStart: clip.startTime,
                  origEnd: clip.startTime + clip.duration,
                  origTrackId: clip.trackId,
                });
              }}
              className="absolute left-0 top-0 bottom-0 w-3 bg-[#D4AF37] flex items-center justify-center cursor-ew-resize z-30"
            >
              <div className="w-0.5 h-4 bg-[#080808] rounded-full" />
            </div>
            <div
              aria-label={`Trim end of ${clip.name}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragging({
                  clipId: clip.id,
                  mode: 'trimRight',
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  origStart: clip.startTime,
                  origEnd: clip.startTime + clip.duration,
                  origTrackId: clip.trackId,
                });
              }}
              className="absolute right-0 top-0 bottom-0 w-3 bg-[#D4AF37] flex items-center justify-center cursor-ew-resize z-30"
            >
              <div className="w-0.5 h-4 bg-[#080808] rounded-full" />
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-[#0D0D0D] border-t border-[#1F1F1F] select-none flex-1 min-h-[190px]">
      {/* Time Row: current / total timecode + frame step + snap + zoom */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A1A] bg-[#0B0B0B]">
        <div className="flex items-center gap-2">
          <span
            data-testid="timeline-timecode"
            className="font-mono tabular-nums text-xs font-semibold text-white"
          >
            {formatTimecode(currentTime)}{' '}
            <span className="text-neutral-500">/ {formatTimecode(totalDuration)}</span>
          </span>
          <div className="hidden sm:flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={() => onStepFrame(-1)}
              aria-label="Previous frame"
              title="Previous frame"
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onStepFrame(1)}
              aria-label="Next frame"
              title="Next frame"
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMultiSelect}
            aria-label="Toggle multi-select clips"
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              multiSelectMode
                ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/50'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Multi{selectedClipIds.length > 1 ? ` (${selectedClipIds.length})` : ''}
          </button>
          <button
            type="button"
            onClick={onToggleSnap}
            aria-label="Toggle timeline snapping"
            title="Snap clips to edges & beats"
            className={`p-1.5 rounded transition-colors ${
              snapEnabled ? 'text-[#D4AF37] bg-[#D4AF37]/15' : 'text-neutral-500 hover:text-white'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(30, zoomPps - 20))}
            aria-label="Zoom out timeline"
            className="p-1.5 rounded text-neutral-400 hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(240, zoomPps + 20))}
            aria-label="Zoom in timeline"
            className="p-1.5 rounded text-neutral-400 hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Multitrack Scroll Area with Fixed Center White Playhead */}
      <div className="relative flex-1 overflow-hidden flex flex-col" onWheel={handleWheelZoom}>
        {/* Fixed center white playhead line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center"
        >
          <div className="w-2 h-2 bg-white rotate-45 -mt-0.5 shadow" />
          <div className="w-[2px] flex-1 bg-white shadow-[0_0_6px_rgba(255,255,255,0.65)]" />
        </div>

        {/* Right floating white square "+" button to add media (matches reference screenshot!) */}
        <button
          type="button"
          onClick={onAddMediaClick}
          aria-label="Add media to timeline"
          className="absolute right-3 top-11 z-30 w-9 h-9 rounded-lg bg-white text-[#080808] flex items-center justify-center shadow-lg hover:bg-[#F0D264] active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Scrollable timeline tracks & ruler */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onClick={() => onClearSelection()}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
        >
          <div
            style={{
              width: `calc(${rulerDuration * zoomPps}px + 100%)`,
              paddingLeft: '50%',
              paddingRight: '50%',
            }}
            className="min-h-full pb-4"
          >
            {/* Inner relative container anchored strictly at t = 0 */}
            <div style={{ width: `${rulerDuration * zoomPps}px` }} className="relative">
              {/* Time Ruler */}
              <div className="h-7 border-b border-[#1C1C1C] relative sticky top-0 bg-[#0D0D0D]/95 z-20">
                {ticks.map((tk) => (
                  <div
                    key={tk.time}
                    style={{ left: `${tk.time * zoomPps}px` }}
                    className="absolute top-0 bottom-0 flex flex-col justify-end"
                  >
                    {tk.major ? (
                      <span className="text-[10px] font-mono tabular-nums text-neutral-400 pl-1.5 pb-1 whitespace-nowrap">
                        {formatTimecode(tk.time)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-600 -translate-x-1/2 pb-1">·</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Visible ordered tracks: Main Video -> Audio -> Text -> Overlay/Adjustment (shows primary waveform & prompts above fold on mobile) */}
              {(() => {
                const orderedTracks = [
                  ...project.tracks.filter((t) => t.type === 'video'),
                  ...project.tracks.filter((t) => t.type === 'audio'),
                  ...project.tracks.filter((t) => t.type === 'text'),
                  ...project.tracks.filter((t) => t.type !== 'video' && t.type !== 'audio' && t.type !== 'text'),
                ];
                return (
                  <div className="relative pt-1.5">
                    {/* Left Control Column pinned cleanly just left of t=0 (Mute clip, Cover, ♪, T) */}
                    <div
                      style={{ left: '-124px' }}
                      className="absolute top-1.5 w-[114px] flex flex-col gap-2 items-end pr-1.5 z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {orderedTracks.map((track) => {
                        if (track.type === 'video') {
                          return (
                            <div key={track.id} style={{ height: '56px' }} className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={onToggleMuteMain}
                                aria-label={mainMuted ? 'Unmute clip' : 'Mute clip'}
                                className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                                  mainMuted ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'text-neutral-300 hover:bg-white/10'
                                }`}
                              >
                                {mainMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                <span className="text-[9px] leading-tight mt-0.5 text-center whitespace-nowrap">
                                  {mainMuted ? 'Unmute' : 'Mute clip'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={onOpenCoverMaker}
                                aria-label="Edit project cover"
                                className="w-12 h-12 rounded-lg bg-[#1A1A1A] border border-[#2D2D2D] overflow-hidden relative flex flex-col items-center justify-center text-neutral-300 hover:border-[#D4AF37]"
                              >
                                {project.coverDataUrl ? (
                                  <img src={project.coverDataUrl} alt="Cover" className="w-full h-full object-cover" />
                                ) : (
                                  <>
                                    <ImageIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                                    <span className="text-[9px] mt-0.5">Cover</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        }
                        const rowH = track.type === 'audio' ? 46 : track.type === 'text' ? 38 : 34;
                        return (
                          <div
                            key={track.id}
                            style={{ height: `${rowH}px` }}
                            className="flex items-center justify-end"
                          >
                            <div
                              title={track.name}
                              className="w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#262626] flex items-center justify-center"
                            >
                              {getTrackIcon(track)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Multitrack Lanes */}
                    <div className="flex flex-col gap-2">
                      {orderedTracks.map((track) => {
                        const trackClips = project.clips.filter((c) => c.trackId === track.id);
                        const showAudioPrompt = track.type === 'audio' && audioClips.length === 0;
                        const showTextPrompt = track.type === 'text' && textClips.length === 0;
                        const rowH =
                          track.type === 'video' ? 56 : track.type === 'audio' ? 46 : track.type === 'text' ? 38 : 34;

                        return (
                          <div
                            key={track.id}
                            style={{ height: `${rowH}px` }}
                            className="relative w-full rounded-lg bg-[#121212]/70 border border-[#1B1B1B]"
                          >
                            {trackClips.map(renderClipBlock)}

                            {showAudioPrompt && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddAudioPrompt();
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#191919] border border-[#2A2A2A] text-xs text-neutral-300 hover:text-white hover:border-[#D4AF37]/60 flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-[#D4AF37]" /> Add audio
                              </button>
                            )}

                            {showTextPrompt && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddTextPrompt();
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#191919] border border-[#2A2A2A] text-xs text-neutral-300 hover:text-white hover:border-[#D4AF37]/60 flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-[#D4AF37]" /> Add text
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
