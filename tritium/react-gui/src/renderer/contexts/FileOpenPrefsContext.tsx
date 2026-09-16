/**
 * @file contexts/FileOpenPrefsContext.tsx
 * @description Where an opened object file is loaded, one preference per entry
 * point that carries its own expectation: a file dropped onto the window, and
 * a file handed over by the OS shell or the command line.
 *
 * The entry point reads its own preference and passes the answer down with the
 * file, so the open commands never consult a preference themselves -- that is
 * what keeps File > Open and Open Recent on the active scene without a branch
 * of their own (an absent target means 'active').
 *
 * `getShellTarget` is awaitable on purpose. `useShellOpenFiles` drains the
 * launch queue as soon as CueMol and the launch scene are ready, and neither
 * of those is ordered against this provider's UI_LOAD round trip; reading the
 * React state there would silently fall back to the default on exactly the
 * path the preference exists for. A drop is a user action long after mount, so
 * it reads the state.
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
  DEFAULT_OPEN_FILE_TARGET,
  normalizeOpenFileTarget,
  type OpenFileTarget,
} from '@renderer/data/openFileTarget'

interface FileOpenPrefsContextValue {
  /** Target for a file dropped onto the window. */
  dropTarget: OpenFileTarget
  /** Target for a file from the OS shell / command line. */
  shellTarget: OpenFileTarget
  setDropTarget: (target: OpenFileTarget) => void
  setShellTarget: (target: OpenFileTarget) => void
  /** The shell target, waiting for the persisted value to have been read. */
  getShellTarget: () => Promise<OpenFileTarget>
}

const DEFAULTS = {
  dropTarget: DEFAULT_OPEN_FILE_TARGET,
  shellTarget: DEFAULT_OPEN_FILE_TARGET,
}

const FileOpenPrefsContext = createContext<FileOpenPrefsContextValue | null>(null)

export const FileOpenPrefsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [targets, setTargets] = useState(DEFAULTS)
  // Mirrors `targets` for getShellTarget, which must see the current value
  // without being re-created (and re-running its callers' effects) per change.
  const ref = useRef(DEFAULTS)
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
        const loaded = {
          dropTarget: normalizeOpenFileTarget(ui?.dropOpenTarget),
          shellTarget: normalizeOpenFileTarget(ui?.shellOpenTarget),
        }
        ref.current = loaded
        setTargets(loaded)
      } catch {
        // Electron not available (Vite dev server) -- keep the defaults.
      } finally {
        // Always resolve: a getShellTarget() caller must never hang on a
        // failed or absent load, or a shell-opened file would be stranded.
        ready.resolve()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  // One narrow patch per change: main merges it over the stored ui object, so
  // two preferences written at once cannot overwrite each other.
  const setDropTarget = useCallback((target: OpenFileTarget) => {
    ref.current = { ...ref.current, dropTarget: target }
    setTargets((prev) => ({ ...prev, dropTarget: target }))
    window.electronAPI
      ?.invoke(IPC.UI_SAVE, { dropOpenTarget: target })
      .catch((e: unknown) => console.warn('saving drop open target failed:', e))
  }, [])

  const setShellTarget = useCallback((target: OpenFileTarget) => {
    ref.current = { ...ref.current, shellTarget: target }
    setTargets((prev) => ({ ...prev, shellTarget: target }))
    window.electronAPI
      ?.invoke(IPC.UI_SAVE, { shellOpenTarget: target })
      .catch((e: unknown) => console.warn('saving shell open target failed:', e))
  }, [])

  const getShellTarget = useCallback(async (): Promise<OpenFileTarget> => {
    await ready.promise
    return ref.current.shellTarget
  }, [ready])

  const value = useMemo<FileOpenPrefsContextValue>(
    () => ({ ...targets, setDropTarget, setShellTarget, getShellTarget }),
    [targets, setDropTarget, setShellTarget, getShellTarget],
  )

  return (
    <FileOpenPrefsContext.Provider value={value}>{children}</FileOpenPrefsContext.Provider>
  )
}

/**
 * Access the file-open targets. Outside a provider (tests, isolated mounts)
 * the defaults are returned, the setters are no-ops and getShellTarget
 * resolves immediately -- so a consumer never blocks on a missing provider.
 */
export function useFileOpenPrefs(): FileOpenPrefsContextValue {
  const ctx = useContext(FileOpenPrefsContext)
  return (
    ctx ?? {
      ...DEFAULTS,
      setDropTarget: () => undefined,
      setShellTarget: () => undefined,
      getShellTarget: () => Promise.resolve(DEFAULT_OPEN_FILE_TARGET),
    }
  )
}
