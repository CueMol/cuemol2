/**
 * @file plugins/pymconsole/renderer/PymConsolePanel.test.tsx
 * @description The prompt's two contracts: a submitted line reaches the
 * worker and its answer is shown, and the arrow key brings the last line
 * back.
 *
 * The history is the half worth pinning. It is pure state that no type
 * checks, it is how people actually use a console, and losing it fails
 * quietly -- the key just does nothing.
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { PymConsolePanel } from './PymConsolePanel'
import { consoleSession } from './consoleSessionStore'
import { clearHistory, pushHistory } from './commandHistory'

function promptOf(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector('textarea')
  if (!el) throw new Error('prompt not found')
  return el
}

function type(el: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setter?.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PymConsolePanel', () => {
  beforeEach(() => {
    clearHistory()
    consoleSession.reset()
  })
  afterEach(() => {
    consoleSession.reset()
    clearHistory()
  })

  it('sends a submitted line to the runner and shows what comes back', async () => {
    const runner = vi.fn((text: string) => {
      consoleSession.finish([
        { kind: 'echo', text: `PyM> ${text}` },
        { kind: 'output', text: 'done' },
      ])
    })
    const tree = mountTree(<PymConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(runner))

    const prompt = promptOf(tree.container)
    act(() => type(prompt, 'bg_color white'))
    act(() => {
      prompt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    })
    await act(async () => flushPromises())

    expect(runner).toHaveBeenCalledWith('bg_color white')
    expect(tree.container.textContent).toContain('PyM> bg_color white')
    expect(tree.container.textContent).toContain('done')
    // The prompt is cleared so the next line starts empty.
    expect(promptOf(tree.container).value).toBe('')
    tree.unmount()
  })

  it('completes the line under the caret with what the worker answers', async () => {
    const invokePluginService = vi.fn(() =>
      Promise.resolve({
        ok: true,
        replacement: 'bg_color ',
        messages: [{ kind: 'output', text: ' parser: matching commands:' }],
      }),
    )
    const cm = { invokePluginService } as unknown as AsyncCueMol
    const tree = mountTree(<PymConsolePanel cm={cm} activeSceneId={1} activeMolViewId={2} />)
    act(() => consoleSession.setRunner(vi.fn()))

    const prompt = promptOf(tree.container)
    act(() => type(prompt, 'bg'))
    act(() => {
      prompt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )
    })
    await act(async () => flushPromises())

    const [pluginId, name, args] = invokePluginService.mock.calls[0] as unknown as [
      string,
      string,
      { line: string },
    ]
    expect([pluginId, name]).toEqual(['pymconsole', 'complete'])
    expect(args.line).toBe('bg')
    expect(promptOf(tree.container).value).toBe('bg_color ')
    expect(tree.container.textContent).toContain('parser: matching commands:')
    tree.unmount()
  })

  it('keeps Tab inside the prompt rather than letting it move focus', () => {
    const cm = {
      invokePluginService: vi.fn(() =>
        Promise.resolve({ ok: true, replacement: null, messages: [] }),
      ),
    } as unknown as AsyncCueMol
    const tree = mountTree(<PymConsolePanel cm={cm} activeSceneId={1} />)
    act(() => consoleSession.setRunner(vi.fn()))

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      promptOf(tree.container).dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    tree.unmount()
  })

  it('does not steal focus from a selection made in the transcript', () => {
    // Clicking the transcript puts the caret back in the prompt, the way a
    // terminal does -- but focusing an input collapses the document
    // selection, so doing it after a drag made the output unselectable.
    const tree = mountTree(<PymConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(vi.fn()))
    act(() => consoleSession.finish([{ kind: 'output', text: 'selectable text' }]))

    const body = tree.container.querySelector('.pymc-body')
    if (!body) throw new Error('body not found')

    // The prompt takes focus on mount, so drop it first: what is being
    // checked is whether the click gives it back.
    promptOf(tree.container).blur()

    const selected = { isCollapsed: false } as Selection
    const getSelection = vi.spyOn(window, 'getSelection').mockReturnValue(selected)
    act(() => {
      body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.activeElement).not.toBe(promptOf(tree.container))

    // With nothing selected the click still focuses the prompt.
    getSelection.mockReturnValue({ isCollapsed: true } as Selection)
    act(() => {
      body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.activeElement).toBe(promptOf(tree.container))

    getSelection.mockRestore()
    tree.unmount()
  })

  it('leaves the prompt usable while a command runs', () => {
    // Disabling a focused element drops focus, and re-enabling it does not
    // restore it -- so a disabled prompt meant clicking back into it after
    // every command. Running state is shown in the toolbar instead.
    const tree = mountTree(<PymConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(vi.fn()))
    act(() => consoleSession.begin())

    expect(promptOf(tree.container).disabled).toBe(false)
    expect(tree.container.textContent).toContain('Running...')
    tree.unmount()
  })

  it('brings the previous line back with the up arrow', () => {
    pushHistory('fetch 1crn')
    const tree = mountTree(<PymConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(vi.fn()))

    const prompt = promptOf(tree.container)
    act(() => {
      prompt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      )
    })
    expect(promptOf(tree.container).value).toBe('fetch 1crn')
    tree.unmount()
  })
})
