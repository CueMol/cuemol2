/**
 * @file plugins/console/renderer/ConsoleRoot.tsx
 * @description The plugin's mount point: it owns the command runner.
 *
 * Renders nothing. The runner has to outlive the panel, which the bottom
 * panel unmounts whenever another tab is in front.
 */

import React from 'react'
import { useConsoleRunner } from './useConsoleRunner'

void React

export const ConsoleRoot: React.FC = () => {
  useConsoleRunner()
  return null
}
ConsoleRoot.displayName = 'ConsoleRoot'
