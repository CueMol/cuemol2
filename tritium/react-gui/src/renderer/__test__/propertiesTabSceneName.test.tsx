/**
 * @file __test__/propertiesTabSceneName.test.tsx
 * @description Pins the scene-name editability rule of the Properties tab:
 * Scene.name is a read-only C++ property (the worker reports `readonly: true`),
 * yet the Properties tab presents its Basic-settings Name field as editable
 * (the write is routed through Scene::setName by setGenericProp). The
 * scene-specific override lives only in the Properties tab -- a non-scene node
 * with a read-only name stays read-only, and the Generic tab is unaffected.
 */

import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { PropertiesTab } from '@renderer/features/inspector/PropertiesTab'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

/**
 * Expand the named accordion section if it is currently collapsed. The Scene
 * Properties tab opens "Ambient occlusion" first, so "Basic settings" (which
 * holds Name) starts collapsed and its body is unmounted until expanded.
 */
function ensureExpanded(container: HTMLElement, title: string): void {
  const section = Array.from(container.querySelectorAll('.insp-accordion')).find(
    (s) => s.querySelector('.insp-accordion-title')?.textContent === title,
  )
  if (section && !section.classList.contains('expanded')) {
    act(() => (section.querySelector('.insp-accordion-header') as HTMLElement).click())
  }
}

function nameEntry(value: string): GenericPropEntry {
  return {
    key: 'name',
    type: 'string',
    value,
    readonly: true, // honest C++ flag for Scene.name
    hasdefault: false,
    isdefault: false,
    isContainer: false,
    depth: 0,
  } as GenericPropEntry
}

/** Find the rendered Name <input> by its value. */
function nameInput(container: HTMLElement, value: string): HTMLInputElement | undefined {
  return Array.from(container.querySelectorAll('input')).find(
    (i) => (i as HTMLInputElement).value === value,
  ) as HTMLInputElement | undefined
}

describe('PropertiesTab scene-name editability', () => {
  it('renders the Scene Name field editable even though the entry is readonly', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[nameEntry('My Scene')]}
        rendererType="Scene"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    ensureExpanded(container, 'Basic settings')
    const input = nameInput(container, 'My Scene')
    expect(input).toBeDefined()
    expect(input!.readOnly).toBe(false)
    unmount()
  })

  it('leaves a non-scene readonly name field read-only (override is scene-only)', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[nameEntry('rend1')]}
        rendererType="ribbon"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    ensureExpanded(container, 'Basic settings')
    const input = nameInput(container, 'rend1')
    expect(input).toBeDefined()
    expect(input!.readOnly).toBe(true)
    unmount()
  })
})
