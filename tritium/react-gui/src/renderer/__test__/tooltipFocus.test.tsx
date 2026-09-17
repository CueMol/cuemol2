/**
 * @file __test__/tooltipFocus.test.tsx
 * @description The kit tooltip hands Blueprint a hover-only configuration.
 *
 * Blueprint opens a tooltip when its target takes focus as well
 * (`openOnTargetFocus`, default true). A toolbar button that opens a dialog
 * gets the focus back when the dialog closes, so the tooltip appeared on its
 * own with the pointer nowhere near it -- reported for the Camera pane's New
 * button and the scene tree's Add button. The behaviour itself cannot be
 * driven in jsdom (Blueprint opens after `hoverOpenDelay`), so what is pinned
 * here is the prop that switches it off.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'

void React

const bpProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }))
vi.mock('@blueprintjs/core', () => ({
    Tooltip: (props: Record<string, unknown>) => {
        bpProps.last = props
        return null
    },
}))

import { Tooltip } from '@renderer/h3-kit/primitives/Tooltip'
import { mountTree } from './helpers/testHarness'

describe('h3-kit Tooltip', () => {
    it('turns off Blueprint open-on-focus so only hover shows it', () => {
        const { unmount } = mountTree(
            <Tooltip content="Add camera">
                <button type="button">+</button>
            </Tooltip>,
        )
        expect(bpProps.last).toMatchObject({
            content: 'Add camera',
            openOnTargetFocus: false,
            compact: true,
            placement: 'bottom',
        })
        unmount()
    })
})
