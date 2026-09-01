/**
 * @file contexts/NewSceneDefaultsContext.tsx
 * @description The scene settings a new scene starts from -- the New Tab
 * dialog's last confirmed values, persisted to electron-store through the
 * shared `UI_LOAD` / `UI_SAVE` channels like `ApbsConfigContext`.
 *
 * Mounted ABOVE `DialogProvider` (see `renderer/index.tsx`): the New Tab
 * dialog reads it, and a dialog cannot consume a context mounted inside the
 * provider that renders it.
 *
 * `getDefaults()` exists alongside the `defaults` state because of the launch
 * path. `useAppInitialization` creates the first scene as soon as the worker
 * is ready, which is not ordered against the `UI_LOAD` round trip, so reading
 * the React state there could hand the factory values to the very scene the
 * preference is meant to shape. `getDefaults()` awaits the load instead, which
 * makes the launch scene deterministic without gating anything on it.
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
import { IPC } from '@shared/ipcChannels'
import {
  FACTORY_NEW_SCENE_DEFAULTS,
  sanitizeNewSceneDefaults,
  type NewSceneDefaults,
} from '@renderer/data/newSceneDefaults'

interface NewSceneDefaultsContextValue {
  /** Current defaults; re-renders consumers when they change. */
  defaults: NewSceneDefaults
  /** The defaults, waiting for the persisted ones to have been read. */
  getDefaults: () => Promise<NewSceneDefaults>
  /** Remember these as the defaults and persist them. */
  setDefaults: (next: NewSceneDefaults) => void
}

/**
 * Usable without the provider, unlike most contexts here: `useNewSceneAction`
 * consumes it and is mounted by tests on its own. Outside the provider the
 * factory defaults apply, which is what a scene got before this existed.
 */
const NewSceneDefaultsContext = createContext<NewSceneDefaultsContextValue>({
  defaults: FACTORY_NEW_SCENE_DEFAULTS,
  getDefaults: async () => FACTORY_NEW_SCENE_DEFAULTS,
  setDefaults: () => {},
})

export const NewSceneDefaultsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [defaults, setDefaultsState] = useState<NewSceneDefaults>(FACTORY_NEW_SCENE_DEFAULTS)
  // Mirrors `defaults` for `getDefaults`, which must see the current value
  // without being re-created (and re-running its callers' effects) per change.
  const ref = useRef<NewSceneDefaults>(FACTORY_NEW_SCENE_DEFAULTS)
  // Resolved once UI_LOAD has settled, however it settled.
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  if (readyRef.current === null) {
    let resolve = (): void => {}
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    readyRef.current = { promise, resolve }
  }
  const ready = readyRef.current

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (cancelled) return
        const loaded = sanitizeNewSceneDefaults(ui?.newSceneDefaults)
        ref.current = loaded
        setDefaultsState(loaded)
      } catch {
        // Electron not available (Vite dev server) -- keep the factory values.
      } finally {
        // Always resolve: a getDefaults() caller must never hang on a failed
        // or absent load.
        ready.resolve()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  const setDefaults = useCallback((next: NewSceneDefaults) => {
    ref.current = next
    setDefaultsState(next)
    // Persist immediately -- one write per dialog confirmation. A failed save
    // costs the next session its defaults, not this one's scene.
    window.electronAPI
      ?.invoke(IPC.UI_SAVE, { newSceneDefaults: next })
      .catch((e: unknown) => console.warn('saving new-scene defaults failed:', e))
  }, [])

  const getDefaults = useCallback(async (): Promise<NewSceneDefaults> => {
    await ready.promise
    return ref.current
  }, [ready])

  const value = useMemo<NewSceneDefaultsContextValue>(
    () => ({ defaults, getDefaults, setDefaults }),
    [defaults, getDefaults, setDefaults],
  )

  return (
    <NewSceneDefaultsContext.Provider value={value}>
      {children}
    </NewSceneDefaultsContext.Provider>
  )
}

/** The scene settings a new scene starts from. */
export function useNewSceneDefaults(): NewSceneDefaultsContextValue {
  return useContext(NewSceneDefaultsContext)
}
