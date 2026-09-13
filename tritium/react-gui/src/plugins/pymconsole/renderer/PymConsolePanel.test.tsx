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
        { kind: 'echo', text: `PyMOL> ${text}` },
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
    expect(tree.container.textContent).toContain('PyMOL> bg_color white')
    expect(tree.container.textContent).toContain('done')
    // The prompt is cleared so the next line starts empty.
    expect(promptOf(tree.container).value).toBe('')
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
