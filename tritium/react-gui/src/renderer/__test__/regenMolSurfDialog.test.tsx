/**
 * RegenMolSurfDialog commit-wire contract.
 *
 * Pins the OBSERVABLE behaviour of the UXP "regeneration mode" port:
 *   - the target molecule / selection / probe radius arrive as pre-fetched
 *     props and are rendered READ-ONLY (only the density is editable, because
 *     `regenerateSES1` takes no other argument)
 *   - the density field is prefilled from `orig_den` and re-seeds when the
 *     dialog is reopened on a different surface (the provider keeps the
 *     component mounted across show/hide cycles)
 *   - OK calls invokeService('regenMolSurf', { sceneId, objId, density }) and
 *     resolves onConfirm({ ok: true }); {ok:false} shows .h3-dialog-error and
 *     does NOT resolve success
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

const invokeService = vi.fn()
const mockCm = { invokeService }

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { RegenMolSurfDialog } from '../components/dialogs/RegenMolSurfDialog'
import type { RegenMolSurfDialogResult } from '../components/dialogs/RegenMolSurfDialog'
import { mountTree, flushPromises } from './helpers/testHarness'

const BASE_PROPS = {
    sceneId: 7,
    objId: 42,
    objName: 'sf_1crn',
    origMol: '1crn',
    selStr: 'protein',
    density: 3,
    probeRadius: 1.4,
}

function routeInvoke(commit: () => unknown): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'regenMolSurf') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'regenMolSurf')
}

function readOnlyValues(): string[] {
    return Array.from(
        document.body.querySelectorAll<HTMLInputElement>('input[readonly]'),
    ).map((el) => el.value)
}

function mount(props: Partial<typeof BASE_PROPS> = {}, visible = true) {
    let captured: RegenMolSurfDialogResult | null = null
    const handle = mountTree(
        React.createElement(RegenMolSurfDialog, {
            ...BASE_PROPS, ...props, visible,
            onConfirm: (r: RegenMolSurfDialogResult) => { captured = r },
            onCancel: () => {},
        }),
    )
    return { ...handle, get captured() { return captured } }
}

beforeEach(() => invokeService.mockReset())
afterEach(() => { document.body.innerHTML = '' })

describe('RegenMolSurfDialog', () => {
    it('renders the generation parameters read-only (density is the only input)', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        expect(readOnlyValues()).toEqual(['sf_1crn', '1crn', 'protein', '1.4'])
        handle.unmount()
    })

    it('shows "(all atoms)" when the surface was built without a selection', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount({ selStr: '' })
        await flushPromises()

        expect(readOnlyValues()).toContain('(all atoms)')
        handle.unmount()
    })

    it('OK fires regenMolSurf with the prefilled orig_den', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({ sceneId: 7, objId: 42, density: 3, backend: 'auto' })
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('a typed density commits on blur and flows into the commit payload', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        const input = document.body.querySelector(
            '.h3-form-sliderfield-number',
        ) as HTMLInputElement
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value',
        )?.set
        act(() => {
            setter?.call(input, '5')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        act(() => {
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        })

        await act(async () => { okButton().click() })
        await flushPromises()

        expect((commitCalls()[0][1] as Record<string, unknown>).density).toBe(5)
        handle.unmount()
    })

    it('re-seeds the density when reopened on another surface', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        const rerender = (props: Partial<typeof BASE_PROPS>, visible: boolean) => {
            act(() => {
                handle.root.render(
                    React.createElement(RegenMolSurfDialog, {
                        ...BASE_PROPS, ...props, visible,
                        onConfirm: () => {}, onCancel: () => {},
                    }),
                )
            })
        }
        rerender({}, false)
        await flushPromises()
        rerender({ objId: 43, density: 2 }, true)
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        const last = commitCalls()[commitCalls().length - 1][1] as Record<string, unknown>
        expect(last).toEqual({ sceneId: 7, objId: 43, density: 2, backend: 'auto' })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error and does NOT resolve success', async () => {
        routeInvoke(() => ({ ok: false, error: 'regen failed' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(handle.captured).toBeNull()
        expect(document.body.querySelector('.h3-dialog-error')?.textContent)
            .toBe('regen failed')
        handle.unmount()
    })
})
