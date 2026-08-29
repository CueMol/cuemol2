/**
 * @file state/layout/LayoutProvider.tsx
 * @description Persistent layout state: splitter sizes and panel open /
 * collapse flags.
 *
 * Loaded from the main process on mount, written back debounced. What made
 * this a provider rather than App-local state is the drag storm: every
 * splitter move used to `setState` the sizes, re-rendering App and every
 * pane under it per pointer event, while the only reader of a size is
 * Allotment's `defaultSizes` -- read once at mount and never again. Sizes
 * therefore live in a ref: a drag writes the ref and schedules the save,
 * and nothing re-renders. What the UI does show -- which panes are
 * collapsed, whether the inspector is open -- stays in state.
 *
 * Two contexts: `useLayout()` for the reactive flags, `useLayoutDispatch()`
 * for the stable setters (never re-renders its subscribers).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PaneCollapseState, LayoutState } from '@shared/types/layout'
import { IPC } from '@shared/ipcChannels'
import { PERSIST_DEBOUNCE_MS } from '@renderer/utils/timing'

/** Default layout values used on first run (no saved state). */
const LAYOUT_DEFAULTS: LayoutState = {
  mainSizes: [],
  rightPanelSizes: [],
  centerSizes: [],
  sidebarOpen: true,
  inspectorOpen: false,
  viewSizes: {
    explorer: [220, 240],
    selection: [260, 180],
  },
  viewCollapsed: {
    explorer: { scene: false, color: false },
    selection: { mol: false, selection: false },
  },
}

/** Splitter sizes as they were LOADED; a drag does not update these. */
export interface SavedSizes {
  mainSizes: number[]
  rightPanelSizes: number[]
  centerSizes: number[]
  viewSizes: Record<string, number[]>
}

export interface LayoutValues {
  /** True once the store has answered (or the app runs without Electron). */
  loaded: boolean
  sidebarOpen: boolean
  inspectorOpen: boolean
  /** Per-view pane collapse state (what is shown), keyed by activity view. */
  viewCollapsed: Record<string, PaneCollapseState>
  /**
   * Sizes to hand Allotment as `defaultSizes`. Fixed at load time on
   * purpose: the splitters are uncontrolled, so re-rendering them with live
   * sizes would only cost renders.
   */
  savedSizes: SavedSizes
}

export interface LayoutDispatch {
  setMainSizes: (sizes: number[]) => void
  setRightPanelSizes: (sizes: number[]) => void
  setCenterSizes: (sizes: number[]) => void
  setSidebarOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  /** Splitter sizes of one activity view (ref write + save; no re-render). */
  setViewSizes: (view: string, sizes: number[]) => void
  /** Collapse state of one activity view's panes. */
  setViewCollapsed: (view: string, collapsed: PaneCollapseState) => void
  /** The live layout, sizes included, for code that needs it now. */
  getLayoutSnapshot: () => LayoutState
  /**
   * Write any debounced layout state immediately. The window-close
   * chain calls this: closing does not unmount the renderer, so the debounce
   * would otherwise be the last word.
   */
  flushPendingSaves: () => Promise<void>
}

const ValuesContext = createContext<LayoutValues | null>(null)
const DispatchContext = createContext<LayoutDispatch | null>(null)

export function useLayout(): LayoutValues {
  const v = useContext(ValuesContext)
  if (v === null) throw new Error('useLayout must be used inside LayoutProvider')
  return v
}
export function useLayoutDispatch(): LayoutDispatch {
  const v = useContext(DispatchContext)
  if (v === null) throw new Error('useLayoutDispatch must be used inside LayoutProvider')
  return v
}

interface Flags {
  loaded: boolean
  sidebarOpen: boolean
  inspectorOpen: boolean
  viewCollapsed: Record<string, PaneCollapseState>
  savedSizes: SavedSizes
}

function sizesOf(layout: LayoutState): SavedSizes {
  return {
    mainSizes: layout.mainSizes ?? [],
    rightPanelSizes: layout.rightPanelSizes ?? [],
    centerSizes: layout.centerSizes ?? [],
    viewSizes: layout.viewSizes ?? {},
  }
}

