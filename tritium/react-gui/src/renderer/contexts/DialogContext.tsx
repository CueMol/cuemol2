/**
 * @file contexts/DialogContext.tsx
 * @description Composite Provider that mounts every per-dialog Provider in
 * one place. Each individual dialog ships its own `<XxxDialogProvider>` and
 * `useShowXxxDialog()` hook (see `components/dialogs/*Provider.tsx`).
 *
 * Adding a new dialog: add its provider component beneath, then export the
 * matching `useShowXxx` hook from the dialog's own file. No code change here
 * apart from the one-line `<XxxDialogProvider>` wrapping.
 */

import React from 'react'
import { AboutDialogProvider } from '../components/dialogs/AboutDialogProvider'
import { NewTabDialogProvider } from '../components/dialogs/NewTabDialogProvider'
import { ConfirmCloseTabDialogProvider } from '../components/dialogs/ConfirmCloseTabDialogProvider'
import { FileOpenOptionDialogProvider } from '../components/fopen-opt-dlgs/FileOpenOptionDialogProvider'
import { GetPdbDialogProvider } from '../components/dialogs/GetPdbDialogProvider'
import { QscWriterOptionDialogProvider } from '../components/dialogs/QscWriterOptionDialogProvider'
import { StreamProgressDialogProvider } from '../components/dialogs/StreamProgressDialogProvider'
import { NodePropertyDialogProvider } from '../components/dialogs/NodePropertyDialogProvider'
import { TextPromptDialogProvider } from '../components/dialogs/TextPromptDialogProvider'

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AboutDialogProvider>
    <NewTabDialogProvider>
      <ConfirmCloseTabDialogProvider>
        <FileOpenOptionDialogProvider>
          <GetPdbDialogProvider>
            <QscWriterOptionDialogProvider>
              <StreamProgressDialogProvider>
                <NodePropertyDialogProvider>
                  <TextPromptDialogProvider>
                    {children}
                  </TextPromptDialogProvider>
                </NodePropertyDialogProvider>
              </StreamProgressDialogProvider>
            </QscWriterOptionDialogProvider>
          </GetPdbDialogProvider>
        </FileOpenOptionDialogProvider>
      </ConfirmCloseTabDialogProvider>
    </NewTabDialogProvider>
  </AboutDialogProvider>
)
