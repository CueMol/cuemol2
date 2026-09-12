/**
 * @file contexts/UndoRedoLockContext.tsx
 * @description Holds Undo / Redo off while something is mid-edit.
 *
 * A long operation that wraps many scene mutations in one undo transaction --
 * the AI agent turn is the case this exists for -- must not have that
 * transaction unwound from under it. The C++ `UndoManager` absorbs a nested
 * transaction into the outermost one, so an undo run while the outer
 * transaction is open would revert an inconsistent half of it.
 *
 * Ref-counted like `ModalOpenCounterContext`, but the count is React state
 * rather than a ref: `useUndoRedoState` has to re-render to disable the
 * toolbar buttons and re-push the native menu's enabled flags, which a ref
 * would not make it do.
 *
 * This suppresses the *running* of undo / redo, not editing: the user can
 * still change the scene while a lock is held, and those edits land in the
 * open transaction. Preventing that is a separate problem (see
 * docs/architecture/ai-agent-plugin.md).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface UndoRedoLock {
  /** True while at least one holder has the lock. */
  locked: boolean
  acquire: () => void
  release: () => void
}

const UndoRedoLockContext = createContext<UndoRedoLock | null>(null)
UndoRedoLockContext.displayName = 'UndoRedoLockContext'

export const UndoRedoLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState(0)

  const acquire = useCallback(() => { setCount((n) => n + 1) }, [])
  const release = useCallback(() => { setCount((n) => (n > 0 ? n - 1 : 0)) }, [])

  const value = useMemo<UndoRedoLock>(
    () => ({ locked: count > 0, acquire, release }),
    [count, acquire, release],
  )

  return <UndoRedoLockContext.Provider value={value}>{children}</UndoRedoLockContext.Provider>
}
UndoRedoLockProvider.displayName = 'UndoRedoLockProvider'

/**
 * Whether undo / redo is currently held off.
 *
 * Reports false outside a provider, so a component mounted on its own in a
 * test behaves as if nothing were locking.
 */
export function useUndoRedoLocked(): boolean {
  return useContext(UndoRedoLockContext)?.locked ?? false
}

/**
 * Hold undo / redo off for as long as `active` is true and the caller is
 * mounted.
 *
 * Releases on unmount, so a panel that disappears mid-operation (a plugin
 * switched off, a view closed) cannot leave the lock stuck on.
 *
 * @param active - whether this caller currently needs the lock.
 */
export function useSuppressUndoRedo(active: boolean): void {
  const lock = useContext(UndoRedoLockContext)
  useEffect(() => {
    if (!active || !lock) return
    lock.acquire()
    return () => { lock.release() }
    // `acquire` / `release` are stable; depending on `lock` itself would
    // re-acquire on every count change, which is every other holder's edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lock?.acquire, lock?.release])
}
