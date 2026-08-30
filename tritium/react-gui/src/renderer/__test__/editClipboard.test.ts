/**
 * @file __test__/editClipboard.test.ts
 * @description Degrade-detection tests for the focus-aware Edit routing.
 *
 * This resolver decides what Cmd+C means, so every branch of it is a
 * user-visible behaviour that would be easy to break silently:
 *   - typing in a field must keep working like a text field;
 *   - a panel only answers while the user is actually working in it;
 *   - clicking the React menu bar must not lose the panel the user was in
 *     (the menu takes DOM focus, which is why the "last scope" memory
 *     exists at all);
 *   - undo/redo report back whether they were handled, so the caller knows
 *     when to fall through to the scene-level undo;
 *   - while a modal dialog is open the keystroke stays in the dialog: it
 *     never reaches a panel behind it, and Cmd+Z never rewinds the scene.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import {
  _resetClipboardScopesForTest,
  dispatchEditClipboard,
  dispatchEditUndoRedo,
  installClipboardScopeTracking,
  isEditableFocused,
  registerClipboardScope,
  setClipboardModalOpen,
} from '@renderer/utils/editClipboard'
import { setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'

let api: ReturnType<typeof setupElectronAPI>
let uninstall: () => void

/** Handlers for a scope, with spies so we can see which fired. */
function makeScope() {
  return { cut: vi.fn(), copy: vi.fn(), paste: vi.fn() }
}

/** Mount an element carrying `data-clipboard-scope`, returning its inner child. */
function mountScope(id: string, opts: { focusable?: boolean } = {}): HTMLElement {
  const host = document.createElement('div')
  host.dataset.clipboardScope = id
  const child = document.createElement('div')
  if (opts.focusable) child.tabIndex = -1
  host.appendChild(child)
  document.body.appendChild(host)
  return child
}

/** Simulate the user clicking on an element (what the tracker listens for). */
function pointerDown(el: Element): void {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
}

/** Focus an <input> so the editable guard sees a text context. */
function mountInput(): HTMLInputElement {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.focus()
  return input
}

/** Native edit actions main was asked to run. */
function nativeCalls(): string[] {
  return api.invoke.mock.calls
    .filter((c: unknown[]) => c[0] === IPC.TEXT_CTX_ACTION)
    .map((c: unknown[]) => c[1] as string)
}

beforeEach(() => {
  api = setupElectronAPI()
  _resetClipboardScopesForTest()
  uninstall = installClipboardScopeTracking()
})

