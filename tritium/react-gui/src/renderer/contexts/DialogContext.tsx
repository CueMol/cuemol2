/**
 * @file contexts/DialogContext.tsx
 * @description Composite Provider that mounts every per-dialog Provider in
 * one place. Each individual dialog ships its own `<XxxDialogProvider>` and
 * `useShowXxxDialog()` hook (see `dialogs/*Provider.tsx`).
 *
 * Adding a new dialog: append its provider component to the array below.
 * The outer-to-inner mount order matches the array order (first entry is
 * outermost), but dialogs do not depend on each other so the order is
 * not load-bearing.
 */

import { AboutDialogProvider } from '@renderer/dialogs/AboutDialogProvider'
import { NewTabDialogProvider } from '@renderer/dialogs/NewTabDialogProvider'
import { ConfirmCloseTabDialogProvider } from '@renderer/dialogs/ConfirmCloseTabDialogProvider'
import { FileOpenOptionDialogProvider } from '@renderer/dialogs/fopen-opt-dlgs/FileOpenOptionDialogProvider'
import { GetPdbDialogProvider } from '@renderer/dialogs/GetPdbDialogProvider'
import { QscWriterOptionDialogProvider } from '@renderer/dialogs/QscWriterOptionDialogProvider'
import { StreamProgressDialogProvider } from '@renderer/dialogs/StreamProgressDialogProvider'
import { TextPromptDialogProvider } from '@renderer/dialogs/TextPromptDialogProvider'
import { NewRendererDialogProvider } from '@renderer/dialogs/NewRendererDialogProvider'
import { OpenMdTrajDialogProvider } from '@renderer/dialogs/OpenMdTrajDialogProvider'
import { ApplyRendStyleDialogProvider } from '@renderer/dialogs/ApplyRendStyleDialogProvider'
import { CreateRendStyleDialogProvider } from '@renderer/dialogs/CreateRendStyleDialogProvider'
import { ObjectPickerDialogProvider } from '@renderer/dialogs/ObjectPickerDialogProvider'
import { ConfirmReloadSceneDialogProvider } from '@renderer/dialogs/ConfirmReloadSceneDialogProvider'
import { SymmetryChangeDialogProvider } from '@renderer/dialogs/SymmetryChangeDialogProvider'
import { ChangeChainIdDialogProvider } from '@renderer/dialogs/ChangeChainIdDialogProvider'
import { DeleteMolDialogProvider } from '@renderer/dialogs/DeleteMolDialogProvider'
import { ChangeResidueIndexDialogProvider } from '@renderer/dialogs/ChangeResidueIndexDialogProvider'
import { MergeMolDialogProvider } from '@renderer/dialogs/MergeMolDialogProvider'
import { MakeMolSurfDialogProvider } from '@renderer/dialogs/MakeMolSurfDialogProvider'
import { RegenMolSurfDialogProvider } from '@renderer/dialogs/RegenMolSurfDialogProvider'
import { CalcApbsPotDialogProvider } from '@renderer/dialogs/CalcApbsPotDialogProvider'
import { InteractionAnalysisDialogProvider } from '@renderer/dialogs/InteractionAnalysisDialogProvider'
import { CutSurfByPlaneDialogProvider } from '@renderer/dialogs/CutSurfByPlaneDialogProvider'
import { ExportPngOptionsDialogProvider } from '@renderer/dialogs/ExportPngOptionsDialogProvider'
import { ReassignProt2ndryDialogProvider } from '@renderer/dialogs/ReassignProt2ndryDialogProvider'
import { MolSuperposeDialogProvider } from '@renderer/dialogs/MolSuperposeDialogProvider'
import { MorphAnimDialogProvider } from '@renderer/dialogs/MorphAnimDialogProvider'
import { ErrorAlertDialogProvider } from '@renderer/dialogs/ErrorAlertDialogProvider'
import { EditCameraVisFlagsDialogProvider } from '@renderer/dialogs/EditCameraVisFlagsDialogProvider'
import { EditInteractionListDialogProvider } from '@renderer/dialogs/EditInteractionListDialogProvider'
import { StyleEditorDialogProvider } from '@renderer/dialogs/StyleEditorDialogProvider'
import { composeProviders } from './composeProviders'
import { ContextMenuProvider } from '@renderer/shell/menu/ContextMenuProvider'

export const DialogProvider = composeProviders([
  // Not a dialog, but the same "mount one host, expose a useShowXxx hook"
  // shape: the React context menu host for Windows / Linux.
  ContextMenuProvider,
  AboutDialogProvider,
  NewTabDialogProvider,
  ConfirmCloseTabDialogProvider,
  FileOpenOptionDialogProvider,
  OpenMdTrajDialogProvider,
  GetPdbDialogProvider,
  QscWriterOptionDialogProvider,
  StreamProgressDialogProvider,
  TextPromptDialogProvider,
  NewRendererDialogProvider,
  ApplyRendStyleDialogProvider,
  CreateRendStyleDialogProvider,
  ObjectPickerDialogProvider,
  ConfirmReloadSceneDialogProvider,
  SymmetryChangeDialogProvider,
  ChangeChainIdDialogProvider,
  DeleteMolDialogProvider,
  ChangeResidueIndexDialogProvider,
  MergeMolDialogProvider,
  MakeMolSurfDialogProvider,
  RegenMolSurfDialogProvider,
  CalcApbsPotDialogProvider,
  InteractionAnalysisDialogProvider,
  CutSurfByPlaneDialogProvider,
  ExportPngOptionsDialogProvider,
  ReassignProt2ndryDialogProvider,
  MolSuperposeDialogProvider,
  MorphAnimDialogProvider,
  ErrorAlertDialogProvider,
  EditCameraVisFlagsDialogProvider,
  EditInteractionListDialogProvider,
  StyleEditorDialogProvider,
])
