import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Check,
  Copy,
  Diamond,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  SplitSquareVertical,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Clip,
  CustomEffectDefinition,
  CustomEffectLayerSpec,
  EffectCategory,
  EffectInstance,
} from '../types/editor';
import {
  buildInstancesFromCustomEffect,
  createEffectInstance,
  EFFECTS_CATALOG,
  LUT_PRESET_NAMES,
  parseCubeLut,
} from '../engine/effectsCatalog';
import { hasKeyframeAtTime, makeEffectParamKeyframeKey } from '../engine/keyframes';

interface EffectsLibraryPanelProps {
  clip: Clip;
  currentTime: number;
  initialCategory?: EffectCategory | 'all';
  favoriteIds: string[];
  compareSplit: number | null;
  customEffects: CustomEffectDefinition[];
  onToggleFavorite: (effectId: string) => void;
  onToggleCompareSplit: () => void;
  onUpdateClipEffects: (nextEffects: EffectInstance[]) => void;
  onApplyEffectsToAllClips: (effects: EffectInstance[]) => void;
  onSavePresetFromClip: (name: string, effects: EffectInstance[]) => void;
  onSaveCustomEffect: (def: CustomEffectDefinition) => void;
  onDeleteCustomEffect: (id: string) => void;
  onRenameCustomEffect: (id: string, name: string) => void;
  onApplyCustomEffect: (def: CustomEffectDefinition, scope: 'selected' | 'all') => void;
  onToggleEffectParamKeyframe: (instanceId: string, paramKey: string, currentValue: number) => void;
}

const CATEGORY_TABS: { id: EffectCategory | 'all' | 'favorites'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stylize', label: 'Stylize & Shader' },
  { id: 'color', label: 'Color & LUT' },
  { id: 'sharpen', label: 'Sharpen & Structure' },
  { id: 'blur', label: 'Blur & Distort' },
  { id: 'motion', label: 'Motion FX' },
  { id: 'favorites', label: 'Favorites' },
];

