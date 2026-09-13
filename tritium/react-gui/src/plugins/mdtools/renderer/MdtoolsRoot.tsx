/**
 * @file plugins/mdtools/renderer/MdtoolsRoot.tsx
 * @description The plugin's mount point: its dialog provider, with the
 * command handler inside it.
 *
 * The handler has to sit under the provider because that is what
 * `useShowOpenMdTrajDialog` resolves against. Unmounting this -- which is what
 * switching the plugin off does -- takes the dialog and the command with it.
 */

import React from 'react'
import { OpenMdTrajDialogProvider } from './OpenMdTrajDialogProvider'
import { useOpenMdTrajCommand } from './useOpenMdTrajCommand'

void React

/** Registers the command; renders nothing. */
const MdtoolsCommands: React.FC = () => {
  useOpenMdTrajCommand()
  return null
}

export const MdtoolsRoot: React.FC = () => (
  <OpenMdTrajDialogProvider>
    <MdtoolsCommands />
  </OpenMdTrajDialogProvider>
)
MdtoolsRoot.displayName = 'MdtoolsRoot'
