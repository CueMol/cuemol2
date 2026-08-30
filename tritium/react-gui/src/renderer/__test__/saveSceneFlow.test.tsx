/**
 * Pins the wire contract of File > Save Scene / Save Scene As.
 *
 *   - empty `src` -> CmdId.FileSave dispatches the Save As branch
 *     (DIALOG_SAVE_SCENE invoke). FILE_EXISTS is NOT consulted because
 *     the writer has no path candidate.
 *   - non-empty `src` + FILE_EXISTS -> exists:true -> no Save dialog;
 *     FILE_BACKUP_RENAME runs first, then the worker `saveScene` service
 *     is invoked with `options: undefined` (UXP plain Save path: no option dialog).
 *   - non-empty `src` + FILE_EXISTS -> exists:false -> falls through to Save As
 *     (UXP `util.isFile` defence).
 *   - CmdId.FileSaveAs always shows the Save dialog regardless of `src`.
 *
 * Source: uxp_gui/cuemol2/base/content/fileopen.js:518-642
 *         uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/qsc-io.js:71-117
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
}))

// The Save As path opens the Qsc writer option dialog. Stub the hook so the
// renderer skips real dialog mounting and returns a fixed options object.
const QSC_OPTS_DEFAULT = {
    embedAll: false,
    version: 'QDF1' as const,
    compress: 'xzip' as const,
    base64: false,
}
const showOptionDialogMock = vi.fn()
vi.mock('@renderer/dialogs/QscWriterOptionDialogProvider', () => ({
    QscWriterOptionDialogProvider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    useShowQscWriterOptionDialog: () => showOptionDialogMock,
}))

import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useEditCommands } from '@renderer/commands/useEditCommands'
import { IPC } from '@shared/ipcChannels'
import {
    flushPromises,
    mountTree,
    setupElectronAPI,
    teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
    undo: ReturnType<typeof vi.fn>
    redo: ReturnType<typeof vi.fn>
}

function makeCm(srcValue: string): MockCm {
    return {
        invokeService: vi.fn(async (name: string, args: Record<string, unknown>) => {
            if (name === 'getSceneSaveInfo') {
                return { ok: true, src: srcValue, name: 'foo', srctype: 'qsc_xml' }
            }
            if (name === 'saveScene') {
                return { ok: true, ...args }
            }
            return { ok: true }
        }),
        undo: vi.fn(),
        redo: vi.fn(),
    }
}

function setupApi(overrides: {
    fileExists?: boolean
    saveDialog?: { canceled: boolean; filePath: string }
    backup?: { ok: boolean; backed: boolean; error?: string }
} = {}): { invoke: ReturnType<typeof vi.fn> } {
    const fileExists = overrides.fileExists ?? true
    const saveDialog = overrides.saveDialog ?? { canceled: false, filePath: '/tmp/foo' }
    const backup = overrides.backup ?? { ok: true, backed: true }

    return setupElectronAPI({
        invoke: vi.fn(async (channel: string, payload: unknown) => {
            switch (channel) {
                case IPC.FILE_EXISTS:
                    return { exists: fileExists }
                case IPC.FILE_BACKUP_RENAME:
                    return backup
                case IPC.DIALOG_SAVE_SCENE:
                    return saveDialog
                default:
                    void payload
                    return undefined
            }
        }),
    }) as { invoke: ReturnType<typeof vi.fn> }
}

interface Probe {
    dispatch: ReturnType<typeof useCommands>['dispatch']
}

let probe: Probe

const ProbeComponent: React.FC<{ cm: MockCm }> = ({ cm }) => {
    useEditCommands({
        cm: cm as unknown as Parameters<typeof useEditCommands>[0]['cm'],
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 2 }),
    })
    const cmds = useCommands()
    probe = { dispatch: cmds.dispatch }
    return null
}

function mount(cm: MockCm) {
    return mountTree(
        React.createElement(
            CommandProvider,
            null,
            React.createElement(ProbeComponent, { cm }),
        ),
    )
}

describe('Save Scene flow (CmdId.FileSave / FileSaveAs)', () => {
    beforeEach(() => {
        // vi.restoreAllMocks() (in afterEach) drops mockResolvedValue on
        // module-scope mocks, so re-prime the implementation each run.
        showOptionDialogMock.mockReset()
        showOptionDialogMock.mockResolvedValue(QSC_OPTS_DEFAULT)
    })
    afterEach(() => {
        teardownElectronAPI()
        vi.restoreAllMocks()
    })

    it('empty src: FileSave falls through to Save As (DIALOG_SAVE_SCENE invoked)', async () => {
        const cm = makeCm('')
        const api = setupApi({ saveDialog: { canceled: false, filePath: '/tmp/new.qsc' } })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSave)
        await flushPromises()

        const channels = api.invoke.mock.calls.map((c) => c[0])
        expect(channels).toContain(IPC.DIALOG_SAVE_SCENE)
        expect(channels).not.toContain(IPC.FILE_EXISTS)
        expect(showOptionDialogMock).toHaveBeenCalledTimes(1)

        // Backup runs against the path returned by the Save dialog.
        expect(api.invoke).toHaveBeenCalledWith(IPC.FILE_BACKUP_RENAME, { path: '/tmp/new.qsc' })

        // Worker is asked to save with the chosen path and the option dialog result.
        expect(cm.invokeService).toHaveBeenCalledWith('saveScene', expect.objectContaining({
            sceneId: 1, viewId: 2, filePath: '/tmp/new.qsc',
            options: expect.objectContaining({ version: 'QDF1' }),
        }))
        handle.unmount()
    })

    it('non-empty src + file exists: FileSave writes directly without Save dialog or option dialog', async () => {
        const cm = makeCm('/tmp/existing.qsc')
        const api = setupApi({ fileExists: true })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSave)
        await flushPromises()

        const channels = api.invoke.mock.calls.map((c) => c[0])
        expect(channels).toContain(IPC.FILE_EXISTS)
        expect(channels).not.toContain(IPC.DIALOG_SAVE_SCENE)
        expect(showOptionDialogMock).not.toHaveBeenCalled()

        // Backup happens against the existing src; saveScene is invoked with options=undefined.
        expect(api.invoke).toHaveBeenCalledWith(IPC.FILE_BACKUP_RENAME, { path: '/tmp/existing.qsc' })
        expect(cm.invokeService).toHaveBeenCalledWith('saveScene', {
            sceneId: 1, viewId: 2, filePath: '/tmp/existing.qsc', options: undefined,
        })
        handle.unmount()
    })

    it('non-empty src + file missing: FileSave falls through to Save As', async () => {
        const cm = makeCm('/tmp/gone.qsc')
        const api = setupApi({
            fileExists: false,
            saveDialog: { canceled: false, filePath: '/tmp/gone.qsc' },
        })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSave)
        await flushPromises()

        const channels = api.invoke.mock.calls.map((c) => c[0])
        expect(channels).toContain(IPC.FILE_EXISTS)
        expect(channels).toContain(IPC.DIALOG_SAVE_SCENE)
        expect(showOptionDialogMock).toHaveBeenCalledTimes(1)
        handle.unmount()
    })

    it('FileSaveAs: always shows Save dialog and option dialog', async () => {
        const cm = makeCm('/tmp/existing.qsc')
        const api = setupApi({
            fileExists: true,
            saveDialog: { canceled: false, filePath: '/tmp/copy.qsc' },
        })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSaveAs)
        await flushPromises()

        const channels = api.invoke.mock.calls.map((c) => c[0])
        expect(channels).toContain(IPC.DIALOG_SAVE_SCENE)
        expect(channels).not.toContain(IPC.FILE_EXISTS)
        expect(showOptionDialogMock).toHaveBeenCalledTimes(1)

        // saveScene receives the new path and options object.
        expect(cm.invokeService).toHaveBeenCalledWith('saveScene', expect.objectContaining({
            filePath: '/tmp/copy.qsc',
            options: expect.objectContaining({ version: 'QDF1' }),
        }))
        handle.unmount()
    })

    it('Save dialog canceled: no backup, no saveScene', async () => {
        const cm = makeCm('')
        const api = setupApi({ saveDialog: { canceled: true, filePath: '' } })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSaveAs)
        await flushPromises()

        const channels = api.invoke.mock.calls.map((c) => c[0])
        expect(channels).toContain(IPC.DIALOG_SAVE_SCENE)
        expect(channels).not.toContain(IPC.FILE_BACKUP_RENAME)
        expect(showOptionDialogMock).not.toHaveBeenCalled()
        expect(cm.invokeService).not.toHaveBeenCalledWith('saveScene', expect.anything())
        handle.unmount()
    })

    it('appends .qsc extension when missing from chosen path', async () => {
        const cm = makeCm('')
        const api = setupApi({ saveDialog: { canceled: false, filePath: '/tmp/no-extension' } })
        const handle = mount(cm)
        await flushPromises()

        await probe.dispatch(CmdId.FileSaveAs)
        await flushPromises()

        expect(api.invoke).toHaveBeenCalledWith(IPC.FILE_BACKUP_RENAME, { path: '/tmp/no-extension.qsc' })
        expect(cm.invokeService).toHaveBeenCalledWith('saveScene', expect.objectContaining({
            filePath: '/tmp/no-extension.qsc',
        }))
        handle.unmount()
    })
})
