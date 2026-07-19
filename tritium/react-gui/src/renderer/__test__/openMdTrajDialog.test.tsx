/**
 * OpenMdTrajDialog wiring contract (step 1 of the MD trajectory open flow).
 *
 * Pins the observable behaviour the command layer depends on:
 *   - Open stays disabled until a topology file AND >=1 trajectory file are set.
 *   - "Add..." opens a MULTI-select native picker (multi:true + the trajectory
 *     filters) and appends every returned path to the ordered list.
 *   - Confirming resolves with { topologyPath, trajPaths, nevery }.
 *   - Cancel resolves null (via onCancel).
 *
 * The multi:true / filters assertion is the tripwire for the IPC contract that
 * lets a user add md_part1..N in one shot.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { OpenMdTrajDialog } from '../components/dialogs/OpenMdTrajDialog'
import { IPC } from '../../shared/ipcChannels'
import { mountTree, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness'

function button(label: string): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label,
    ) as HTMLButtonElement
}

function trajRows(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll('.h3-list-row')) as HTMLElement[]
}

/**
 * Route DIALOG_PICK_PATH: multi picks return the two trajectory files, a single
 * pick returns the topology file. Any other channel resolves undefined.
 */
function installPickerApi(): ReturnType<typeof setupElectronAPI> {
    return setupElectronAPI({
        invoke: vi.fn((channel: string, payload: { multi?: boolean }) => {
            if (channel !== IPC.DIALOG_PICK_PATH) return Promise.resolve(undefined)
            if (payload?.multi) {
                return Promise.resolve({ canceled: false, filePaths: ['/p/a.dcd', '/p/b.xtc'] })
            }
            return Promise.resolve({ canceled: false, filePath: '/p/system.gro' })
        }),
    })
}

afterEach(() => {
    teardownElectronAPI()
    document.body.innerHTML = ''
    localStorage.clear()
})

describe('OpenMdTrajDialog', () => {
    it('disables Open until a topology and at least one trajectory are chosen', async () => {
        installPickerApi()
        const { unmount } = mountTree(
            <OpenMdTrajDialog visible onConfirm={vi.fn()} onCancel={vi.fn()} />,
        )
        expect(button('Open').disabled).toBe(true)

        act(() => button('Browse...').click())
        await flushPromises()
        // Topology alone is not enough.
        expect(button('Open').disabled).toBe(true)

        act(() => button('Add...').click())
        await flushPromises()
        expect(button('Open').disabled).toBe(false)
        unmount()
    })

    it('Add opens a multi-select picker with the trajectory filters and appends every path', async () => {
        const api = installPickerApi()
        const { unmount } = mountTree(
            <OpenMdTrajDialog visible onConfirm={vi.fn()} onCancel={vi.fn()} />,
        )
        act(() => button('Add...').click())
        await flushPromises()

        expect(trajRows()).toHaveLength(2)
        expect(document.body.textContent).toContain('a.dcd')
        expect(document.body.textContent).toContain('b.xtc')

        const addCall = api.invoke.mock.calls.find(
            (c: unknown[]) => c[0] === IPC.DIALOG_PICK_PATH && (c[1] as { multi?: boolean }).multi,
        )
        expect(addCall).toBeTruthy()
        const filters = (addCall![1] as { filters: { extensions: string[] }[] }).filters
        expect(filters[0].extensions).toEqual(['dcd', 'xtc', 'trr'])
        unmount()
    })

    it('Open resolves with the collected topology, ordered trajectories and stride', async () => {
        installPickerApi()
        const onConfirm = vi.fn()
        const { unmount } = mountTree(
            <OpenMdTrajDialog visible onConfirm={onConfirm} onCancel={vi.fn()} />,
        )
        act(() => button('Browse...').click())
        await flushPromises()
        act(() => button('Add...').click())
        await flushPromises()

        act(() => button('Open').click())
        expect(onConfirm).toHaveBeenCalledWith({
            topologyPath: '/p/system.gro',
            trajPaths: ['/p/a.dcd', '/p/b.xtc'],
            nevery: 1,
        })
        unmount()
    })

    it('Cancel resolves via onCancel', () => {
        installPickerApi()
        const onCancel = vi.fn()
        const { unmount } = mountTree(
            <OpenMdTrajDialog visible onConfirm={vi.fn()} onCancel={onCancel} />,
        )
        act(() => button('Cancel').click())
        expect(onCancel).toHaveBeenCalled()
        unmount()
    })
})
