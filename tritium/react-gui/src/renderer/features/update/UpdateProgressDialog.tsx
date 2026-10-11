/**
 * @file features/update/UpdateProgressDialog.tsx
 * @description Modal progress while the downloaded update is unpacked and checked.
 *
 * Shown for the `installing` phase only. It is modal on purpose: the user has
 * just chosen to restart, so there is nothing to keep working on, and an edit
 * made now would only add a save prompt to the quit that follows. It has no
 * buttons; the step takes seconds and ends in the restart (or an error
 * notification).
 */

import React from 'react'
import { ProgressBar } from '@blueprintjs/core'
import { DialogShell } from '@renderer/dialogs/DialogShell'
import type { UpdateInstallStep } from '@shared/types/update'

const STEP_LABEL: Record<UpdateInstallStep, string> = {
  mount: 'Opening the disk image...',
  copy: 'Copying the new version...',
  verify: 'Checking the new version...',
}

interface Props {
  visible: boolean
  version: string
  step: UpdateInstallStep
  fraction: number
}

/** See the file header. */
export function UpdateProgressDialog({ visible, version, step, fraction }: Props): React.JSX.Element {
  const determinate = step === 'copy'
  return (
    <DialogShell
      visible={visible}
      title={`Installing CueMol3 ${version}`}
      width="md"
      onCancel={() => {}}
      canEscapeKeyClose={false}
      noFooter
    >
      <ProgressBar
        intent="primary"
        value={determinate ? fraction : undefined}
        animate={!determinate}
        stripes={!determinate}
      />
      <div className="update-progress-label type-caption">
        {STEP_LABEL[step]}
        {determinate ? ` ${Math.round(fraction * 100)}%` : ''}
      </div>
    </DialogShell>
  )
}
