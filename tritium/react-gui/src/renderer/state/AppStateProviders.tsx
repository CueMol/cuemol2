/**
 * @file state/AppStateProviders.tsx
 * @description The app-level state providers, in dependency order.
 *
 * Mounted between the dialog / command providers and App. The order is a
 * dependency chain, outermost first:
 *   Layout        -- nothing above it
 *   Workspace     -- needs the dialogs and commands (close confirm)
 *   ActiveTool    -- nothing else
 *   StatusMessage -- needs ViewInputConfig (mounted above)
 *   ActiveView    -- needs the workspace (active view / scene)
 *   UndoRedo      -- needs the workspace and commands
 */

import React from 'react'
import { LayoutProvider } from './layout'
import { WorkspaceProvider } from './workspace'
import { ActiveToolProvider } from '../contexts/ActiveToolContext'
import { StatusMessageProvider } from './statusMessage'
import { ActiveViewStateProvider } from './activeView'
import { UndoRedoProvider } from './undoRedo'

export function AppStateProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <LayoutProvider>
      <WorkspaceProvider>
        <ActiveToolProvider>
          <StatusMessageProvider>
            <ActiveViewStateProvider>
              <UndoRedoProvider>{children}</UndoRedoProvider>
            </ActiveViewStateProvider>
          </StatusMessageProvider>
        </ActiveToolProvider>
      </WorkspaceProvider>
    </LayoutProvider>
  )
}
