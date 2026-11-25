/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Clip,
  CustomEffectDefinition,
  CustomPreset,
  EditorToolId,
  EffectInstance,
  Project,
} from './types/editor';
import { detectDeviceCapabilities } from './engine/videoExporter';
import {
  clearAutosaveRecovery,
  createStarterProject,
  loadAppSettings,
  loadAutosaveRecovery,
  loadCustomEffects,
  loadFavoriteEffects,
  loadPresets,
  loadProjects,
  saveAppSettings,
  saveAutosaveRecovery,
  saveCustomEffects,
  saveFavoriteEffects,
  savePresets,
  saveProjects,
  type AppSettings,
} from './engine/storage';
import {
  createBuiltinAudioAsset,
  importLocalMediaFile,
} from './engine/mediaGenerator';
import { createDefaultSpeedConfig, getPresetCurvePoints } from './engine/speedRemap';
import {
  createDefaultMask,
  createDefaultTransform,
  createDefaultTransition,
} from './engine/timelineOps';
import { SplashScreen } from './components/BrandLogo';
import { HomeScreen } from './components/HomeScreen';
import { EditorScreen } from './components/EditorScreen';
import { ShootRecordModal } from './components/EditorModals';

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const capabilities = useMemo(() => detectDeviceCapabilities(), []);
  const pcmStoreRef = useRef<Map<string, { pcm: Float32Array; sampleRate: number }>>(new Map());

  const [showSplash, setShowSplash] = useState(!autostart);
  const [projects, setProjects] = useState<Project[]>(() => {
    const existing = loadProjects();
    if (existing.length > 0) return existing;
    const starter = createStarterProject('video', 'Golden Orbit Showreel', true);
    starter.pcmStore.forEach((v, k) => pcmStoreRef.current.set(k, v));
    return [starter.project];
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    autostart ? projects[0]?.id ?? null : null
  );
  const [initialEditorTool, setInitialEditorTool] = useState<EditorToolId | null>(null);
  const [recoveryProject, setRecoveryProject] = useState<Project | null>(() => loadAutosaveRecovery());
  const [presets, setPresets] = useState<CustomPreset[]>(() => loadPresets());
  const [customEffects, setCustomEffects] = useState<CustomEffectDefinition[]>(() => loadCustomEffects());
  const [favoriteEffects, setFavoriteEffects] = useState<string[]>(() => loadFavoriteEffects());
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [showHomeShootModal, setShowHomeShootModal] = useState(false);

  // Rehydrate synthetic audio blob URLs when reopening persisted projects offline
  const hydrateProjectOfflineAudio = useCallback((proj: Project): Project => {
    let changed = false;
    const nextAssets = { ...proj.assets };
    for (const [id, asset] of Object.entries(nextAssets)) {
      if (asset.kind === 'audio' && asset.syntheticAudioBpm && !asset.objectUrl) {
        const rebuilt = createBuiltinAudioAsset(id, asset.name, asset.syntheticAudioBpm, asset.duration);
        pcmStoreRef.current.set(id, { pcm: rebuilt.pcm, sampleRate: rebuilt.sampleRate });
        nextAssets[id] = { ...asset, objectUrl: rebuilt.asset.objectUrl, waveformPeaks: rebuilt.asset.waveformPeaks };
        changed = true;
      }
    }
    return changed ? { ...proj, assets: nextAssets } : proj;
  }, []);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  useEffect(() => {
    saveCustomEffects(customEffects);
  }, [customEffects]);

  useEffect(() => {
    saveFavoriteEffects(favoriteEffects);
  }, [favoriteEffects]);

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    const found = projects.find((p) => p.id === activeProjectId);
    return found ? hydrateProjectOfflineAudio(found) : null;
  }, [activeProjectId, projects, hydrateProjectOfflineAudio]);

  const handleSaveProject = useCallback(
    (updated: Project) => {
      setProjects((prev) => {
        const exists = prev.some((p) => p.id === updated.id);
        return exists
          ? prev.map((p) => (p.id === updated.id ? updated : p))
          : [updated, ...prev];
      });
      if (settings.autosaveEnabled) {
        saveAutosaveRecovery(updated);
      }
    },
    [settings.autosaveEnabled]
  );

  const handleCreateNewVideo = async (
    tool: EditorToolId | null = null,
    importedFiles?: FileList | null
  ) => {
    const hasFiles = Boolean(importedFiles && importedFiles.length > 0);
    const starter = createStarterProject(
      'video',
      hasFiles && importedFiles ? importedFiles[0].name.replace(/\.[^.]+$/, '') : `Cut ${projects.length + 1}`,
      !hasFiles
    );
    starter.pcmStore.forEach((v, k) => pcmStoreRef.current.set(k, v));
    let proj = starter.project;

    if (hasFiles && importedFiles) {
      let cursor = 0;
      const newAssets = { ...proj.assets };
      const newClips: Clip[] = [];
      for (const file of Array.from(importedFiles)) {
        const { asset, pcm, sampleRate } = await importLocalMediaFile(file);
        if (pcm && sampleRate) pcmStoreRef.current.set(asset.id, { pcm, sampleRate });
        newAssets[asset.id] = asset;
        const track =
          asset.kind === 'audio'
            ? proj.tracks.find((t) => t.type === 'audio') ?? proj.tracks[4]
            : proj.tracks[0];
        newClips.push({
          id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          trackId: track.id,
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          startTime: asset.kind === 'audio' ? 0 : cursor,
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
        });
        if (asset.kind !== 'audio') cursor += asset.duration;
      }
      proj = { ...proj, assets: newAssets, clips: newClips };
    }

    setProjects((prev) => [proj, ...prev]);
    setInitialEditorTool(tool);
    setActiveProjectId(proj.id);
  };

  const handleCreateEditPhoto = async (importedFile?: File | null) => {
    const starter = createStarterProject(
      'photo',
      importedFile ? importedFile.name.replace(/\.[^.]+$/, '') : `Photo Edit ${projects.length + 1}`,
      !importedFile
    );
    let proj = starter.project;

    if (importedFile) {
      const { asset } = await importLocalMediaFile(importedFile);
      proj = {
        ...proj,
        assets: { [asset.id]: asset },
        clips: [
          {
            id: `clip_photo_${Date.now()}`,
            trackId: proj.tracks[0].id,
            assetId: asset.id,
            name: asset.name,
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
          },
        ],
      };
    }

    setProjects((prev) => [proj, ...prev]);
    setInitialEditorTool('sharpen');
    setActiveProjectId(proj.id);
  };

  const handleApplyPresetToNewProject = (preset: CustomPreset) => {
    const starter = createStarterProject('video', `${preset.name} Edit`, true);
    starter.pcmStore.forEach((v, k) => pcmStoreRef.current.set(k, v));
    let proj = starter.project;

    proj = {
      ...proj,
      beatSync: preset.beatSync ? { ...proj.beatSync, ...preset.beatSync } : proj.beatSync,
      clips: proj.clips.map((clip) => {
        if (clip.kind !== 'video' && clip.kind !== 'image') return clip;
        return {
          ...clip,
          effects: preset.effects
            ? preset.effects.map((e, i) => ({
                ...e,
                instanceId: `fx_pre_${Date.now()}_${i}`,
                params: { ...e.params },
              }))
            : clip.effects,
          speed: preset.speed
            ? {
                ...clip.speed,
                ...preset.speed,
                curvePoints: preset.speed.presetId
                  ? getPresetCurvePoints(preset.speed.presetId)
                  : clip.speed.curvePoints,
              }
            : clip.speed,
        };
      }),
    };

    setProjects((prev) => [proj, ...prev]);
    setInitialEditorTool(
      preset.category === 'beatSync'
        ? 'beatSync'
        : preset.category === 'speed'
          ? 'speed'
          : preset.category === 'sharpen'
            ? 'sharpen'
            : 'effects'
    );
    setActiveProjectId(proj.id);
  };

  const handleSavePresetFromEditor = (name: string, effects: EffectInstance[]) => {
    const next: CustomPreset = {
      id: `preset_${Date.now()}`,
      name,
      category: effects.some((e) => e.category === 'sharpen') ? 'sharpen' : 'effects',
      description: `${effects.map((e) => e.name).slice(0, 3).join(', ')}`,
      createdAt: Date.now(),
      effects: effects.map((e) => ({ ...e, params: { ...e.params } })),
    };
    setPresets((prev) => [next, ...prev]);
  };

  const downloadJson = (obj: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {activeProject ? (
        <EditorScreen
          key={activeProject.id}
          project={activeProject}
          capabilities={capabilities}
          initialTool={initialEditorTool}
          pcmStore={pcmStoreRef.current}
          proxyEnabled={settings.proxyPreview}
          favoriteEffects={favoriteEffects}
          customEffects={customEffects}
          onToggleProxy={() =>
            setSettings((s) => ({ ...s, proxyPreview: !s.proxyPreview }))
          }
          onToggleFavoriteEffect={(id) =>
            setFavoriteEffects((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }
          onSaveProject={handleSaveProject}
          onSavePreset={handleSavePresetFromEditor}
          onSaveCustomEffect={(def) =>
            setCustomEffects((prev) =>
              prev.some((c) => c.id === def.id)
                ? prev.map((c) => (c.id === def.id ? def : c))
                : [def, ...prev]
            )
          }
          onDeleteCustomEffect={(id) =>
            setCustomEffects((prev) => prev.filter((c) => c.id !== id))
          }
          onRenameCustomEffect={(id, name) =>
            setCustomEffects((prev) =>
              prev.map((c) => (c.id === id ? { ...c, name, updatedAt: Date.now() } : c))
            )
          }
          onExit={() => {
            clearAutosaveRecovery();
            setRecoveryProject(null);
            setActiveProjectId(null);
            setInitialEditorTool(null);
          }}
        />
      ) : (
        <HomeScreen
          projects={projects}
          recoveryProject={recoveryProject}
          presets={presets}
          capabilities={capabilities}
          settings={settings}
          onUpdateSettings={setSettings}
          onCreateNewVideo={handleCreateNewVideo}
          onCreateEditPhoto={handleCreateEditPhoto}
          onOpenProject={(proj, tool = null) => {
            setInitialEditorTool(tool);
            setActiveProjectId(proj.id);
          }}
          onRecoverProject={() => {
            if (!recoveryProject) return;
            const hydrated = hydrateProjectOfflineAudio(recoveryProject);
            setProjects((prev) => [hydrated, ...prev.filter((p) => p.id !== hydrated.id)]);
            setActiveProjectId(hydrated.id);
            setRecoveryProject(null);
          }}
          onDismissRecovery={() => {
            clearAutosaveRecovery();
            setRecoveryProject(null);
          }}
          onDuplicateProject={(projectId) => {
            const src = projects.find((p) => p.id === projectId);
            if (!src) return;
            const dup: Project = {
              ...structuredClone(src),
              id: `proj_${Date.now()}`,
              name: `${src.name} Copy`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            setProjects((prev) => [dup, ...prev]);
          }}
          onRenameProject={(projectId, name) =>
            setProjects((prev) =>
              prev.map((p) => (p.id === projectId ? { ...p, name, updatedAt: Date.now() } : p))
            )
          }
          onDeleteProject={(projectId) =>
            setProjects((prev) => prev.filter((p) => p.id !== projectId))
          }
          onRelinkProjectMedia={async (projectId, file) => {
            const { asset, pcm, sampleRate } = await importLocalMediaFile(file);
            if (pcm && sampleRate) pcmStoreRef.current.set(asset.id, { pcm, sampleRate });
            setProjects((prev) =>
              prev.map((p) => {
                if (p.id !== projectId) return p;
                const missingEntry = Object.values(p.assets).find((a) => a.missing);
                if (!missingEntry) return p;
                return {
                  ...p,
                  assets: {
                    ...p.assets,
                    [missingEntry.id]: { ...asset, id: missingEntry.id, missing: false },
                  },
                };
              })
            );
          }}
          onExportProjectJson={(proj) =>
            downloadJson(proj, `${proj.name.replace(/\s+/g, '_')}.allcut.json`)
          }
          onImportProjectJson={async (file) => {
            try {
              const parsed = JSON.parse(await file.text()) as Project;
              if (parsed && parsed.id && Array.isArray(parsed.clips)) {
                const imported = { ...parsed, id: `proj_imp_${Date.now()}`, updatedAt: Date.now() };
                setProjects((prev) => [imported, ...prev]);
              }
            } catch {
              // ignore invalid file
            }
          }}
          onApplyPresetToNewProject={handleApplyPresetToNewProject}
          onDeletePreset={(id) => setPresets((prev) => prev.filter((p) => p.id !== id))}
          onRenamePreset={(id, name) =>
            setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
          }
          onImportPresetJson={async (file) => {
            try {
              const parsed = JSON.parse(await file.text()) as CustomPreset;
              if (parsed && parsed.name) {
                setPresets((prev) => [
                  { ...parsed, id: `preset_imp_${Date.now()}`, builtIn: false },
                  ...prev,
                ]);
              }
            } catch {
              // ignore invalid JSON
            }
          }}
          onExportPresetJson={(preset) =>
            downloadJson(preset, `${preset.name.replace(/\s+/g, '_')}.allcut-preset.json`)
          }
          onOpenShootModal={() => setShowHomeShootModal(true)}
          onClearCache={() => {
            clearAutosaveRecovery();
            setRecoveryProject(null);
          }}
        />
      )}

      {showHomeShootModal && (
        <ShootRecordModal
          onRecordedFile={async (file) => {
            const dt = new DataTransfer();
            dt.items.add(file);
            await handleCreateNewVideo(null, dt.files);
          }}
          onClose={() => setShowHomeShootModal(false)}
        />
      )}
    </>
  );
}
