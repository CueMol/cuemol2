/**
 * EditCameraVisFlagsDialog wiring contract (UXP `visflagset-edit-dlg` port).
 *
 * Pins: renders one row per entry, OK returns the (possibly edited) rows via
 * onConfirm, toggling Inc flips that row's `included`, and Cancel resolves null.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { EditCameraVisFlagsDialog } from '@renderer/dialogs/EditCameraVisFlagsDialog'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { VisFlagEntry } from '@renderer/worker/server/services/camera/cameraVisFlags'

function entries(): VisFlagEntry[] {
    return [
        { tgtId: 11, tgtName: '1CRN', isObj: true, included: true, visible: false },
        { tgtId: 21, tgtName: 'rend1', isObj: false, included: false, visible: true },
    ]
}

/** Blueprint Dialog portals to document.body; query there. */
function checkboxes(): HTMLInputElement[] {
    return Array.from(
        document.body.querySelectorAll('[role="table"] input[type="checkbox"]'),
    ) as HTMLInputElement[]
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent === 'OK',
    ) as HTMLButtonElement
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('EditCameraVisFlagsDialog', () => {
    it('renders a row per entry (Inc + Vis checkboxes each)', () => {
        const { unmount } = mountTree(
            <EditCameraVisFlagsDialog
                visible
                cameraName="cam1"
                entries={entries()}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        )
        // 2 rows x (Inc + Vis) = 4 checkboxes.
        expect(checkboxes()).toHaveLength(4)
        expect(document.body.textContent).toContain('1CRN')
        expect(document.body.textContent).toContain('rend1')
        unmount()
    })

    it('OK returns the rows unchanged when nothing is edited', () => {
        const onConfirm = vi.fn()
        const { unmount } = mountTree(
            <EditCameraVisFlagsDialog
                visible
                cameraName="cam1"
                entries={entries()}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />,
        )
        act(() => okButton().click())
        expect(onConfirm).toHaveBeenCalledWith({ entries: entries() })
        unmount()
    })

    it('toggling Inc on the second row flips its included flag on OK', () => {
        const onConfirm = vi.fn()
        const { unmount } = mountTree(
            <EditCameraVisFlagsDialog
                visible
                cameraName="cam1"
                entries={entries()}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />,
        )
        // checkboxes: [row1 Inc, row1 Vis, row2 Inc, row2 Vis].
        act(() => checkboxes()[2].click())
        act(() => okButton().click())
        const arg = onConfirm.mock.calls[0][0] as { entries: VisFlagEntry[] }
        expect(arg.entries[1].included).toBe(true)
        expect(arg.entries[0].included).toBe(true) // row 1 unchanged
        unmount()
    })

    it('Cancel resolves null', () => {
        const onCancel = vi.fn()
        const { unmount } = mountTree(
            <EditCameraVisFlagsDialog
                visible
                cameraName="cam1"
                entries={entries()}
                onConfirm={vi.fn()}
                onCancel={onCancel}
            />,
        )
        const cancel = Array.from(document.body.querySelectorAll('button')).find(
            (b) => b.textContent === 'Cancel',
        ) as HTMLButtonElement
        act(() => cancel.click())
        expect(onCancel).toHaveBeenCalled()
        unmount()
    })
})
