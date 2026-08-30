/**
 * Pins the batch-open contract shared by the drag-and-drop and OS-shell open
 * paths (hooks/useOpenFilePaths.ts).
 *
 * The load-bearing properties are: files open strictly one at a time (the
 * renderer-option dialog is modal), one failing file does not abort the batch,
 * and the mutex is shared across consumers -- showing the option dialog twice
 * concurrently would strand a caller's promise forever.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRenderHook, flushPromises } from '@renderer/__test__/helpers/testHarness'
import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { resetOpenFilePathsForTests, useOpenFilePaths } from '@renderer/features/file-io/useOpenFilePaths'
import type { OpenFilePathsApi } from '@renderer/features/file-io/useOpenFilePaths'

void React

const showErrorAlert = vi.fn((_args: { title: string; message: string }) => Promise.resolve())
vi.mock('@renderer/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => showErrorAlert,
}))

const OBJ_FILTERS = [
  { name: 'All Supported', extensions: ['pdb', 'qsc'] },
  { name: 'PDB file', extensions: ['pdb'] },
  { name: 'All Files', extensions: ['*'] },
]
const SCENE_FILTERS = [
  { name: 'All Supported', extensions: ['qsc'] },
  { name: 'CueMol scene file', extensions: ['qsc'] },
  { name: 'All Files', extensions: ['*'] },
]

/** Minimal AsyncCueMol stand-in: only getOpenFilters is reached. */
function makeCm() {
  return {
    getOpenFilters: vi.fn((catId: number) =>
      Promise.resolve(catId === 0 ? OBJ_FILTERS : SCENE_FILTERS),
    ),
  }
}

interface MountOpts {
  obj?: (args: unknown) => unknown
  scene?: (args: unknown) => unknown
  /** null models CueMol still initialising. */
  cm?: unknown
  /** Mount a second hook instance sharing the same registry. */
  second?: boolean
}

/**
 * Mount useOpenFilePaths under a CommandProvider with spy handlers registered
 * for the two open commands.
 */
function mountOpenPaths(opts: MountOpts = {}) {
  const objSpy = vi.fn(opts.obj ?? (() => Promise.resolve()))
  const sceneSpy = vi.fn(opts.scene ?? (() => Promise.resolve()))
  const cm = opts.cm === undefined ? makeCm() : opts.cm

  const handle = makeRenderHook<{ a: OpenFilePathsApi; b: OpenFilePathsApi }>(
    () => {
      const { register } = useCommands()
      React.useEffect(() => {
        const un1 = register(CmdId.OpenObjByPath, objSpy as never)
        const un2 = register(CmdId.OpenSceneByPath, sceneSpy as never)
        return () => {
          un1()
          un2()
        }
      }, [register])
      // Two instances so cross-consumer exclusion can be exercised; the second
      // stands in for useShellOpenFiles.
      const a = useOpenFilePaths({ cm: cm as never })
      const b = useOpenFilePaths({ cm: cm as never })
      return { a, b }
    },
    ({ children }) => <CommandProvider>{children}</CommandProvider>,
  )
  return { handle, objSpy, sceneSpy }
}

