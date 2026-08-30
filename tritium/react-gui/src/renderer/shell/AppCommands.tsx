/**
 * @file shell/AppCommands.tsx
 * @description Mounts every CmdId handler and the Electron IPC bridge.
 *
 * A component rather than a call in App so the provider subscriptions the
 * handlers need re-render this and nothing else.
 */

import React from 'react'
import { useCommandRegistrations } from '@renderer/hooks/useCommandRegistrations'

export const AppCommands: React.FC = () => {
  useCommandRegistrations()
  return null
}
