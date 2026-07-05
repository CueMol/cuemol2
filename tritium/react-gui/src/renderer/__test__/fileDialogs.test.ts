/**
 * Degrade-detection tests for main/handlers/fileDialogs.ts.
 *
 * The six save/open-family handlers are near-clones that differ only by the
 * dialog title, filters, and (open family) the `openFile` property. They were
 * collapsed onto shared `saveDialog` / `openDialog` helpers; this test pins
 * the observable contract that each handler still passes the correct title +
 * filters + properties down to the Electron dialog, so a future edit to the
 * helpers or a copy-paste slip surfaces as a failing assertion.
 *
 * It also pins the result normalization: save returns `filePath: ''` when the
 * native result has no path, and open treats an empty selection as canceled.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Native dialog spies. fileDialogs.ts imports `dialog` from electron at module
// load; the per-call return value is set inside each test.
const showSaveDialog = vi.fn()
const showOpenDialog = vi.fn()
vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
  },
}))

// withMenuBlocked wraps each dialog call; run the op transparently so the
// dialog spy is reached and the menu side-effect is irrelevant under test.
vi.mock('../../main/menu', () => ({
  withMenuBlocked: (_reason: string, op: () => unknown) => op(),
}))

// fileDialogs lives in src/main (tsconfig.node project). A string-variable
// dynamic import keeps tsc's cross-project check (TS6307) off this file while
// Vitest still resolves it at runtime -- same trick as quitState.test.ts.
const fileDialogsEntry = '../../main/handlers/fileDialogs'

type FileFilter = { name: string; extensions: string[] }
interface FileDialogsModule {
  handleSaveSceneDialog(win: object, defaultName: string): Promise<{ canceled: boolean; filePath: string }>
  handleStyleSaveDialog(win: object, defaultName: string): Promise<{ canceled: boolean; filePath: string }>
  handleCameraSaveDialog(win: object, defaultName: string): Promise<{ canceled: boolean; filePath: string }>
  handleSceneExportDialog(
    win: object,
    payload: { defaultName: string; filters: FileFilter[] },
  ): Promise<{ canceled: boolean; filePath: string }>
  handleStyleOpenDialog(win: object): Promise<{ canceled: boolean; filePath: string }>
  handleCameraOpenDialog(win: object): Promise<{ canceled: boolean; filePath: string }>
}

let mod: FileDialogsModule
const win = {}

beforeEach(async () => {
  showSaveDialog.mockReset()
  showOpenDialog.mockReset()
  mod = (await import(fileDialogsEntry)) as unknown as FileDialogsModule
})

interface SaveCase {
  name: string
  run: (m: FileDialogsModule) => Promise<unknown>
  title: string
  filters: FileFilter[]
}

const saveCases: SaveCase[] = [
  {
    name: 'handleSaveSceneDialog',
    run: (m) => m.handleSaveSceneDialog(win, 'scene.qsc'),
    title: 'Save Scene As',
    filters: [
      { name: 'CueMol Scene', extensions: ['qsc'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
  {
    name: 'handleStyleSaveDialog',
    run: (m) => m.handleStyleSaveDialog(win, 'style.xml'),
    title: 'Save Style As',
    filters: [
      { name: 'Style file', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
  {
    name: 'handleCameraSaveDialog',
    run: (m) => m.handleCameraSaveDialog(win, 'cam.xml'),
    title: 'Save Camera As',
    filters: [
      { name: 'Camera file', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
  {
    name: 'handleSceneExportDialog',
    run: (m) =>
      m.handleSceneExportDialog(win, {
        defaultName: 'img.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
      }),
    title: 'Export Scene As',
    filters: [
      { name: 'PNG image', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
]

describe('fileDialogs save-family handlers', () => {
  it.each(saveCases)('$name passes the correct title + filters', async ({ run, title, filters }) => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/out' })
    await run(mod)
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    const [passedWin, opts] = showSaveDialog.mock.calls[0]
    expect(passedWin).toBe(win)
    expect(opts.title).toBe(title)
    expect(opts.filters).toEqual(filters)
    // Save dialogs forward the chosen name as defaultPath and set no
    // open-only `properties`.
    expect(opts.properties).toBeUndefined()
  })

  it('normalizes a missing filePath to an empty string', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const res = await mod.handleSaveSceneDialog(win, 'scene.qsc')
    expect(res).toEqual({ canceled: true, filePath: '' })
  })
})

interface OpenCase {
  name: string
  run: (m: FileDialogsModule) => Promise<unknown>
  title: string
  filters: FileFilter[]
}

const openCases: OpenCase[] = [
  {
    name: 'handleStyleOpenDialog',
    run: (m) => m.handleStyleOpenDialog(win),
    title: 'Open Style File',
    filters: [
      { name: 'Style file', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
  {
    name: 'handleCameraOpenDialog',
    run: (m) => m.handleCameraOpenDialog(win),
    title: 'Open Camera File',
    filters: [
      { name: 'Camera file', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  },
]

describe('fileDialogs open-family handlers', () => {
  it.each(openCases)('$name passes title + filters + openFile property', async ({ run, title, filters }) => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/in'] })
    await run(mod)
    expect(showOpenDialog).toHaveBeenCalledTimes(1)
    const [passedWin, opts] = showOpenDialog.mock.calls[0]
    expect(passedWin).toBe(win)
    expect(opts.title).toBe(title)
    expect(opts.filters).toEqual(filters)
    expect(opts.properties).toEqual(['openFile'])
  })

  it('returns the first selected path on success', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/a', '/tmp/b'] })
    const res = await mod.handleStyleOpenDialog(win)
    expect(res).toEqual({ canceled: false, filePath: '/tmp/a' })
  })

  it('treats an empty selection as canceled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
    const res = await mod.handleCameraOpenDialog(win)
    expect(res).toEqual({ canceled: true, filePath: '' })
  })
})
