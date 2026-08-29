/**
 * @file state/inspector/InspectorProvider.tsx
 * @description What the property inspector is pointed at, and the property
 * data shown for it.
 *
 * The inspector edits one target at a time: a scene-tree node or the View
 * (through the generic C++ property bridge -- `getGenericProps` /
 * `setGenericProp`), or an animation element (which `AnimElementInspector`
 * fetches and edits on its own). The target is remembered per scene so a
 * content-tab switch brings back what that scene was showing, and dropped
 * when its scene closes.
 *
 * Split into two contexts:
 *   - useInspector()        the target and its property data; re-renders the
 *                           panel and the shell's pane visibility
 *   - useInspectorActions() identity-stable for the provider's lifetime; the
 *                           scene tree, the animation strip and the commands
 *                           open / close / write through it without
 *                           re-rendering when the target changes
 *
 * The open flag is the persisted layout flag (state/layout): there is one
 * source for it, and it survives a restart.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { GenericPropEntry, PropTargetType, PropWriteOpts } from '../../worker/server/services/genericProps.service'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useCueMolEventListener } from '../../hooks/cuemol/useCueMolEventListener'
import { useLatestRef } from '../../hooks/react/useLatestRef'
import { SEM_OBJECT, SEM_RENDERER, SEM_SCENE, SEM_VIEW, SEM_PROPCHG } from '../../event'
import { EVENT_BURST_DEBOUNCE_MS } from '../../utils/timing'
import { useActiveScene } from '../workspace'
import { useLayout, useLayoutDispatch } from '../layout'

// --- Types ---

/**
 * Identity of whatever is currently shown in the inspector.
 *
 * - `node` -- a scene-tree node or the View, edited through the generic
 *   C++ property bridge.
 * - `animElement` -- an animation element selected in the AnimationPanel;
 *   keyed by stable `uid` and edited by `AnimElementInspector` itself.
 */
export type InspectorTarget =
  | { kind: 'node'; sceneId: number; nodeId: number; nodeType: PropTargetType }
  | { kind: 'animElement'; sceneId: number; uid: number }

/** A property-bridge target (a scene-tree node or the View). */
export type NodeTarget = Extract<InspectorTarget, { kind: 'node' }>

/** One generic property write. */
export interface PropWrite {
  key: string
  valueType: string
  value: string | number | boolean
}

export interface InspectorState {
  /** Persisted open flag; the pane is shown only while a target exists too. */
  open: boolean
  target: InspectorTarget | null
  /** Header badge: Scene / Object / Renderer / ... / Animation. */
  category: string
  /** Header name and type label for the current target. */
  header: { name: string; type: string }
  /** Flat property entries for a node target (empty for anim elements). */
  entries: GenericPropEntry[]
  /** True while the entries are being (re)fetched. */
  loading: boolean
}

export interface InspectorActions {
  /** Point the inspector at a resolved scene-tree node (or the View) and open it. */
  showNode: (target: NodeTarget) => void
  /** Open the active scene's View (View menu > View property...). */
  showView: (viewId: number) => void
  /** Open the scene node itself (Scene > Properties...); its node id is its uid. */
  showScene: (sceneId: number) => void
  /** Open an animation element selected in the AnimationPanel. */
  showAnimElement: (sceneId: number, uid: number) => void
  /**
   * Drop an animElement target for one scene (deselect / element gone).
   * Scene-scoped and kind-guarded, so a stale clear never drops a node target.
   */
  clearAnimElement: (sceneId: number) => void
  /** AnimElementInspector reports the header it fetched. */
  setAnimHeader: (name: string, type: string) => void
  /** Close the panel, forget the target and the per-scene memory. */
  close: () => void
  /** Set the open flag alone (a snap-collapse of the pane); the target is kept. */
  setOpen: (open: boolean) => void
  /** Write one property (live-apply; `opts` carries realtime-drag info). */
  setProp: (key: string, valueType: string, value: string | number | boolean, opts?: PropWriteOpts) => Promise<void>
  /** Restore one property to its C++ default. */
  resetProp: (key: string) => Promise<void>
  /** Write several properties in one undo step. No-op when empty. */
  setMany: (writes: PropWrite[]) => Promise<void>
  /** Restore several properties in one undo step. No-op when empty. */
  resetMany: (keys: string[]) => Promise<void>
}

/** Header category label for each scene-tree node type. */
const NODE_CATEGORY_LABELS: Record<string, string> = {
  scene: 'Scene',
  object: 'Object',
  renderer: 'Renderer',
  rendGroup: 'Renderer group',
  view: 'View',
}

/**
 * Source-type mask for the property-change subscription of a scene-graph
 * target (a scene / object / renderer row).
 */
