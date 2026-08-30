import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import { setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { runObjectSaveFlow } from '@renderer/hooks/sceneContextMenu/runObjectSaveFlow'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'

interface FixtureOpts {
    /** Persisted UiState returned by IPC.UI_LOAD. */
    uiState?: Record<string, unknown>
    /** getObjectSaveInfo result. */
    info?: unknown
    /** DIALOG_OBJECT_SAVE result. */
    dialog?: unknown
    /** saveObjectToFile result. Default: success. */
    saveResult?: unknown
    /** When true, saveObjectToFile rejects instead of resolving. */
    saveThrows?: boolean
}

const DEFAULT_INFO = {
    ok: true,
    filters: [
        { name: 'xyz', description: 'XYZ file', extensions: ['xyz'] },
        { name: 'pdb', description: 'PDB file', extensions: ['pdb', 'ent'] },
    ],
    defaultFileName: 'mol1.xyz',
    defaultDir: '/data',
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        uiState = { saveWriterName: 'xyz' },
        info = DEFAULT_INFO,
        dialog = { canceled: false, filePath: '/data/mol1.xyz', filterIndex: 0 },
        saveResult = { ok: true },
        saveThrows = false,
    } = opts

    const api = setupElectronAPI({
        invoke: vi.fn((channel: string) => {
            if (channel === IPC.UI_LOAD) return Promise.resolve(uiState)
            if (channel === IPC.DIALOG_OBJECT_SAVE) return Promise.resolve(dialog)
            return Promise.resolve(undefined)
        }),
    })

    const invokeService = vi.fn((name: string) => {
        if (name === 'getObjectSaveInfo') return Promise.resolve(info)
        if (name === 'saveObjectToFile') {
            return saveThrows
                ? Promise.reject(new Error('write boom'))
                : Promise.resolve(saveResult)
        }
        return Promise.resolve(undefined)
    })
    const cm = { invokeService } as unknown as AsyncCueMol

    const uiSaveCalls = () =>
        api.invoke.mock.calls.filter((c: unknown[]) => c[0] === IPC.UI_SAVE)

    return { api, cm, invokeService, uiSaveCalls }
}

describe('runObjectSaveFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
    })
    afterEach(() => {
        teardownElectronAPI()
        vi.restoreAllMocks()
    })

    it('forwards the remembered writer as preferredWriter', async () => {
        const { cm, invokeService } = makeFixture()
        await runObjectSaveFlow(cm, 1, 10)
        expect(invokeService).toHaveBeenCalledWith('getObjectSaveInfo', {
            sceneId: 1, objId: 10, preferredWriter: 'xyz',
        })
    })

    it('falls back to the UXP default writer when nothing is persisted', async () => {
        const { cm, invokeService } = makeFixture({ uiState: {} })
        await runObjectSaveFlow(cm, 1, 10)
        expect(invokeService).toHaveBeenCalledWith('getObjectSaveInfo', {
            sceneId: 1, objId: 10, preferredWriter: 'pdb',
        })
    })

    it('writes the file and persists the writer actually used', async () => {
        // filterIndex 1 -> the pdb row, not the remembered xyz row.
        const { cm, invokeService, uiSaveCalls } = makeFixture({
            dialog: { canceled: false, filePath: '/data/mol1.pdb', filterIndex: 1 },
        })
        const res = await runObjectSaveFlow(cm, 1, 10)
        expect(res).toEqual({ status: 'saved', path: '/data/mol1.pdb' })
        expect(invokeService).toHaveBeenCalledWith('saveObjectToFile', {
            sceneId: 1, objId: 10, path: '/data/mol1.pdb', writerName: 'pdb',
        })
        expect(uiSaveCalls()).toEqual([[IPC.UI_SAVE, { saveWriterName: 'pdb' }]])
    })

    it('treats ok:false as an error and does not remember the writer', async () => {
        // invokeService resolves (never throws) on a failed write, so the
        // result flag is the only failure signal the caller gets.
        const { cm, uiSaveCalls } = makeFixture({ saveResult: { ok: false } })
        const res = await runObjectSaveFlow(cm, 1, 10)
        expect(res).toEqual({ status: 'error', path: '/data/mol1.xyz' })
        expect(uiSaveCalls()).toEqual([])
    })

    it('reports an error when saveObjectToFile rejects', async () => {
        const { cm, uiSaveCalls } = makeFixture({ saveThrows: true })
        const res = await runObjectSaveFlow(cm, 1, 10)
        expect(res).toEqual({ status: 'error', path: '/data/mol1.xyz' })
        expect(uiSaveCalls()).toEqual([])
    })

    it('returns cancelled without writing when the dialog is dismissed', async () => {
        const { cm, invokeService, uiSaveCalls } = makeFixture({
            dialog: { canceled: true, filePath: '', filterIndex: -1 },
        })
        const res = await runObjectSaveFlow(cm, 1, 10)
        expect(res).toEqual({ status: 'cancelled' })
        expect(invokeService).not.toHaveBeenCalledWith(
            'saveObjectToFile', expect.anything(),
        )
        expect(uiSaveCalls()).toEqual([])
    })

    it('returns no-writer without showing a dialog when the object has none', async () => {
        const { api, cm } = makeFixture({
            info: { ok: false, filters: [], defaultFileName: '', defaultDir: '' },
        })
        const res = await runObjectSaveFlow(cm, 1, 10)
        expect(res).toEqual({ status: 'no-writer' })
        expect(api.invoke).not.toHaveBeenCalledWith(
            IPC.DIALOG_OBJECT_SAVE, expect.anything(),
        )
    })
})
