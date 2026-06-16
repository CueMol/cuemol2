/**
 * Degrade-detection test for the per-dialog hook factory (post-F).
 *
 * After F, each dialog ships its own `<XxxDialogProvider>` and
 * `useShowXxxDialog()` hook (`createDialogHook` factory). The composite
 * `<DialogProvider>` mounts all four. The observable contract pinned here:
 *   - `showXxx(args)` opens the dialog (Blueprint Dialog visible in the DOM)
 *   - User clicks Confirm/Cancel/etc -> Promise resolves with the right value
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: false, cm: null }),
}))

const { DialogProvider } = await import('../contexts/DialogContext')
const { useShowAboutDialog } = await import('../components/dialogs/AboutDialogProvider')
const { useShowNewTabDialog } = await import('../components/dialogs/NewTabDialogProvider')
const { useShowConfirmCloseTabDialog } = await import('../components/dialogs/ConfirmCloseTabDialogProvider')
const { useShowFileOpenOptionDialog } = await import('../components/fopen-opt-dlgs/FileOpenOptionDialogProvider')
const { useShowTextPromptDialog } = await import('../components/dialogs/TextPromptDialogProvider')

import { mountTree, flushPromises, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

function findButtonByText(root: ParentNode, text: string): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
  return buttons.find((b: HTMLButtonElement) => (b.textContent ?? '').trim() === text) ?? null
}

let showAbout: () => Promise<void>
let showNewTab: (args: { currentSceneName: string | null; defaultSceneName: string; defaultViewName: string }) => Promise<unknown>
let showConfirmClose: (args: { sceneName: string }) => Promise<unknown>
let showFileOpenOption: (args: { filePath: string; sceneId: number; rendererTypes?: string[] }) => Promise<unknown>
let showTextPrompt: (args: { title: string; label: string; defaultValue?: string; confirmLabel?: string }) => Promise<string | null>

const Probe: React.FC = () => {
  showAbout = useShowAboutDialog()
  showNewTab = useShowNewTabDialog()
  showConfirmClose = useShowConfirmCloseTabDialog()
  showFileOpenOption = useShowFileOpenOptionDialog()
  showTextPrompt = useShowTextPromptDialog()
  return null
}

function mount() {
  return mountTree(
    React.createElement(
      DialogProvider as React.FC<{ children: React.ReactNode }>,
      null,
      React.createElement(Probe),
    ),
  )
}

describe('DialogProvider (per-dialog factory)', () => {
  beforeEach(() => {
    setupElectronAPI()
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('useShowAboutDialog: opens, OK resolves the Promise', async () => {
    const handle = mount()
    let resolved = false
    const p = showAbout().then(() => { resolved = true })
    await flushPromises()

    const okBtn = findButtonByText(document.body, 'OK')
    expect(okBtn).toBeTruthy()
    okBtn!.click()

    await p
    expect(resolved).toBe(true)
    handle.unmount()
  })

  it('useShowConfirmCloseTabDialog: Cancel resolves with "cancel"', async () => {
    const handle = mount()
    const p = showConfirmClose({ sceneName: 'Scene_1' })
    await flushPromises()

    const cancelBtn = findButtonByText(document.body, 'Cancel')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()

    expect(await p).toBe('cancel')
    handle.unmount()
  })

  it('useShowConfirmCloseTabDialog: Don\'t Save resolves with "discard"', async () => {
    const handle = mount()
    const p = showConfirmClose({ sceneName: 'Scene_1' })
    await flushPromises()

    const discardBtn = findButtonByText(document.body, "Don't Save")
    expect(discardBtn).toBeTruthy()
    discardBtn!.click()

    expect(await p).toBe('discard')
    handle.unmount()
  })

  it('useShowNewTabDialog: Cancel resolves with null', async () => {
    const handle = mount()
    const p = showNewTab({
      currentSceneName: null,
      defaultSceneName: 'Scene_1',
      defaultViewName: 'View_1',
    })
    await flushPromises()

    const cancelBtn = findButtonByText(document.body, 'Cancel')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()

    expect(await p).toBeNull()
    handle.unmount()
  })

  it('useShowNewTabDialog: OK resolves with { mode: new-scene, name, inheritViewProps }', async () => {
    const handle = mount()
    const p = showNewTab({
      currentSceneName: null,
      defaultSceneName: 'Scene_1',
      defaultViewName: 'View_1',
    })
    await flushPromises()

    const okBtn = findButtonByText(document.body, 'OK')
    expect(okBtn).toBeTruthy()
    okBtn!.click()

    const result = await p
    expect(result).toEqual({ mode: 'new-scene', name: 'Scene_1', inheritViewProps: true })
    handle.unmount()
  })

  it('useShowFileOpenOptionDialog: Cancel resolves with null', async () => {
    const handle = mount()
    const p = showFileOpenOption({ filePath: '/tmp/foo.pdb', sceneId: 0, rendererTypes: ['*default'] })
    await flushPromises()

    const cancelBtn = findButtonByText(document.body, 'Cancel')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()

    expect(await p).toBeNull()
    handle.unmount()
  })

  it('useShowTextPromptDialog: Cancel resolves with null', async () => {
    const handle = mount()
    const p = showTextPrompt({ title: 'Rename', label: 'New name:', defaultValue: 'foo' })
    await flushPromises()

    const cancelBtn = findButtonByText(document.body, 'Cancel')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()

    expect(await p).toBeNull()
    handle.unmount()
  })

  it('useShowTextPromptDialog: OK resolves with the trimmed default value', async () => {
    const handle = mount()
    const p = showTextPrompt({ title: 'Rename', label: 'New name:', defaultValue: 'foo' })
    await flushPromises()

    const okBtn = findButtonByText(document.body, 'OK')
    expect(okBtn).toBeTruthy()
    okBtn!.click()

    expect(await p).toBe('foo')
    handle.unmount()
  })

  it('useShowTextPromptDialog: custom confirmLabel renders on the OK button', async () => {
    const handle = mount()
    const p = showTextPrompt({
      title: 'New Group',
      label: 'Name:',
      defaultValue: 'group1',
      confirmLabel: 'Create',
    })
    await flushPromises()

    expect(findButtonByText(document.body, 'OK')).toBeNull()
    const createBtn = findButtonByText(document.body, 'Create')
    expect(createBtn).toBeTruthy()
    createBtn!.click()

    expect(await p).toBe('group1')
    handle.unmount()
  })

  it('useShowAboutDialog throws outside its provider', () => {
    expect(() =>
      mountTree(React.createElement(Probe)),
    ).toThrow(/AboutDialogProvider/)
  })
})
