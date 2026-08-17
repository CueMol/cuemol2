/**
 * Degrade-detection test for OS file drag-and-drop open (hooks/useFileDrop.ts).
 *
 * Pins the observable contract rather than the implementation: which drags are
 * intercepted, the exact command + payload each dropped file produces, that a
 * batch opens strictly one file at a time, and that one failing file does not
 * abort the rest. These survive a refactor of the hook's internals.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import { useFileDrop } from '../hooks/useFileDrop'
import { resetOpenFilePathsForTests } from '../hooks/useOpenFilePaths'

void React

const showErrorAlert = vi.fn((_args: { title: string; message: string }) => Promise.resolve())
vi.mock('../components/dialogs/ErrorAlertDialogProvider', () => ({
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

/**
 * DataTransfer stand-in for a file drag (jsdom has no implementation).
 *
 * `items` is omitted so the MIME pre-check fails open, matching a platform
 * that reports no usable item types; makeTypedFileDataTransfer covers the
 * case where types are available.
 */
function makeFileDataTransfer(names: string[]) {
  return {
    types: ['Files'],
    files: names.map((n) => ({ name: n })),
    dropEffect: '',
  }
}

/** As above, but with a readable `items` list carrying MIME types. */
function makeTypedFileDataTransfer(files: Array<{ name: string; type: string }>) {
  const items = files.map((f) => ({ kind: 'file', type: f.type }))
  return {
    types: ['Files'],
    files: files.map((f) => ({ name: f.name })),
    items: { length: items.length, ...Object.fromEntries(items.map((it, i) => [i, it])) },
    dropEffect: '',
  }
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** DataTransfer stand-in for an in-app drag (tab reorder / scene node move). */
function makeInternalDataTransfer() {
  return { types: ['text/plain'], files: [], dropEffect: '' }
}

function fireWindowDrag(type: string, dt: unknown): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'dataTransfer', { value: dt })
  act(() => {
    window.dispatchEvent(ev)
  })
  return ev
}

/**
 * Mount useFileDrop under a CommandProvider with spy handlers registered for
 * the two open commands, and return the spies plus the hook handle.
 */
function mountFileDrop(
  handlers: {
    obj?: (args: unknown) => unknown
    scene?: (args: unknown) => unknown
  } = {},
) {
  const objSpy = vi.fn(handlers.obj ?? (() => Promise.resolve()))
  const sceneSpy = vi.fn(handlers.scene ?? (() => Promise.resolve()))
  const cm = makeCm()

  const handle = makeRenderHook(
    () => {
      const { register } = useCommands()
      // Register once on mount, like a real command hook does.
      React.useEffect(() => {
        const un1 = register(CmdId.OpenObjByPath, objSpy as never)
        const un2 = register(CmdId.OpenSceneByPath, sceneSpy as never)
        return () => {
          un1()
          un2()
        }
      }, [register])
      return useFileDrop({ cm: cm as never })
    },
    ({ children }) => <CommandProvider>{children}</CommandProvider>,
  )
  return { handle, objSpy, sceneSpy, cm }
}

