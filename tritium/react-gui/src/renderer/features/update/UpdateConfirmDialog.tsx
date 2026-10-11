/**
 * @file features/update/UpdateConfirmDialog.tsx
 * @description "Restart and update now?" once the new version is downloaded.
 *
 * OK unpacks the new app (UpdateProgressDialog) and then quits through the
 * usual save prompts; Later leaves a "Restart to Update" notification.
 */

import React from 'react'
import { DialogShell } from '@renderer/dialogs/DialogShell'
import { MarkdownBlock } from '@renderer/h3-kit/markdown'
import { Button } from '@blueprintjs/core'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

interface Props {
  visible: boolean
  // Absent while the dialog is mounted hidden with no arguments yet.
  version?: string
  current?: string
  notes?: string
  onConfirm: (ok: true) => void
  onCancel: () => void
}

/** See the file header. */
export function UpdateConfirmDialog({ visible, version, current, notes, onConfirm, onCancel }: Props): React.JSX.Element {
  return (
    <DialogShell
      visible={visible}
      title="Install Update"
      width="xl"
      onCancel={onCancel}
      footerActions={
        <>
          <Button onClick={onCancel}>Later</Button>
          <Button intent="primary" onClick={() => onConfirm(true)}>Restart and Update</Button>
        </>
      }
    >
      <p className="update-confirm-text type-body">
        CueMol3 {version} has been downloaded (you have {current}). CueMol3 will quit, replace
        itself with the new version and start again. You will be asked to save any unsaved scenes.
      </p>
      {notes?.trim() && (
        <div className="update-confirm-notes">
          <MarkdownBlock text={notes} />
        </div>
      )}
    </DialogShell>
  )
}

/** Arguments of {@link useShowUpdateConfirmDialog}. */
export interface UpdateConfirmArgs {
  version: string
  current: string
  notes: string
}

export const { Provider: UpdateConfirmDialogProvider, useShow: useShowUpdateConfirmDialog } =
  createConfirmCancelDialog<UpdateConfirmArgs, true>({
    name: 'UpdateConfirmDialog',
    component: UpdateConfirmDialog,
  })
