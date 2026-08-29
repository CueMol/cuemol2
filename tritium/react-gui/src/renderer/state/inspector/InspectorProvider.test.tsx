/**
 * @file state/inspector/InspectorProvider.test.tsx
 * @description Contract tests for the inspector provider: the worker
 * service calls it issues, View / scene targeting, the per-scene memory that
 * keeps it in sync across content-tab switches, and that its actions keep
 * their identity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { flushPromises, mountTree } from '../../__test__/helpers/testHarness'
import { LayoutProvider } from '../layout'
import { SEM_OBJECT, SEM_RENDERER, SEM_SCENE, SEM_VIEW, SEM_PROPCHG } from '../../event'
import { InspectorProvider, useInspector, useInspectorActions, type InspectorActions, type InspectorState } from './InspectorProvider'

void React

const scene = vi.hoisted(() => ({ activeSceneId: 1 as number | undefined }))
const env = vi.hoisted(() => ({ cm: null as unknown }))

vi.mock('../../hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm: env.cm, cueMolReady: true }) }))
vi.mock('../workspace', () => ({
  useActiveScene: () => ({ activeSceneId: scene.activeSceneId, activeMolViewId: 5, hasScene: true }),
}))
const listener = vi.hoisted(() => ({ opts: null as Record<string, unknown> | null }))
vi.mock('../../hooks/cuemol/useCueMolEventListener', () => ({
  useCueMolEventListener: (opts: Record<string, unknown>) => { listener.opts = opts },
}))

function makeCm() {
  return {
    invokeService: vi.fn((name: string) => {
      if (name === 'getGenericProps') {
        return Promise.resolve({ ok: true, entries: [], displayName: 'ribbon1', typeLabel: 'ribbon' })
      }
      return Promise.resolve({ ok: true, entries: [] })
    }),
  }
}

interface Handle {
  readonly state: InspectorState
  readonly actions: InspectorActions
  /** Simulate a content-tab switch (or, with undefined, closing the last tab). */
  switchScene(id: number | undefined): Promise<void>
  unmount(): void
}

function mount(): Handle {
  let state!: InspectorState
  let actions!: InspectorActions
  const Probe: React.FC = () => {
    state = useInspector()
    actions = useInspectorActions()
    return null
  }
  const tree = () => (
    <LayoutProvider>
      <InspectorProvider>
        <Probe />
      </InspectorProvider>
    </LayoutProvider>
  )
  const { root, unmount } = mountTree(tree())
  return {
    get state() { return state },
    get actions() { return actions },
    async switchScene(id) {
      scene.activeSceneId = id
      await act(async () => {
        root.render(tree())
        await flushPromises()
      })
    },
    unmount,
  }
}

async function settle(): Promise<void> {
  await act(async () => { await flushPromises() })
}

const RIBBON = { kind: 'node', sceneId: 1, nodeId: 5, nodeType: 'renderer' } as const

let cm: ReturnType<typeof makeCm>
beforeEach(() => {
  cm = makeCm()
  env.cm = cm
  scene.activeSceneId = 1
})

