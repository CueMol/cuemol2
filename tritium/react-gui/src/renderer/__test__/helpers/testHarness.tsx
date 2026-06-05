/**
 * Shared test helpers for renderer-side Vitest tests.
 *
 * No @testing-library/react: we follow the project's existing convention of
 * driving React via `createRoot` + `act()` directly (see useActiveTool.test.ts
 * and MenuBar.test.tsx).
 */

import React from 'react'
import { vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderHookHandle<T> {
  readonly result: T
  rerender(): void
  unmount(): void
}

/**
 * Mount a hook in a throwaway component and expose its current return value.
 * Optionally wrap the test component in a Provider chain.
 */
export function makeRenderHook<T>(
  useHookFn: () => T,
  wrapper?: React.FC<{ children: React.ReactNode }>,
): RenderHookHandle<T> {
  let result!: T
  let root!: Root
  const container = document.createElement('div')
  document.body.appendChild(container)
  let unmounted = false

  const Probe: React.FC = () => {
    result = useHookFn()
    return null
  }

  const tree = wrapper
    ? React.createElement(wrapper, null, React.createElement(Probe))
    : React.createElement(Probe)

  act(() => {
    root = createRoot(container)
    root.render(tree)
  })

  return {
    get result() {
      return result
    },
    rerender() {
      act(() => {
        root.render(tree)
      })
    },
    unmount() {
      if (unmounted) return
      unmounted = true
      act(() => root.unmount())
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

/**
 * Mount a JSX tree under createRoot/act and return helpers to query / unmount.
 */
export function mountTree(node: React.ReactNode): {
  container: HTMLElement
  root: Root
  unmount(): void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(node as React.ReactElement)
  })
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount())
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

/**
 * Press-and-release a DragNumericField step arrow for a single step.
 *
 * The field steps on `mousedown` (starting a press) and commits on the global
 * `mouseup` that ends it -- it no longer reacts to a bare `click`. This drives a
 * quick single-step press: down then up, with no auto-repeat in between.
 */
export function pressStepArrow(button: HTMLElement): void {
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  })
  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup'))
  })
}

/**
 * Click an inspector accordion header by its title text to toggle it open.
 * Needed because the Properties tab accordions are an exclusive group (only one
 * open at a time), so a section other than the initially-open one must be
 * clicked before its body rows are in the DOM.
 */
export function openAccordion(container: HTMLElement, title: string): void {
  const header = Array.from(
    container.querySelectorAll('.insp-accordion-header'),
  ).find((h) => h.querySelector('.insp-accordion-title')?.textContent === title)
  if (!header) throw new Error(`accordion header not found: ${title}`)
  act(() => {
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/**
 * Install a mock window.electronAPI matching the post-B generic surface
 * (`invoke` + `onPush`) and return it for assertion / further mock.
 *
 * jsdom: window === globalThis. Mirrors the pattern used by MenuBar.test.tsx.
 */
export function setupElectronAPI(overrides: Record<string, unknown> = {}): Record<string, any> {
  const api: Record<string, any> = {
    platform: 'linux',
    invoke: vi.fn().mockResolvedValue(undefined),
    onPush: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

export function teardownElectronAPI(): void {
  delete (window as any).electronAPI
}

/** Yield to the microtask queue so awaited Promises settle inside act(). */
export async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
