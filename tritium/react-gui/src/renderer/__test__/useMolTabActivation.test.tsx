/**
 * Regression test for the MolTab activation stale-index crash.
 *
 * On window close the renderer sweeps every tab: it activates the tab, then
 * closes it (removeMolTab). `setActiveViewByID` used to precompute the index
 * from a ref and hand it to an index-based `setActiveTab`, so when a removal
 * landed first the updater ran against a shorter list and threw
 * "tab index N <= ind" -- crashing the renderer mid-close (the window then hit
 * the 10s force-close watchdog).
 *
 * The fix resolves the index INSIDE the state updater (by view_id), making a
 * concurrently-removed tab a safe no-op. These tests pin that contract.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect } from 'vitest'
import { mountTree } from './helpers/testHarness'
import { MolTabProvider, useMolTab } from '../hooks/useMolTab'

void React

function Consumer(): React.ReactElement {
  const { addMolTab, removeMolTab, setActiveViewByID, clearActiveView, getActiveSceneInfo, molTabEntries } = useMolTab()
  const active = molTabEntries.find((e) => e.active)
  return (
    <div>
      <span data-testid="count">{molTabEntries.length}</span>
      <span data-testid="active">{active ? active.view_id : 'none'}</span>
      <span data-testid="scene">{getActiveSceneInfo()?.scene_uid ?? 'none'}</span>
      <button data-testid="add-a" onClick={() => addMolTab('A', 10, 100)} />
      <button data-testid="add-b" onClick={() => addMolTab('B', 20, 100)} />
      <button data-testid="activate-a" onClick={() => setActiveViewByID(10)} />
      <button data-testid="activate-unknown" onClick={() => setActiveViewByID(999)} />
      <button data-testid="clear" onClick={() => clearActiveView()} />
      {/* Same-tick removal + reactivation -- reproduces the close-sweep race. */}
      <button data-testid="race" onClick={() => { removeMolTab(20); setActiveViewByID(20) }} />
    </div>
  )
}

function mount() {
  const t = mountTree(
    <MolTabProvider>
      <Consumer />
    </MolTabProvider>,
  )
  return t
}

const click = (c: HTMLElement, id: string) =>
  act(() => {
    ;(c.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click()
  })
const text = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)!.textContent

describe('MolTab activation', () => {
  it('activates the tab whose view_id matches', () => {
    const { container, unmount } = mount()
    click(container, 'add-a')
    click(container, 'add-b')
    expect(text(container, 'count')).toBe('2')
    expect(text(container, 'active')).toBe('20') // last added is active

    click(container, 'activate-a')
    expect(text(container, 'active')).toBe('10')
    unmount()
  })

  it('is a no-op (no throw) for an unknown view_id', () => {
    const { container, unmount } = mount()
    click(container, 'add-a')
    expect(() => click(container, 'activate-unknown')).not.toThrow()
    expect(text(container, 'active')).toBe('10') // unchanged
    unmount()
  })

  it('clearActiveView deactivates every entry so no scene is active', () => {
    const { container, unmount } = mount()
    click(container, 'add-a')
    click(container, 'add-b')
    expect(text(container, 'active')).toBe('20')
    expect(text(container, 'scene')).toBe('100')

    // Switching to a non-molview tab clears the active molview: entries remain
    // but none is active, so the derived active scene is undefined.
    click(container, 'clear')
    expect(text(container, 'count')).toBe('2') // entries kept
    expect(text(container, 'active')).toBe('none')
    expect(text(container, 'scene')).toBe('none')

    // Returning to a molview re-activates it.
    click(container, 'activate-a')
    expect(text(container, 'active')).toBe('10')
    expect(text(container, 'scene')).toBe('100')
    unmount()
  })

  it('does not throw when a tab is removed and reactivated in the same tick', () => {
    const { container, unmount } = mount()
    click(container, 'add-a')
    click(container, 'add-b')
    // Before the fix this threw "tab index 1 <= 1".
    expect(() => click(container, 'race')).not.toThrow()
    expect(text(container, 'count')).toBe('1')
    unmount()
  })
})
