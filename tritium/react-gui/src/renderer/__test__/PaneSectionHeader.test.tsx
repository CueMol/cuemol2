import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'

void React

/**
 * Degrade-detection test for the shared PaneSectionHeader pane component.
 * Pins the observable contract the panes depend on when they migrate their
 * hand-rolled collapsible headers onto it:
 *   - the chevron icon flips between caretRight (collapsed) and caretDown
 *     (expanded) with the `collapsed` prop,
 *   - a click on the header fires `onToggleCollapse`,
 *   - optional `actions` render, and clicking inside them stops propagation
 *     so the header toggle is NOT triggered.
 *
 * AppIcon is mocked to surface its semantic `name` as a `data-icon`
 * attribute, giving a stable, library-agnostic assertion target for the
 * chevron flip (the real AppIcon resolves to a Phosphor/Blueprint glyph).
 */

vi.mock('@renderer/h3-kit/primitives', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) => (
    <span data-icon={name} className={className} />
  ),
}))

import { PaneSectionHeader } from '../components/panes/PaneSectionHeader'

function chevronName(container: HTMLElement): string | null {
  return container
    .querySelector('.section-chevron')
    ?.getAttribute('data-icon') ?? null
}

describe('PaneSectionHeader', () => {
  it('shows the caretDown chevron when expanded', () => {
    const { container, unmount } = mountTree(
      <PaneSectionHeader
        title="Color"
        icon="ui.tint"
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    )
    expect(chevronName(container)).toBe('ui.caretDown')
    unmount()
  })

  it('flips to the caretRight chevron when collapsed', () => {
    const { container, unmount } = mountTree(
      <PaneSectionHeader
        title="Color"
        icon="ui.tint"
        collapsed
        onToggleCollapse={vi.fn()}
      />,
    )
    expect(chevronName(container)).toBe('ui.caretRight')
    unmount()
  })

  it('fires onToggleCollapse when the header is clicked', () => {
    const onToggle = vi.fn()
    const { container, unmount } = mountTree(
      <PaneSectionHeader title="Color" icon="ui.tint" onToggleCollapse={onToggle} />,
    )
    const header = container.querySelector('.sp-section-header')!
    act(() => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onToggle).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('renders actions and stops their click from toggling the header', () => {
    const onToggle = vi.fn()
    const onAction = vi.fn()
    const { container, unmount } = mountTree(
      <PaneSectionHeader
        title="Mol Struct"
        icon="ui.git"
        onToggleCollapse={onToggle}
        actions={
          <button type="button" data-testid="act" onClick={onAction}>
            x
          </button>
        }
      />,
    )
    const actionBtn = container.querySelector('[data-testid="act"]')!
    expect(actionBtn).not.toBeNull()
    act(() => {
      actionBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onAction).toHaveBeenCalledTimes(1)
    // stopPropagation on the actions wrapper means the header toggle is silent.
    expect(onToggle).not.toHaveBeenCalled()
    unmount()
  })

  it('omits the chevron when onToggleCollapse is not provided', () => {
    const { container, unmount } = mountTree(
      <PaneSectionHeader title="Static" icon="ui.tint" />,
    )
    expect(container.querySelector('.section-chevron')).toBeNull()
    unmount()
  })
})
