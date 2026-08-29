/**
 * Focus-aware Edit commands.
 *
 * Cmd+Z used to run the scene undo whatever was focused, so undoing a typo in
 * a text field could roll back the scene instead. Cut / Copy / Paste have the
 * same shape: they mean the focused text field, the scene tree, or the paint
 * deck depending on where focus is.
 *
 * That routing used to be special-cased inside `useMenuDispatch`; it is a set
 * of commands now (`commands/useFocusEditCommands.ts`), so these pin it there
 * -- through the real command bus, which is also how a second entry point
 * (a shortcut, a toolbar) would reach it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { CommandKey } from '../commands/CommandMap'
import { IPC } from '@shared/ipcChannels'
import { useFocusEditCommands } from '../commands/useFocusEditCommands'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'
import {
  _resetClipboardScopesForTest,
  registerClipboardScope,
} from '../utils/editClipboard'

void React

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

/**
 * Mount the real commands, then overwrite the SCENE undo/redo with catchers so
 * a fall-through is observable. The focus-routed commands themselves stay real.
 */
function setupHarness() {
  const captured: string[] = []
  const h = makeRenderHook(() => {
    useFocusEditCommands()
    return useCommands()
  }, Wrapper)
  for (const id of [CmdId.Undo, CmdId.Redo] as CommandKey[]) {
    h.result.register(id, (() => { captured.push(id) }) as never)
  }
  return { h, captured }
}

/** Native edit actions main was asked to run. */
function nativeCalls(api: ReturnType<typeof setupElectronAPI>): string[] {
  return api.invoke.mock.calls
    .filter((c: unknown[]) => c[0] === IPC.TEXT_CTX_ACTION)
    .map((c: unknown[]) => c[1] as string)
}

function focusInput(): void {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.focus()
}

describe('focus-aware Edit commands', () => {
  let api: ReturnType<typeof setupElectronAPI>

  beforeEach(() => {
    api = setupElectronAPI()
    _resetClipboardScopesForTest()
  })
  afterEach(() => {
    teardownElectronAPI()
    document.body.innerHTML = ''
  })

  it('undo/redo run natively while a text field has focus', async () => {
    const { h, captured } = setupHarness()
    focusInput()
    await h.result.dispatch(CmdId.EditUndoFocused)
    await h.result.dispatch(CmdId.EditRedoFocused)
    expect(nativeCalls(api)).toEqual(['undo', 'redo'])
    // The scene stack is untouched.
    expect(captured).toEqual([])
    h.unmount()
  })

  it('undo/redo fall through to the scene commands otherwise', async () => {
    const { h, captured } = setupHarness()
    await h.result.dispatch(CmdId.EditUndoFocused)
    await h.result.dispatch(CmdId.EditRedoFocused)
    await Promise.resolve()
    expect(nativeCalls(api)).toEqual([])
    expect(captured).toEqual([CmdId.Undo, CmdId.Redo])
    h.unmount()
  })

  it('cut / copy / paste reach the registered panel scope', async () => {
    const scope = { cut: vi.fn(), copy: vi.fn(), paste: vi.fn() }
    registerClipboardScope('scene-tree', scope)
    const host = document.createElement('div')
    host.dataset.clipboardScope = 'scene-tree'
    host.tabIndex = -1
    document.body.appendChild(host)
    host.focus()

    const { h } = setupHarness()
    await h.result.dispatch(CmdId.EditCopy)
    await h.result.dispatch(CmdId.EditCut)
    await h.result.dispatch(CmdId.EditPaste)
    expect(scope.copy).toHaveBeenCalledTimes(1)
    expect(scope.cut).toHaveBeenCalledTimes(1)
    expect(scope.paste).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('select-all is scoped to the focused field, not the document', async () => {
    const input = document.createElement('input')
    input.value = 'abcdef'
    document.body.appendChild(input)
    input.focus()

    const { h } = setupHarness()
    await h.result.dispatch(CmdId.EditSelectAll)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6])
    h.unmount()
  })
})
