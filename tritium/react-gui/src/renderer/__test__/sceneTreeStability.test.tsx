/**
 * @file __test__/sceneTreeStability.test.tsx
 * @description The scene-tree bundle holds its identity.
 *
 * `SceneTreeProvider` derives both of its contexts from this one object and
 * the rows are memo'd against them, so a re-render that changes nothing must
 * hand back the same bundle -- and the same `selectedHasOps` inside it.
 * Returning a fresh object each render would re-render every row on any
 * render of the provider, which is what the memo boundaries added in the
 * shell work exist to prevent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { useState } from 'react'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import { useSceneTree, type UseSceneTreeResult } from '../hooks/useSceneTree'

void React

const tree = {
  id: 1, type: 'scene', name: 'S', className: '', visible: true, locked: false,
  uiCollapsed: false, uiOrder: 0, effectiveVisible: true,
  children: [
    { id: 10, type: 'object', name: 'mol', className: 'MolCoord', visible: true, locked: false, uiCollapsed: false, uiOrder: 0, effectiveVisible: true, children: [] },
  ],
}

// useLiveFetch's own result is stable (its refetch is a useCallback), so the
// stand-in has to be too -- otherwise this would measure the mock.
const live = vi.hoisted(() => ({ refetch: () => undefined }))
vi.mock('@renderer/hooks/cuemol/useLiveFetch', () => ({
  useLiveFetch: () => ({ state: tree, refetch: live.refetch, loading: false }),
}))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
  useCueMolEventListener: () => undefined,
}))

function mount() {
  let result!: UseSceneTreeResult
  let rerender!: () => void
  const Probe: React.FC = () => {
    const [, setTick] = useState(0)
    rerender = () => act(() => setTick((t) => t + 1))
    result = useSceneTree({ cm: null, sceneId: 1 })
    return null
  }
  const { unmount } = mountTree(<Probe />)
  return { get result() { return result }, rerender, unmount }
}

beforeEach(() => vi.clearAllMocks())

describe('useSceneTree result identity', () => {
  it('hands back the same bundle when nothing changed', () => {
    const h = mount()
    const first = h.result
    const firstOps = h.result.selectedHasOps
    h.rerender()
    expect(h.result).toBe(first)
    expect(h.result.selectedHasOps).toBe(firstOps)
    h.unmount()
  })

  it('hands back a new bundle when the selection changes', () => {
    const h = mount()
    const first = h.result
    act(() => h.result.setSelectedId('10'))
    expect(h.result).not.toBe(first)
    expect(h.result.selectedId).toBe('10')
    // ... and holds again from there.
    const second = h.result
    h.rerender()
    expect(h.result).toBe(second)
    h.unmount()
  })
})
