/**
 * @file __test__/windowTitleSync.test.ts
 * @description Pins the window-title wire contract (UXP `setWindowTitle`).
 *
 * The title string itself is composed in main; what the renderer owes is the
 * subtitle, and these tests pin that: the active molview tab's title, an
 * empty string when nothing molview is active, and no redundant IPC when a
 * tab change leaves the subtitle alone.
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { TabData } from '@renderer/types'
import { useWindowTitleSync } from '@renderer/hooks/useWindowTitleSync'
import {
  mountTree,
  setupElectronAPI,
  teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'

void React

/** Probe component so each render can carry fresh props. */
const Probe: React.FC<{ tabs: TabData[]; activeTab: string }> = ({ tabs, activeTab }) => {
  useWindowTitleSync(tabs, activeTab)
  return null
}

const probe = (tabs: TabData[], activeTab: string): React.ReactElement =>
  React.createElement(Probe, { tabs, activeTab })

const molview = (id: string, title: string, viewId: number): TabData => ({
  id, title, icon: 'file.molview', type: 'molview', viewId,
})
const settings: TabData = {
  id: '__settings__', title: 'Settings', icon: 'file.settings', type: 'settings',
}

let api: ReturnType<typeof setupElectronAPI>

const titleCalls = (): unknown[] =>
  (api.invoke.mock.calls as unknown[][])
    .filter((c) => c[0] === IPC.WINDOW_SET_TITLE)
    .map((c) => c[1])

beforeEach(() => { api = setupElectronAPI() })
afterEach(() => { teardownElectronAPI() })

describe('useWindowTitleSync', () => {
  it('sends the active molview tab title as the subtitle', () => {
    const t = mountTree(probe([molview('m1', 'Untitled:0', 1)], 'm1'))

    expect(titleCalls()).toEqual([{ subtitle: 'Untitled:0' }])
    t.unmount()
  })

  it('sends an empty subtitle for a non-molview tab and for no tab at all', () => {
    // Settings tab active: UXP called setWindowTitle() with no argument, which
    // main renders as the bare product name.
    const t1 = mountTree(probe([settings], '__settings__'))
    expect(titleCalls()).toEqual([{ subtitle: '' }])
    t1.unmount()

    api.invoke.mockClear()

    const t2 = mountTree(probe([], ''))
    expect(titleCalls()).toEqual([{ subtitle: '' }])
    t2.unmount()
  })

  it('follows a rename of the active tab', () => {
    // useMolViewTabTitleSync rewrites the tab title on a scene rename; the
    // window title has to track it rather than freeze at tab-creation time.
    const t = mountTree(probe([molview('m1', 'Untitled:0', 1)], 'm1'))
    act(() => t.root.render(probe([molview('m1', 'Renamed:0', 1)], 'm1')))

    expect(titleCalls()).toEqual([
      { subtitle: 'Untitled:0' },
      { subtitle: 'Renamed:0' },
    ])
    t.unmount()
  })

  it('follows a tab switch', () => {
    const tabs = [molview('m1', 'First:0', 1), molview('m2', 'Second:0', 2)]
    const t = mountTree(probe(tabs, 'm1'))
    act(() => t.root.render(probe(tabs, 'm2')))

    expect(titleCalls()).toEqual([
      { subtitle: 'First:0' },
      { subtitle: 'Second:0' },
    ])
    t.unmount()
  })

  it('does not re-send when a tab change leaves the subtitle unchanged', () => {
    // Opening a second tab in the background rewrites `tabs`, but the active
    // subtitle is the same -- that must not cost an IPC round trip.
    const t = mountTree(probe([molview('m1', 'Untitled:0', 1)], 'm1'))
    expect(titleCalls()).toHaveLength(1)

    act(() =>
      t.root.render(
        probe([molview('m1', 'Untitled:0', 1), molview('m2', 'Second:0', 2)], 'm1'),
      ),
    )

    expect(titleCalls()).toHaveLength(1)
    t.unmount()
  })
})
