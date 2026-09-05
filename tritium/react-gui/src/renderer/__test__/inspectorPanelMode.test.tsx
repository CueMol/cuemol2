/**
 * @file __test__/inspectorPanelMode.test.tsx
 * @description Pins when the inspector returns to a target's default tab: on
 * a new target, never on a rename. A rename committed from the Generic tab
 * used to switch the panel back to Properties and unmount the field being
 * edited, because the reset effect keyed on the header name.
 *
 * The tabs and the data providers are stubbed; only the mode logic is under
 * test.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

interface FakeTarget {
  kind: 'node'
  sceneId: number
  nodeId: number
  nodeType: string
}

const state = vi.hoisted(() => ({
  target: null as FakeTarget | null,
  category: 'Renderer group',
  header: { name: 'grp1', type: 'rendGroup' },
  entries: [] as unknown[],
  molId: null,
  loading: false,
}))
// The panel is memoised with no props, so a re-render has to come from the
// hook it reads: the stub is a tiny store that the test pokes.
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    listeners,
    notify: () => listeners.forEach((l) => l()),
  }
})
const actions = vi.hoisted(() => ({
  setProp: vi.fn(),
  setMany: vi.fn(),
  resetProp: vi.fn(),
  resetMany: vi.fn(),
  close: vi.fn(),
  clearAnimElement: vi.fn(),
  setAnimHeader: vi.fn(),
}))

vi.mock('@renderer/state/inspector', async () => {
  const R = await import('react')
  return {
    useInspector: () => {
      const [, force] = R.useReducer((x: number) => x + 1, 0)
      R.useEffect(() => {
        store.listeners.add(force)
        return () => {
          store.listeners.delete(force)
        }
      }, [force])
      return state
    },
    useInspectorActions: () => actions,
  }
})
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: false, cm: null }),
}))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ activeSceneId: 1, activeMolViewId: undefined }),
}))
vi.mock('@renderer/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('@renderer/h3-kit/colorpicker', () => ({
  ColorPickerProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@renderer/features/inspector/PropertiesTab', () => ({
  PropertiesTab: () => <div data-testid="properties-tab" />,
}))
vi.mock('@renderer/features/inspector/GenericTab', () => ({
  GenericTab: () => <div data-testid="generic-tab" />,
}))

import { InspectorPanel } from '@renderer/features/inspector/InspectorPanel'

void React

const segment = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll('.inspector-mode-bar button, .inspector-mode-bar label')).find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLElement

const showing = (container: HTMLElement) =>
  container.querySelector('[data-testid="generic-tab"]') ? 'generic' : 'properties'

describe('InspectorPanel tab mode', () => {
  beforeEach(() => {
    state.target = { kind: 'node', sceneId: 1, nodeId: 12, nodeType: 'rendGroup' }
    state.header = { name: 'grp1', type: 'rendGroup' }
  })

  it('keeps the Generic tab open across a rename of the same target', () => {
    const view = mountTree(<InspectorPanel />)
    expect(showing(view.container)).toBe('properties')
    act(() => segment(view.container, 'Generic').click())
    expect(showing(view.container)).toBe('generic')

    act(() => {
      state.header = { name: 'grp2', type: 'rendGroup' }
      store.notify()
    })
    expect(showing(view.container)).toBe('generic')
    view.unmount()
  })

  it('returns to the default tab when a different node is selected', () => {
    const view = mountTree(<InspectorPanel />)
    act(() => segment(view.container, 'Generic').click())
    expect(showing(view.container)).toBe('generic')

    act(() => {
      state.target = { kind: 'node', sceneId: 1, nodeId: 13, nodeType: 'rendGroup' }
      state.header = { name: 'grp3', type: 'rendGroup' }
      store.notify()
    })
    expect(showing(view.container)).toBe('properties')
    view.unmount()
  })
})
