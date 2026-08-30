/**
 * @file hooks/useActiveViewState.ts
 * @description The view-scoped attributes the native menu mirrors --
 * `viewProjection`, `viewCenterMark`, `sceneBgColor`, `sceneColorProof` --
 * for the active molview tab.
 *
 * Two ways in, both landing on one read:
 *   - a tab switch (`activeMolViewId` / `activeSceneId` change), and
 *   - a change made anywhere else: an undo, a script, a `.qsc` load, or the
 *     inspector's Scene page, which all fire the C++ property-change events
 *     this subscribes to.
 *
 * Only the write-through path is separate: a command that sets one of these
 * pushes its own value straight into the cache and the menu rather than
 * waiting for the event, so the menu never lags the click that caused it.
 */

import { useCallback, useEffect, useState } from 'react';
import { IPC } from '@shared/ipcChannels';
import type { SceneBgColor, ViewCenterMark } from '@shared/types/menuState';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';
import { useLatestRef } from '@renderer/hooks/react/useLatestRef';
import { SEM_SCENE, SEM_VIEW, SEM_PROPCHG } from '@renderer/event';
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing';

interface UseActiveViewStateOptions {
  cm: AsyncCueMol | null;
  activeMolViewId: number | undefined;
  /** Active scene uid (of the active molview tab); scopes the scene reads. */
  activeSceneId: number | undefined;
}

export interface ActiveViewState {
  viewProjection: boolean | null;
  viewCenterMark: ViewCenterMark | null;
  sceneBgColor: SceneBgColor | null;
  /** Whether colour proofing is active on the scene; null when there is none. */
  sceneColorProof: boolean | null;
  onProjectionChanged: (perspective: boolean) => void;
  onCenterMarkChanged: (centerMark: ViewCenterMark) => void;
  onBgColorChanged: (bgColor: SceneBgColor) => void;
  onColorProofingChanged: (active: boolean) => void;
}

/** Scene properties whose change is one of ours; anything else is noise. */
const SCENE_PROPS = new Set(['bgcolor', 'use_colproof']);
/** View properties, named after the `.qif` properties the setters report. */
const VIEW_PROPS = new Set(['perspective', 'centerMark']);

/** The `propname` an event carries, or '' when it is not a property change. */
function propNameOf(args: unknown): string {
  const a = args as { obj?: { propname?: string } } | null | undefined;
  return a?.obj?.propname ?? '';
}

/** The uid the event is about (a view event names the view, not the scene). */
function targetUidOf(args: unknown): number | undefined {
  const a = args as { obj?: { target_uid?: number } } | null | undefined;
  return a?.obj?.target_uid;
}

