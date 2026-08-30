/**
 * Behavior tests for the Output-panel log API (contexts/LogContext.tsx).
 *
 * Pins the two guarantees consumers rely on:
 *   1. appendLine / append / clear mutate the shared buffer that
 *      useLogContents() exposes (renderer-side logging without C++).
 *   2. useLogActions() identities are stable across buffer growth, so a
 *      write-only consumer (e.g. the memoized WebGL MolViewPane) is not forced
 *      to re-render every time a log line lands.
 */
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

// LogProvider pulls in useLogEvent -> useCueMol; stub the CueMol layer so the
// provider mounts without a real worker (no core log events in this test).
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cueMolReady: false, cm: null }) }))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({ useCueMolEventListener: () => {} }))

import { LogProvider, useLogActions, useLogContents } from '@renderer/contexts/LogContext'

void React
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function mount(node: React.ReactElement): { root: Root; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(<LogProvider>{node}</LogProvider>)
  })
  return { root, unmount() { act(() => root.unmount()); document.body.removeChild(container) } }
}

describe('LogContext', () => {
  it('appendLine / append feed the buffer that useLogContents exposes', () => {
    let actions!: ReturnType<typeof useLogActions>
    let contents = ''
    const Probe: React.FC = () => {
      actions = useLogActions()
      contents = useLogContents()
      return null
    }
    const h = mount(<Probe />)

    act(() => actions.appendLine('hello'))
    expect(contents).toBe('hello\n')
    act(() => actions.append('raw'))
    expect(contents).toBe('hello\nraw')
    act(() => actions.clear())
    expect(contents).toBe('')
    h.unmount()
  })

  it('useLogActions identity is stable across buffer growth (write-only stays memo-safe)', () => {
    const seen: Array<ReturnType<typeof useLogActions>> = []
    let actions!: ReturnType<typeof useLogActions>
    const Writer: React.FC = () => {
      actions = useLogActions()
      seen.push(actions)
      return null
    }
    // A separate subscriber to contents forces provider re-renders on append.
    const Reader: React.FC = () => {
      useLogContents()
      return null
    }
    const h = mount(<><Writer /><Reader /></>)

    const firstCount = seen.length
    act(() => actions.appendLine('a'))
    act(() => actions.appendLine('b'))
    // The actions object is referentially stable, so even though the buffer
    // (and Reader) changed, every captured actions ref is the same object.
    expect(seen.every((a) => a === seen[0])).toBe(true)
    // Writer may or may not re-render, but if it did, it saw the same object.
    expect(seen.length).toBeGreaterThanOrEqual(firstCount)
    h.unmount()
  })

  it('throws when the hooks are used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad: React.FC = () => { useLogActions(); return null }
    expect(() => {
      const container = document.createElement('div')
      act(() => { createRoot(container).render(<Bad />) })
    }).toThrow(/useLogActions must be used within LogProvider/)
    spy.mockRestore()
  })
})
