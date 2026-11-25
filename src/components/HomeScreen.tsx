import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bookmark,
  BookOpen,
  Camera,
  ChevronRight,
  Compass,
  Copy,
  Crosshair,
  Diamond,
  Download,
  FolderKanban,
  Gauge,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Link2,
  Music,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Shapes,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Upload,
  User,
  Wand2,
  X,
} from 'lucide-react';
import type {
  CustomPreset,
  DeviceCapabilities,
  EditorToolId,
  HomeTabId,
  Project,
} from '../types/editor';
import type { AppSettings } from '../engine/storage';
import { estimateCacheSizeKb } from '../engine/storage';
import { computeProjectDuration, formatTimecode } from '../engine/timelineOps';
import { BrandLogo, downloadLogoAssetPng, type LogoVariant } from './BrandLogo';

interface HomeScreenProps {
  projects: Project[];
  recoveryProject: Project | null;
  presets: CustomPreset[];
  capabilities: DeviceCapabilities;
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  onCreateNewVideo: (initialTool?: EditorToolId | null, importedFiles?: FileList | null) => void;
  onCreateEditPhoto: (importedFile?: File | null) => void;
  onOpenProject: (project: Project, initialTool?: EditorToolId | null) => void;
  onRecoverProject: () => void;
  onDismissRecovery: () => void;
  onDuplicateProject: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  onRelinkProjectMedia: (projectId: string, file: File) => void;
  onExportProjectJson: (project: Project) => void;
  onImportProjectJson: (file: File) => void;
  onApplyPresetToNewProject: (preset: CustomPreset) => void;
  onDeletePreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, name: string) => void;
  onImportPresetJson: (file: File) => void;
  onExportPresetJson: (preset: CustomPreset) => void;
  onOpenShootModal: () => void;
  onClearCache: () => void;
}

interface HomeToolTile {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: 'tool' | 'photo' | 'shoot' | 'presets' | 'settings' | 'templates' | 'allTools';
  editorTool?: EditorToolId;
}

// Exact 18 offline working tiles in 6 rows × 3 columns (Section 18A — ZERO cloud-AI tiles!)
const HOME_TOOL_TILES: HomeToolTile[] = [
  { id: 'beatSync', label: 'Beat Sync', icon: Activity, action: 'tool', editorTool: 'beatSync' },
  { id: 'autoBeats', label: 'Auto Beats', icon: Music, action: 'tool', editorTool: 'beatSync' },
  { id: 'speedRemap', label: 'Speed / Time Remap', icon: Gauge, action: 'tool', editorTool: 'speed' },
  { id: 'motionTrack', label: 'Motion Tracking', icon: Crosshair, action: 'tool', editorTool: 'tracking' },
  { id: 'sharpenStruct', label: 'Sharpen & Structure', icon: Sliders, action: 'tool', editorTool: 'sharpen' },
  { id: 'masksChroma', label: 'Masks & Chroma Key', icon: Shapes, action: 'tool', editorTool: 'mask' },
  { id: 'effectsLib', label: 'Effects Library', icon: Sparkles, action: 'tool', editorTool: 'effects' },
  { id: 'transitions', label: 'Transitions', icon: Wand2, action: 'tool', editorTool: 'transition' },
  { id: 'coverMaker', label: 'Cover Maker', icon: ImageIcon, action: 'tool', editorTool: 'edit' },
  { id: 'audioTools', label: 'Audio Tools', icon: Music, action: 'tool', editorTool: 'audio' },
  { id: 'photoTools', label: 'Photo Tools', icon: Layers, action: 'photo' },
  { id: 'presetsTile', label: 'Presets', icon: Bookmark, action: 'presets' },
  { id: 'keyframeStudio', label: 'Keyframe Studio', icon: Diamond, action: 'tool', editorTool: 'keyframe' },
  { id: 'subtitlesText', label: 'Subtitles/Text', icon: Type, action: 'tool', editorTool: 'captions' },
  { id: 'shootRecord', label: 'Shoot and Record', icon: Camera, action: 'shoot' },
  { id: 'proxyCache', label: 'Proxy and Cache', icon: HardDrive, action: 'settings' },
  { id: 'templates', label: 'Templates', icon: Compass, action: 'templates' },
  { id: 'allTools', label: 'All Tools', icon: LayoutGrid, action: 'allTools' },
];