const PROPCHG_SRC_MASK = SEM_OBJECT | SEM_RENDERER | SEM_SCENE

/**
 * The View is not a scene-graph node: its changes arrive as SEM_VIEW
 * events (`View::fireViewEvent`), scoped -- like the others -- by the
 * scene uid it belongs to (`ev.setSource(m_nSceneID)`). Only the settled
 * category is taken: a trackpad pan fires `viewPropChgDragging` per frame
 * and ends with a `viewPropChanged`, so listening to the settled one alone
 * still lands on the final value without refetching mid-gesture.
 */
const VIEW_PROPCHG_CATEGORY = 'viewPropChanged'

const EMPTY_HEADER = { name: '', type: '' }

const StateContext = createContext<InspectorState | null>(null)
const ActionsContext = createContext<InspectorActions | null>(null)

export function useInspector(): InspectorState {
  const v = useContext(StateContext)
  if (!v) throw new Error('useInspector must be used inside InspectorProvider')
  return v
}

export function useInspectorActions(): InspectorActions {
  const v = useContext(ActionsContext)
  if (!v) throw new Error('useInspectorActions must be used inside InspectorProvider')
  return v
}

export function InspectorProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { cm } = useCueMol()
  const { activeSceneId } = useActiveScene()
  const { inspectorOpen: open } = useLayout()
  const { setInspectorOpen: setOpen } = useLayoutDispatch()

  const [target, setTarget] = useState<InspectorTarget | null>(null)
  const [entries, setEntries] = useState<GenericPropEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [nodeHeader, setNodeHeader] = useState(EMPTY_HEADER)
  // The anim element's header comes from AnimElementInspector's own fetch:
  // a tab-switch restore rewrites the target without going through the
  // AnimationPanel, so the inspector's fetch is the one source for it.
  const [animHeader, setAnimHeader] = useState<{ name: string; type: string } | null>(null)

  // Latest target in a ref so the writers and the event handler stay
  // identity-stable.
  const targetRef = useLatestRef(target)
  const activeSceneIdRef = useLatestRef(activeSceneId)

  // Per-scene memory of the last inspected target. Switching content tabs
  // (= scenes) restores that scene's target so the inspector never stays
  // pointed at a now-hidden scene's node.
  const targetsBySceneRef = useRef<Map<number, InspectorTarget>>(new Map())
  // Active scene id already handled by the tab-switch effect below.
  const appliedSceneIdRef = useRef<number | undefined>(undefined)

  /** Set the target, remember it for its scene, and open the panel. */
  const applyTarget = useCallback(
    (t: InspectorTarget) => {
      targetsBySceneRef.current.set(t.sceneId, t)
      setTarget(t)
      setOpen(true)
    },
    [setOpen],
  )

  /** Fetch the generic property list for the current target. */
  const fetchProps = useCallback(async () => {
    const t = targetRef.current
    // Anim elements are not property-bridge nodes; AnimElementInspector
    // self-fetches. Blank the generic state for them.
    if (!cm || !t || t.kind === 'animElement') {
      setEntries([])
      setNodeHeader(EMPTY_HEADER)
      return
    }
    setLoading(true)
    try {
      const res = await cm.invokeService('getGenericProps', {
        sceneId: t.sceneId,
        nodeId: t.nodeId,
        nodeType: t.nodeType,
      })
      // Ignore a response that arrived after the target changed.
      if (targetRef.current !== t) return
      if (res?.ok) {
        setEntries(res.entries)
        setNodeHeader({ name: res.displayName, type: res.typeLabel })
      } else {
        setEntries([])
        setNodeHeader(EMPTY_HEADER)
      }
    } catch (err) {
      console.warn('getGenericProps failed:', err)
      setEntries([])
    } finally {
      if (targetRef.current === t) setLoading(false)
    }
  }, [cm, targetRef])

  // Refetch whenever the target changes.
  useEffect(() => {
    void fetchProps()
  }, [target, fetchProps])

  // Tab switch = active scene change. Restore that scene's remembered target,
  // or clear when the active scene goes away (all molview tabs closed) so the
  // inspector never keeps editing a closed scene.
  useEffect(() => {
    if (activeSceneId === appliedSceneIdRef.current) return
    appliedSceneIdRef.current = activeSceneId
    setTarget(
      activeSceneId === undefined
        ? null
        : (targetsBySceneRef.current.get(activeSceneId) ?? null),
    )
  }, [activeSceneId])

  // Live sync: refetch on external property changes (undo/redo, script- and
  // mouse-driven mutations of the inspected target). Only node targets sync
  // via SEM_PROPCHG; anim targets own their SEM_ANIM subscription.
  const isViewTarget = target?.kind === 'node' && target.nodeType === 'view'
  useCueMolEventListener({
    cm,
    enabled: open && target?.kind === 'node',
    category: isViewTarget ? VIEW_PROPCHG_CATEGORY : '',
    srcMask: isViewTarget ? SEM_VIEW : PROPCHG_SRC_MASK,
    evtMask: SEM_PROPCHG,
    scopeId: target?.sceneId ?? -1,
    handler: () => {
      void fetchProps()
    },
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  })

  /** Run one property-bridge write against the current node target. */
  const writeNode = useCallback(
    async (
      label: string,
      run: (t: NodeTarget) => Promise<{ ok: boolean; entries?: GenericPropEntry[] } | undefined>,
      refresh: boolean,
    ) => {
      const t = targetRef.current
      if (!cm || !t || t.kind !== 'node') return
      try {
        const res = await run(t)
        if (targetRef.current === t && res?.ok && refresh && res.entries) setEntries(res.entries)
      } catch (err) {
        console.warn(`${label} failed:`, err)
      }
    },
    [cm, targetRef],
  )

  const actions = useMemo<InspectorActions>(
    () => ({
      showNode: (t) => applyTarget(t),
      showView: (viewId) => {
        const sid = activeSceneIdRef.current
        if (sid === undefined) return
        applyTarget({ kind: 'node', sceneId: sid, nodeId: viewId, nodeType: 'view' })
      },
      showScene: (sceneId) =>
        applyTarget({ kind: 'node', sceneId, nodeId: sceneId, nodeType: 'scene' }),
      showAnimElement: (sceneId, uid) => applyTarget({ kind: 'animElement', sceneId, uid }),
      clearAnimElement: (sceneId) => {
        setTarget((t) => (t?.kind === 'animElement' && t.sceneId === sceneId ? null : t))
        const mem = targetsBySceneRef.current.get(sceneId)
        if (mem?.kind === 'animElement') targetsBySceneRef.current.delete(sceneId)
        setAnimHeader(null)
      },
      setAnimHeader: (name, type) => setAnimHeader({ name, type }),
      close: () => {
        setOpen(false)
        setTarget(null)
        setEntries([])
        setNodeHeader(EMPTY_HEADER)
        setAnimHeader(null)
        targetsBySceneRef.current.clear()
      },
      setOpen,
      setProp: (key, valueType, value, opts) =>
        writeNode(
          'setGenericProp (set)',
          (t) =>
            cm!.invokeService('setGenericProp', {
              sceneId: t.sceneId,
              nodeId: t.nodeId,
              nodeType: t.nodeType,
              propName: key,
              op: 'set',
              valueType,
              value,
              mode: opts?.mode,
              originalValue: opts?.originalValue,
              originalWasDefault: opts?.originalWasDefault,
              cascadeGroupVisibility: opts?.cascadeGroupVisibility,
            }),
          // A preview / abort write returns no entries (the field drives itself
          // from its local draft during a drag, and an abort's refresh arrives
          // through the PROPCHG listener); only refresh on a real commit.
          opts?.mode === undefined || opts?.mode === 'commit',
        ),
      resetProp: (key) =>
        writeNode(
          'setGenericProp (reset)',
          (t) =>
            cm!.invokeService('setGenericProp', {
              sceneId: t.sceneId,
              nodeId: t.nodeId,
              nodeType: t.nodeType,
              propName: key,
              op: 'reset',
              valueType: '',
            }),
          true,
        ),
      setMany: async (writes) => {
        if (writes.length === 0) return
        await writeNode(
          'setGenericProps',
          (t) =>
            cm!.invokeService('setGenericProps', {
              sceneId: t.sceneId,
              nodeId: t.nodeId,
              nodeType: t.nodeType,
              writes: writes.map((w) => ({
                propName: w.key,
                op: 'set' as const,
                valueType: w.valueType,
                value: w.value,
              })),
            }),
          true,
        )
      },
      resetMany: async (keys) => {
        if (keys.length === 0) return
        await writeNode(
          'resetGenericProps',
          (t) =>
            cm!.invokeService('resetGenericProps', {
              sceneId: t.sceneId,
              nodeId: t.nodeId,
              nodeType: t.nodeType,
              propNames: keys,
            }),
          true,
        )
      },
    }),
    [applyTarget, activeSceneIdRef, setOpen, writeNode, cm],
  )

  const state = useMemo<InspectorState>(() => {
    const isAnim = target?.kind === 'animElement'
    return {
      open,
      target,
      category: !target ? '' : isAnim ? 'Animation' : (NODE_CATEGORY_LABELS[target.nodeType] ?? 'Node'),
      header: isAnim ? (animHeader ?? EMPTY_HEADER) : nodeHeader,
      entries,
      loading,
    }
  }, [open, target, animHeader, nodeHeader, entries, loading])

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  )
}
