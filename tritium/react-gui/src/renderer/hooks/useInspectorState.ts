/**
 * @file hooks/useInspectorState.ts
 * @description Manages the inspector panel lifecycle: open/close state, the
 * scene-tree node being inspected, and the property data shown inside.
 *
 * The "Generic" tab is backed by the real C++ property bridge: selecting a
 * node in the scene tree fetches its full property list via the
 * `getGenericProps` worker service, and edits are written back live through
 * `setGenericProp`. The structured "Properties" tab still uses static
 * sample data pending its own migration.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { LayoutState } from "./useLayoutPersistence";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { SceneTreeNode } from "../worker/shared/sceneTreeTypes";
import type {
  GenericPropEntry,
  PropTargetType,
  PropWriteOpts,
} from "../worker/server/services/genericProps.service";
import { findTypedNode } from "./sceneTree/sceneTreeNodeUtils";
import { useCueMolEventListener } from "./useCueMolEventListener";
import { SEM_OBJECT, SEM_RENDERER, SEM_SCENE, SEM_PROPCHG } from "../event";

// --- Types ---

/** Display information shown in the inspector header. */
export interface InspectorInfo {
  name: string;
  type: string;
}

/**
 * Identity of whatever is currently shown in the inspector.
 *
 * - `node` -- a scene-tree node or the View, edited through the generic
 *   C++ property bridge (`getGenericProps` / `setGenericProp`).
 * - `renderSettings` -- the scene's render output settings; not a scene-tree
 *   node and not backed by the property bridge (see `RenderSettingsEditor`).
 * - `animElement` -- an animation element selected in the AnimationPanel; keyed
 *   by stable `uid` and edited by `AnimElementInspector` via its own services
 *   (not the property bridge), the same bespoke-branch pattern as renderSettings.
 */
export type InspectorTarget =
  | { kind: "node"; sceneId: number; nodeId: number; nodeType: PropTargetType }
  | { kind: "renderSettings"; sceneId: number }
  | { kind: "animElement"; sceneId: number; uid: number };

/** Header category label for each scene-tree node type. */
const NODE_CATEGORY_LABELS: Record<string, string> = {
  scene: "Scene",
  object: "Object",
  renderer: "Renderer",
  rendGroup: "Renderer group",
  view: "View",
};

export interface UseInspectorStateOptions {
  /** Persisted layout (used to restore open state on first load). */
  layout: LayoutState;
  /** Whether the persisted layout has finished loading. */
  loaded: boolean;
  /** Persist the inspector open/close flag to disk. */
  persistInspectorOpen: (open: boolean) => void;
  /** Worker bridge (null until CueMol is ready). */
  cm: AsyncCueMol | null;
  /** Live scene tree; its root id is the active scene uid. */
  sceneTree: SceneTreeNode | null;
  /**
   * The active scene uid (from the active molview tab), or undefined when no
   * molview tab is open. This is the authoritative active-scene signal: unlike
   * `sceneTree?.id` it never goes transiently null during a tree refetch, so it
   * is the safe trigger for clearing the inspector when its scene closes.
   */
  activeSceneId: number | undefined;
}

/** Source-type mask for the property-change event subscription. */
const PROPCHG_SRC_MASK = SEM_OBJECT | SEM_RENDERER | SEM_SCENE;
/** Coalesce event bursts (one high-level op fires many PROPCHG events). */
const REFETCH_DEBOUNCE_MS = 30;

// --- Hook ---

