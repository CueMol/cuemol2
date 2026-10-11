/**
 * @file plugins/console/renderer/ConsolePanel.test.tsx
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

import { ConsolePanel } from './ConsolePanel'
import { consoleSession } from './consoleSessionStore'
import { historyOf } from './commandHistory'

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

describe('ConsolePanel', () => {
  beforeEach(() => {
    historyOf('native').clearHistory()
    consoleSession.reset()
  })
  afterEach(() => {
    consoleSession.reset()
    historyOf('native').clearHistory()
  })

  it('sends a submitted line to the runner and shows what comes back', async () => {
    const runner = vi.fn((text: string) => {
      consoleSession.finish([
        { kind: 'echo', text: `PyM> ${text}` },
        { kind: 'output', text: 'done' },
      ])
    })
    const tree = mountTree(<ConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(runner))

    const prompt = promptOf(tree.container)
    act(() => type(prompt, 'bg_color white'))
    act(() => {
      prompt.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    })
    await act(async () => flushPromises())

    // A fresh panel speaks the native dialect.
    expect(runner).toHaveBeenCalledWith('bg_color white', 'native')
    expect(tree.container.textContent).toContain('PyM> bg_color white')
    expect(tree.container.textContent).toContain('done')
    // The prompt is cleared so the next line starts empty.
    expect(promptOf(tree.container).value).toBe('')
    tree.unmount()
  })

  it('lists several candidates, walks them on the next Tab, and Esc puts back what was typed', async () => {
    const candidates = ['bg_color', 'bg_gradient'].map((c) => ({
      label: c,
      replacement: `${c} `,
      kind: 'command',
      group: 'commands',
    }))
    const invokePluginService = vi.fn(() => Promise.resolve({ ok: true, replacement: 'bg_', messages: [], candidates }))
    const runner = vi.fn()
    const cm = { invokePluginService } as unknown as AsyncCueMol
    const tree = mountTree(<ConsolePanel cm={cm} activeSceneId={1} activeMolViewId={2} />)
    act(() => consoleSession.setRunner(runner))
    const key = (k: string) =>
      act(() => {
        promptOf(tree.container).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
      })

    act(() => type(promptOf(tree.container), 'bg'))
    key('Tab')
    await act(async () => flushPromises())

    const [pluginId, name, args] = invokePluginService.mock.calls[0] as unknown as [string, string, { line: string }]
    expect([pluginId, name, args.line]).toEqual(['console', 'complete', 'bg'])
    // Extended to what they share, and listed above the prompt, not in the transcript.
    expect(promptOf(tree.container).value).toBe('bg_')
    const strip = () => tree.container.querySelector('.console-completions')
    expect(strip()?.textContent).toContain('bg_gradient')
    expect(tree.container.querySelector('.console-transcript')?.textContent ?? '').not.toContain('bg_gradient')

    // The second Tab walks the list without asking the worker again.
    key('Tab')
    key('Tab')
    expect(invokePluginService).toHaveBeenCalledTimes(1)
    expect(promptOf(tree.container).value).toBe('bg_gradient ')
    expect(strip()?.querySelector('.is-selected')?.textContent).toBe('bg_gradient')

    key('Escape')
    expect(promptOf(tree.container).value).toBe('bg_')
    expect(strip()).toBeNull()

    // Enter in a menu takes the selection and runs nothing.
    key('Tab')
    await act(async () => flushPromises())
    key('Tab')
    key('Enter')
    expect(promptOf(tree.container).value).toBe('bg_color ')
    expect(runner).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('completes the word before the caret and keeps what follows it, as bash does', async () => {
    const invokePluginService = vi.fn(() => Promise.resolve({ ok: true, replacement: 'load f, cartoon, ', messages: [] }))
    const cm = { invokePluginService } as unknown as AsyncCueMol
    const tree = mountTree(<ConsolePanel cm={cm} activeSceneId={1} activeMolViewId={2} />)
    act(() => consoleSession.setRunner(vi.fn()))

    const prompt = promptOf(tree.container)
    act(() => type(prompt, 'load f, car, protein'))
    prompt.setSelectionRange(11, 11) // after "car"
    act(() => {
      prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    })
    await act(async () => flushPromises())

    const args = (invokePluginService.mock.calls[0] as unknown as [string, string, { line: string }])[2]
    expect(args.line).toBe('load f, car')
    // The `, ` the completion ends with is already there after the caret.
    expect(promptOf(tree.container).value).toBe('load f, cartoon, protein')
    tree.unmount()
  })

  it('keeps Tab inside the prompt rather than letting it move focus', () => {
    const cm = {
      invokePluginService: vi.fn(() =>
        Promise.resolve({ ok: true, replacement: null, messages: [] }),
      ),
    } as unknown as AsyncCueMol
    const tree = mountTree(<ConsolePanel cm={cm} activeSceneId={1} />)
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

  it('keeps focus in the transcript on click, and sends typing to the prompt', () => {
    // Focus stays in the transcript so Cmd+A selects the log, not the
    // prompt's line; a printable key still lands in the prompt, the way a
    // terminal does, and a shortcut does not move focus.
    const tree = mountTree(<ConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(vi.fn()))
    act(() => consoleSession.finish([{ kind: 'output', text: 'selectable text' }]))

    const transcript = tree.container.querySelector<HTMLElement>('.console-transcript')
    if (!transcript) throw new Error('transcript not found')
    act(() => transcript.focus())
    expect(document.activeElement).toBe(transcript)

    act(() => {
      transcript.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }))
    })
    expect(document.activeElement).toBe(transcript)

    act(() => {
      transcript.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    expect(document.activeElement).toBe(promptOf(tree.container))
    tree.unmount()
  })

  it('leaves the prompt usable while a command runs', () => {
    // Disabling a focused element drops focus, and re-enabling it does not
    // restore it -- so a disabled prompt meant clicking back into it after
    // every command. Running state is shown in the toolbar instead.
    const tree = mountTree(<ConsolePanel cm={null} />)
    act(() => consoleSession.setRunner(vi.fn()))
    act(() => consoleSession.begin())

    expect(promptOf(tree.container).disabled).toBe(false)
    expect(tree.container.textContent).toContain('Running...')
    tree.unmount()
  })

  it('brings the previous line back with the up arrow', () => {
    historyOf('native').pushHistory('fetch 1crn')
    const tree = mountTree(<ConsolePanel cm={null} />)
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
