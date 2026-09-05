/**
 * @file features/render/renderwindow/useSceneSettingsSync.ts
 * @description Keeps the Rendering window's editor and the target scene's
 * stored render settings in step.
 *
 * The scene is the store (a C++ RenderSettings object, one undoable edit per
 * write); the editor is a view of it:
 *
 *   - target scene changes -> load what it stores (or the defaults), no write;
 *   - the user edits       -> write the whole editor state after a short
 *                             quiet period, so a slider drag is one undo entry;
 *   - a render starts      -> flush, so the render and the scene agree;
 *   - "Use settings"       -> restore a history entry and write it at once;
 *   - the scene changes    -> (an undo in the main window, another writer)
 *                             reload unless the push is this window's own
 *                             echo or a write is about to supersede it.
 *
 * Loads never write, so the echo of a write cannot start a ping-pong: an own
 * write comes back equal to the editor and is dropped by comparison, which
 * also covers a C++ side that normalises a value. The sceneId of a debounced
 * write is captured when the edit happens, so a target switch flushes the
 * pending write to the scene it belongs to before the new scene is loaded.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderResult } from "@renderer/data/renderResult";
import { useDebouncedCallback } from "@renderer/hooks/react/useDebouncedCallback";
import { useStaleGuard } from "@renderer/hooks/react/useStaleGuard";
import { useHoldReveal } from "@renderer/shell/reveal/useRevealWindow";
import { PERSIST_DEBOUNCE_MS } from "@renderer/utils/timing";
import {
  sameRenderValues,
  type RenderSettingsValues,
} from "@renderer/worker/shared/renderSettingsValues";
import type { PropDef } from "@renderer/data/rendererProperties";
import type { RenderBackendId } from "@renderer/data/renderSettings";
import { backendSpecs, placeholderProps } from "../propMath";
import {
  backendPropsFromValues,
  snapshotFromRenderSettings,
  valuesFromSnapshot,
} from "../sceneRenderSettings";
import type { useRenderSettings } from "../useRenderSettings";
import type { useRenderWindowClient } from "../useRenderWindowClient";

type RenderSettingsApi = ReturnType<typeof useRenderSettings>;
type RenderWindowClientApi = ReturnType<typeof useRenderWindowClient>;

export interface UseSceneSettingsSyncArgs {
  client: RenderWindowClientApi;
  settings: RenderSettingsApi;
  /** Scene of the selected render target, or null when none is open. */
  targetSceneId: number | null;
  umbreonAvailable: boolean;
}

export interface SceneSettingsSync {
  /** A load for the target scene is in flight (holds the window reveal). */
  loading: boolean;
  /** The target scene's settings are in the editor. */
  loaded: boolean;
  /**
   * Whether the target scene stores settings of its own (false: the editor
   * shows the defaults). Undefined until the first load answers.
   */
  sceneHasSettings: boolean | undefined;
  /** Before a render: flush a pending write, or write now if the scene disagrees. */
  flushBeforeStart(): void;
  /** "Use settings": restore a history entry into the editor and store it on the scene. */
  restoreFromHistory(entry: RenderResult): void;
  /** Whether the entry's settings differ from the editor (enables the action). */
  differsFromEditor(entry: RenderResult): boolean;
  /**
   * The rows of a backend as the target scene holds them (its stored block,
   * or the C++ defaults), for a backend switch in the editor.
   */
  backendPropsFor(backend: RenderBackendId): PropDef[];
}

/** What this window last knew a scene to hold. */
interface KnownSceneValues {
  sceneId: number;
  exists: boolean;
  values: RenderSettingsValues;
  defaults: RenderSettingsValues;
}

