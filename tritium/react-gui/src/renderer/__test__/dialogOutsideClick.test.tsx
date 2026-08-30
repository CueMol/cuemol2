/**
 * Pins the project-wide visual / dismissal contract for every Blueprint
 * Dialog:
 *
 *   - canOutsideClickClose={false}  -- backdrop click is a no-op; only
 *     ESC, explicit Cancel buttons, or onConfirm dismiss the dialog
 *     (matches UXP and native file-open dialog UX).
 *   - isCloseButtonShown={false}    -- no window-chrome (X) button in
 *     the header, since the dialog is not draggable and the title is
 *     rendered as an inline section heading rather than a title bar.
 *
 * The test mocks Blueprint's Dialog as a prop-recording stub so each
 * dialog's outer JSX is exercised (its hooks/state run) but the body
 * children never mount. We assert the captured props on the recorded
 * call.
 *
 * Every dialog in the app now renders its frame through DialogShell, so
 * there is one block: if the shell stops forwarding any of these, all of
 * them regress here at once.
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
vi.mock('@renderer/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: false, cm: null }),
}))

import { AboutDialog } from '@renderer/dialogs/AboutDialog'
import { ConfirmCloseTabDialog } from '@renderer/dialogs/ConfirmCloseTabDialog'
import { ConfirmReloadSceneDialog } from '@renderer/dialogs/ConfirmReloadSceneDialog'
import { ErrorAlertDialog } from '@renderer/dialogs/ErrorAlertDialog'
import { ObjectPickerDialog } from '@renderer/dialogs/ObjectPickerDialog'
import { TextPromptDialog } from '@renderer/dialogs/TextPromptDialog'
import { EditCameraVisFlagsDialog } from '@renderer/dialogs/EditCameraVisFlagsDialog'
import { GetPdbDialog } from '@renderer/dialogs/GetPdbDialog'
import { NewTabDialog } from '@renderer/dialogs/NewTabDialog'
import { QscWriterOptionDialog } from '@renderer/dialogs/QscWriterOptionDialog'
import { StreamProgressDialog } from '@renderer/dialogs/StreamProgressDialog'
import { FileOpenOptionDialog } from '@renderer/dialogs/fopen-opt-dlgs/FileOpenOptionDialog'
import { ChangeChainIdDialog } from '@renderer/dialogs/ChangeChainIdDialog'
import { ChangeResidueIndexDialog } from '@renderer/dialogs/ChangeResidueIndexDialog'
import { CutSurfByPlaneDialog } from '@renderer/dialogs/CutSurfByPlaneDialog'
import { DeleteMolDialog } from '@renderer/dialogs/DeleteMolDialog'
import { MakeMolSurfDialog } from '@renderer/dialogs/MakeMolSurfDialog'
import { MergeMolDialog } from '@renderer/dialogs/MergeMolDialog'
import { MolSuperposeDialog } from '@renderer/dialogs/MolSuperposeDialog'
import { ReassignProt2ndryDialog } from '@renderer/dialogs/ReassignProt2ndryDialog'
import { InteractionAnalysisDialog } from '@renderer/dialogs/InteractionAnalysisDialog'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

void React

function lastDialogProps(): Record<string, unknown> {
  expect(dialogPropsList.length).toBeGreaterThan(0)
  return dialogPropsList[dialogPropsList.length - 1]
}

/**
 * Pins the DialogShell-owned frame contract on every dialog: the two boolean
 * props, the light-theme `portalClassName === ''` value (NOT `undefined`), the
 * title, and a `style.width` that is a token rung rather than a number.
 */
