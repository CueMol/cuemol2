/**
 * @file contexts/DialogContext.tsx
 * @description Composite Provider that mounts every per-dialog Provider in
 * one place. Each individual dialog ships its own `<XxxDialogProvider>` and
 * `useShowXxxDialog()` hook (see `components/dialogs/*Provider.tsx`).
 *
 * Adding a new dialog: append its provider component to the array below.
 * The outer-to-inner mount order matches the array order (first entry is
 * outermost), but dialogs do not depend on each other so the order is
 * not load-bearing.
 */

import { AboutDialogProvider } from '../components/dialogs/AboutDialogProvider'
import { NewTabDialogProvider } from '../components/dialogs/NewTabDialogProvider'
import { ConfirmCloseTabDialogProvider } from '../components/dialogs/ConfirmCloseTabDialogProvider'
import { FileOpenOptionDialogProvider } from '../components/fopen-opt-dlgs/FileOpenOptionDialogProvider'
import { GetPdbDialogProvider } from '../components/dialogs/GetPdbDialogProvider'
import { QscWriterOptionDialogProvider } from '../components/dialogs/QscWriterOptionDialogProvider'
import { StreamProgressDialogProvider } from '../components/dialogs/StreamProgressDialogProvider'
import { NodePropertyDialogProvider } from '../components/dialogs/NodePropertyDialogProvider'
import { TextPromptDialogProvider } from '../components/dialogs/TextPromptDialogProvider'
import { NewRendererDialogProvider } from '../components/dialogs/NewRendererDialogProvider'
import { ApplyRendStyleDialogProvider } from '../components/dialogs/ApplyRendStyleDialogProvider'
import { CreateRendStyleDialogProvider } from '../components/dialogs/CreateRendStyleDialogProvider'
import { composeProviders } from './composeProviders'

export const DialogProvider = composeProviders([
  AboutDialogProvider,
  NewTabDialogProvider,
  ConfirmCloseTabDialogProvider,
  FileOpenOptionDialogProvider,
  GetPdbDialogProvider,
  QscWriterOptionDialogProvider,
  StreamProgressDialogProvider,
  NodePropertyDialogProvider,
  TextPromptDialogProvider,
  NewRendererDialogProvider,
  ApplyRendStyleDialogProvider,
  CreateRendStyleDialogProvider,
])