describe('useOpenFilePaths', () => {
  beforeEach(() => {
    showErrorAlert.mockClear()
    resetOpenFilePathsForTests()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches an object file with a basename label and the raw path', async () => {
    const { handle, objSpy } = mountOpenPaths()

    await handle.result.a.openPaths(['/abs/dir/1abc.pdb'])
    expect(objSpy).toHaveBeenCalledWith({
      name: '1abc.pdb',
      path: '/abs/dir/1abc.pdb',
      contentFirst: false,
    })

    handle.unmount()
  })

  it('derives the basename from a Windows path too', async () => {
    const { handle, objSpy } = mountOpenPaths()

    await handle.result.a.openPaths(['C:\\data\\models\\1abc.pdb'])
    expect(objSpy.mock.calls[0][0]).toMatchObject({ name: '1abc.pdb' })

    handle.unmount()
  })

  it('dispatches a scene file with the path only', async () => {
    const { handle, objSpy, sceneSpy } = mountOpenPaths()

    await handle.result.a.openPaths(['/abs/test.qsc'])
    expect(sceneSpy).toHaveBeenCalledWith('/abs/test.qsc')
    expect(objSpy).not.toHaveBeenCalled()

    handle.unmount()
  })

  it('opens a multi-file batch strictly one at a time', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handle, objSpy } = mountOpenPaths({
      obj: () => (calls++ === 0 ? gate : Promise.resolve()),
    })

    void handle.result.a.openPaths(['/a.pdb', '/b.pdb'])
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/b.pdb' })

    handle.unmount()
  })

  it('continues with the remaining files after one fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let calls = 0
    const { handle, objSpy } = mountOpenPaths({
      obj: () => (calls++ === 0 ? Promise.reject(new Error('boom')) : Promise.resolve()),
    })

    await handle.result.a.openPaths(['/bad.pdb', '/good.pdb'])
    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/good.pdb' })

    handle.unmount()
  })

  it('reports unsupported files once, merging the caller-supplied names', async () => {
    const { handle, objSpy } = mountOpenPaths()

    await handle.result.a.openPaths(['/notes.txt'], { unopenable: ['clipboard.png'] })
    expect(objSpy).not.toHaveBeenCalled()
    expect(showErrorAlert).toHaveBeenCalledTimes(1)
    const msg = showErrorAlert.mock.calls[0][0].message
    expect(msg).toContain('notes.txt')
    expect(msg).toContain('clipboard.png')

    handle.unmount()
  })

  it('opens nothing while CueMol is still initialising', async () => {
    const { handle, objSpy, sceneSpy } = mountOpenPaths({ cm: null })

    await handle.result.a.openPaths(['/1abc.pdb'])
    expect(objSpy).not.toHaveBeenCalled()
    expect(sceneSpy).not.toHaveBeenCalled()
    expect(showErrorAlert).not.toHaveBeenCalled()

    handle.unmount()
  })

  it("policy 'drop' discards a batch that arrives while one is running", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handle, objSpy } = mountOpenPaths({
      obj: () => (calls++ === 0 ? gate : Promise.resolve()),
    })

    void handle.result.a.openPaths(['/a.pdb'])
    await flushPromises()
    await handle.result.a.openPaths(['/b.pdb'], { policy: 'drop' })
    release()
    await flushPromises()

    expect(objSpy).toHaveBeenCalledTimes(1)
    expect(objSpy.mock.calls[0][0]).toMatchObject({ path: '/a.pdb' })

    handle.unmount()
  })

  it("policy 'queue' defers a batch behind the running one instead of losing it", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handle, objSpy } = mountOpenPaths({
      obj: () => (calls++ === 0 ? gate : Promise.resolve()),
    })

    void handle.result.a.openPaths(['/a.pdb'])
    await flushPromises()
    void handle.result.a.openPaths(['/b.pdb'], { policy: 'queue' })
    await flushPromises()
    // Still waiting on the first batch.
    expect(objSpy).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/b.pdb' })

    handle.unmount()
  })

  it('shares the mutex across hook instances', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { handle, objSpy } = mountOpenPaths({
      obj: () => (calls++ === 0 ? gate : Promise.resolve()),
    })

    // Instance `a` is busy; `b` (the shell-open consumer) must see that and
    // not start a second option dialog.
    void handle.result.a.openPaths(['/a.pdb'])
    await flushPromises()
    await handle.result.b.openPaths(['/b.pdb'], { policy: 'drop' })
    expect(objSpy).toHaveBeenCalledTimes(1)

    // With 'queue' it waits for a's batch rather than overlapping it.
    void handle.result.b.openPaths(['/c.pdb'], { policy: 'queue' })
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(1)

    release()
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/c.pdb' })

    handle.unmount()
  })

  it('does nothing for an empty batch', async () => {
    const { handle, objSpy } = mountOpenPaths()

    await handle.result.a.openPaths([])
    expect(objSpy).not.toHaveBeenCalled()
    expect(showErrorAlert).not.toHaveBeenCalled()

    handle.unmount()
  })
})