export function useInspectorState({
  layout,
  loaded,
  persistInspectorOpen,
  cm,
  sceneTree,
  activeSceneId,
}: UseInspectorStateOptions) {
  // --- Local state ---

  const [inspectorOpen, setInspectorOpenLocal] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [genericEntries, setGenericEntries] = useState<GenericPropEntry[]>([]);
  const [genericLoading, setGenericLoading] = useState(false);
  const [inspectorInfo, setInspectorInfo] = useState<InspectorInfo>({ name: "", type: "" });

  // Latest target in a ref so the event handler stays identity-stable.
  const targetRef = useRef<InspectorTarget | null>(null);
  targetRef.current = inspectorTarget;

  // Per-scene memory of the last inspected target. Switching content tabs
  // (= scenes) restores that scene's target so the inspector never stays
  // pointed at a now-hidden scene's node.
  const targetsBySceneRef = useRef<Map<number, InspectorTarget>>(new Map());
  // Active scene id already handled by the tab-switch effect below.
  const appliedSceneIdRef = useRef<number | undefined>(undefined);

  // Restore open state from persisted layout on first load.
  useEffect(() => {
    if (loaded && layout.inspectorOpen) {
      setInspectorOpenLocal(true);
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Helpers ---

  /** Update both the local state and the persisted flag. */
  const setInspectorOpen = useCallback(
    (open: boolean) => {
      setInspectorOpenLocal(open);
      persistInspectorOpen(open);
    },
    [persistInspectorOpen],
  );

  /** Set the inspector target, remember it for its scene, and open the panel. */
  const applyTarget = useCallback(
    (target: InspectorTarget) => {
      targetsBySceneRef.current.set(target.sceneId, target);
      setInspectorTarget(target);
      setInspectorOpen(true);
    },
    [setInspectorOpen],
  );

  /** Fetch the generic property list for the current target. */
  const fetchGenericProps = useCallback(async () => {
    const target = targetRef.current;
    if (!cm || !target) {
      setGenericEntries([]);
      setInspectorInfo({ name: "", type: "" });
      return;
    }
    // Render Settings / anim element are not property-bridge nodes -- each has
    // its own editor that self-fetches. Blank the generic state here (the anim
    // header name/type is supplied separately by AnimElementInspector).
    if (target.kind === "renderSettings" || target.kind === "animElement") {
      setGenericEntries([]);
      setInspectorInfo({ name: "", type: "" });
      return;
    }
    setGenericLoading(true);
    try {
      const res = await cm.invokeService("getGenericProps", {
        sceneId: target.sceneId,
        nodeId: target.nodeId,
        nodeType: target.nodeType,
      });
      // Ignore a response that arrived after the target changed.
      if (targetRef.current !== target) return;
      if (res?.ok) {
        setGenericEntries(res.entries);
        setInspectorInfo({ name: res.displayName, type: res.typeLabel });
      } else {
        setGenericEntries([]);
        setInspectorInfo({ name: "", type: "" });
      }
    } catch (err) {
      console.warn("getGenericProps failed:", err);
      setGenericEntries([]);
    } finally {
      if (targetRef.current === target) setGenericLoading(false);
    }
  }, [cm]);

  // --- Public handlers ---

  /**
   * Open the inspector for the given scene-tree node id. Unsupported node
   * types (camera / style) resolve to an empty property list rather than
   * an error - the panel shows "No properties available".
   */
  const handleShowGeneric = useCallback(
    (id: string) => {
      const sid = sceneTree ? Number(sceneTree.id) : undefined;
      const found = findTypedNode(sceneTree, id);
      if (sid === undefined || !found) return;
      applyTarget({
        kind: "node",
        sceneId: sid,
        nodeId: found.numId,
        nodeType: found.node.type,
      });
    },
    [sceneTree, applyTarget],
  );

  /**
   * Open the inspector for the active View (View menu > View property...).
   * The View has no scene-tree node; it is keyed by view id under the
   * active scene.
   */
  const handleShowViewProps = useCallback(
    (viewId: number) => {
      const sid = sceneTree ? Number(sceneTree.id) : undefined;
      if (sid === undefined) return;
      applyTarget({ kind: "node", sceneId: sid, nodeId: viewId, nodeType: "view" });
    },
    [sceneTree, applyTarget],
  );

  /**
   * Open the inspector on a scene's Render Settings (Toolbar Render button /
   * F12, or the Render panel / Render Result gear). Render Settings belongs to
   * the scene as a whole and has no scene-tree node.
   *
   * @param sceneId - Explicit scene to target. Required on a render-result tab,
   *   where no molview is active so `sceneTree` is null: the caller passes the
   *   result's source scene id. Falls back to the active scene tree's id when
   *   omitted (Toolbar / F12 on a molview tab).
   */
  const handleShowRenderSettings = useCallback(
    (sceneId?: number) => {
      const sid =
        typeof sceneId === "number"
          ? sceneId
          : sceneTree
            ? Number(sceneTree.id)
            : undefined;
      if (sid === undefined) return;
      applyTarget({ kind: "renderSettings", sceneId: sid });
    },
    [sceneTree, applyTarget],
  );

  /**
   * Open the inspector for an animation element selected in the AnimationPanel.
   * Keyed by stable `uid`; the AnimElementInspector self-fetches its data.
   */
  const handleShowAnimElement = useCallback(
    (sceneId: number, uid: number) => {
      applyTarget({ kind: "animElement", sceneId, uid });
    },
    [applyTarget],
  );

  /**
   * Clear an animElement target for a specific scene (deselect / element gone).
   * Scene-scoped + kind-guarded so a stale anim clear never drops a coexisting
   * node / renderSettings target (or another scene's target).
   */
  const handleClearAnimElement = useCallback((sceneId: number) => {
    setInspectorTarget((t) =>
      t?.kind === "animElement" && t.sceneId === sceneId ? null : t,
    );
    const mem = targetsBySceneRef.current.get(sceneId);
    if (mem?.kind === "animElement") targetsBySceneRef.current.delete(sceneId);
  }, []);

  // Refetch whenever the target changes.
  useEffect(() => {
    void fetchGenericProps();
  }, [inspectorTarget, fetchGenericProps]);

  // Tab switch = active scene change. Restore that scene's remembered target,
  // or clear when the active scene goes away (all molview tabs closed) so the
  // inspector never keeps editing a closed scene. Driven by the authoritative
  // `activeSceneId` (not `sceneTree?.id`, which goes transiently null during a
  // refetch and would wrongly drop the target).
  useEffect(() => {
    if (activeSceneId === appliedSceneIdRef.current) return;
    appliedSceneIdRef.current = activeSceneId;
    setInspectorTarget(
      activeSceneId === undefined
        ? null
        : (targetsBySceneRef.current.get(activeSceneId) ?? null),
    );
  }, [activeSceneId]);

  /** Close the inspector, clear the target, and forget per-scene memory. */
  const handleCloseInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorTarget(null);
    setGenericEntries([]);
    setInspectorInfo({ name: "", type: "" });
    targetsBySceneRef.current.clear();
  }, [setInspectorOpen]);

  /** Write a single generic property value (live-apply). */
  const handleGenericSet = useCallback(
    async (
      key: string,
      valueType: string,
      value: string | number | boolean,
      opts?: PropWriteOpts,
    ) => {
      const target = targetRef.current;
      if (!cm || !target || target.kind !== "node") return;
      try {
        const res = await cm.invokeService("setGenericProp", {
          sceneId: target.sceneId,
          nodeId: target.nodeId,
          nodeType: target.nodeType,
          propName: key,
          op: "set",
          valueType,
          value,
          mode: opts?.mode,
          originalValue: opts?.originalValue,
          originalWasDefault: opts?.originalWasDefault,
        });
        // A preview / abort write returns no entries (the field drives itself
        // from its local draft during a drag, and an abort's flag/value refresh
        // is delivered via the PROPCHG listener); only refresh on a real commit.
        const isCommit = opts?.mode === undefined || opts?.mode === "commit";
        if (targetRef.current === target && res?.ok && isCommit) {
          setGenericEntries(res.entries);
        }
      } catch (err) {
        console.warn("setGenericProp (set) failed:", err);
      }
    },
    [cm],
  );

  /** Restore a generic property to its C++ default. */
  const handleGenericReset = useCallback(
    async (key: string) => {
      const target = targetRef.current;
      if (!cm || !target || target.kind !== "node") return;
      try {
        const res = await cm.invokeService("setGenericProp", {
          sceneId: target.sceneId,
          nodeId: target.nodeId,
          nodeType: target.nodeType,
          propName: key,
          op: "reset",
          valueType: "",
        });
        if (targetRef.current === target && res?.ok) {
          setGenericEntries(res.entries);
        }
      } catch (err) {
        console.warn("setGenericProp (reset) failed:", err);
      }
    },
    [cm],
  );

  /**
   * Write several generic property values in one undo step. Used when a single
   * UI action changes several properties together yet must collapse to one undo
   * step (e.g. the atomintr "Dashed" toggle rewriting all six stipple values).
   * No-op when `writes` is empty.
   */
  const handleSetMany = useCallback(
    async (
      writes: { key: string; valueType: string; value: string | number | boolean }[],
    ) => {
      const target = targetRef.current;
      if (!cm || !target || target.kind !== "node" || writes.length === 0) return;
      try {
        const res = await cm.invokeService("setGenericProps", {
          sceneId: target.sceneId,
          nodeId: target.nodeId,
          nodeType: target.nodeType,
          writes: writes.map((w) => ({
            propName: w.key,
            op: "set" as const,
            valueType: w.valueType,
            value: w.value,
          })),
        });
        if (targetRef.current === target && res?.ok) {
          setGenericEntries(res.entries);
        }
      } catch (err) {
        console.warn("setGenericProps failed:", err);
      }
    },
    [cm],
  );

  /**
   * Restore several generic properties to their C++ defaults in one undo step
   * (used by "Reset all to default"). No-op when `keys` is empty.
   */
  const handleResetMany = useCallback(
    async (keys: string[]) => {
      const target = targetRef.current;
      if (!cm || !target || target.kind !== "node" || keys.length === 0) return;
      try {
        const res = await cm.invokeService("resetGenericProps", {
          sceneId: target.sceneId,
          nodeId: target.nodeId,
          nodeType: target.nodeType,
          propNames: keys,
        });
        if (targetRef.current === target && res?.ok) {
          setGenericEntries(res.entries);
        }
      } catch (err) {
        console.warn("resetGenericProps failed:", err);
      }
    },
    [cm],
  );

  // --- Live sync: refetch on external property changes ---
  // Catches undo/redo and script-driven mutations of the inspected node.
  useCueMolEventListener({
    cm,
    // Only node targets sync via SEM_PROPCHG; anim targets own their SEM_ANIM
    // subscription (in AnimElementInspector), and renderSettings has no bridge.
    enabled: inspectorOpen && inspectorTarget?.kind === "node",
    category: "",
    srcMask: PROPCHG_SRC_MASK,
    evtMask: SEM_PROPCHG,
    scopeId: inspectorTarget?.sceneId ?? -1,
    handler: () => {
      void fetchGenericProps();
    },
    debounceMs: REFETCH_DEBOUNCE_MS,
  });

  // Conceptual category of the current target, shown as a header badge.
  const inspectorCategory = useMemo(() => {
    if (!inspectorTarget) return "";
    if (inspectorTarget.kind === "renderSettings") return "Render Settings";
    if (inspectorTarget.kind === "animElement") return "Animation";
    return NODE_CATEGORY_LABELS[inspectorTarget.nodeType] ?? "Node";
  }, [inspectorTarget]);

  return {
    inspectorOpen,
    inspectorTarget,
    inspectorCategory,
    genericEntries,
    genericLoading,
    inspectorInfo,
    handleShowGeneric,
    handleShowViewProps,
    handleShowRenderSettings,
    handleShowAnimElement,
    handleClearAnimElement,
    handleCloseInspector,
    handleGenericSet,
    handleGenericReset,
    handleSetMany,
    handleResetMany,
  } as const;
}
