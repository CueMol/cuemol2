/**
 * CalcApbsPotDialog wire contract (degrade-detection for the APBS tool dialog).
 *
 * Pins the OBSERVABLE behaviour, not the JSX:
 *   - Start is disabled while a required exe path is unset (the Settings gate),
 *     and the not-configured warning is shown.
 *   - With paths configured, Start calls invokeService('calcApbsStart', ...)
 *     carrying the form state + the ApbsConfig binaries.
 *   - A `complete` apbs-progress push resolves onConfirm with the new object id.
 *   - While running the primary button is "Stop" and clicking it calls
 *     invokeService('calcApbsCancel', { jobId }).
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

let progressCb: ((u: unknown) => void) | null = null
const invokeService = vi.fn()
const mockCm = {
    invokeService,
    subscribeApbsProgress: vi.fn((cb: (u: unknown) => void) => {
        progressCb = cb
        return () => {}
    }),
    addEventListener: vi.fn().mockResolvedValue(1),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

const mockApbsConfig = {
    current: { apbsExe: '', pdb2pqrExe: '', pdb2pqrFF: 'charmm' },
}
vi.mock('../contexts/ApbsConfigContext', () => ({
    useApbsConfig: () => ({ config: mockApbsConfig.current, setValue: vi.fn() }),
}))

import { CalcApbsPotDialog } from '../components/dialogs/CalcApbsPotDialog'
import type { CalcApbsPotDialogResult } from '../components/dialogs/CalcApbsPotDialog'
import { mountTree, flushPromises } from './helpers/testHarness'

const MOL = { uid: 11, name: 'mol1', className: 'MolCoord' }

function routeInvoke(): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'listSceneObjects') return Promise.resolve({ objects: [MOL] })
        if (name === 'proposeElepotName') return Promise.resolve({ name: 'pot_mol1' })
        if (name === 'getSelDefs')
            return Promise.resolve({ scene: [], global: [], currentSel: undefined })
        if (name === 'calcApbsStart') return Promise.resolve({ ok: true, jobId: 'job1' })
        if (name === 'calcApbsCancel') return Promise.resolve({ ok: true })
        return Promise.resolve(undefined)
    })
}

function buttonByText(text: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === text,
    ) as HTMLButtonElement | undefined
}

function startCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'calcApbsStart')
}
function cancelCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'calcApbsCancel')
}

function mount(visible = true) {
    let captured: CalcApbsPotDialogResult | null = null
    const handle = mountTree(
        React.createElement(CalcApbsPotDialog, {
            visible,
            sceneId: 7,
            onConfirm: (r: CalcApbsPotDialogResult) => {
                captured = r
            },
            onCancel: () => {},
        }),
    )
    return {
        ...handle,
        get captured() {
            return captured
        },
    }
}

beforeEach(() => {
    invokeService.mockReset()
    progressCb = null
    mockApbsConfig.current = { apbsExe: '', pdb2pqrExe: '', pdb2pqrFF: 'charmm' }
})
afterEach(() => {
    document.body.innerHTML = ''
})

describe('CalcApbsPotDialog', () => {
    it('gates Start when a required exe path is unset', async () => {
        routeInvoke()
        const handle = mount()
        await flushPromises()

        expect(buttonByText('Start')?.disabled).toBe(true)
        // Warning banner names the missing binaries.
        expect(document.body.querySelector('.bp5-callout')?.textContent).toContain('APBS')
        handle.unmount()
    })

    it('Start invokes calcApbsStart with form state + config binaries', async () => {
        mockApbsConfig.current = {
            apbsExe: '/opt/apbs',
            pdb2pqrExe: '/opt/pdb2pqr',
            pdb2pqrFF: 'charmm',
        }
        routeInvoke()
        const handle = mount()
        await flushPromises()

        expect(buttonByText('Start')?.disabled).toBe(false)
        await act(async () => {
            buttonByText('Start')!.click()
        })
        await flushPromises()

        expect(startCalls()).toHaveLength(1)
        expect(startCalls()[0][1]).toEqual({
            sceneId: 7,
            objId: 11,
            selStr: '',
            elepotName: 'pot_mol1',
            chargeMethod: 'pdb2pqr',
            forceField: 'charmm',
            useHydrogen: false,
            useNpbe: false,
            temperature: 298.15,
            gridSpacing: 1.0,
            waterDielec: 78.54,
            protDielec: 2.0,
            binaries: { apbsExe: '/opt/apbs', pdb2pqrExe: '/opt/pdb2pqr' },
        })
        handle.unmount()
    })

    it('a complete push resolves onConfirm with the new object id', async () => {
        mockApbsConfig.current = {
            apbsExe: '/opt/apbs',
            pdb2pqrExe: '/opt/pdb2pqr',
            pdb2pqrFF: 'charmm',
        }
        routeInvoke()
        const handle = mount()
        await flushPromises()
        await act(async () => {
            buttonByText('Start')!.click()
        })
        await flushPromises()

        act(() => {
            progressCb!({
                type: 'complete',
                jobId: 'job1',
                newObjId: 99,
                newObjName: 'pot_mol1',
                elapsedSec: 1,
            })
        })
        expect(handle.captured).toEqual({
            ok: true,
            newObjId: 99,
            newObjName: 'pot_mol1',
        })
        handle.unmount()
    })

    it('while running, the primary button is Stop and cancels the job', async () => {
        mockApbsConfig.current = {
            apbsExe: '/opt/apbs',
            pdb2pqrExe: '/opt/pdb2pqr',
            pdb2pqrFF: 'charmm',
        }
        routeInvoke()
        const handle = mount()
        await flushPromises()
        await act(async () => {
            buttonByText('Start')!.click()
        })
        await flushPromises()

        expect(buttonByText('Stop')).toBeTruthy()
        await act(async () => {
            buttonByText('Stop')!.click()
        })
        await flushPromises()

        expect(cancelCalls()).toHaveLength(1)
        expect(cancelCalls()[0][1]).toEqual({ jobId: 'job1' })
        handle.unmount()
    })
})
