/**
 * @file hooks/useActiveViewState.ts
 * @description Owns the renderer-side cache of three view-scoped properties
 * (`viewProjection`, `viewCenterMark`, `sceneBgColor`) for the currently
 * active molview tab, and keeps the native menu in sync via IPC.
 *
 * Update flow (one direction: write → read-back → cache):
 *   - Tab switch (`activeMolViewId` change): pull all three from worker.
 *   - User action via command: corresponding `onXxxChanged` callback writes
 *     the new value into the cache and syncs the native menu.
 *
 * The polling on tab switch is the residual two-way path; once the C++
 * Scene/View emit per-property change events, this hook can subscribe via
 * `cm.addEventListener` and drop the Promise.all fetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC } from '../../shared/ipcChannels';
import type { SceneBgColor, ViewCenterMark } from '../../shared/ipcTypes';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';

interface UseActiveViewStateOptions {
  cm: AsyncCueMol | null;
  activeMolViewId: number | undefined;
  /** Returns the active scene/view ids, used to fetch sceneBgColor. */
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined;
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
  getActiveSceneInfo,
}: UseActiveViewStateOptions): ActiveViewState {
  const [viewProjection, setViewProjection] = useState<boolean | null>(null);
  const [viewCenterMark, setViewCenterMark] = useState<ViewCenterMark | null>(null);
  const [sceneBgColor, setSceneBgColor] = useState<SceneBgColor | null>(null);

  const syncNativeViewMenu = useCallback((state: {
    perspective?: boolean | null;
    centerMark?: ViewCenterMark | null;
    bgColor?: SceneBgColor | null;
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

  // Stabilize getActiveSceneInfo via a ref so a fresh function reference on
  // every render does not retrigger the polling effect (which would re-fetch
  // and overwrite state set by `onXxxChanged` callbacks).
  const getActiveSceneInfoRef = useRef(getActiveSceneInfo);
  getActiveSceneInfoRef.current = getActiveSceneInfo;

  // Tab-switch fetch: when the active view changes, pull all three values
  // from the worker. On cancellation or error, reset to nulls (disables the
  // related menu items via `enabled: false`).
  useEffect(() => {
    if (!cm || activeMolViewId === undefined) {
      setViewProjection(null);
      setViewCenterMark(null);
      setSceneBgColor(null);
      syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null });
      return;
    }

    const sceneInfo = getActiveSceneInfoRef.current();
    const sceneId = sceneInfo?.scene_uid;

    let cancelled = false;
    Promise.all([
      cm.getViewProjection(activeMolViewId),
      cm.getViewCenterMark(activeMolViewId),
      sceneId !== undefined ? cm.getSceneBgColor(sceneId) : Promise.resolve(null),
    ]).then(([projectionResult, centerMarkResult, bgColorResult]) => {
      if (cancelled) return;
      const perspective = projectionResult?.ok ? projectionResult.perspective : null;
      const centerMark = centerMarkResult?.ok ? centerMarkResult.centerMark : null;
      const bgColor = bgColorResult?.ok ? bgColorResult.bgColor : null;
      setViewProjection(perspective);
      setViewCenterMark(centerMark);
      setSceneBgColor(bgColor);
      syncNativeViewMenu({ perspective, centerMark, bgColor });
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.warn('get view state failed:', err);
        setViewProjection(null);
        setViewCenterMark(null);
        setSceneBgColor(null);
        syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null });
      }
    });

    return () => { cancelled = true; };
  }, [activeMolViewId, cm, syncNativeViewMenu]);

  return {
    viewProjection,
    viewCenterMark,
    sceneBgColor,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
  };
}
