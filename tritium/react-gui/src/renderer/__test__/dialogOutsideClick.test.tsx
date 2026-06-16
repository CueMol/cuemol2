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
import { ChangeChainIdDialog } from '../components/dialogs/ChangeChainIdDialog'
import { ChangeResidueIndexDialog } from '../components/dialogs/ChangeResidueIndexDialog'
import { CutSurfByPlaneDialog } from '../components/dialogs/CutSurfByPlaneDialog'
import { DeleteMolDialog } from '../components/dialogs/DeleteMolDialog'
import { MakeMolSurfDialog } from '../components/dialogs/MakeMolSurfDialog'
import { MergeMolDialog } from '../components/dialogs/MergeMolDialog'
import { MolSuperposeDialog } from '../components/dialogs/MolSuperposeDialog'
import { ReassignProt2ndryDialog } from '../components/dialogs/ReassignProt2ndryDialog'
import { InteractionAnalysisDialog } from '../components/dialogs/InteractionAnalysisDialog'
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

/**
 * The 9 molecule-edit dialogs render their frame through the shared
 * `DialogShell`. This block pins the DialogShell-owned frame contract on
 * each of them (not just the two boolean props above, but also the
 * light-theme `portalClassName === ''` value -- NOT `undefined` -- the
 * title, and a token-driven `style.width`). It guards the shell extraction:
 * if DialogShell stops forwarding any of these, every dialog regresses here.
 */
describe('Molecule-edit dialogs: DialogShell frame contract', () => {
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
