/**
 * @file state/workspace/workspaceReducer.test.ts
 * @description The tab strip's transitions, pinned as a pure function.
 *
 * Carries the cases the two stores it replaced were tested on
 * (useTabManager: singleton Settings, title sync without churn;
 * MolTabProvider: activation by view id, removal races) plus the invariant
 * that is the reason for the merge: the active scene and the active view
 * come from one record.
 */

import { describe, it, expect } from 'vitest'
import {
  INITIAL_WORKSPACE,
  SETTINGS_TAB_ID,
  activeMolViewOf,
  molViewTabId,
  workspaceReducer as reduce,
  type WorkspaceState,
} from './workspaceReducer'

const open = (s: WorkspaceState, viewId: number, sceneId = 100, title = `Scene:${viewId}`) =>
  reduce(s, { type: 'openMolView', title, viewId, sceneId })

describe('workspaceReducer', () => {
  it('starts with no tabs and no active tab (the WelcomePane empty state)', () => {
    expect(INITIAL_WORKSPACE).toEqual({ tabs: [], activeTabId: '' })
  })

  it('opening a molview adds its tab and makes it active; both ids ride the record', () => {
    const s = open(INITIAL_WORKSPACE, 10, 100, 'A:0')
    expect(s.tabs).toHaveLength(1)
    expect(s.activeTabId).toBe(molViewTabId(10))
    expect(activeMolViewOf(s)).toEqual({ viewId: 10, sceneId: 100 })
  })

  it('re-opening an existing view only activates it', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    const again = open(s, 10)
    expect(again.tabs).toBe(s.tabs)
    expect(again.activeTabId).toBe(molViewTabId(10))
  })

  it('activateView resolves by view id and is a no-op for a view without a tab', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    s = reduce(s, { type: 'activateView', viewId: 10 })
    expect(activeMolViewOf(s)?.viewId).toBe(10)
    // Unknown: same state object, nothing thrown.
    expect(reduce(s, { type: 'activateView', viewId: 999 })).toBe(s)
  })

  it('a non-molview tab in front means no active scene, with the entries kept', () => {
    let s = open(INITIAL_WORKSPACE, 10, 100)
    s = open(s, 20, 100)
    s = reduce(s, { type: 'openSettings' })
    expect(activeMolViewOf(s)).toBeUndefined()
    expect(s.tabs.filter((t) => t.type === 'molview')).toHaveLength(2)
    // Coming back re-activates it.
    s = reduce(s, { type: 'activateView', viewId: 10 })
    expect(activeMolViewOf(s)).toEqual({ viewId: 10, sceneId: 100 })
  })

  it('close then activateView in the same tick does not throw (the window-close sweep)', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    s = reduce(s, { type: 'close', id: molViewTabId(20) })
    expect(() => reduce(s, { type: 'activateView', viewId: 20 })).not.toThrow()
    expect(s.tabs).toHaveLength(1)
  })

  it('closing the active tab activates the last remaining one, or nothing', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    s = reduce(s, { type: 'activate', id: molViewTabId(10) })
    s = reduce(s, { type: 'close', id: molViewTabId(10) })
    expect(s.activeTabId).toBe(molViewTabId(20))
    s = reduce(s, { type: 'close', id: molViewTabId(20) })
    expect(s).toEqual({ tabs: [], activeTabId: '' })
  })

  it('closing an inactive tab leaves the active one alone', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    s = reduce(s, { type: 'close', id: molViewTabId(10) })
    expect(s.activeTabId).toBe(molViewTabId(20))
  })

  it('opens the Settings tab once and re-activates it afterwards', () => {
    let s = reduce(INITIAL_WORKSPACE, { type: 'openSettings' })
    expect(s.tabs.filter((t) => t.type === 'settings')).toHaveLength(1)
    expect(s.activeTabId).toBe(SETTINGS_TAB_ID)
    s = open(s, 10)
    expect(s.activeTabId).not.toBe(SETTINGS_TAB_ID)
    s = reduce(s, { type: 'openSettings' })
    expect(s.tabs.filter((t) => t.type === 'settings')).toHaveLength(1)
    expect(s.activeTabId).toBe(SETTINGS_TAB_ID)
  })

  it('setMolViewTitle rewrites only the matching tab, and is a no-op without a change', () => {
    let s = open(INITIAL_WORKSPACE, 10, 100, 'Old:0')
    s = open(s, 20, 100, 'Keep:0')
    const renamed = reduce(s, { type: 'setMolViewTitle', viewId: 10, title: 'New:0' })
    expect(renamed.tabs.map((t) => t.title)).toEqual(['New:0', 'Keep:0'])
    // Same object proves no churn for an unchanged title or an unknown view.
    expect(reduce(renamed, { type: 'setMolViewTitle', viewId: 10, title: 'New:0' })).toBe(renamed)
    expect(reduce(renamed, { type: 'setMolViewTitle', viewId: 999, title: 'Nope' })).toBe(renamed)
  })

  it('reorder moves a tab before or after its target', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    s = open(s, 20)
    s = open(s, 30)
    const ids = (x: WorkspaceState) => x.tabs.map((t) => t.viewId)
    expect(ids(reduce(s, { type: 'reorder', fromId: molViewTabId(10), toId: molViewTabId(30), insertAfter: false }))).toEqual([20, 10, 30])
    expect(ids(reduce(s, { type: 'reorder', fromId: molViewTabId(10), toId: molViewTabId(30), insertAfter: true }))).toEqual([20, 30, 10])
    expect(reduce(s, { type: 'reorder', fromId: molViewTabId(10), toId: molViewTabId(10), insertAfter: false })).toBe(s)
  })

  it('returns the same state for every no-op, so subscribers do not re-render', () => {
    let s = open(INITIAL_WORKSPACE, 10)
    expect(reduce(s, { type: 'activate', id: molViewTabId(10) })).toBe(s)
    expect(reduce(s, { type: 'activate', id: 'nope' })).toBe(s)
    expect(reduce(s, { type: 'close', id: 'nope' })).toBe(s)
    s = reduce(s, { type: 'openSettings' })
    expect(reduce(s, { type: 'openSettings' })).toBe(s)
  })
})