export const EffectsLibraryPanel: React.FC<EffectsLibraryPanelProps> = ({
  clip,
  currentTime,
  initialCategory = 'all',
  favoriteIds,
  compareSplit,
  customEffects,
  onToggleFavorite,
  onToggleCompareSplit,
  onUpdateClipEffects,
  onApplyEffectsToAllClips,
  onSavePresetFromClip,
  onSaveCustomEffect,
  onDeleteCustomEffect,
  onRenameCustomEffect,
  onApplyCustomEffect,
  onToggleEffectParamKeyframe,
}) => {
  const [category, setCategory] = useState<EffectCategory | 'all' | 'favorites'>(initialCategory);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'library' | 'custom' | 'stack'>('library');
  const [presetName, setPresetName] = useState('');
  const [lutError, setLutError] = useState<string | null>(null);
  const [showAllParamsByInstance, setShowAllParamsByInstance] = useState<Record<string, boolean>>({});
  const lutInputRef = useRef<HTMLInputElement | null>(null);
  const customImportRef = useRef<HTMLInputElement | null>(null);
  const [lutTargetInstanceId, setLutTargetInstanceId] = useState<string | null>(null);

  // Custom Effect Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [builderName, setBuilderName] = useState('My Custom Effect');
  const [builderDesc, setBuilderDesc] = useState('Stacked shader & stylize chain');
  const [builderLayers, setBuilderLayers] = useState<CustomEffectLayerSpec[]>([
    {
      id: 'layer_init_1',
      effectId: 'waveWarp',
      params: { magnitude: 16, spacing: 5, angle: 25, phase: 0 },
      exposedParamKeys: ['magnitude', 'spacing'],
    },
    {
      id: 'layer_init_2',
      effectId: 'glow',
      params: { intensity: 55, radius: 12, threshold: 150 },
      exposedParamKeys: ['intensity'],
    },
  ]);
  const [pickerEffectId, setPickerEffectId] = useState<string>('kaleidoscope');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [customStatus, setCustomStatus] = useState<string | null>(null);

  const localTime = Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));

  React.useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EFFECTS_CATALOG.filter((def) => {
      if (category === 'favorites' && !favoriteIds.includes(def.id)) return false;
      if (category !== 'all' && category !== 'favorites' && def.category !== category) return false;
      if (q && !def.name.toLowerCase().includes(q) && !def.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [category, query, favoriteIds]);

  const handleAddEffect = (effectId: string) => {
    const inst = createEffectInstance(effectId);
    onUpdateClipEffects([...clip.effects, inst]);
    setActiveTab('stack');
  };

  const handleParamChange = (instanceId: string, key: string, value: number) => {
    onUpdateClipEffects(
      clip.effects.map((fx) =>
        fx.instanceId === instanceId ? { ...fx, params: { ...fx.params, [key]: value } } : fx
      )
    );
  };

  const handleToggleEnabled = (instanceId: string) => {
    onUpdateClipEffects(
      clip.effects.map((fx) => (fx.instanceId === instanceId ? { ...fx, enabled: !fx.enabled } : fx))
    );
  };

  const handleMoveEffect = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= clip.effects.length) return;
    const next = [...clip.effects];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onUpdateClipEffects(next);
  };

  const handleDuplicateEffect = (fx: EffectInstance) => {
    const dup: EffectInstance = {
      ...fx,
      instanceId: `fx_${fx.effectId}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      params: { ...fx.params },
    };
    onUpdateClipEffects([...clip.effects, dup]);
  };

  const handleResetEffect = (fx: EffectInstance) => {
    const def = EFFECTS_CATALOG.find((d) => d.id === fx.effectId);
    if (!def) return;
    const resetParams: Record<string, number> = {};
    def.params.forEach((p) => { resetParams[p.key] = p.defaultValue; });
    onUpdateClipEffects(
      clip.effects.map((e) => (e.instanceId === fx.instanceId ? { ...e, params: resetParams } : e))
    );
  };

  const handleCubeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !lutTargetInstanceId) return;
    setLutError(null);
    try {
      const text = await file.text();
      const parsed = parseCubeLut(text);
      onUpdateClipEffects(
        clip.effects.map((fx) =>
          fx.instanceId === lutTargetInstanceId
            ? { ...fx, lutName: parsed.title, lutData: parsed.data, lutSize: parsed.size }
            : fx
        )
      );
    } catch (err) {
      setLutError((err as Error).message);
    }
    e.target.value = '';
  };

  // --- Custom Effect Builder handlers ---
  const openNewBuilder = () => {
    setEditingCustomId(null);
    setBuilderName('Custom Shader Stack');
    setBuilderDesc('Stacked effects with exposed keyframeable controls');
    setBuilderLayers([
      {
        id: `layer_${Date.now()}_1`,
        effectId: 'kaleidoscope',
        params: { segments: 6, rotation: 15 },
        exposedParamKeys: ['segments', 'rotation'],
      },
      {
        id: `layer_${Date.now()}_2`,
        effectId: 'outline',
        params: { threshold: 42, mix: 80, goldTint: 85 },
        exposedParamKeys: ['mix'],
      },
    ]);
    setBuilderOpen(true);
    setCustomStatus(null);
  };

  const openEditBuilder = (def: CustomEffectDefinition) => {
    setEditingCustomId(def.id);
    setBuilderName(def.name);
    setBuilderDesc(def.description);
    setBuilderLayers(def.layers.map((l) => ({ ...l, params: { ...l.params }, exposedParamKeys: [...l.exposedParamKeys] })));
    setBuilderOpen(true);
    setCustomStatus(null);
  };

  const addBuilderLayer = (effectId: string) => {
    const def = EFFECTS_CATALOG.find((e) => e.id === effectId);
    if (!def) return;
    const params: Record<string, number> = {};
    def.params.forEach((p) => { params[p.key] = p.defaultValue; });
    const firstKey = def.params[0]?.key ? [def.params[0].key] : [];
    setBuilderLayers((prev) => [
      ...prev,
      {
        id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        effectId: def.id,
        params,
        exposedParamKeys: firstKey,
      },
    ]);
  };

  const moveBuilderLayer = (idx: number, delta: -1 | 1) => {
    setBuilderLayers((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const toggleExposedParam = (layerId: string, paramKey: string) => {
    setBuilderLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        const exists = l.exposedParamKeys.includes(paramKey);
        return {
          ...l,
          exposedParamKeys: exists
            ? l.exposedParamKeys.filter((k) => k !== paramKey)
            : [...l.exposedParamKeys, paramKey],
        };
      })
    );
  };

  const handleSaveBuilder = () => {
    if (builderLayers.length === 0) return;
    const now = Date.now();
    const def: CustomEffectDefinition = {
      id: editingCustomId ?? `cust_${now}_${Math.random().toString(36).slice(2, 5)}`,
      name: builderName.trim() || 'Untitled Custom Effect',
      description: builderDesc.trim() || `${builderLayers.length} stacked effects`,
      createdAt: editingCustomId
        ? customEffects.find((c) => c.id === editingCustomId)?.createdAt ?? now
        : now,
      updatedAt: now,
      layers: builderLayers,
    };
    onSaveCustomEffect(def);
    setBuilderOpen(false);
    setCustomStatus(`Saved "${def.name}"`);
  };

  const handleLivePreviewBuilder = () => {
    if (builderLayers.length === 0) return;
    const tempDef: CustomEffectDefinition = {
      id: editingCustomId ?? 'preview_custom',
      name: builderName.trim() || 'Live Preview Stack',
      description: builderDesc,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layers: builderLayers,
    };
    const instances = buildInstancesFromCustomEffect(tempDef);
    // Replace any existing custom preview instances from this ID, keep unrelated clip effects
    const kept = clip.effects.filter((fx) => fx.customEffectId !== tempDef.id);
    onUpdateClipEffects([...kept, ...instances]);
    setCustomStatus('Live preview applied to canvas');
  };

  const handleExportCustomJson = (def: CustomEffectDefinition) => {
    const json = JSON.stringify(def, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.name.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCustomStatus(`Exported ${def.name}.json`);
  };

  const handleImportCustomJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<CustomEffectDefinition>;
      if (!parsed.name || !Array.isArray(parsed.layers) || parsed.layers.length === 0) {
        throw new Error('Invalid custom effect JSON format');
      }
      const validLayers = parsed.layers.filter((l) => EFFECTS_CATALOG.some((c) => c.id === l.effectId));
      if (validLayers.length === 0) {
        throw new Error('No recognized effect layers found in JSON');
      }
      const imported: CustomEffectDefinition = {
        id: `cust_imp_${Date.now()}`,
        name: parsed.name,
        description: parsed.description ?? `${validLayers.length} imported layers`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layers: validLayers.map((l, idx) => ({
          id: l.id ?? `imp_l_${idx}`,
          effectId: l.effectId,
          params: l.params ?? {},
          exposedParamKeys: Array.isArray(l.exposedParamKeys) ? l.exposedParamKeys : [],
        })),
      };
      onSaveCustomEffect(imported);
      setCustomStatus(`Imported "${imported.name}"`);
    } catch (err) {
      setCustomStatus(`Import error: ${(err as Error).message}`);
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <input
        ref={lutInputRef}
        type="file"
        accept=".cube"
        onChange={handleCubeFile}
        className="hidden"
      />
      <input
        ref={customImportRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportCustomJson}
        className="hidden"
      />

      {/* Top Switch: Library vs Custom vs Active Effect Stack + Before/After Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-xl overflow-hidden border border-[#2B2B2B] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-3 py-2 font-semibold ${
              activeTab === 'library' ? 'bg-[#D4AF37] text-[#080808]' : 'bg-[#161616] text-neutral-300'
            }`}
          >
            Library ({EFFECTS_CATALOG.length})
          </button>
          <button
            type="button"
            data-testid="effects-custom-tab"
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-2 font-semibold flex items-center gap-1 ${
              activeTab === 'custom' ? 'bg-[#D4AF37] text-[#080808]' : 'bg-[#161616] text-neutral-300'
            }`}
          >
            <Sparkles className="w-3 h-3" /> Custom ({customEffects.length})
          </button>
          <button
            type="button"
            data-testid="effects-stack-tab"
            onClick={() => setActiveTab('stack')}
            className={`px-3 py-2 font-semibold ${
              activeTab === 'stack' ? 'bg-[#D4AF37] text-[#080808]' : 'bg-[#161616] text-neutral-300'
            }`}
          >
            Applied ({clip.effects.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleCompareSplit}
          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
            compareSplit !== null
              ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#F7E396]'
              : 'bg-[#161616] border-[#282828] text-neutral-300 hover:text-white'
          }`}
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
          Before / After
        </button>
      </div>

      {activeTab === 'library' && (
        <div className="space-y-2.5">
          {/* Search + Categories */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 65 effects (Kaleidoscope, Wave Warp, Outline, Unsharp Mask…)"
              aria-label="Search effects library"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#151515] border border-[#272727] text-xs text-white placeholder:text-neutral-500 outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border ${
                  category === tab.id
                    ? 'bg-white text-[#080808] border-white font-semibold'
                    : 'bg-[#161616] text-neutral-400 border-[#262626] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Grid of real effects */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
            {filteredCatalog.map((def) => {
              const isFav = favoriteIds.includes(def.id);
              const appliedCount = clip.effects.filter((e) => e.effectId === def.id).length;
              return (
                <div
                  key={def.id}
                  className="rounded-xl bg-[#151515] border border-[#252525] hover:border-[#D4AF37]/70 p-2.5 flex flex-col justify-between gap-2 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => handleAddEffect(def.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-xs font-semibold text-white truncate">{def.name}</div>
                      <div className="text-[10px] text-neutral-500 line-clamp-2 mt-0.5">{def.description}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(def.id)}
                      aria-label={`Favorite ${def.name}`}
                      className={`p-1 rounded ${isFav ? 'text-[#D4AF37]' : 'text-neutral-600 hover:text-neutral-300'}`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#202020]">
                    <span className="text-[10px] text-neutral-500 capitalize">{def.category}</span>
                    <button
                      type="button"
                      onClick={() => handleAddEffect(def.id)}
                      className="text-[11px] font-semibold text-[#D4AF37] hover:text-[#F7E396]"
                    >
                      {appliedCount > 0 ? `+ Add (${appliedCount})` : '+ Apply'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="space-y-3">
          {/* Header actions: New Custom Effect + Import JSON */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-neutral-300 font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              {builderOpen ? 'Custom Effect Builder' : 'Saved Custom Effects'}
            </div>
            <div className="flex items-center gap-1.5">
              {!builderOpen && (
                <>
                  <button
                    type="button"
                    onClick={() => customImportRef.current?.click()}
                    className="min-h-[34px] px-3 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-[11px] font-medium text-neutral-200 hover:border-[#D4AF37] flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#D4AF37]" /> Import .json
                  </button>
                  <button
                    type="button"
                    data-testid="open-custom-builder-btn"
                    onClick={openNewBuilder}
                    className="min-h-[34px] px-3 rounded-lg bg-[#D4AF37] text-[#080808] text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Effect Builder
                  </button>
                </>
              )}
              {builderOpen && (
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="min-h-[34px] px-3 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-[11px] text-neutral-300"
                >
                  Back to Saved
                </button>
              )}
            </div>
          </div>

          {customStatus && (
            <div className="text-[11px] text-[#F7E396] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg px-3 py-1.5">
              {customStatus}
            </div>
          )}

          {builderOpen ? (
            <div className="bg-[#131313] border border-[#262626] rounded-xl p-3 space-y-3">
              {/* Name + Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={builderName}
                  onChange={(e) => setBuilderName(e.target.value)}
                  placeholder="Custom effect name"
                  aria-label="Custom effect name"
                  className="px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-white outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="text"
                  value={builderDesc}
                  onChange={(e) => setBuilderDesc(e.target.value)}
                  placeholder="Short description"
                  aria-label="Custom effect description"
                  className="px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-neutral-300 outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Add Effect Layer to Stack */}
              <div className="flex items-center gap-2">
                <select
                  aria-label="Select effect to add to stack"
                  value={pickerEffectId}
                  onChange={(e) => setPickerEffectId(e.target.value)}
                  className="flex-1 bg-[#1A1A1A] border border-[#2C2C2C] rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-[#D4AF37]"
                >
                  {EFFECTS_CATALOG.map((eff) => (
                    <option key={eff.id} value={eff.id}>
                      [{eff.category.toUpperCase()}] {eff.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addBuilderLayer(pickerEffectId)}
                  className="min-h-[34px] px-3 rounded-lg bg-white text-[#080808] text-xs font-bold flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Stack Layer
                </button>
              </div>

              {/* Stacked Layers + Exposed Parameter Checkboxes */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {builderLayers.map((layer, idx) => {
                  const def = EFFECTS_CATALOG.find((e) => e.id === layer.effectId);
                  if (!def) return null;
                  return (
                    <div key={layer.id} className="rounded-xl bg-[#181818] border border-[#292929] p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">
                          {idx + 1}. {def.name}
                          <span className="ml-1.5 text-[10px] text-[#D4AF37]">
                            ({layer.exposedParamKeys.length} exposed)
                          </span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveBuilderLayer(idx, -1)}
                            aria-label="Move layer up"
                            className="p-1 rounded bg-[#222] text-neutral-300 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === builderLayers.length - 1}
                            onClick={() => moveBuilderLayer(idx, 1)}
                            aria-label="Move layer down"
                            className="p-1 rounded bg-[#222] text-neutral-300 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBuilderLayers((prev) => prev.filter((l) => l.id !== layer.id))}
                            aria-label="Remove layer"
                            className="p-1 rounded bg-[#222] text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {def.params.map((param) => {
                          const val = layer.params[param.key] ?? param.defaultValue;
                          const isExposed = layer.exposedParamKeys.includes(param.key);
                          return (
                            <div key={param.key} className="bg-[#121212] rounded-lg p-2 border border-[#222]">
                              <div className="flex items-center justify-between text-[10px] mb-1">
                                <label className="flex items-center gap-1.5 text-neutral-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isExposed}
                                    onChange={() => toggleExposedParam(layer.id, param.key)}
                                    className="accent-[#D4AF37]"
                                  />
                                  <span>{param.label}</span>
                                  {isExposed && <span className="text-[#D4AF37] font-semibold">Exposed</span>}
                                </label>
                                <span className="font-mono text-white">
                                  {val}
                                  {param.unit ?? ''}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                value={val}
                                onChange={(e) => {
                                  const nextVal = Number(e.target.value);
                                  setBuilderLayers((prev) =>
                                    prev.map((l) =>
                                      l.id === layer.id
                                        ? { ...l, params: { ...l.params, [param.key]: nextVal } }
                                        : l
                                    )
                                  );
                                }}
                                className="w-full allcut-slider"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Builder Footer Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLivePreviewBuilder}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#1D1D1D] border border-[#323232] text-xs font-semibold text-white hover:border-[#D4AF37] flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> Live Preview
                </button>
                <button
                  type="button"
                  data-testid="save-custom-effect-btn"
                  onClick={handleSaveBuilder}
                  className="flex-1 min-h-[38px] px-4 rounded-xl bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> {editingCustomId ? 'Update Custom Effect' : 'Save Custom Effect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {customEffects.map((ce) => (
                <div
                  key={ce.id}
                  className="rounded-xl bg-[#151515] border border-[#262626] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {renamingId === ce.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            className="px-2 py-1 rounded bg-[#1E1E1E] border border-[#D4AF37] text-xs text-white outline-none flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (renameText.trim()) onRenameCustomEffect(ce.id, renameText.trim());
                              setRenamingId(null);
                            }}
                            className="p-1.5 rounded bg-[#D4AF37] text-[#080808]"
                            aria-label="Confirm rename"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-xs font-bold text-white truncate">{ce.name}</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">{ce.description}</div>
                          <div className="text-[10px] text-[#D4AF37] mt-1 font-mono">
                            {ce.layers
                              .map((l) => EFFECTS_CATALOG.find((e) => e.id === l.effectId)?.name ?? l.effectId)
                              .join(' → ')}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditBuilder(ce)}
                        aria-label={`Edit ${ce.name}`}
                        title="Edit stack"
                        className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 hover:text-white"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(ce.id);
                          setRenameText(ce.name);
                        }}
                        aria-label={`Rename ${ce.name}`}
                        title="Rename"
                        className="px-2 py-1 rounded bg-[#1E1E1E] text-[10px] text-neutral-300 hover:text-white"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportCustomJson(ce)}
                        aria-label={`Export ${ce.name} JSON`}
                        title="Export .json"
                        className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 hover:text-[#D4AF37]"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomEffect(ce.id)}
                        aria-label={`Delete ${ce.name}`}
                        title="Delete"
                        className="p-1.5 rounded bg-[#1E1E1E] text-red-400 hover:bg-red-950/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#222]">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyCustomEffect(ce, 'selected');
                        setActiveTab('stack');
                      }}
                      className="min-h-[32px] px-3 rounded-lg bg-[#D4AF37] text-[#080808] text-[11px] font-bold"
                    >
                      Apply to Clip
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyCustomEffect(ce, 'all');
                        setCustomStatus(`Applied "${ce.name}" to all clips`);
                      }}
                      className="min-h-[32px] px-3 rounded-lg bg-[#1E1E1E] border border-[#303030] text-[11px] text-white hover:border-[#D4AF37]"
                    >
                      Apply to All Clips
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'stack' && (
        <div className="space-y-3">
          {lutError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
              {lutError}
            </div>
          )}

          {clip.effects.length === 0 ? (
            <div className="text-center py-6 bg-[#131313] rounded-xl border border-[#222222]">
              <p className="text-xs text-neutral-400">No effects applied to this clip yet.</p>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className="mt-2.5 px-4 py-2 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold"
              >
                Browse Effects Library
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {clip.effects.map((fx, idx) => {
                  const def = EFFECTS_CATALOG.find((d) => d.id === fx.effectId);
                  if (!def) return null;
                  const hasExposedFilter = fx.exposedParams && fx.exposedParams.length > 0;
                  const showAll = showAllParamsByInstance[fx.instanceId] || !hasExposedFilter;
                  const visibleParams = showAll
                    ? def.params
                    : def.params.filter((p) => fx.exposedParams!.includes(p.key));

                  return (
                    <div
                      key={fx.instanceId}
                      className={`rounded-xl border p-3 space-y-2.5 ${
                        fx.enabled
                          ? 'bg-[#151515] border-[#292929]'
                          : 'bg-[#101010] border-[#1D1D1D] opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-white flex flex-wrap items-center gap-1.5">
                          <span>
                            {idx + 1}. {fx.name}
                          </span>
                          {fx.customEffectName && (
                            <span className="px-1.5 py-0.5 rounded bg-[#D4AF37]/15 text-[#F0D264] text-[10px]">
                              {fx.customEffectName}
                            </span>
                          )}
                          {fx.lutName && <span className="text-[#D4AF37]">· {fx.lutName}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {hasExposedFilter && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowAllParamsByInstance((prev) => ({
                                  ...prev,
                                  [fx.instanceId]: !prev[fx.instanceId],
                                }))
                              }
                              className="px-2 py-1 rounded bg-[#1E1E1E] text-[10px] text-neutral-300 hover:text-white"
                            >
                              {showAll ? 'Exposed' : 'All'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(fx.instanceId)}
                            aria-label={fx.enabled ? `Disable ${fx.name}` : `Enable ${fx.name}`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 hover:text-white"
                          >
                            {fx.enabled ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveEffect(idx, -1)}
                            aria-label={`Move ${fx.name} up`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === clip.effects.length - 1}
                            onClick={() => handleMoveEffect(idx, 1)}
                            aria-label={`Move ${fx.name} down`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateEffect(fx)}
                            aria-label={`Duplicate ${fx.name}`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 hover:text-white"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetEffect(fx)}
                            aria-label={`Reset ${fx.name}`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-neutral-300 hover:text-white"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateClipEffects(clip.effects.filter((e) => e.instanceId !== fx.instanceId))
                            }
                            aria-label={`Remove ${fx.name}`}
                            className="p-1.5 rounded bg-[#1E1E1E] text-red-400 hover:bg-red-950/50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {fx.effectId === 'lutApply' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLutTargetInstanceId(fx.instanceId);
                              lutInputRef.current?.click();
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] border border-[#333] text-[11px] text-[#D4AF37] font-semibold flex items-center gap-1"
                          >
                            <Upload className="w-3 h-3" /> Import .cube LUT
                          </button>
                          <span className="text-[11px] text-neutral-400">
                            Active: {fx.lutName ?? LUT_PRESET_NAMES[Math.round(fx.params.preset ?? 0)]}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                        {visibleParams.map((param) => {
                          const val = fx.params[param.key] ?? param.defaultValue;
                          const kfKey = makeEffectParamKeyframeKey(fx.instanceId, param.key);
                          const hasKf = hasKeyframeAtTime(clip.keyframes[kfKey], localTime);
                          return (
                            <div key={param.key}>
                              <div className="flex items-center justify-between text-[11px] mb-1 gap-1.5">
                                <span className="text-neutral-400 truncate">{param.label}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono tabular-nums text-white">
                                    {param.key === 'preset' && fx.effectId === 'lutApply'
                                      ? LUT_PRESET_NAMES[Math.round(val)]
                                      : `${val}${param.unit ?? ''}`}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Toggle keyframe for ${fx.name} ${param.label}`}
                                    aria-pressed={hasKf}
                                    onClick={() => onToggleEffectParamKeyframe(fx.instanceId, param.key, val)}
                                    className={`p-1 rounded transition-colors ${
                                      hasKf
                                        ? 'text-[#D4AF37] bg-[#D4AF37]/15'
                                        : 'text-neutral-500 hover:text-white'
                                    }`}
                                  >
                                    <Diamond className={`w-3 h-3 ${hasKf ? 'fill-current' : ''}`} />
                                  </button>
                                </div>
                              </div>
                              <input
                                type="range"
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                value={val}
                                onChange={(e) => handleParamChange(fx.instanceId, param.key, Number(e.target.value))}
                                className="w-full allcut-slider"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save Stack as Custom Preset / Apply to All Clips */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#222222]">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Custom preset name…"
                  aria-label="Custom preset name"
                  className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-[#161616] border border-[#2A2A2A] text-xs text-white outline-none focus:border-[#D4AF37]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const label = presetName.trim() || `Custom Look ${new Date().toLocaleTimeString()}`;
                    onSavePresetFromClip(label, clip.effects);
                    setPresetName('');
                  }}
                  className="min-h-[36px] px-3 rounded-lg bg-[#D4AF37] text-[#080808] text-xs font-bold flex items-center gap-1"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" /> Save Preset
                </button>
                <button
                  type="button"
                  onClick={() => onApplyEffectsToAllClips(clip.effects)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#1C1C1C] border border-[#2E2E2E] text-xs text-white font-medium hover:border-[#D4AF37]"
                >
                  Apply to All Clips
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