afterEach(() => {
  uninstall()
  teardownElectronAPI()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('isEditableFocused', () => {
  it('recognises the elements that own their own clipboard behaviour', () => {
    expect(isEditableFocused()).toBe(false)
    const input = mountInput()
    expect(isEditableFocused()).toBe(true)
    input.blur()

    const editable = document.createElement('div')
    // jsdom neither derives isContentEditable from the attribute nor makes a
    // contenteditable div focusable, so both are supplied here.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    editable.tabIndex = -1
    document.body.appendChild(editable)
    editable.focus()
    expect(isEditableFocused()).toBe(true)
  })
})

describe('dispatchEditClipboard', () => {
  it('gives a focused text field the native edit, never a panel', () => {
    const scope = makeScope()
    registerClipboardScope('scene-tree', scope)
    const row = mountScope('scene-tree')
    pointerDown(row) // the user was in the tree...
    mountInput() // ...but is now typing

    for (const action of ['cut', 'copy', 'paste'] as const) {
      dispatchEditClipboard(action)
    }
    expect(nativeCalls()).toEqual(['cut', 'copy', 'paste'])
    expect(scope.cut).not.toHaveBeenCalled()
    expect(scope.copy).not.toHaveBeenCalled()
    expect(scope.paste).not.toHaveBeenCalled()
  })

  it('routes to the scope containing the focused element', () => {
    const scope = makeScope()
    registerClipboardScope('scene-tree', scope)
    const row = mountScope('scene-tree', { focusable: true })
    row.focus()

    dispatchEditClipboard('copy')
    expect(scope.copy).toHaveBeenCalledTimes(1)
    expect(nativeCalls()).toEqual([])
  })

  it('remembers the last scope the user clicked, so the menu bar still works', () => {
    // Clicking Edit > Copy moves focus into the React menu, outside every
    // scope. Without the memory the action would reach nothing.
    const scope = makeScope()
    registerClipboardScope('paint-deck', scope)
    pointerDown(mountScope('paint-deck'))

    const menu = document.createElement('div')
    menu.setAttribute('data-keep-clipboard-scope', '')
    document.body.appendChild(menu)
    pointerDown(menu)

    dispatchEditClipboard('cut')
    expect(scope.cut).toHaveBeenCalledTimes(1)
  })

  it('forgets the scope once the user works somewhere else', () => {
    const scope = makeScope()
    registerClipboardScope('scene-tree', scope)
    pointerDown(mountScope('scene-tree'))

    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)
    pointerDown(elsewhere)

    dispatchEditClipboard('copy')
    expect(scope.copy).not.toHaveBeenCalled()
    // Falls through to the native edit, a no-op outside a field.
    expect(nativeCalls()).toEqual(['copy'])
  })

  it('lets a plain text selection win for Copy only', () => {
    // Selecting log output and pressing Cmd+C must copy the text, even
    // though the log panel is in no clipboard scope. Cut and Paste have no
    // such case -- they need an editable target.
    const scope = makeScope()
    registerClipboardScope('scene-tree', scope)
    pointerDown(mountScope('scene-tree'))

    const p = document.createElement('p')
    p.textContent = 'some log output'
    document.body.appendChild(p)
    const range = document.createRange()
    range.selectNodeContents(p)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    dispatchEditClipboard('copy')
    expect(nativeCalls()).toEqual(['copy'])
    expect(scope.copy).not.toHaveBeenCalled()

    dispatchEditClipboard('paste')
    expect(scope.paste).toHaveBeenCalledTimes(1)
  })

  it('falls back to the native edit when no scope is registered', () => {
    pointerDown(mountScope('scene-tree')) // tagged, but nothing registered
    dispatchEditClipboard('paste')
    expect(nativeCalls()).toEqual(['paste'])
  })

  it('stops answering once a scope unregisters', () => {
    const scope = makeScope()
    const unregister = registerClipboardScope('paint-deck', scope)
    const row = mountScope('paint-deck')
    pointerDown(row)

    unregister()
    dispatchEditClipboard('copy')
    expect(scope.copy).not.toHaveBeenCalled()
    expect(nativeCalls()).toEqual(['copy'])
  })
})

describe('dispatchEditUndoRedo', () => {
  it('handles undo natively while a text field has focus', () => {
    mountInput()
    expect(dispatchEditUndoRedo('undo')).toBe(true)
    expect(nativeCalls()).toEqual(['undo'])
  })

  it('defers to the caller (scene undo) when no field has focus', () => {
    expect(dispatchEditUndoRedo('undo')).toBe(false)
    expect(dispatchEditUndoRedo('redo')).toBe(false)
    expect(nativeCalls()).toEqual([])
  })
})

// A modal owns the keystroke. Without this the "last scope" memory (which
// survives a menu click by design) would let Cmd+V inside a dialog paste into
// the panel the user was in before opening it.
describe('editClipboard -- while a modal dialog is open', () => {
  it('routes clipboard actions to the native edit, not the last scope', () => {
    const scope = makeScope()
    _resetClipboardScopesForTest()
    registerClipboardScope('scene-tree', scope)
    pointerDown(mountScope('scene-tree'))
    setClipboardModalOpen(true)

    dispatchEditClipboard('paste')

    expect(scope.paste).not.toHaveBeenCalled()
    expect(api.invoke).toHaveBeenCalledWith(IPC.TEXT_CTX_ACTION, 'paste')
  })

  it('reports undo/redo as handled so the scene undo never runs', () => {
    setClipboardModalOpen(true)
    // No text field focused: outside a modal this would fall through (false).
    expect(dispatchEditUndoRedo('undo')).toBe(true)
    expect(api.invoke).toHaveBeenCalledWith(IPC.TEXT_CTX_ACTION, 'undo')
  })

  it('restores normal panel routing once the modal closes', () => {
    const scope = makeScope()
    _resetClipboardScopesForTest()
    registerClipboardScope('scene-tree', scope)
    pointerDown(mountScope('scene-tree'))

    setClipboardModalOpen(true)
    setClipboardModalOpen(false)
    dispatchEditClipboard('paste')

    expect(scope.paste).toHaveBeenCalledTimes(1)
    expect(dispatchEditUndoRedo('undo')).toBe(false)
  })
})
