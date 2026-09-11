/**
 * @file plugins/getpdb/renderer/GetPdbRoot.tsx
 * @description The plugin's mount point: its dialog provider, with the
 * command handler inside it.
 *
 * The handler has to sit under the provider because that is what
 * `useShowGetPdbDialog` resolves against. Unmounting this -- which is what
 * switching the plugin off does -- takes the dialog and the command with it.
 */

import React from 'react'
import { GetPdbDialogProvider } from './GetPdbDialogProvider'
import { useGetPdbCommand } from './useGetPdbCommand'

void React

/** Registers the command; renders nothing. */
const GetPdbCommands: React.FC = () => {
  useGetPdbCommand()
  return null
}

export const GetPdbRoot: React.FC = () => (
  <GetPdbDialogProvider>
    <GetPdbCommands />
  </GetPdbDialogProvider>
)
GetPdbRoot.displayName = 'GetPdbRoot'
