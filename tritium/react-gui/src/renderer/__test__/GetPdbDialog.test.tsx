/**
 * @file __test__/GetPdbDialog.test.tsx
 * @description Regression test for the Get PDB dialog's history affordance.
 *
 * The PDB-id field used to wire a native HTML5 <datalist>, whose dropdown is
 * drawn by the OS: it ignored the app's dark theme (always light), put its
 * chevron out of line with the Blueprint input, and could pop open on focus /
 * typing without the user clicking it. History is now shown only through a
 * themed, click-to-open Blueprint Popover (a chevron in the input's
 * rightElement). These tests pin that the native datalist is gone and the
 * themed chevron trigger is present and closed by default -- re-adding a
 * `<datalist>` / `list=` attr would reintroduce all three bugs.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

// Render the Blueprint Dialog body inline (no portal/overlay) so the field
// mounts deterministically for DOM inspection; keep every other export real.
vi.mock('@blueprintjs/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@blueprintjs/core')
  const InlineDialog = (props: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, props.children)
  return { ...actual, Dialog: InlineDialog }
})
vi.mock('@renderer/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }))
// Non-empty history so the chevron trigger is enabled.
vi.mock('@renderer/dialogs/pdbIdHistory', () => ({
  getHistory: () => ['1abc', '2xyz'],
}))

import { GetPdbDialog } from '@renderer/dialogs/GetPdbDialog'

void React

let tree: ReturnType<typeof mountTree>

beforeEach(() => {
  tree = mountTree(
    React.createElement(GetPdbDialog, { visible: true, onConfirm: () => {}, onCancel: () => {} }),
  )
})
afterEach(() => {
  tree.unmount()
})

describe('GetPdbDialog history affordance', () => {
  it('renders no native <datalist> (the themed popover replaces it)', () => {
    expect(tree.container.querySelector('datalist')).toBeNull()
  })

  it('does not wire a native list attribute on the id input', () => {
    const input = tree.container.querySelector('#get-pdb-id') as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input!.getAttribute('list')).toBeNull()
  })

  it('shows an enabled history chevron, with the popover closed by default', () => {
    const chevron = tree.container.querySelector(
      '[aria-label="Show PDB ID history"]',
    ) as HTMLButtonElement | null
    expect(chevron).not.toBeNull()
    expect(chevron!.disabled).toBe(false)
    // Closed initially: the history menu is not in the DOM until the chevron
    // is clicked (the native datalist used to auto-open on focus / typing).
    expect(tree.container.querySelector('.bp5-menu')).toBeNull()
  })
})
