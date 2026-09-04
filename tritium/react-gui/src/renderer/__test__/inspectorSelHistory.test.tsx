/**
 * @file __test__/inspectorSelHistory.test.tsx
 * @description Pins that the inspector records a selection-typed property
 * write in the shared selection history only when the worker accepted it,
 * and never records other property types. One provider-level hook covers
 * every selection row (sel / anchor_sel / showsel / bndry_sel).
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const mockCm = vi.hoisted(() => ({
  invokeService: vi.fn(),
}))
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
  useCueMolEventListener: () => undefined,
}))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ activeSceneId: 1, activeMolViewId: undefined }),
}))
vi.mock('@renderer/state/layout', () => ({
  useLayout: () => ({ inspectorOpen: true }),
  useLayoutDispatch: () => ({ setInspectorOpen: () => undefined }),
}))

import { InspectorProvider, useInspectorActions } from '@renderer/state/inspector/InspectorProvider'
import type { InspectorActions } from '@renderer/state/inspector/InspectorProvider'
import { clearHistory, getHistory } from '@renderer/h3-kit/MolSelList'

void React

let actions: InspectorActions | null = null
const Probe: React.FC = () => {
  actions = useInspectorActions()
  return null
}

describe('InspectorProvider -- selection history', () => {
  beforeEach(() => {
    clearHistory()
    actions = null
    mockCm.invokeService.mockReset()
  })

  it('records a MolSelection write only when the worker accepted it', async () => {
    let accept = true
    mockCm.invokeService.mockImplementation((name: string) => {
      if (name === 'getGenericProps') {
        return Promise.resolve({ ok: true, entries: [], displayName: 'r', typeLabel: 'Renderer' })
      }
      if (name === 'setGenericProp') return Promise.resolve({ ok: accept, entries: [] })
      return Promise.resolve(null)
    })
    const handle = mountTree(
      <InspectorProvider>
        <Probe />
      </InspectorProvider>,
    )
    await flushPromises()
    act(() => {
      actions!.showNode({ kind: 'node', sceneId: 1, nodeId: 5, nodeType: 'renderer' })
    })
    await flushPromises()

    await act(async () => {
      await actions!.setProp('sel', 'object<MolSelection>$', "c;'A'")
    })
    // A non-selection type is never recorded.
    await act(async () => {
      await actions!.setProp('name', 'string', 'ribbon2')
    })
    // A rejected selection write is not recorded either.
    accept = false
    await act(async () => {
      await actions!.setProp('sel', 'object<MolSelection>$', 'bogus')
    })
    expect(getHistory()).toEqual(["c;'A'"])
    handle.unmount()
  })
})
