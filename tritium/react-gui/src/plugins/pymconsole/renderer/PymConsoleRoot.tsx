/**
 * @file plugins/pymconsole/renderer/PymConsoleRoot.tsx
 * @description The plugin's mount point: it owns the command runner.
 *
 * Renders nothing. The runner has to outlive the panel, which the bottom
 * panel unmounts whenever another tab is in front.
 */

import React from 'react'
import { usePymCommandRunner } from './usePymCommandRunner'

void React

export const PymConsoleRoot: React.FC = () => {
  usePymCommandRunner()
  return null
}
PymConsoleRoot.displayName = 'PymConsoleRoot'
