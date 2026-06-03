/**
 * Degrade-detection tests for utils/selectAllScope.ts.
 *
 * Pins the scoped Select All priority contract that keeps Cmd+A / Edit >
 * Select All from selecting the whole GUI:
 *   - focused input -> selects that field
 *   - active [data-select-scope] region (last pointer-down) -> selects it
 *   - nothing focused / no active region -> no-op (no whole-document select)
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  installSelectAllScope,
  selectAllInScope,
  _resetSelectAllScopeForTest,
} from '../utils/selectAllScope'

afterEach(() => {
  _resetSelectAllScopeForTest()
  document.body.innerHTML = ''
})

describe('selectAllInScope', () => {
  it('selects the focused input field', () => {
    const input = document.createElement('input')
    input.value = 'hello'
    document.body.appendChild(input)
    input.focus()
    const select = vi.spyOn(input, 'select')

    selectAllInScope()

    expect(select).toHaveBeenCalledOnce()
  })

  it('selects the active [data-select-scope] region after pointer-down on it', () => {
    const cleanup = installSelectAllScope()
    const pre = document.createElement('pre')
    pre.textContent = 'log line 1\nlog line 2'
    pre.setAttribute('data-select-scope', '')
    document.body.appendChild(pre)

    // Right/left click inside the region marks it active.
    pre.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    selectAllInScope()

    const sel = window.getSelection()
    expect(sel?.rangeCount).toBe(1)
    // The selection range wraps the region's contents.
    expect(sel?.getRangeAt(0).commonAncestorContainer).toBe(pre)

    cleanup()
  })

  it('is a no-op when nothing is focused and no region is active', () => {
    // Move focus to body (no editable, no scope).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const sel = window.getSelection()
    sel?.removeAllRanges()

    expect(() => selectAllInScope()).not.toThrow()
    expect(sel?.rangeCount ?? 0).toBe(0)
  })

  it('pointer-down outside any scope clears the active region', () => {
    const cleanup = installSelectAllScope()
    const pre = document.createElement('pre')
    pre.textContent = 'logs'
    pre.setAttribute('data-select-scope', '')
    const outside = document.createElement('div')
    document.body.append(pre, outside)

    pre.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    window.getSelection()?.removeAllRanges()
    selectAllInScope()

    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
    cleanup()
  })
})