export function useSceneSettingsSync(args: UseSceneSettingsSyncArgs): SceneSettingsSync {
  const { client, settings, targetSceneId, umbreonAvailable } = args;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const clientRef = useRef(client);
  clientRef.current = client;

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(targetSceneId === null);
  const [sceneHasSettings, setSceneHasSettings] = useState<boolean | undefined>(undefined);
  const knownRef = useRef<KnownSceneValues | null>(null);

  /** The editor state as the scene would store it. */
  const editorValues = useCallback((): RenderSettingsValues => {
    const s = settingsRef.current;
    return valuesFromSnapshot(s.getSnapshot("store"), { backendExplicit: s.backendExplicit });
  }, []);

  const writeNow = useCallback((sceneId: number, values: RenderSettingsValues) => {
    clientRef.current.writeSceneRenderSettings(sceneId, values);
    // Optimistic: the scene's own change event confirms it shortly. The
    // stored map is the scene's full set with the written keys on top.
    const known = knownRef.current;
    const base = known && known.sceneId === sceneId ? known : null;
    knownRef.current = {
      sceneId,
      exists: true,
      values: { ...(base?.values ?? {}), ...values },
      defaults: base?.defaults ?? {},
    };
    setSceneHasSettings(true);
  }, []);

  // The sceneId is an argument (captured at schedule time); the values are
  // read when the call fires, so a burst of edits writes its final state.
  const scheduleWrite = useDebouncedCallback(
    (sceneId: number) => writeNow(sceneId, editorValues()),
    PERSIST_DEBOUNCE_MS,
  );

  // --- user edits -> debounced write ---
  const targetRef = useRef(targetSceneId);
  targetRef.current = targetSceneId;
  const { userEditSeq } = settings;
  useEffect(() => {
    if (userEditSeq === 0) return;
    const sceneId = targetRef.current;
    if (sceneId === null) return;
    scheduleWrite(sceneId);
  }, [userEditSeq, scheduleWrite]);

  // --- target scene -> load ---
  const guard = useStaleGuard();
  useEffect(() => {
    // A write still pending belongs to the previous scene: deliver it there
    // before the editor is replaced with the new scene's settings.
    scheduleWrite.flush();
    if (targetSceneId === null) {
      knownRef.current = null;
      setSceneHasSettings(undefined);
      setLoaded(true);
      return;
    }
    const token = guard.next();
    setLoaded(false);
    setLoading(true);
    void clientRef.current
      .getSceneRenderSettings(targetSceneId)
      .then((reply) => {
        if (!guard.isCurrent(token)) return;
        if (reply.ok) {
          knownRef.current = {
            sceneId: targetSceneId,
            exists: reply.exists,
            values: reply.values,
            defaults: reply.defaults,
          };
          setSceneHasSettings(reply.exists);
          // A scene without settings of its own shows a fresh object's values.
          settingsRef.current.loadFromScene(
            snapshotFromRenderSettings(reply.values, { defaults: reply.defaults, umbreonAvailable }),
          );
        } else {
          // Leave the editor as it is; a render still works with what it shows.
          console.warn("scene render settings unavailable:", reply.error);
          knownRef.current = null;
          setSceneHasSettings(undefined);
        }
      })
      .finally(() => {
        if (!guard.isCurrent(token)) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => {
      guard.invalidate();
    };
  }, [targetSceneId, umbreonAvailable, guard, scheduleWrite]);

  // --- scene changed (any writer) -> reload unless it is our own state ---
  const push = client.state.sceneSettings;
  useEffect(() => {
    if (!push || push.sceneId !== targetRef.current) return;
    knownRef.current = {
      sceneId: push.sceneId,
      exists: push.exists,
      values: push.values,
      defaults: push.defaults,
    };
    setSceneHasSettings(push.exists);
    // Our next write supersedes whatever the scene holds now.
    if (scheduleWrite.pending()) return;
    const mine = editorValues();
    if (sameRenderValues(push.values, mine, Object.keys(mine))) return;
    settingsRef.current.loadFromScene(
      snapshotFromRenderSettings(push.values, { defaults: push.defaults, umbreonAvailable }),
    );
  }, [push, umbreonAvailable, scheduleWrite, editorValues]);

  const flushBeforeStart = useCallback(() => {
    if (scheduleWrite.pending()) {
      scheduleWrite.flush();
      return;
    }
    const sceneId = targetRef.current;
    if (sceneId === null) return;
    const mine = editorValues();
    const known = knownRef.current;
    // Equal to what the scene holds (or, for a scene without settings, to the
    // fresh defaults it would start from): nothing to store.
    if (known && known.sceneId === sceneId && sameRenderValues(known.values, mine, Object.keys(mine))) {
      return;
    }
    writeNow(sceneId, mine);
  }, [scheduleWrite, editorValues, writeNow]);

  const backendPropsFor = useCallback((backend: RenderBackendId): PropDef[] => {
    const known = knownRef.current;
    if (!known || known.sceneId !== targetRef.current) return placeholderProps(backendSpecs(backend));
    return backendPropsFromValues(known.values, known.defaults, backend);
  }, []);

  const restoreFromHistory = useCallback(
    (entry: RenderResult) => {
      // One write, from the entry itself: `restore` bumps no edit counter,
      // and the editor state has not committed yet when this runs.
      scheduleWrite.cancel();
      settingsRef.current.restore(entry.settingsSnapshot);
      const sceneId = targetRef.current;
      if (sceneId !== null) writeNow(sceneId, valuesFromSnapshot(entry.settingsSnapshot));
    },
    [scheduleWrite, writeNow],
  );

  const differsFromEditor = useCallback(
    (entry: RenderResult): boolean => {
      const theirs = valuesFromSnapshot(entry.settingsSnapshot);
      const mine = editorValues();
      const keys = Array.from(new Set([...Object.keys(theirs), ...Object.keys(mine)]));
      return !sameRenderValues(theirs, mine, keys);
    },
    [editorValues],
  );

  // A window close must not lose a pending write. React runs no unmount
  // cleanup on page unload, and the debounce hook cancels its own pending
  // call on unmount, so the flush hangs off beforeunload.
  useEffect(() => {
    const onUnload = (): void => scheduleWrite.flush();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [scheduleWrite]);

  useHoldReveal(loading);

  return {
    loading,
    loaded,
    sceneHasSettings,
    flushBeforeStart,
    restoreFromHistory,
    differsFromEditor,
    backendPropsFor,
  };
}
