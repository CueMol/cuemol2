import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, flushPromises } from './helpers/testHarness'

void React

/**
 * Wire-contract tests for the reusable `CueColorField` adapter.
 *
 * Pins:
 *   - it forwards the ambient `ColorPickerProvider` cm / sceneId to the
 *     underlying ColorPicker (so callers need no prop threading)
 *   - it commits to `onCommit` only on a completed change (`completed=true`
 *     AND a different value); live drags and no-op commits are swallowed
 *   - it passes the optional `modes` allow-list straight through
 *
 * The ColorPicker is mocked to a stub that captures its props, so the test
 * isolates CueColorField's adapter logic from the widget internals.
 */

let captured: {
    value?: string
    cm?: unknown
    sceneId?: number
    modes?: string[]
    onChange?: (value: string, completed: boolean) => void
} = {}

vi.mock('../h3-kit/colorpicker/ColorPicker', () => ({
    ColorPicker: (props: typeof captured) => {
        captured = props
        return React.createElement('div', { className: 'h3-color-stub' })
    },
}))

import { CueColorField, ColorPickerProvider } from '@renderer/h3-kit/colorpicker'

describe('CueColorField', () => {
    it('forwards provider cm / sceneId and the modes allow-list', async () => {
        const cm = { invokeService: vi.fn() }
        const { unmount } = mountTree(
            <ColorPickerProvider cm={cm as never} sceneId={7}>
                <CueColorField
                    value="#0000FF"
                    onCommit={vi.fn()}
                    modes={['rgb', 'hsb', 'palette']}
                />
            </ColorPickerProvider>,
        )
        await act(async () => {
            await flushPromises()
        })
        expect(captured.cm).toBe(cm)
        expect(captured.sceneId).toBe(7)
        expect(captured.value).toBe('#0000FF')
        expect(captured.modes).toEqual(['rgb', 'hsb', 'palette'])
        unmount()
    })

    it('commits only on a completed change to a different value', async () => {
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <ColorPickerProvider cm={null} sceneId={undefined}>
                <CueColorField value="#0000FF" onCommit={onCommit} />
            </ColorPickerProvider>,
        )
        await act(async () => {
            await flushPromises()
        })

        // Live drag (completed=false) -- swallowed.
        act(() => captured.onChange!('#00FF00', false))
        expect(onCommit).not.toHaveBeenCalled()

        // Completed but unchanged value -- swallowed.
        act(() => captured.onChange!('#0000FF', true))
        expect(onCommit).not.toHaveBeenCalled()

        // Completed change -- committed once.
        act(() => captured.onChange!('#00FF00', true))
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('#00FF00')
        unmount()
    })
})
