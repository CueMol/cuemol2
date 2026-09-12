/**
 * @file contexts/UndoRedoLockContext.test.tsx
 * @description That taking the lock actually stops undo and redo.
 *
 * Two halves, both required and each useless alone: the flags have to go
 * false (so the toolbar greys out AND the native Edit menu is re-pushed), and
 * `pickUndo` has to refuse (because on Windows and Linux Cmd+Z reaches the
 * command bus without going near the menu's enabled flag).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { IPC } from '@shared/ipcChannels'
import {
  flushPromises,
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'
import { CommandProvider } from '@renderer/commands/CommandRegistry'
import { UndoRedoLockProvider, useSuppressUndoRedo } from './UndoRedoLockContext'
import { useUndoRedoState } from '@renderer/hooks/useUndoRedoState'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
  useCueMolEventListener: () => undefined,
}))

void React

/** A scene with something to undo and something to redo. */
const undo = vi.fn(() => Promise.resolve())
const cm = {
  invokeService: vi.fn(() =>
    Promise.resolve({ canUndo: true, canRedo: true, undoDescs: ['edit'], redoDescs: ['edit'] }),
  ),
  undo,
  redo: vi.fn(() => Promise.resolve()),
} as never

/** Mount the undo state next to a component that can take the lock. */
function mountWithLock() {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <CommandProvider>
      <UndoRedoLockProvider>{children}</UndoRedoLockProvider>
    </CommandProvider>
  )
  return makeRenderHook(() => {
    const [locked, setLocked] = React.useState(false)
    useSuppressUndoRedo(locked)
    const state = useUndoRedoState({ cm, activeSceneId: 1 })
    return { state, setLocked }
  }, Wrapper)
}

describe('the undo/redo lock', () => {
  let api: ReturnType<typeof setupElectronAPI>

  beforeEach(() => { api = setupElectronAPI() })
  afterEach(() => { teardownElectronAPI(); vi.clearAllMocks() })

  it('disables undo and redo while held, and restores them on release', async () => {
    const h = mountWithLock()
    await flushPromises()
    expect(h.result.state.canUndo).toBe(true)
    api.invoke.mockClear()

    await act(async () => { h.result.setLocked(true) })
    await flushPromises()

    expect(h.result.state.canUndo).toBe(false)
    expect(h.result.state.canRedo).toBe(false)
    // The native menu owns Cmd+Z on macOS, so it has to be told too.
    expect(api.invoke).toHaveBeenCalledWith(IPC.MENU_UPDATE_STATE, {
      undo: { enabled: false },
      redo: { enabled: false },
    })

    // And the command path refuses, for the platforms where the keystroke
    // does not travel through the menu.
    act(() => { h.result.state.pickUndo(0) })
    expect(undo).not.toHaveBeenCalled()

    await act(async () => { h.result.setLocked(false) })
    await flushPromises()

    expect(h.result.state.canUndo).toBe(true)
    expect(api.invoke).toHaveBeenCalledWith(IPC.MENU_UPDATE_STATE, {
      undo: { enabled: true },
      redo: { enabled: true },
    })
    h.unmount()
  })
})