describe('useFileDrop', () => {
  beforeEach(() => {
    showErrorAlert.mockClear()
    // The batch mutex is module-level (shared with the shell-open path), so a
    // case that leaves a batch running would silently starve the next one.
    resetOpenFilePathsForTests()
    setupElectronAPI({ getPathForFile: vi.fn((f: { name: string }) => `/drop/${f.name}`) })
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('accepts a file drag and ignores an in-app drag', () => {
    const { handle } = mountFileDrop()

    const fileOver = fireWindowDrag('dragover', makeFileDataTransfer(['1abc.pdb']))
    expect(fileOver.defaultPrevented).toBe(true)

    // An internal DnD payload must pass through untouched, or tab reorder
    // and scene-tree moves break.
    const internalOver = fireWindowDrag('dragover', makeInternalDataTransfer())
    expect(internalOver.defaultPrevented).toBe(false)

    handle.unmount()
  })

  it('refuses a drag of only unopenable types, showing no overlay', () => {
    const { handle } = mountFileDrop()
    const dt = makeTypedFileDataTransfer([{ name: 'report.docx', type: DOCX_MIME }])

    // Not prevented -> the OS shows its no-drop cursor and no drop fires.
    fireWindowDrag('dragenter', dt)
    const over = fireWindowDrag('dragover', dt)
    expect(over.defaultPrevented).toBe(false)
    expect(handle.result.isDragActive).toBe(false)

    handle.unmount()
  })

  it('accepts a drag mixing an openable file with an unopenable one', async () => {
    const { handle, objSpy } = mountFileDrop()
    // .pdb has no OS-known MIME type, so it arrives with an empty type.
    const dt = makeTypedFileDataTransfer([
      { name: '1abc.pdb', type: '' },
      { name: 'report.docx', type: DOCX_MIME },
    ])

    const over = fireWindowDrag('dragover', dt)
    expect(over.defaultPrevented).toBe(true)
    fireWindowDrag('dragenter', dt)
    expect(handle.result.isDragActive).toBe(true)

    // The docx is reported after the drop, not silently dropped.
    fireWindowDrag('drop', dt)
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(1)
    expect(objSpy.mock.calls[0][0]).toMatchObject({ path: '/drop/1abc.pdb' })
    expect(showErrorAlert).toHaveBeenCalledTimes(1)
    expect(showErrorAlert.mock.calls[0][0].message).toContain('report.docx')

    handle.unmount()
  })

  it('dispatches OpenObjByPath for an object file and OpenSceneByPath for a scene', async () => {
    const { handle, objSpy, sceneSpy } = mountFileDrop()

    fireWindowDrag('drop', makeFileDataTransfer(['1abc.pdb']))
    await flushPromises()
    expect(objSpy).toHaveBeenCalledWith({
      name: '1abc.pdb',
      path: '/drop/1abc.pdb',
      contentFirst: false,
    })
    expect(sceneSpy).not.toHaveBeenCalled()

    fireWindowDrag('drop', makeFileDataTransfer(['test.qsc']))
    await flushPromises()
    expect(sceneSpy).toHaveBeenCalledWith('/drop/test.qsc')

    handle.unmount()
  })

  it('opens a multi-file drop strictly one at a time', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let calls = 0
    const { handle, objSpy } = mountFileDrop({
      obj: () => (calls++ === 0 ? gate : Promise.resolve()),
    })

    fireWindowDrag('drop', makeFileDataTransfer(['a.pdb', 'b.pdb']))
    await flushPromises()
    // The second file must wait for the first one's dialog to finish.
    expect(objSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseFirst()
      await gate
    })
    await flushPromises()
    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/drop/b.pdb' })

    handle.unmount()
  })

  it('continues with the remaining files after one fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let calls = 0
    const { handle, objSpy } = mountFileDrop({
      obj: () => (calls++ === 0 ? Promise.reject(new Error('boom')) : Promise.resolve()),
    })

    fireWindowDrag('drop', makeFileDataTransfer(['bad.pdb', 'good.pdb']))
    await flushPromises()
    await flushPromises()

    expect(objSpy).toHaveBeenCalledTimes(2)
    expect(objSpy.mock.calls[1][0]).toMatchObject({ path: '/drop/good.pdb' })

    handle.unmount()
  })

  it('reports unsupported files once and dispatches nothing for them', async () => {
    const { handle, objSpy, sceneSpy } = mountFileDrop()

    fireWindowDrag('drop', makeFileDataTransfer(['README.txt', 'notes.md']))
    await flushPromises()

    expect(objSpy).not.toHaveBeenCalled()
    expect(sceneSpy).not.toHaveBeenCalled()
    expect(showErrorAlert).toHaveBeenCalledTimes(1)
    const arg = showErrorAlert.mock.calls[0][0]
    expect(arg.message).toContain('README.txt')
    expect(arg.message).toContain('notes.md')

    handle.unmount()
  })

  it('tracks nested dragenter/dragleave and clears the overlay on drop', () => {
    const { handle } = mountFileDrop()
    const dt = makeFileDataTransfer(['1abc.pdb'])

    fireWindowDrag('dragenter', dt)
    expect(handle.result.isDragActive).toBe(true)
    // Entering a child element fires enter before the parent's leave; the
    // overlay must stay up through the transition.
    fireWindowDrag('dragenter', dt)
    fireWindowDrag('dragleave', dt)
    expect(handle.result.isDragActive).toBe(true)
    fireWindowDrag('dragleave', dt)
    expect(handle.result.isDragActive).toBe(false)

    // A drop always clears it, however unbalanced the counter got. Dropping
    // an empty file list keeps this case about the overlay only -- no open
    // is started, so nothing races with the unmount below.
    fireWindowDrag('dragenter', dt)
    fireWindowDrag('dragenter', dt)
    fireWindowDrag('drop', makeFileDataTransfer([]))
    expect(handle.result.isDragActive).toBe(false)

    handle.unmount()
  })

  it('stops listening after unmount', () => {
    const { handle, objSpy } = mountFileDrop()
    handle.unmount()

    const ev = fireWindowDrag('dragover', makeFileDataTransfer(['1abc.pdb']))
    expect(ev.defaultPrevented).toBe(false)
    fireWindowDrag('drop', makeFileDataTransfer(['1abc.pdb']))
    expect(objSpy).not.toHaveBeenCalled()
  })
})