const OFFLINE_GUIDES = [
  {
    id: 'guide_beat',
    title: 'Beat-Synced Velocity Editing',
    duration: 'Offline Guide · 4 steps',
    summary: 'Run local FFT spectral-flux Detect Beats on any imported track, choose Strong Beats or Every Beat, and generate editable Beat Velocity ramps.',
    tool: 'beatSync' as EditorToolId,
  },
  {
    id: 'guide_bezier',
    title: 'Alight-Style Cubic Bézier Keyframes',
    duration: 'Offline Guide · 3 steps',
    summary: 'Animate independent Position X/Y, Scale, Rotation, and Opacity with draggable P1/P2 Bézier handles, Overshoot, and Smooth curves.',
    tool: 'keyframe' as EditorToolId,
  },
  {
    id: 'guide_sharp',
    title: 'Optical Sharpening & Structure Without Halos',
    duration: 'Offline Guide · 3 steps',
    summary: 'Combine Smart Sharpen (halo-clamped), Structure, and Fine Detail Recovery with live Before/After split preview.',
    tool: 'sharpen' as EditorToolId,
  },
  {
    id: 'guide_track',
    title: 'ZNCC Motion Tracking & Layer Attachment',
    duration: 'Offline Guide · 4 steps',
    summary: 'Lock a tracker box onto moving footage, run forward/backward pixel tracking, attach titles or overlays, and export editable keyframes.',
    tool: 'tracking' as EditorToolId,
  },
];

const LOGO_ASSETS: { variant: LogoVariant; wordmark: boolean; label: string; file: string }[] = [
  { variant: 'gold-on-black', wordmark: true, label: 'Main Logo + Wordmark', file: 'ALLCUT_Main_Wordmark_1024.png' },
  { variant: 'launcher', wordmark: false, label: 'Android Launcher Icon', file: 'ALLCUT_Launcher_1024.png' },
  { variant: 'transparent', wordmark: false, label: 'Transparent PNG Symbol', file: 'ALLCUT_Transparent_1024.png' },
  { variant: 'white', wordmark: false, label: 'White Monochrome', file: 'ALLCUT_White_Mono_1024.png' },
  { variant: 'black', wordmark: false, label: 'Black Monochrome', file: 'ALLCUT_Black_Mono_1024.png' },
  { variant: 'adaptive-fg', wordmark: false, label: 'Adaptive Foreground', file: 'ALLCUT_Adaptive_FG_1024.png' },
  { variant: 'adaptive-bg', wordmark: false, label: 'Adaptive Background', file: 'ALLCUT_Adaptive_BG_1024.png' },
];