describe('DialogShell frame contract', () => {
  beforeEach(() => {
    dialogPropsList.length = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const cases: Array<{ name: string; render: () => React.ReactElement; title: string }> = [
    {
      name: 'ChangeChainIdDialog',
      title: 'Change chain ID',
      render: () => React.createElement(ChangeChainIdDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'ChangeResidueIndexDialog',
      title: 'Change residue index',
      render: () => React.createElement(ChangeResidueIndexDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'CutSurfByPlaneDialog',
      title: 'Mol surface cutter',
      render: () => React.createElement(CutSurfByPlaneDialog, {
        visible: true, sceneId: 0, viewId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'DeleteMolDialog',
      title: 'Delete atoms',
      render: () => React.createElement(DeleteMolDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'MakeMolSurfDialog',
      title: 'Mol surface generation',
      render: () => React.createElement(MakeMolSurfDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'MergeMolDialog',
      title: 'Merge molecule',
      render: () => React.createElement(MergeMolDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'MolSuperposeDialog',
      title: 'Molecular superposition',
      render: () => React.createElement(MolSuperposeDialog, {
        visible: true, sceneId: 0, viewId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'ReassignProt2ndryDialog',
      title: 'Reassign secondary structure',
      render: () => React.createElement(ReassignProt2ndryDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    // Moved onto the shell from a hand-rolled frame. ErrorAlertDialog is the
    // one that changes behaviour: it was the only dialog in the app still
    // showing a window-chrome (X) button, which the stylesheet already assumed
    // was gone everywhere.
    {
      name: 'AboutDialog',
      title: 'About CueMol3',
      render: () => React.createElement(AboutDialog, { visible: true, onClose: () => {} }),
    },
    {
      name: 'ConfirmCloseTabDialog',
      title: 'Unsaved Changes',
      render: () => React.createElement(ConfirmCloseTabDialog, {
        visible: true, sceneName: 's', onResult: () => {},
      }),
    },
    {
      name: 'ConfirmReloadSceneDialog',
      title: 'Reload Scene',
      render: () => React.createElement(ConfirmReloadSceneDialog, {
        visible: true, sceneName: 's', onResult: () => {},
      }),
    },
    {
      name: 'ErrorAlertDialog',
      title: 'Open failed',
      render: () => React.createElement(ErrorAlertDialog, {
        visible: true, title: 'Open failed', message: 'no reader', onClose: () => {},
      }),
    },
    {
      name: 'ObjectPickerDialog',
      title: 'Save Object As',
      render: () => React.createElement(ObjectPickerDialog, {
        visible: true, objects: [{ id: 1, name: 'mol1' }], onResult: () => {},
      }),
    },
    {
      name: 'StreamProgressDialog',
      title: 'Downloading',
      render: () => React.createElement(StreamProgressDialog, {
        visible: true, title: 'Downloading', bytesReceived: 0,
        status: 'downloading' as const, onCancel: () => {},
      }),
    },
    {
      name: 'GetPdbDialog',
      title: 'Get PDB',
      render: () => React.createElement(GetPdbDialog, {
        visible: true, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'NewTabDialog',
      title: 'New Tab/Window',
      render: () => React.createElement(NewTabDialog, {
        visible: true, currentSceneName: 's', defaultSceneName: 'Scene_1',
        defaultViewName: 'View_1', onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'TextPromptDialog',
      title: 'Rename',
      render: () => React.createElement(TextPromptDialog, {
        visible: true, title: 'Rename', label: 'Name', defaultValue: 'x',
        onResult: () => {},
      }),
    },
    {
      name: 'QscWriterOptionDialog',
      title: 'Scene options',
      render: () => React.createElement(QscWriterOptionDialog, {
        visible: true, onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'EditCameraVisFlagsDialog',
      title: 'Edit visibility flags: cam1',
      render: () => React.createElement(EditCameraVisFlagsDialog, {
        visible: true, cameraName: 'cam1', entries: [], onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'FileOpenOptionDialog',
      title: 'Open File Options',
      render: () => React.createElement(FileOpenOptionDialog, {
        visible: true, filePath: '/tmp/foo.pdb', sceneId: 0,
        rendererTypes: ['*default'], objType: '', readerName: 'pdb',
        onConfirm: () => {}, onCancel: () => {},
      }),
    },
    {
      name: 'InteractionAnalysisDialog',
      title: 'Interaction analysis',
      render: () => React.createElement(InteractionAnalysisDialog, {
        visible: true, sceneId: 0, onConfirm: () => {}, onCancel: () => {},
      }),
    },
  ]

  for (const c of cases) {
    it(`${c.name} forwards the DialogShell frame props`, () => {
      const handle = mountTree(c.render())
      const props = lastDialogProps()
      expect(props.canOutsideClickClose).toBe(false)
      expect(props.isCloseButtonShown).toBe(false)
      // Light theme: portalClassName is the empty string, NOT undefined.
      expect(props.portalClassName).toBe('')
      expect(props.title).toBe(c.title)
      // Width is a token rung (CSS custom property), never a raw px number.
      const width = (props.style as { width?: unknown } | undefined)?.width
      expect(typeof width).toBe('string')
      expect(String(width)).toMatch(/^var\(--dialog-w-/)
      handle.unmount()
    })
  }
})

/*
 * The two escape hatches the conversion needed. Both are load-bearing: without
 * the first, Escape abandons a download while it keeps running; without the
 * second, the About splash gets the shared form gutter and stops being
 * full-bleed.
 */
describe('DialogShell escape hatches', () => {
  beforeEach(() => {
    dialogPropsList.length = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lets Escape close a dialog by default', () => {
    const handle = mountTree(
      React.createElement(ConfirmReloadSceneDialog, {
        visible: true, sceneName: 's', onResult: () => {},
      }),
    )
    expect(lastDialogProps().canEscapeKeyClose).toBe(true)
    handle.unmount()
  })

  it('refuses Escape while a download is in flight', () => {
    const handle = mountTree(
      React.createElement(StreamProgressDialog, {
        visible: true, title: 'Downloading', bytesReceived: 0,
        status: 'downloading' as const, onCancel: () => {},
      }),
    )
    expect(lastDialogProps().canEscapeKeyClose).toBe(false)
    handle.unmount()
  })
})
