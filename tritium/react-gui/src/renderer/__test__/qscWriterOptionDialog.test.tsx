/**
 * Pins the QDF0 disable rule from UXP qscwriter-option-dlg.js:34-49 -- when
 * the user picks "Ver 2.2 or later" (QDF0), the OK action MUST coerce
 * `compress` to "none" and `base64` to false regardless of the (disabled)
 * UI state. This guarantees a downstream SceneXMLWriter is never asked to
 * write a QDF0 file with QDF1-only options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

import { QscWriterOptionDialog, type QscWriterOptions } from '../components/dialogs/QscWriterOptionDialog'
import { mountTree, flushPromises } from './helpers/testHarness'

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement | null {
    const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
    return buttons.find((b) => (b.textContent ?? '').trim() === text) ?? null
}

function findSelectByLabel(root: ParentNode, label: string): HTMLSelectElement | null {
    // FormGroup renders <label>; the next select element in the FormGroup's
    // content area is the one we want.
    const labels = Array.from(root.querySelectorAll('label')) as HTMLLabelElement[]
    for (const lab of labels) {
        if ((lab.textContent ?? '').trim().startsWith(label)) {
            const fg = lab.closest('.bp5-form-group')
            const sel = fg?.querySelector('select') as HTMLSelectElement | null
            if (sel) return sel
        }
    }
    return null
}

describe('QscWriterOptionDialog (UXP parity)', () => {
    let captured: QscWriterOptions | null
    let resolved: boolean

    beforeEach(() => {
        captured = null
        resolved = false
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mount() {
        return mountTree(
            React.createElement(QscWriterOptionDialog, {
                visible: true,
                onConfirm: (r: QscWriterOptions) => {
                    captured = r
                    resolved = true
                },
                onCancel: () => {
                    resolved = true
                },
            }),
        )
    }

    it('defaults to QDF0 with embedAll=false and forces compress=none / base64=false on OK', async () => {
        const handle = mount()
        await flushPromises()

        const ok = findButtonByText(document.body, 'OK')
        expect(ok).toBeTruthy()
        ok!.click()
        await flushPromises()

        expect(resolved).toBe(true)
        expect(captured).toEqual({
            embedAll: false,
            version: 'QDF0',
            compress: 'none',
            base64: false,
        })
        handle.unmount()
    })

    it('switches to QDF1 and passes through compress / base64 selections', async () => {
        const handle = mount()
        await flushPromises()

        const versionSelect = findSelectByLabel(document.body, 'Compatibility')
        expect(versionSelect).toBeTruthy()

        // Pick QDF1.
        await act(async () => {
            versionSelect!.value = 'QDF1'
            versionSelect!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flushPromises()

        // Pick gzip compression.
        const compressSelect = findSelectByLabel(document.body, 'Compression')
        expect(compressSelect).toBeTruthy()
        expect(compressSelect!.disabled).toBe(false)
        await act(async () => {
            compressSelect!.value = 'gzip'
            compressSelect!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flushPromises()

        const ok = findButtonByText(document.body, 'OK')
        ok!.click()
        await flushPromises()

        expect(captured).toEqual({
            embedAll: false,
            version: 'QDF1',
            compress: 'gzip',
            base64: false,
        })
        handle.unmount()
    })

    it('disables compress / base64 when version is QDF0', async () => {
        const handle = mount()
        await flushPromises()

        const compressSelect = findSelectByLabel(document.body, 'Compression')
        expect(compressSelect).toBeTruthy()
        expect(compressSelect!.disabled).toBe(true)
        handle.unmount()
    })
})