export function useActiveViewState({
  cm,
  activeMolViewId,
  activeSceneId,
}: UseActiveViewStateOptions): ActiveViewState {
  const [viewProjection, setViewProjection] = useState<boolean | null>(null);
  const [viewCenterMark, setViewCenterMark] = useState<ViewCenterMark | null>(null);
  const [sceneBgColor, setSceneBgColor] = useState<SceneBgColor | null>(null);
  const [sceneColorProof, setSceneColorProof] = useState<boolean | null>(null);

  const syncNativeViewMenu = useCallback((state: {
    perspective?: boolean | null;
    centerMark?: ViewCenterMark | null;
    bgColor?: SceneBgColor | null;
    colorProof?: boolean | null;
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
      ...(state.colorProof !== undefined
        ? { sceneColorProof: { enabled: state.colorProof !== null, checked: state.colorProof === true } }
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

  const onColorProofingChanged = useCallback((active: boolean) => {
    setSceneColorProof(active);
    syncNativeViewMenu({ colorProof: active });
  }, [syncNativeViewMenu]);

  // The one read. Both the tab-switch effect and the event subscriptions run
  // it, so there is a single description of what the menu mirrors. Reads the
  // scoping ids from a ref: the listeners are identity-stable and must not
  // resubscribe just because a value changed.
  const scopeRef = useLatestRef({ cm, activeMolViewId, activeSceneId });
  const refresh = useCallback(async (): Promise<void> => {
    const { cm: c, activeMolViewId: viewId, activeSceneId: sceneId } = scopeRef.current;
    if (!c || viewId === undefined) {
      setViewProjection(null);
      setViewCenterMark(null);
      setSceneBgColor(null);
      setSceneColorProof(null);
      // No active molview tab -> disable both the view-property items and the
      // scene-operation items (Save / Export / tools, ...).
      syncNativeViewMenu({
        perspective: null, centerMark: null, bgColor: null, colorProof: null,
        sceneEnabled: false,
      });
      return;
    }
    try {
      const [projection, centerMarkRes, bgColorRes, colorProofRes] = await Promise.all([
        c.invokeService('getViewProjection', { viewId }),
        c.invokeService('getViewCenterMark', { viewId }),
        sceneId !== undefined ? c.invokeService('getSceneBgColor', { sceneId }) : Promise.resolve(null),
        sceneId !== undefined ? c.invokeService('getSceneColorProofing', { sceneId }) : Promise.resolve(null),
      ]);
      // A tab switch during the fetch makes this answer the wrong scene's.
      if (scopeRef.current.activeMolViewId !== viewId) return;
      const perspective = projection?.ok ? projection.perspective : null;
      const centerMark = centerMarkRes?.ok ? centerMarkRes.centerMark : null;
      const bgColor = bgColorRes?.ok ? bgColorRes.bgColor : null;
      const colorProof = colorProofRes?.ok ? colorProofRes.enabled : null;
      setViewProjection(perspective);
      setViewCenterMark(centerMark);
      setSceneBgColor(bgColor);
      setSceneColorProof(colorProof);
      syncNativeViewMenu({ perspective, centerMark, bgColor, colorProof, sceneEnabled: true });
    } catch (err: unknown) {
      if (scopeRef.current.activeMolViewId !== viewId) return;
      console.warn('get view state failed:', err);
      setViewProjection(null);
      setViewCenterMark(null);
      setSceneBgColor(null);
      setSceneColorProof(null);
      // A molview tab is still active (only the property fetch failed), so
      // scene-operation items stay enabled.
      syncNativeViewMenu({
        perspective: null, centerMark: null, bgColor: null, colorProof: null,
        sceneEnabled: true,
      });
    }
  }, [scopeRef, syncNativeViewMenu]);

  // Tab switch: read the new tab's values.
  useEffect(() => {
    void refresh();
  }, [activeMolViewId, activeSceneId, cm, refresh]);

  // The scene's background colour and colour-proofing flag, changed anywhere
  // else: an undo, a script, a `.qsc` load, or the inspector's Scene page.
  // `Scene::propChanged` reports them as SEM_SCENE property changes.
  useCueMolEventListener({
    cm,
    enabled: activeSceneId !== undefined,
    category: '',
    srcMask: SEM_SCENE,
    evtMask: SEM_PROPCHG,
    scopeId: activeSceneId ?? -1,
    filter: (args) => SCENE_PROPS.has(propNameOf(args)),
    handler: () => { void refresh(); },
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  });

  // The same for the view's projection and center mark. A view event is
  // sourced by its scene, so the scope is the scene and the view itself is
  // named by `target_uid` -- without that check another view in the same
  // scene would trigger a read of this one.
  useCueMolEventListener({
    cm,
    enabled: activeSceneId !== undefined && activeMolViewId !== undefined,
    category: 'viewPropChanged',
    srcMask: SEM_VIEW,
    evtMask: SEM_PROPCHG,
    scopeId: activeSceneId ?? -1,
    filter: (args) =>
      VIEW_PROPS.has(propNameOf(args)) &&
      targetUidOf(args) === scopeRef.current.activeMolViewId,
    handler: () => { void refresh(); },
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  });

  return {
    viewProjection,
    viewCenterMark,
    sceneBgColor,
    sceneColorProof,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
    onColorProofingChanged,
  };
}
