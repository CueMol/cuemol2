/**
 * @file __test__/menuKeyBindings.test.tsx
 * @description Degrade-detection tests for the Windows / Linux menu-shortcut
 * dispatcher (shell/keybindings/useMenuKeyBindings).
 *
 * The contract pinned here is what a keystroke does on those platforms, where
 * Blink swallows Ctrl+X/C/V/A before a native menu accelerator could fire:
 *   - a template accelerator dispatches the item's menu channel as a command
 *     and consumes the key (preventDefault), even from a text field -- the
 *     focus routing happens downstream in editClipboard;
 *   - a disabled item (no scene for Save) and a non-matching chord do nothing;
 *   - while a modal is open only the text-edit items get through;
 *   - an IME-composing key is left alone;
 *   - on macOS nothing is installed (the native menu owns the keys).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import type { CommandKey } from '@renderer/commands/CommandMap'
import { useMenuKeyBindings } from '@renderer/shell/keybindings/useMenuKeyBindings'
import { _resetClipboardScopesForTest, setClipboardModalOpen } from '@renderer/utils/editClipboard'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'

// The dispatcher resolves the template against live state; stub the
// providers it reads, with the scene gate switchable per test.
const live = vi.hoisted(() => ({ hasScene: true }))
vi.mock('@renderer/state/activeView', () => ({
  useActiveViewValues: () => ({ viewProjection: null, viewCenterMark: null, sceneBgColor: null, exportAvailable: null }),
}))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ activeSceneId: undefined, activeMolViewId: undefined, hasScene: live.hasScene }),
}))
vi.mock('@renderer/features/file-io/useRecentFiles', () => ({ useRecentFiles: () => [] }))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

function mount(platform: string) {
  setupElectronAPI({ platform })
  const dispatched: string[] = []
  const h = makeRenderHook(() => {
    const cmds = useCommands()
    useMenuKeyBindings()
    return cmds
  }, Wrapper)
  for (const id of Object.values(CmdId) as CommandKey[]) {
    h.result.register(id, (() => { dispatched.push(id) }) as never)
  }
  return { h, dispatched }
}

/** Fire a keydown on a focused element and report whether it was consumed. */
function press(
  target: HTMLElement,
  key: string,
  mods: Partial<Pick<KeyboardEventInit, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'>> = {},
): boolean {
  target.focus()
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  act(() => { target.dispatchEvent(ev) })
  return ev.defaultPrevented
}

let unmount: (() => void) | null = null
let host: HTMLDivElement
let input: HTMLInputElement

beforeEach(() => {
  live.hasScene = true
  _resetClipboardScopesForTest()
  host = document.createElement('div')
  host.tabIndex = -1
  input = document.createElement('input')
  document.body.append(host, input)
})

afterEach(() => {
  unmount?.()
  unmount = null
  teardownElectronAPI()
  document.body.innerHTML = ''
})

describe('useMenuKeyBindings on Windows', () => {
  it('turns Ctrl+V into the Paste menu command and consumes the key', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(host, 'v', { ctrlKey: true })).toBe(true)
    expect(dispatched).toEqual([CmdId.EditPaste])
  })

  it('covers the other text-edit keys with the Windows accelerators (Ctrl+Y for Redo)', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    press(host, 'x', { ctrlKey: true })
    press(host, 'c', { ctrlKey: true })
    press(host, 'a', { ctrlKey: true })
    press(host, 'z', { ctrlKey: true })
    press(host, 'y', { ctrlKey: true })
    expect(dispatched).toEqual([
      CmdId.EditCut, CmdId.EditCopy, CmdId.EditSelectAll,
      CmdId.EditUndoFocused, CmdId.EditRedoFocused,
    ])
  })

  it('dispatches from a text field too: focus routing is the router\'s job', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(input, 'v', { ctrlKey: true })).toBe(true)
    expect(dispatched).toEqual([CmdId.EditPaste])
  })

  it('reaches non-edit menu items as well (Ctrl+O opens the file dialog)', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(host, 'o', { ctrlKey: true })).toBe(true)
    expect(dispatched).toEqual(['ui.openObjDialog'])
  })

  it('leaves a disabled item\'s key alone (Save with no scene)', () => {
    live.hasScene = false
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(host, 's', { ctrlKey: true })).toBe(false)
    expect(dispatched).toEqual([])
  })

  it('ignores a chord that is not an accelerator, and a bare key', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(host, 'v', { ctrlKey: true, shiftKey: true })).toBe(false)
    expect(press(host, 'v')).toBe(false)
    expect(dispatched).toEqual([])
  })

  it('while a modal is open, lets only the text-edit items through', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    setClipboardModalOpen(true)
    expect(press(host, 'o', { ctrlKey: true })).toBe(false)
    expect(press(host, 'v', { ctrlKey: true })).toBe(true)
    expect(dispatched).toEqual([CmdId.EditPaste])
  })

  it('leaves an IME-composing key to the IME', () => {
    const { h, dispatched } = mount('win32')
    unmount = h.unmount
    expect(press(host, 'a', { ctrlKey: true, isComposing: true })).toBe(false)
    expect(dispatched).toEqual([])
  })
})

describe('useMenuKeyBindings on macOS', () => {
  it('installs nothing: the native menu owns the key equivalents', () => {
    const { h, dispatched } = mount('darwin')
    unmount = h.unmount
    expect(press(host, 'v', { ctrlKey: true })).toBe(false)
    expect(press(host, 'v', { metaKey: true })).toBe(false)
    expect(dispatched).toEqual([])
  })
})
