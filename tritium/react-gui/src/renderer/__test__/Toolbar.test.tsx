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
import { CmdId } from '@renderer/commands/ids'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

// Mock the command registry so dispatch calls can be asserted directly.
// Both Toolbar and UndoRedoSplitButton import this same module.
const dispatch = vi.fn(() => Promise.resolve())
vi.mock('@renderer/commands/CommandRegistry', () => ({
  useCommands: () => ({ dispatch, register: vi.fn(), has: vi.fn() }),
}))

// Toolbar reads undo/redo state and the active scene from their providers.
const toolbarState = vi.hoisted(() => ({
  undoRedo: null as unknown,
  hasScene: true,
}))
vi.mock('@renderer/state/undoRedo', () => ({ useUndoRedo: () => toolbarState.undoRedo }))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ activeSceneId: undefined, activeMolViewId: undefined, hasScene: toolbarState.hasScene }),
}))

import { Toolbar } from '@renderer/shell/Toolbar'
import type { UndoRedoState } from '@renderer/hooks/useUndoRedoState'

/** Mount the toolbar over the given provider state. */
function mountToolbar(undoRedo: UndoRedoState, hasScene = true) {
  toolbarState.undoRedo = undoRedo
  toolbarState.hasScene = hasScene
  return mountTree(<Toolbar />)
}

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
    const t = mountToolbar(makeUndoRedo(), true)
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
    const t = mountToolbar(makeUndoRedo(), true)

    clickButton(t.container, 'Undo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Undo)

    dispatch.mockClear()
    clickButton(t.container, 'Redo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Redo)

    t.unmount()
  })

  it('disables the Undo / Redo body buttons when nothing can be undone/redone', () => {
    const t = mountToolbar(makeUndoRedo({ canUndo: false, canRedo: false, undoDescs: [], redoDescs: [] }), true)
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

  it('carries no dead buttons -- every one dispatches', () => {
    // The bar used to hold a mock "Save" (object overwrite-save) that only
    // logged a warning. UXP has no such button -- its ribbon offers Save As
    // and Save Scene only, and there is no object overwrite-save anywhere in
    // its File menu either -- so it was removed rather than implemented.
    const t = mountToolbar(makeUndoRedo(), true)
    const labels = Array.from(t.container.querySelectorAll('button')).map((b) =>
      b.textContent?.trim(),
    )
    expect(labels).not.toContain('Save')
    expect(labels).toContain('Save As')
    expect(labels).toContain('Save Scene')
    t.unmount()
  })

  // --- Scene-operation gating (no active molview tab) ---

  const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    )

  it('disables scene-only buttons when no molview tab is active', () => {
    const t = mountToolbar(makeUndoRedo(), false)
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
    const t = mountToolbar(makeUndoRedo(), true)
    for (const text of ['Save As', 'Reload Scene', 'Save Scene', 'Render']) {
      expect(findButton(t.container, text)?.disabled).toBe(false)
    }
    t.unmount()
  })
})
