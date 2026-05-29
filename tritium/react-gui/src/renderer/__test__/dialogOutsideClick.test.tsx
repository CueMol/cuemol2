/**
 * Pins the project-wide visual / dismissal contract for every Blueprint
 * Dialog:
 *
 *   - canOutsideClickClose={false}  — backdrop click is a no-op; only
 *     ESC, explicit Cancel buttons, or onConfirm dismiss the dialog
 *     (matches UXP and native file-open dialog UX).
 *   - isCloseButtonShown={false}    — no window-chrome (X) button in
 *     the header, since the dialog is not draggable and the title is
 *     rendered as an inline section heading rather than a title bar.
 *
 * The test mocks Blueprint's Dialog as a prop-recording stub so each
 * dialog's outer JSX is exercised (its hooks/state run) but the body
 * children never mount. We assert the captured props on the recorded
 * call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

const dialogPropsList: Array<Record<string, unknown>> = []

vi.mock('@blueprintjs/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@blueprintjs/core')
  const SpyDialog = (props: Record<string, unknown>) => {
    dialogPropsList.push(props)
    return null
  }
  return { ...actual, Dialog: SpyDialog }
})
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: false, cm: null }),
}))

import { AboutDialog } from '../components/dialogs/AboutDialog'
import { ConfirmCloseTabDialog } from '../components/dialogs/ConfirmCloseTabDialog'
import { GetPdbDialog } from '../components/dialogs/GetPdbDialog'
import { NewTabDialog } from '../components/dialogs/NewTabDialog'
import { QscWriterOptionDialog } from '../components/dialogs/QscWriterOptionDialog'
import { StreamProgressDialog } from '../components/dialogs/StreamProgressDialog'
import { FileOpenOptionDialog } from '../components/fopen-opt-dlgs/FileOpenOptionDialog'
import { mountTree } from './helpers/testHarness'

void React

function lastDialogProps(): Record<string, unknown> {
  expect(dialogPropsList.length).toBeGreaterThan(0)
  return dialogPropsList[dialogPropsList.length - 1]
}

describe('Modal dialog: backdrop click + close button are disabled', () => {
  beforeEach(() => {
    dialogPropsList.length = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AboutDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(AboutDialog, { visible: true, onClose: () => {} }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('ConfirmCloseTabDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(ConfirmCloseTabDialog, {
        visible: true,
        sceneName: 'Scene_1',
        onResult: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('GetPdbDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(GetPdbDialog, {
        visible: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('NewTabDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(NewTabDialog, {
        visible: true,
        currentSceneName: null,
        defaultSceneName: 'Scene_1',
        defaultViewName: 'View_1',
        onConfirm: () => {},
        onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('QscWriterOptionDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(QscWriterOptionDialog, {
        visible: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('StreamProgressDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(StreamProgressDialog, {
        visible: true,
        title: 'Loading',
        bytesReceived: 0,
        status: 'downloading',
        onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })

  it('FileOpenOptionDialog passes canOutsideClickClose={false}', () => {
    const handle = mountTree(
      React.createElement(FileOpenOptionDialog, {
        visible: true,
        filePath: '/tmp/foo.pdb',
        sceneId: 0,
        rendererTypes: ['*default'],
        objType: '',
        readerName: 'pdb',
        onConfirm: () => {},
        onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canOutsideClickClose).toBe(false)
    expect(lastDialogProps().isCloseButtonShown).toBe(false)
    handle.unmount()
  })
})
