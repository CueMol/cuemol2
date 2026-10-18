/**
 * @file plugins/console/renderer/ConsoleRoot.tsx
 * @description The plugin's mount point: it owns the command runner.
 *
 * Renders nothing. The runner has to outlive the panel, which the bottom
 * panel unmounts whenever another tab is in front; so does the endpoint the
 * command line client talks to.
 */

import React from 'react'
import { useConsoleEndpoint } from './useConsoleEndpoint'
import { useConsoleRunner } from './useConsoleRunner'

void React

export const ConsoleRoot: React.FC = () => {
  useConsoleRunner()
  useConsoleEndpoint()
  return null
}
ConsoleRoot.displayName = 'ConsoleRoot'