export const HomeScreen: React.FC<HomeScreenProps> = (props) => {
  const [activeTab, setActiveTab] = useState<HomeTabId>('edit');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllToolsModal, setShowAllToolsModal] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [presetRenameDraft, setPresetRenameDraft] = useState('');
  const [relinkTargetId, setRelinkTargetId] = useState<string | null>(null);

  const videoPickerRef = useRef<HTMLInputElement | null>(null);
  const photoPickerRef = useRef<HTMLInputElement | null>(null);
  const presetImportRef = useRef<HTMLInputElement | null>(null);
  const projectImportRef = useRef<HTMLInputElement | null>(null);
  const relinkFileRef = useRef<HTMLInputElement | null>(null);

  const handleTileClick = (tile: HomeToolTile) => {
    switch (tile.action) {
      case 'tool':
        if (props.projects.length > 0) {
          props.onOpenProject(props.projects[0], tile.editorTool ?? null);
        } else {
          props.onCreateNewVideo(tile.editorTool ?? null);
        }
        break;
      case 'photo':
        props.onCreateEditPhoto(null);
        break;
      case 'shoot':
        props.onOpenShootModal();
        break;
      case 'presets':
        setActiveTab('presets');
        break;
      case 'settings':
        setActiveTab('me');
        break;
      case 'templates':
        setActiveTab('discover');
        break;
      case 'allTools':
        setShowAllToolsModal(true);
        break;
    }
  };

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return HOME_TOOL_TILES;
    return HOME_TOOL_TILES.filter((t) => t.label.toLowerCase().includes(q));
  }, [searchQuery]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return props.projects;
    return props.projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [searchQuery, props.projects]);

  const cacheKb = estimateCacheSizeKb();

  return (
    <div
      data-testid="home-screen"
      className="min-h-screen bg-[#080808] text-white flex flex-col pb-20"
    >
      {/* Hidden native file inputs for Storage Access / local file picking */}
      <input
        ref={videoPickerRef}
        type="file"
        accept="video/*,image/*"
        multiple
        onChange={(e) => {
          props.onCreateNewVideo(null, e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={photoPickerRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          props.onCreateEditPhoto(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={presetImportRef}
        type="file"
        accept=".json"
        onChange={(e) => {
          if (e.target.files?.[0]) props.onImportPresetJson(e.target.files[0]);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={projectImportRef}
        type="file"
        accept=".json"
        onChange={(e) => {
          if (e.target.files?.[0]) props.onImportProjectJson(e.target.files[0]);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={relinkFileRef}
        type="file"
        accept="video/*,image/*,audio/*"
        onChange={(e) => {
          if (e.target.files?.[0] && relinkTargetId) {
            props.onRelinkProjectMedia(relinkTargetId, e.target.files[0]);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* TOP HERO WITH SUBTLE METALLIC GOLD-TO-BLACK GRADIENT GLOW (Section 18A & Screenshot 1) */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_85%_70%_at_50%_-15%,rgba(212,175,55,0.28),rgba(138,104,22,0.10)_52%,rgba(8,8,8,0)_100%)]"
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          {/* Top Bar: ALL CUT logo at top-left, circular Search button at top-right */}
          <header className="flex items-center justify-between gap-4">
            <BrandLogo size={36} variant="launcher" showWordmark />
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              aria-label="Search tools and projects"
              className="w-11 h-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors shrink-0"
            >
              {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </header>

          {/* Expandable Search Overlay */}
          {showSearch && (
            <div className="mt-4 bg-[#121212] border border-[#282828] rounded-2xl p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools, effects, or saved projects…"
                  aria-label="Search tools and projects"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-sm text-white outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filteredTools.slice(0, 8).map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => {
                      setShowSearch(false);
                      handleTileClick(tile);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-neutral-200 hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  >
                    {tile.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autosave Crash Recovery Banner */}
          {props.recoveryProject && activeTab === 'edit' && (
            <div className="mt-4 p-3.5 rounded-2xl bg-[#18150D] border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-neutral-200">
                Unsaved session recovered: <strong className="text-[#F0D264]">{props.recoveryProject.name}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={props.onRecoverProject}
                  className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
                <button
                  type="button"
                  onClick={props.onDismissRecovery}
                  aria-label="Dismiss recovery"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 1: EDIT (OPENING / HOME SCREEN) ==================== */}
          {activeTab === 'edit' && (
            <main className="pt-8 pb-6 space-y-6">
              {/* Hero Kicker & Heading matching Screenshot 1 */}
              <div>
                <p className="text-xs font-medium text-[#D4AF37] tracking-wide">Video create</p>
                <button
                  type="button"
                  onClick={() => props.onCreateNewVideo(null)}
                  className="mt-1 inline-flex items-center gap-2 group text-left"
                >
                  <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Get started
                  </h1>
                  <span className="w-7 h-7 rounded-lg bg-white/10 group-hover:bg-[#D4AF37] group-hover:text-[#080808] flex items-center justify-center transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </button>
              </div>

              {/* Two Large Rounded Cards Side-by-Side: "New video" & "Edit photo" */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-3xl bg-gradient-to-br from-[#1C1912] via-[#151515] to-[#111111] border border-[#D4AF37]/35 hover:border-[#D4AF37] transition-all p-5 sm:p-7 flex flex-col items-center justify-center text-center gap-3 min-h-[144px] sm:min-h-[168px]">
                  <button
                    type="button"
                    onClick={() => props.onCreateNewVideo(null)}
                    className="flex flex-col items-center gap-2.5 w-full"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F0D264] to-[#B89020] text-[#080808] flex items-center justify-center shadow-lg">
                      <Plus className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <span className="font-display text-base sm:text-lg font-bold text-white">
                      New video
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => videoPickerRef.current?.click()}
                    className="text-[11px] text-neutral-400 hover:text-[#D4AF37] transition-colors flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Pick device files
                  </button>
                </div>

                <div className="rounded-3xl bg-[#141414] border border-[#262626] hover:border-[#D4AF37]/60 transition-all p-5 sm:p-7 flex flex-col items-center justify-center text-center gap-3 min-h-[144px] sm:min-h-[168px]">
                  <button
                    type="button"
                    onClick={() => props.onCreateEditPhoto(null)}
                    className="flex flex-col items-center gap-2.5 w-full"
                  >
                    <div className="w-11 h-11 rounded-xl bg-white text-[#080808] flex items-center justify-center">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="font-display text-base sm:text-lg font-bold text-white">
                      Edit photo
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => photoPickerRef.current?.click()}
                    className="text-[11px] text-neutral-400 hover:text-[#D4AF37] transition-colors flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Pick photo
                  </button>
                </div>
              </div>

              {/* 3-Column × 6-Row Grid of 18 Offline Working Tool Tiles (expands cleanly on desktop) */}
              <section aria-label="Editing tools grid" className="pt-1">
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-2 gap-y-4 sm:gap-4">
                  {HOME_TOOL_TILES.map((tile) => {
                    const Icon = tile.icon;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => handleTileClick(tile)}
                        className="group min-h-[82px] p-3 rounded-2xl bg-[#111111]/80 hover:bg-[#191919] border border-transparent hover:border-[#D4AF37]/35 flex flex-col items-center justify-center gap-2 text-center transition-all active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#191919] group-hover:bg-[#D4AF37]/15 flex items-center justify-center text-neutral-200 group-hover:text-[#D4AF37] transition-colors">
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-medium text-neutral-200 group-hover:text-white leading-snug">
                          {tile.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Recent Projects quick-resume strip when projects exist */}
              {props.projects.length > 0 && (
                <section className="pt-4 border-t border-[#1A1A1A] space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold text-white">Recent Projects</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('projects')}
                      className="text-xs font-medium text-[#D4AF37] hover:text-[#F0D264]"
                    >
                      Manage all ({props.projects.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {props.projects.slice(0, 3).map((proj) => (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => props.onOpenProject(proj)}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-[#121212] border border-[#222222] hover:border-[#D4AF37]/60 text-left transition-colors"
                      >
                        <div className="w-12 h-16 rounded-lg bg-[#080808] border border-[#262626] overflow-hidden shrink-0 flex items-center justify-center">
                          {proj.coverDataUrl ? (
                            <img src={proj.coverDataUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Scissors className="w-4 h-4 text-[#D4AF37]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">{proj.name}</div>
                          <div className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                            {formatTimecode(computeProjectDuration(proj.clips))} · {proj.aspectRatio} · {proj.clips.length} clips
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </main>
          )}

          {/* ==================== TAB 2: DISCOVER (OFFLINE GUIDES & PRESET PACKS) ==================== */}
          {activeTab === 'discover' && (
            <main className="pt-6 pb-8 space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Discover Offline Studio</h1>
                <p className="text-xs text-neutral-400 mt-1">
                  Built-in workflow tutorials and instant offline starter packs — zero internet required.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {OFFLINE_GUIDES.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 rounded-2xl bg-[#121212] border border-[#242424] flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[11px] text-[#D4AF37]">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{g.duration}</span>
                      </div>
                      <h2 className="font-display text-base font-bold text-white mt-1.5">{g.title}</h2>
                      <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{g.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onCreateNewVideo(g.tool)}
                      className="self-start min-h-[38px] px-4 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#D4AF37] text-xs font-semibold text-white"
                    >
                      Try in Editor
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-base font-bold text-white">Offline Preset Packs</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {props.presets.filter((p) => p.builtIn).map((preset) => (
                    <div
                      key={preset.id}
                      className="p-4 rounded-2xl bg-[#131313] border border-[#242424] flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="text-[11px] text-neutral-500 capitalize">{preset.category} pack</div>
                        <div className="text-sm font-bold text-white mt-0.5">{preset.name}</div>
                        <p className="text-xs text-neutral-400 mt-1">{preset.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onApplyPresetToNewProject(preset)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold"
                      >
                        Launch with Pack
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </main>
          )}

          {/* ==================== TAB 3: PRESETS ==================== */}
          {activeTab === 'presets' && (
            <main className="pt-6 pb-8 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">Custom Presets</h1>
                  <p className="text-xs text-neutral-400 mt-1">
                    Save, rename, import, export, and apply effects, sharpening, speed, and Beat Sync bundles.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => presetImportRef.current?.click()}
                  className="min-h-[42px] px-4 rounded-xl bg-[#1B1B1B] border border-[#2E2E2E] hover:border-[#D4AF37] text-xs font-semibold text-white flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-[#D4AF37]" /> Import Preset JSON
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {props.presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 rounded-2xl bg-[#121212] border border-[#242424] flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {renamingPresetId === preset.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (presetRenameDraft.trim()) props.onRenamePreset(preset.id, presetRenameDraft.trim());
                              setRenamingPresetId(null);
                            }}
                            className="flex gap-1.5"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={presetRenameDraft}
                              onChange={(e) => setPresetRenameDraft(e.target.value)}
                              className="flex-1 px-2 py-1 rounded bg-[#1C1C1C] border border-[#D4AF37] text-xs text-white"
                            />
                            <button type="submit" className="px-2.5 py-1 rounded bg-[#D4AF37] text-[#080808] text-xs font-bold">
                              Save
                            </button>
                          </form>
                        ) : (
                          <h2 className="text-sm font-bold text-white truncate">{preset.name}</h2>
                        )}
                        <div className="text-[11px] text-neutral-500 mt-0.5 capitalize">
                          {preset.category} · {preset.effects?.length ?? 0} effects {preset.builtIn ? '· Built-in' : '· Custom'}
                        </div>
                        <p className="text-xs text-neutral-400 mt-1">{preset.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1F1F1F]">
                      <button
                        type="button"
                        onClick={() => props.onApplyPresetToNewProject(preset)}
                        className="min-h-[36px] px-3.5 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold"
                      >
                        Apply in Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onExportPresetJson(preset)}
                        className="min-h-[36px] px-3 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-xs text-neutral-200 flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> Export
                      </button>
                      {!preset.builtIn && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingPresetId(preset.id);
                              setPresetRenameDraft(preset.name);
                            }}
                            aria-label={`Rename ${preset.name}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-neutral-300 hover:text-white"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onDeletePreset(preset.id)}
                            aria-label={`Delete ${preset.name}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-red-400 hover:bg-red-950/50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </main>
          )}

          {/* ==================== TAB 4: PROJECTS ==================== */}
          {activeTab === 'projects' && (
            <main className="pt-6 pb-8 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">Projects</h1>
                  <p className="text-xs text-neutral-400 mt-1">
                    All timelines, keyframes, beat markers, masks, and export profiles stored locally offline.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => projectImportRef.current?.click()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#1A1A1A] border border-[#2C2C2C] text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4 text-[#D4AF37]" /> Import
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onCreateNewVideo(null)}
                    className="min-h-[42px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> New Project
                  </button>
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="p-10 rounded-2xl bg-[#111111] border border-[#222222] text-center space-y-3">
                  <FolderKanban className="w-8 h-8 text-[#D4AF37] mx-auto" />
                  <p className="text-sm text-neutral-300">No saved projects yet.</p>
                  <button
                    type="button"
                    onClick={() => props.onCreateNewVideo(null)}
                    className="min-h-[42px] px-5 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold"
                  >
                    Create First Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProjects.map((proj) => {
                    const hasMissing = Object.values(proj.assets).some((a) => a.missing);
                    return (
                      <div
                        key={proj.id}
                        className="p-4 rounded-2xl bg-[#121212] border border-[#242424] flex flex-col gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => props.onOpenProject(proj)}
                            className="w-16 h-20 rounded-xl bg-[#080808] border border-[#2A2A2A] overflow-hidden shrink-0 flex items-center justify-center"
                          >
                            {proj.coverDataUrl ? (
                              <img src={proj.coverDataUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Scissors className="w-5 h-5 text-[#D4AF37]" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            {renamingProjectId === proj.id ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (renameDraft.trim()) props.onRenameProject(proj.id, renameDraft.trim());
                                  setRenamingProjectId(null);
                                }}
                                className="flex gap-1.5"
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  className="flex-1 px-2 py-1 rounded bg-[#1C1C1C] border border-[#D4AF37] text-xs text-white"
                                />
                                <button type="submit" className="px-2.5 py-1 rounded bg-[#D4AF37] text-[#080808] text-xs font-bold">
                                  OK
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => props.onOpenProject(proj)}
                                className="text-left block w-full"
                              >
                                <h2 className="text-sm font-bold text-white truncate hover:text-[#D4AF37]">
                                  {proj.name}
                                </h2>
                              </button>
                            )}
                            <div className="text-[11px] text-neutral-400 mt-1 font-mono tabular-nums">
                              {formatTimecode(computeProjectDuration(proj.clips))} · {proj.aspectRatio} · {proj.exportSettings.resolution}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              Updated {new Date(proj.updatedAt).toLocaleDateString()} · {proj.clips.length} clips
                            </div>
                            {hasMissing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRelinkTargetId(proj.id);
                                  relinkFileRef.current?.click();
                                }}
                                className="mt-1.5 text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                              >
                                <Link2 className="w-3 h-3" /> Relink offline media file
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#1F1F1F]">
                          <button
                            type="button"
                            onClick={() => props.onOpenProject(proj)}
                            className="min-h-[36px] px-3.5 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onDuplicateProject(proj.id)}
                            aria-label={`Duplicate ${proj.name}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-neutral-300 hover:text-white flex items-center gap-1 text-xs"
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingProjectId(proj.id);
                              setRenameDraft(proj.name);
                            }}
                            aria-label={`Rename ${proj.name}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-neutral-300 hover:text-white"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onExportProjectJson(proj)}
                            aria-label={`Export ${proj.name} JSON`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-neutral-300 hover:text-white"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onDeleteProject(proj.id)}
                            aria-label={`Delete ${proj.name}`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#1A1A1A] text-red-400 hover:bg-red-950/50 ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>
          )}

          {/* ==================== TAB 5: ME (SETTINGS, DEVICE CAPABILITIES, CACHE, BRAND KIT) ==================== */}
          {activeTab === 'me' && (
            <main className="pt-6 pb-8 space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Engine & Device Profile</h1>
                <p className="text-xs text-neutral-400 mt-1">
                  Performance optimization, offline cache management, real hardware capabilities, and ALL CUT brand assets.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Performance & Memory Settings */}
                <section className="p-4 rounded-2xl bg-[#121212] border border-[#242424] space-y-3.5">
                  <h2 className="font-display text-sm font-bold text-white">Performance & Cache</h2>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold text-white">Proxy Editing Mode</div>
                      <div className="text-[11px] text-neutral-500">Uses faster 270p preview canvas while keeping full export resolution</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={props.settings.proxyPreview}
                      onChange={(e) => props.onUpdateSettings({ ...props.settings, proxyPreview: e.target.checked })}
                      className="w-4 h-4 accent-[#D4AF37]"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold text-white">Low-Memory Mode</div>
                      <div className="text-[11px] text-neutral-500">Limits thumbnail cache & background frame buffers</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={props.settings.lowMemoryMode}
                      onChange={(e) => props.onUpdateSettings({ ...props.settings, lowMemoryMode: e.target.checked })}
                      className="w-4 h-4 accent-[#D4AF37]"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                    <div>
                      <div className="text-xs font-semibold text-white">Automatic Crash Recovery</div>
                      <div className="text-[11px] text-neutral-500">Continuously snapshots timeline state locally</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={props.settings.autosaveEnabled}
                      onChange={(e) => props.onUpdateSettings({ ...props.settings, autosaveEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[#D4AF37]"
                    />
                  </label>

                  <div className="pt-2 border-t border-[#1F1F1F] flex items-center justify-between">
                    <div className="text-xs text-neutral-400">
                      Local Storage Cache: <strong className="font-mono text-white">{cacheKb} KB</strong>
                    </div>
                    <button
                      type="button"
                      onClick={props.onClearCache}
                      className="min-h-[36px] px-3.5 rounded-lg bg-[#1C1C1C] border border-[#2D2D2D] text-xs font-semibold text-neutral-200 hover:border-[#D4AF37]"
                    >
                      Clear Recovery Cache
                    </button>
                  </div>
                </section>

                {/* Hardware Capability Matrix */}
                <section className="p-4 rounded-2xl bg-[#121212] border border-[#242424] space-y-3">
                  <h2 className="font-display text-sm font-bold text-white">Detected Device Capabilities</h2>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#171717]">
                      <div className="text-[10px] text-neutral-500">CPU Threads / RAM</div>
                      <div className="font-mono font-semibold text-white mt-0.5">
                        {props.capabilities.cores} cores · ~{props.capabilities.memoryGb} GB
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#171717]">
                      <div className="text-[10px] text-neutral-500">GPU / WebGL2 Texture</div>
                      <div className="font-mono font-semibold text-[#D4AF37] mt-0.5">
                        {props.capabilities.webgl2Supported ? 'WebGL2' : 'Canvas2D'} · {props.capabilities.maxTextureSize}px
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#171717]">
                      <div className="text-[10px] text-neutral-500">Supported Resolutions</div>
                      <div className="font-mono font-semibold text-white mt-0.5">
                        {props.capabilities.supportedResolutions.join(' · ')}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#171717]">
                      <div className="text-[10px] text-neutral-500">Supported Frame Rates</div>
                      <div className="font-mono font-semibold text-white mt-0.5">
                        Up to {props.capabilities.supportedFps[props.capabilities.supportedFps.length - 1]} FPS
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ALL CUT 1024×1024 Brand Identity & Adaptive Icon Exporter */}
              <section className="p-4 rounded-2xl bg-[#121212] border border-[#242424] space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-bold text-white">ALL CUT Brand Identity Kit (1024 × 1024 PNG)</h2>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Deep black (#080808), metallic gold (#D4AF37), and white (#FFFFFF) geometric A symbol inside adaptive icon safe zone.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {LOGO_ASSETS.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      onClick={() => downloadLogoAssetPng(item.variant, item.wordmark, item.file)}
                      className="p-3 rounded-xl bg-[#171717] border border-[#262626] hover:border-[#D4AF37] flex flex-col items-center gap-2 text-center transition-colors"
                    >
                      <div className={`p-1.5 rounded-lg ${item.variant === 'black' ? 'bg-white' : 'bg-[#080808]'}`}>
                        <BrandLogo size={42} variant={item.variant} />
                      </div>
                      <span className="text-[10px] font-medium text-neutral-200 leading-tight">{item.label}</span>
                      <span className="text-[9px] text-[#D4AF37] font-mono">1024px PNG</span>
                    </button>
                  ))}
                </div>
              </section>
            </main>
          )}
        </div>
      </div>

      {/* ALL TOOLS FULL LIST MODAL */}
      {showAllToolsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All Offline Tools"
            className="w-full max-w-2xl bg-[#121212] border border-[#262626] rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#222222] sticky top-0 bg-[#121212]">
              <h2 className="font-display text-base font-bold text-white">All Offline Tools (18)</h2>
              <button
                type="button"
                onClick={() => setShowAllToolsModal(false)}
                aria-label="Close all tools"
                className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {HOME_TOOL_TILES.filter((t) => t.id !== 'allTools').map((tile) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => {
                      setShowAllToolsModal(false);
                      handleTileClick(tile);
                    }}
                    className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#D4AF37] flex items-center gap-3 text-left transition-colors"
                  >
                    <Icon className="w-5 h-5 text-[#D4AF37] shrink-0" />
                    <span className="text-xs font-semibold text-white">{tile.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* FIXED 5-TAB BOTTOM NAVIGATION (Section 18A: Edit active gold, Discover, Presets, Projects, Me) */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 inset-x-0 z-40 h-14 bg-[#0A0A0A]/95 backdrop-blur-md border-t border-[#1D1D1D]"
      >
        <div className="max-w-3xl mx-auto h-full grid grid-cols-5 items-center">
          {(
            [
              { id: 'edit', label: 'Edit', icon: Scissors },
              { id: 'discover', label: 'Discover', icon: Compass },
              { id: 'presets', label: 'Presets', icon: Bookmark },
              { id: 'projects', label: 'Projects', icon: FolderKanban },
              { id: 'me', label: 'Me', icon: User },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-[#D4AF37]' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
