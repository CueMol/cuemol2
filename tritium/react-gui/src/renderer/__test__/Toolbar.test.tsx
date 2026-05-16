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

void React

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
    const t = mountTree(<Toolbar />)
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

  it('Undo / Redo body buttons dispatch edit commands', () => {
    const t = mountTree(<Toolbar />)

    clickButton(t.container, 'Undo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Undo)

    dispatch.mockClear()
    clickButton(t.container, 'Redo')
    expect(dispatch).toHaveBeenCalledWith(CmdId.Redo)

    t.unmount()
  })

  it('mock buttons do not dispatch any command', () => {
    const t = mountTree(<Toolbar />)
    // Object overwrite-save ("Save") has no command yet -- stays mock.
    dispatch.mockClear()
    clickButton(t.container, 'Save')
    expect(dispatch).not.toHaveBeenCalled()
    t.unmount()
  })
})