describe('InspectorProvider', () => {
  it('showNode fetches the props for the target and opens the panel', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    expect(cm.invokeService).toHaveBeenCalledWith('getGenericProps', { sceneId: 1, nodeId: 5, nodeType: 'renderer' })
    expect(h.state.open).toBe(true)
    expect(h.state.category).toBe('Renderer')
    expect(h.state.header).toEqual({ name: 'ribbon1', type: 'ribbon' })
    h.unmount()
  })

  it('showView targets the active View by view id; showScene the scene by its uid', async () => {
    const h = mount()
    act(() => h.actions.showView(42))
    await settle()
    expect(h.state.target).toEqual({ kind: 'node', sceneId: 1, nodeId: 42, nodeType: 'view' })
    expect(cm.invokeService).toHaveBeenCalledWith('getGenericProps', { sceneId: 1, nodeId: 42, nodeType: 'view' })
    act(() => h.actions.showScene(1))
    await settle()
    expect(h.state.target).toEqual({ kind: 'node', sceneId: 1, nodeId: 1, nodeType: 'scene' })
    expect(h.state.category).toBe('Scene')
    h.unmount()
  })

  it('writes go through the property bridge against the current target', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    cm.invokeService.mockClear()

    await act(() => h.actions.setProp('alpha', 'real', 0.5))
    expect(cm.invokeService).toHaveBeenCalledWith('setGenericProp', {
      sceneId: 1, nodeId: 5, nodeType: 'renderer',
      propName: 'alpha', op: 'set', valueType: 'real', value: 0.5,
    })
    await act(() => h.actions.resetProp('alpha'))
    expect(cm.invokeService).toHaveBeenCalledWith('setGenericProp', {
      sceneId: 1, nodeId: 5, nodeType: 'renderer', propName: 'alpha', op: 'reset', valueType: '',
    })
    await act(() => h.actions.resetMany(['alpha', 'visible']))
    expect(cm.invokeService).toHaveBeenCalledWith('resetGenericProps', {
      sceneId: 1, nodeId: 5, nodeType: 'renderer', propNames: ['alpha', 'visible'],
    })
    cm.invokeService.mockClear()
    await act(() => h.actions.resetMany([]))
    await act(() => h.actions.setMany([]))
    expect(cm.invokeService).not.toHaveBeenCalled()
    h.unmount()
  })

  it('remembers the inspected target per scene across tab switches', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    expect(h.state.target).toMatchObject({ sceneId: 1, nodeId: 5 })

    // Scene 2 was never inspected: nothing to show.
    await h.switchScene(2)
    expect(h.state.target).toBeNull()

    // Back to scene 1: its target comes back.
    await h.switchScene(1)
    expect(h.state.target).toEqual(RIBBON)
    h.unmount()
  })

  it('clears the target and the property data when the active scene closes', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    await h.switchScene(undefined)
    expect(h.state.target).toBeNull()
    expect(h.state.entries).toEqual([])
    expect(h.state.header).toEqual({ name: '', type: '' })
    h.unmount()
  })

  it('close drops the target, the open flag and the per-scene memory', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    act(() => h.actions.close())
    expect(h.state.open).toBe(false)
    expect(h.state.target).toBeNull()
    await h.switchScene(2)
    await h.switchScene(1)
    expect(h.state.target).toBeNull()
    h.unmount()
  })

  it('the actions keep their identity while the target changes', async () => {
    const h = mount()
    const first = h.actions
    act(() => h.actions.showNode(RIBBON))
    await settle()
    expect(h.actions).toBe(first)
    h.unmount()
  })
})

describe('InspectorProvider - animation elements', () => {
  it('an anim element is an Animation target with no generic fetch; its header comes from the inspector', async () => {
    const h = mount()
    act(() => h.actions.showAnimElement(1, 42))
    await settle()
    expect(h.state.target).toEqual({ kind: 'animElement', sceneId: 1, uid: 42 })
    expect(h.state.category).toBe('Animation')
    expect(cm.invokeService).not.toHaveBeenCalledWith('getGenericProps', expect.anything())
    act(() => h.actions.setAnimHeader('fade1', 'Fade'))
    expect(h.state.header).toEqual({ name: 'fade1', type: 'Fade' })
    h.unmount()
  })

  it('clearAnimElement leaves a coexisting node target untouched', async () => {
    const h = mount()
    act(() => h.actions.showNode(RIBBON))
    await settle()
    act(() => h.actions.clearAnimElement(1))
    expect(h.state.target?.kind).toBe('node')
    act(() => h.actions.showAnimElement(1, 42))
    act(() => h.actions.clearAnimElement(1))
    expect(h.state.target).toBeNull()
    h.unmount()
  })
})

// A View is not a scene-graph node: `View::fireViewEvent` emits SEM_VIEW,
// so the scene-graph mask alone never refetched it and the View page went
// stale until it was reopened.
describe('InspectorProvider - live sync subscription', () => {
  it('follows the View through SEM_VIEW, and a scene-graph row through its own mask', async () => {
    const h = mount()
    act(() => h.actions.showView(42))
    await settle()
    expect(listener.opts).toMatchObject({
      enabled: true,
      srcMask: SEM_VIEW,
      evtMask: SEM_PROPCHG,
      category: 'viewPropChanged',
      // Scoped by the scene the view belongs to (ev.setSource(m_nSceneID)).
      scopeId: 1,
    })

    act(() => h.actions.showNode(RIBBON))
    await settle()
    expect(listener.opts).toMatchObject({
      enabled: true,
      srcMask: SEM_OBJECT | SEM_RENDERER | SEM_SCENE,
      evtMask: SEM_PROPCHG,
      category: '',
      scopeId: 1,
    })
    h.unmount()
  })

  it('does not subscribe for an animation element (it owns its SEM_ANIM listener)', async () => {
    const h = mount()
    act(() => h.actions.showAnimElement(1, 42))
    await settle()
    expect(listener.opts).toMatchObject({ enabled: false })
    h.unmount()
  })
})
