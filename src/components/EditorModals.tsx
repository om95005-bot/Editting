import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Square,
  Video,
  X,
} from 'lucide-react';
import type { DeviceCapabilities, ExportSettings, Project } from '../types/editor';
import { computeProjectDuration, formatTimecode } from '../engine/timelineOps';
import {
  estimateExportSizeMB,
  exportProjectVideo,
  getFpsDisableReason,
  getResolutionDisableReason,
  type ExportProgressInfo,
} from '../engine/videoExporter';
import type { MediaSourceRegistry } from '../engine/pixelProcessor';
import { renderTimelineFrame } from '../engine/pixelProcessor';

interface ExportModalProps {
  project: Project;
  capabilities: DeviceCapabilities;
  sources: MediaSourceRegistry;
  onUpdateSettings: (settings: ExportSettings) => void;
  onClose: () => void;
}

const ALL_RESOLUTIONS: ExportSettings['resolution'][] = ['720p', '1080p', '1440p', '4K'];
const ALL_FPS: ExportSettings['fps'][] = [24, 25, 30, 48, 50, 60, 90, 120];

export const ExportModal: React.FC<ExportModalProps> = ({
  project,
  capabilities,
  sources,
  onUpdateSettings,
  onClose,
}) => {
  const settings = project.exportSettings;
  const duration = Math.max(0.5, computeProjectDuration(project.clips));
  const estSizeMb = estimateExportSizeMB(duration, settings);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFilename, setResultFilename] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const handleStartExport = async () => {
    setError(null);
    setExporting(true);
    setProgress({ percent: 0, currentFrame: 0, totalFrames: 1, status: 'Initializing encoder…' });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await exportProjectVideo(
        project,
        sources,
        (info) => setProgress(info),
        controller.signal
      );
      const url = URL.createObjectURL(res.blob);
      setResultUrl(url);
      setResultFilename(res.filename);
      setProgress({ percent: 100, currentFrame: 1, totalFrames: 1, status: 'Render complete' });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Export cancelled.');
      } else {
        setError((err as Error).message || 'Failed to render video on this device.');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = resultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export Video"
        className="w-full max-w-lg bg-[#121212] border border-[#262626] rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#222222] sticky top-0 bg-[#121212] z-10">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-base font-bold text-white">Export Video</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Resolution */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-300">Resolution</label>
              <span className="text-xs text-neutral-500">
                Max supported: {capabilities.supportedResolutions[capabilities.supportedResolutions.length - 1]}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_RESOLUTIONS.map((res) => {
                const reason = getResolutionDisableReason(res, capabilities);
                const supported = reason === null;
                const active = settings.resolution === res;
                return (
                  <button
                    key={res}
                    type="button"
                    disabled={!supported || exporting}
                    onClick={() => onUpdateSettings({ ...settings, resolution: res })}
                    className={`min-h-[46px] px-2 py-1.5 rounded-xl text-xs font-semibold transition-all border flex flex-col items-center justify-center ${
                      active
                        ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
                        : supported
                          ? 'bg-[#1A1A1A] text-white border-[#2A2A2A] hover:border-[#D4AF37]/50'
                          : 'bg-[#101010] text-neutral-600 border-[#1D1D1D] cursor-not-allowed'
                    }`}
                  >
                    <span>{res}</span>
                    {reason && <span className="text-[9px] text-neutral-500 font-normal leading-tight mt-0.5">{reason}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Frame Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-300">Frame Rate (up to 120 FPS)</label>
              <span className="text-xs text-neutral-500">
                Device max: {capabilities.supportedFps[capabilities.supportedFps.length - 1]} FPS
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ALL_FPS.map((fps) => {
                const reason = getFpsDisableReason(fps, capabilities);
                const supported = reason === null;
                const active = settings.fps === fps;
                return (
                  <button
                    key={fps}
                    type="button"
                    disabled={!supported || exporting}
                    title={reason ?? `${fps} FPS`}
                    onClick={() => onUpdateSettings({ ...settings, fps })}
                    className={`min-h-[44px] px-1 py-1 rounded-lg text-xs font-semibold tabular-nums transition-all border flex flex-col items-center justify-center ${
                      active
                        ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37]'
                        : supported
                          ? 'bg-[#1A1A1A] text-white border-[#2A2A2A] hover:border-[#D4AF37]/50'
                          : 'bg-[#101010] text-neutral-600 border-[#1D1D1D] cursor-not-allowed'
                    }`}
                  >
                    <span>{fps} FPS</span>
                    {reason && <span className="text-[8px] text-neutral-500 font-normal leading-tight mt-0.5">{reason}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Codec & Container */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">Video Codec</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['H.264', 'H.265', 'VP9'] as const).map((codec) => {
                  const disabled = codec === 'H.265' && !capabilities.h265Supported;
                  const active = settings.codec === codec;
                  return (
                    <button
                      key={codec}
                      type="button"
                      disabled={disabled || exporting}
                      onClick={() => onUpdateSettings({ ...settings, codec })}
                      className={`min-h-[38px] rounded-lg text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-white text-[#080808] border-white'
                          : disabled
                            ? 'bg-[#101010] text-neutral-600 border-[#1D1D1D] cursor-not-allowed'
                            : 'bg-[#1A1A1A] text-neutral-300 border-[#2A2A2A]'
                      }`}
                    >
                      {codec}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">Audio Codec</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['AAC', 'Opus'] as const).map((ac) => (
                  <button
                    key={ac}
                    type="button"
                    disabled={exporting}
                    onClick={() => onUpdateSettings({ ...settings, audioCodec: ac })}
                    className={`min-h-[38px] rounded-lg text-[11px] font-semibold border transition-colors ${
                      settings.audioCodec === ac
                        ? 'bg-white text-[#080808] border-white'
                        : 'bg-[#1A1A1A] text-neutral-300 border-[#2A2A2A]'
                    }`}
                  >
                    {ac}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bitrate */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-neutral-300">Video Bitrate</span>
                <span className="font-mono tabular-nums text-[#D4AF37]">{settings.videoBitrateMbps} Mbps</span>
              </div>
              <input
                type="range"
                min={4}
                max={80}
                step={2}
                disabled={exporting}
                value={settings.videoBitrateMbps}
                onChange={(e) => onUpdateSettings({ ...settings, videoBitrateMbps: Number(e.target.value) })}
                className="w-full allcut-slider"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-neutral-300">Audio Bitrate</span>
                <span className="font-mono tabular-nums text-neutral-200">{settings.audioBitrateKbps} kbps</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([128, 192, 256, 320] as const).map((kbps) => (
                  <button
                    key={kbps}
                    type="button"
                    disabled={exporting}
                    onClick={() => onUpdateSettings({ ...settings, audioBitrateKbps: kbps })}
                    className={`min-h-[34px] rounded-lg text-[11px] font-mono tabular-nums border ${
                      settings.audioBitrateKbps === kbps
                        ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]'
                        : 'bg-[#1A1A1A] text-neutral-400 border-[#262626]'
                    }`}
                  >
                    {kbps}k
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary Row */}
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-[#181818] border border-[#242424] text-xs">
            <span className="text-neutral-400">
              Duration <strong className="text-white font-mono tabular-nums ml-1">{formatTimecode(duration)}</strong>
            </span>
            <span className="text-neutral-400">
              Est. Size <strong className="text-[#D4AF37] font-mono tabular-nums ml-1">~{estSizeMb} MB</strong>
            </span>
          </div>

          {/* Progress & Errors */}
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-300">{progress.status}</span>
                <span className="font-mono tabular-nums text-[#D4AF37]">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-[#222222] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#9A7615] via-[#D4AF37] to-[#F7E396] transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            {exporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="w-full min-h-[48px] rounded-xl bg-red-600/20 border border-red-500/50 text-red-200 font-semibold text-sm hover:bg-red-600/30 transition-colors"
              >
                Cancel Export
              </button>
            ) : resultUrl ? (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F0D264] text-[#080808] font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Save Video ({resultFilename.split('.').pop()?.toUpperCase()})
                </button>
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="min-h-[48px] px-4 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] text-white text-xs font-semibold hover:bg-[#282828]"
                >
                  Re-render
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartExport}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#C89F28] via-[#D4AF37] to-[#F0D264] text-[#080808] font-bold text-sm hover:brightness-105 active:scale-[0.99] transition-all"
              >
                Render & Export Video
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CoverMakerModalProps {
  project: Project;
  currentTime: number;
  sources: MediaSourceRegistry;
  onSaveCover: (dataUrl: string, timestamp: number) => void;
  onClose: () => void;
}

export const CoverMakerModal: React.FC<CoverMakerModalProps> = ({
  project,
  currentTime,
  sources,
  onSaveCover,
  onClose,
}) => {
  const duration = Math.max(0.5, computeProjectDuration(project.clips));
  const [sampleTime, setSampleTime] = useState(Math.min(duration, currentTime));
  const [headline, setHeadline] = useState(project.name.toUpperCase());
  const [subtitle, setSubtitle] = useState('ALL CUT STUDIO');
  const [showOverlay, setShowOverlay] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderTimelineFrame(canvas, project, sampleTime, sources, { skipEffects: false });
    if (showOverlay) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
        grad.addColorStop(0, 'rgba(8,8,8,0)');
        grad.addColorStop(1, 'rgba(8,8,8,0.88)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h * 0.55, w, h * 0.45);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#D4AF37';
        ctx.font = '700 13px "DM Sans", sans-serif';
        ctx.fillText(subtitle, w / 2, h * 0.81);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(headline, w / 2, h * 0.89);
      }
    }
  }, [project, sampleTime, sources, headline, subtitle, showOverlay]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onSaveCover(dataUrl, sampleTime);
    onClose();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${project.name.replace(/\s+/g, '_')}_Cover.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cover Maker"
        className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-display text-sm font-bold text-white">Cover Maker</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover maker"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={270}
              height={480}
              className="h-64 w-auto rounded-xl border border-[#2A2A2A] bg-black"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-400">Cover Frame</span>
              <span className="font-mono tabular-nums text-[#D4AF37]">{formatTimecode(sampleTime)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={sampleTime}
              onChange={(e) => setSampleTime(Number(e.target.value))}
              className="w-full allcut-slider"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(e) => setShowOverlay(e.target.checked)}
              className="accent-[#D4AF37]"
            />
            Show Cover Typography Overlay
          </label>

          {showOverlay && (
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Cover Title"
                aria-label="Cover Title"
                className="px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white focus:border-[#D4AF37] outline-none"
              />
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Subtitle"
                aria-label="Cover Subtitle"
                className="px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white focus:border-[#D4AF37] outline-none"
              />
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] px-4 rounded-xl bg-[#1C1C1C] border border-[#2C2C2C] text-xs font-semibold text-white hover:bg-[#262626] flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> PNG
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 min-h-[44px] rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-105"
            >
              <Check className="w-4 h-4" /> Set Project Cover
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShootRecordModalProps {
  onRecordedFile: (file: File) => void;
  onClose: () => void;
}

export const ShootRecordModal: React.FC<ShootRecordModalProps> = ({ onRecordedFile, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (active) setCameraError('Camera access unavailable on this device. You can record a studio test clip instead.');
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `ALLCUT_Shot_${Date.now()}.webm`, { type: 'video/webm' });
      onRecordedFile(file);
      onClose();
    };
    rec.start(250);
    setSeconds(0);
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shoot and Record"
        className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-display text-sm font-bold text-white">Shoot & Record</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera recorder"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="aspect-[9/16] max-h-80 mx-auto rounded-xl bg-black border border-[#242424] overflow-hidden relative flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center space-y-2">
                <Video className="w-8 h-8 text-[#D4AF37] mx-auto" />
                <p className="text-xs text-neutral-400">{cameraError}</p>
              </div>
            ) : (
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            )}
            {recording && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-mono tabular-nums font-bold">
                REC {formatTimecode(seconds)}
              </div>
            )}
          </div>

          <div className="flex justify-center">
            {!cameraError ? (
              recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="min-h-[48px] px-8 rounded-full bg-red-600 text-white font-semibold text-sm flex items-center gap-2"
                >
                  <Square className="w-4 h-4 fill-current" /> Stop & Add to Timeline
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="min-h-[48px] px-8 rounded-full bg-[#D4AF37] text-[#080808] font-bold text-sm flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Start Recording
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-6 rounded-xl bg-[#1E1E1E] text-white text-xs font-semibold"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