export function LayoutProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // The full persisted record lives here; the flags below are the part the
  // UI renders from.
  const layoutRef = useRef<LayoutState>(LAYOUT_DEFAULTS)
  const [flags, setFlags] = useState<Flags>({
    loaded: false,
    sidebarOpen: LAYOUT_DEFAULTS.sidebarOpen ?? true,
    inspectorOpen: LAYOUT_DEFAULTS.inspectorOpen ?? false,
    viewCollapsed: LAYOUT_DEFAULTS.viewCollapsed ?? {},
    savedSizes: sizesOf(LAYOUT_DEFAULTS),
  })

  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Load on mount ---
  useEffect(() => {
    const api = window.electronAPI
    if (!api) {
      setFlags((f) => ({ ...f, loaded: true }))
      return
    }
    api.invoke(IPC.LAYOUT_LOAD)
      .then((savedLayout) => {
        if (savedLayout) layoutRef.current = { ...layoutRef.current, ...savedLayout }
      })
      .catch((err: unknown) => {
        // Fall back to the defaults rather than leaving `loaded` false: App
        // gates the whole main content area on it, so a rejected store read
        // would render a permanently blank window.
        console.warn('layout load failed; using defaults:', err)
      })
      .finally(() => {
        const l = layoutRef.current
        setFlags({
          loaded: true,
          sidebarOpen: l.sidebarOpen ?? true,
          inspectorOpen: l.inspectorOpen ?? false,
          viewCollapsed: l.viewCollapsed ?? {},
          savedSizes: sizesOf(l),
        })
      })
  }, [])

  // --- Debounced writers ---
  const scheduleLayoutSave = useCallback(() => {
    const api = window.electronAPI
    if (!api) return
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
    layoutTimerRef.current = setTimeout(() => {
      layoutTimerRef.current = null
      api.invoke(IPC.LAYOUT_SAVE, layoutRef.current).catch((err: unknown) => {
        console.warn('layout save failed:', err)
      })
    }, PERSIST_DEBOUNCE_MS)
  }, [])

  /** Merge into the persisted record and schedule the write; no re-render. */
  const patchLayout = useCallback(
    (patch: Partial<LayoutState>) => {
      layoutRef.current = { ...layoutRef.current, ...patch }
      scheduleLayoutSave()
    },
    [scheduleLayoutSave],
  )

  const dispatch = useMemo<LayoutDispatch>(
    () => ({
      setMainSizes: (sizes) => patchLayout({ mainSizes: sizes }),
      setRightPanelSizes: (sizes) => patchLayout({ rightPanelSizes: sizes }),
      setCenterSizes: (sizes) => patchLayout({ centerSizes: sizes }),
      setViewSizes: (view, sizes) =>
        patchLayout({ viewSizes: { ...layoutRef.current.viewSizes, [view]: sizes } }),
      setSidebarOpen: (open) => {
        patchLayout({ sidebarOpen: open })
        setFlags((f) => (f.sidebarOpen === open ? f : { ...f, sidebarOpen: open }))
      },
      setInspectorOpen: (open) => {
        patchLayout({ inspectorOpen: open })
        setFlags((f) => (f.inspectorOpen === open ? f : { ...f, inspectorOpen: open }))
      },
      setViewCollapsed: (view, collapsed) => {
        const viewCollapsed = { ...layoutRef.current.viewCollapsed, [view]: collapsed }
        patchLayout({ viewCollapsed })
        setFlags((f) => ({ ...f, viewCollapsed }))
      },
      getLayoutSnapshot: () => layoutRef.current,
      flushPendingSaves: async () => {
        const api = window.electronAPI
        if (!api) return
        const writes: Promise<unknown>[] = []
        if (layoutTimerRef.current) {
          clearTimeout(layoutTimerRef.current)
          layoutTimerRef.current = null
          writes.push(api.invoke(IPC.LAYOUT_SAVE, layoutRef.current))
        }
        await Promise.allSettled(writes)
      },
    }),
    [patchLayout],
  )

  // Flush on unmount (a dev reload); the window-close chain flushes itself.
  useEffect(() => () => { void dispatch.flushPendingSaves() }, [dispatch])

  return (
    <DispatchContext.Provider value={dispatch}>
      <ValuesContext.Provider value={flags}>{children}</ValuesContext.Provider>
    </DispatchContext.Provider>
  )
}
