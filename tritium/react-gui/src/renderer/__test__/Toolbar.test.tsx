/**
 * Degrade-detection test for the top Toolbar.
 *
 * Pins the observable contract after the UXP-ribbon port:
 *   - real-wired buttons dispatch their CmdId through the command bus
 *   - mock buttons (object Save / Save As / Reload Scene) dispatch nothing
 *   - Undo / Redo body buttons dispatch CmdId.Undo / CmdId.Redo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { CmdId } from '../commands/ids'
import { mountTree } from './helpers/testHarness'

// Mock the command registry so dispatch calls can be asserted directly.
// Both Toolbar and UndoRedoSplitButton import this same module.
const dispatch = vi.fn(() => Promise.resolve())
vi.mock('../commands/CommandRegistry', () => ({
  useCommands: () => ({ dispatch, register: vi.fn(), has: vi.fn() }),
}))

import { Toolbar } from '../components/Toolbar'
import type { UndoRedoState } from '../hooks/useUndoRedoState'

void React

/** A ready-to-undo/redo state stub so the body buttons are enabled. */
function makeUndoRedo(over: Partial<UndoRedoState> = {}): UndoRedoState {
  return {
    canUndo: true,
    canRedo: true,
    undoDescs: ['e1'],
    redoDescs: ['e2'],
    pickUndo: vi.fn(),
    pickRedo: vi.fn(),
    ...over,
  }
}

/** Click a Blueprint button by its visible text. */
function clickButton(container: HTMLElement, text: string): void {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  )
  if (!btn) throw new Error(`button "${text}" not found`)
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Toolbar', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dispatch.mockClear()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('real buttons dispatch their CmdId', () => {
    const t = mountTree(<Toolbar undoRedo={makeUndoRedo()} hasScene={true} />)
    const cases: [string, CmdId][] = [
      ['New Tab', CmdId.TabNew],
      ['Open File', CmdId.UiOpenObjDialog],
      ['Save As', CmdId.ObjectSaveAs],
      ['Open Scene', CmdId.UiOpenSceneDialog],
      ['Reload Scene', CmdId.SceneReload],
      ['Save Scene', CmdId.FileSave],
      ['Get PDB', CmdId.UiGetPdbDialog],
    ]
    for (const [text, cmd] of cases) {
      dispatch.mockClear()
      clickButton(t.container, text)
      expect(dispatch).toHaveBeenCalledWith(cmd)
    }
    t.unmount()
  })

  it('Undo / Redo body buttons dispatch edit commands when enabled', () => {
    const t = mountTree(<Toolbar undoRedo={makeUndoRedo()} hasScene={true} />)

    clickButton(t.container, 'Undo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Undo)

    dispatch.mockClear()
    clickButton(t.container, 'Redo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Redo)

    t.unmount()
  })

  it('disables the Undo / Redo body buttons when nothing can be undone/redone', () => {
    const t = mountTree(
      <Toolbar undoRedo={makeUndoRedo({ canUndo: false, canRedo: false, undoDescs: [], redoDescs: [] })} hasScene={true} />,
    )
    const undoBtn = Array.from(t.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Undo',
    )
    const redoBtn = Array.from(t.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Redo',
    )
    expect(undoBtn?.disabled).toBe(true)
    expect(redoBtn?.disabled).toBe(true)
    t.unmount()
  })

  it('mock buttons do not dispatch any command', () => {
    const t = mountTree(<Toolbar undoRedo={makeUndoRedo()} hasScene={true} />)
    // Object overwrite-save ("Save") has no command yet -- stays mock.
    dispatch.mockClear()
    clickButton(t.container, 'Save')
    expect(dispatch).not.toHaveBeenCalled()
    t.unmount()
  })

  // --- Scene-operation gating (no active molview tab) ---

  const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    )

  it('disables scene-only buttons when no molview tab is active', () => {
    const t = mountTree(<Toolbar undoRedo={makeUndoRedo()} hasScene={false} />)
    for (const text of ['Save As', 'Reload Scene', 'Save Scene', 'Render']) {
      expect(findButton(t.container, text)?.disabled).toBe(true)
    }
    // Scene-independent buttons stay enabled.
    for (const text of ['New Tab', 'Open File', 'Open Scene', 'Get PDB']) {
      expect(findButton(t.container, text)?.disabled).toBe(false)
    }
    t.unmount()
  })

  it('enables scene-only buttons when a molview tab is active', () => {
    const t = mountTree(<Toolbar undoRedo={makeUndoRedo()} hasScene={true} />)
    for (const text of ['Save As', 'Reload Scene', 'Save Scene', 'Render']) {
      expect(findButton(t.container, text)?.disabled).toBe(false)
    }
    t.unmount()
  })
})
