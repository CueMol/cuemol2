/**
 * @file hooks/useActiveViewState.ts
 * @description Owns the renderer-side cache of three view-scoped properties
 * (`viewProjection`, `viewCenterMark`, `sceneBgColor`) for the currently
 * active molview tab, and keeps the native menu in sync via IPC.
 *
 * Update flow (one direction: write -> read-back -> cache):
 *   - Tab switch (`activeMolViewId` change): pull all three from worker.
 *   - User action via command: corresponding `onXxxChanged` callback writes
 *     the new value into the cache and syncs the native menu.
 *
 * The polling on tab switch is the residual two-way path; once the C++
 * Scene/View emit per-property change events, this hook can subscribe via
 * `cm.addEventListener` and drop the Promise.all fetch.
 */

import { useCallback, useEffect, useState } from 'react';
import { IPC } from '@shared/ipcChannels';
import type { SceneBgColor, ViewCenterMark } from '@shared/ipcTypes';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';

interface UseActiveViewStateOptions {
  cm: AsyncCueMol | null;
  activeMolViewId: number | undefined;
  /** Active scene uid (of the active molview tab), used to fetch sceneBgColor. */
  activeSceneId: number | undefined;
}

export interface ActiveViewState {
  viewProjection: boolean | null;
  viewCenterMark: ViewCenterMark | null;
  sceneBgColor: SceneBgColor | null;
  onProjectionChanged: (perspective: boolean) => void;
  onCenterMarkChanged: (centerMark: ViewCenterMark) => void;
  onBgColorChanged: (bgColor: SceneBgColor) => void;
}

export function useActiveViewState({
  cm,
  activeMolViewId,
  activeSceneId,
}: UseActiveViewStateOptions): ActiveViewState {
  const [viewProjection, setViewProjection] = useState<boolean | null>(null);
  const [viewCenterMark, setViewCenterMark] = useState<ViewCenterMark | null>(null);
  const [sceneBgColor, setSceneBgColor] = useState<SceneBgColor | null>(null);

  const syncNativeViewMenu = useCallback((state: {
    perspective?: boolean | null;
    centerMark?: ViewCenterMark | null;
    bgColor?: SceneBgColor | null;
    /** Enable/disable scene-operation menu items (Save / Export / tools, ...). */
    sceneEnabled?: boolean;
  }) => {
    window.electronAPI?.invoke(IPC.MENU_UPDATE_STATE, {
      ...(state.perspective !== undefined
        ? { viewProjection: { enabled: state.perspective !== null, perspective: state.perspective } }
        : {}),
      ...(state.centerMark !== undefined
        ? { viewCenterMark: { enabled: state.centerMark !== null, centerMark: state.centerMark } }
        : {}),
      ...(state.bgColor !== undefined
        ? { sceneBgColor: { enabled: state.bgColor !== null, bgColor: state.bgColor } }
        : {}),
      ...(state.sceneEnabled !== undefined
        ? { sceneOps: { enabled: state.sceneEnabled } }
        : {}),
    }).catch((err: unknown) => {
      console.warn('update menu state failed:', err);
    });
  }, []);

  const onProjectionChanged = useCallback((perspective: boolean) => {
    setViewProjection(perspective);
    syncNativeViewMenu({ perspective });
  }, [syncNativeViewMenu]);

  const onCenterMarkChanged = useCallback((centerMark: ViewCenterMark) => {
    setViewCenterMark(centerMark);
    syncNativeViewMenu({ centerMark });
  }, [syncNativeViewMenu]);

  const onBgColorChanged = useCallback((bgColor: SceneBgColor) => {
    setSceneBgColor(bgColor);
    syncNativeViewMenu({ bgColor });
  }, [syncNativeViewMenu]);

  // Tab-switch fetch: when the active view (or its scene) changes, pull all
  // three values from the worker. `activeSceneId` is in the dep list so the
  // effect re-runs once it resolves on a tab switch (it can briefly lag
  // `activeMolViewId` by a render), keeping the bgColor fetch correct. On
  // cancellation or error, reset to nulls (disables the related menu items).
  useEffect(() => {
    if (!cm || activeMolViewId === undefined) {
      setViewProjection(null);
      setViewCenterMark(null);
      setSceneBgColor(null);
      // No active molview tab -> disable both the view-property items and the
      // scene-operation items (Save / Export / tools, ...).
      syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null, sceneEnabled: false });
      return;
    }

    let cancelled = false;
    Promise.all([
      cm.invokeService('getViewProjection', { viewId: activeMolViewId }),
      cm.invokeService('getViewCenterMark', { viewId: activeMolViewId }),
      activeSceneId !== undefined ? cm.invokeService('getSceneBgColor', { sceneId: activeSceneId }) : Promise.resolve(null),
    ]).then(([projectionResult, centerMarkResult, bgColorResult]) => {
      if (cancelled) return;
      const perspective = projectionResult?.ok ? projectionResult.perspective : null;
      const centerMark = centerMarkResult?.ok ? centerMarkResult.centerMark : null;
      const bgColor = bgColorResult?.ok ? bgColorResult.bgColor : null;
      setViewProjection(perspective);
      setViewCenterMark(centerMark);
      setSceneBgColor(bgColor);
      syncNativeViewMenu({ perspective, centerMark, bgColor, sceneEnabled: true });
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.warn('get view state failed:', err);
        setViewProjection(null);
        setViewCenterMark(null);
        setSceneBgColor(null);
        // A molview tab is still active (only the property fetch failed), so
        // scene-operation items stay enabled.
        syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null, sceneEnabled: true });
      }
    });

    return () => { cancelled = true; };
  }, [activeMolViewId, activeSceneId, cm, syncNativeViewMenu]);

  return {
    viewProjection,
    viewCenterMark,
    sceneBgColor,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
  };
}
