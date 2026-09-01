/**
 * @file __test__/propertiesTabSceneFlat.test.tsx
 * @description Pins how the Properties tab lays its sections out: the Scene
 * page shows every section expanded under a plain heading, while a renderer
 * page keeps the exclusive accordion.
 *
 * The Scene page is short enough (a name plus four small categories) that
 * collapsing costs a click per setting and saves no room, and its categories
 * still have to read as categories -- so the headings stay and only the
 * collapsing goes. A renderer page can be very long, so it keeps one section
 * open at a time.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { PropertiesTab } from '@renderer/features/inspector/PropertiesTab'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

function entry(key: string, type: string, value: unknown): GenericPropEntry {
  return {
    key, type, value,
    readonly: false, hasdefault: true, isdefault: true,
    isContainer: false, depth: 0,
  } as GenericPropEntry
}

/** Enough of a Scene for Basic settings + AO + AA + Background to render. */
const SCENE_ENTRIES = [
  entry('name', 'string', 'My Scene'),
  entry('aoEnabled', 'boolean', false),
  entry('aoRadius', 'real', 4),
  entry('aoSteps', 'integer', 3),
  entry('aoIntensity', 'real', 2.2),
  entry('aoHalfRes', 'boolean', false),
  entry('aa_method', 'enum', 'fxaa'),
  entry('aaJitterLevel', 'integer', 0),
  entry('bgcolor', 'color', '#000000'),
]

function sections(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.insp-accordion'))
}

function titles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
    (t) => t.textContent ?? '',
  )
}

describe('PropertiesTab section layout', () => {
  it('shows every Scene section expanded, with its heading kept', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={SCENE_ENTRIES}
        rendererType="Scene"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )

    const all = sections(container)
    expect(all.length).toBeGreaterThan(1)
    // Every section is expanded, so no setting is a click away...
    expect(all.every((s) => s.classList.contains('expanded'))).toBe(true)
    expect(all.every((s) => s.querySelector('.insp-accordion-body'))).toBe(true)
    // ...and none of them is clickable to collapse.
    expect(container.querySelectorAll('.insp-accordion-chevron').length).toBe(0)
    // The categories still read as categories.
    expect(titles(container)).toContain('Ambient occlusion')
    expect(titles(container)).toContain('Background')
    unmount()
  })

  it('keeps one-at-a-time accordions on a renderer page', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry('name', 'string', 'rend1'), entry('alpha', 'real', 1)]}
        rendererType="ribbon"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )

    expect(sections(container).filter((s) => s.classList.contains('expanded')).length).toBe(1)
    expect(container.querySelectorAll('.insp-accordion-chevron').length).toBeGreaterThan(0)
    unmount()
  })
})
