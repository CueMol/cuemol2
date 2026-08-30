/**
 * @file render.tsx
 * @description Entry point of the modeless Rendering window (render.html).
 *
 * This window hosts only pure-UI render components; it has NO CueMol worker
 * (the native addon lives solely in the main window's renderer). All render
 * execution is relayed to the main window over IPC -- see
 * hooks/useRenderWindowClient.ts and main/renderWindowIpc.ts.
 *
 * The provider stack is deliberately minimal: no CueMolProvider (would spawn
 * a second native addon), no dialog/command providers, and no
 * installGlobalCrashHandlers (a satellite-window crash must not exit the
 * app; the main process destroys just this window on render-process-gone).
 *
 * ContextMenuProvider is the exception: main registers the text context menu
 * on this window too, and on Windows / Linux that arrives as an
 * IPC.TEXT_CTX_SHOW push the renderer has to draw itself. Without a subscriber
 * here, right-clicking a text field in this window produced no menu at all.
 */

import { createRoot } from 'react-dom/client'

// Blueprint.js styles (must come before app styles so overrides take effect)
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'

import './index.css'
import './app.css'

import { ThemeProvider } from '@renderer/contexts/ThemeContext'
import { ContextMenuProvider } from '@renderer/shell/menu/ContextMenuProvider'
import { ErrorBoundary } from '@renderer/crash/ErrorBoundary'
import { RenderWindowApp } from '@renderer/features/render/renderwindow/RenderWindowApp'

const container = document.getElementById('root') as HTMLElement
createRoot(container).render(
  <ErrorBoundary>
    <ThemeProvider>
      <ContextMenuProvider>
        <RenderWindowApp />
      </ContextMenuProvider>
    </ThemeProvider>
  </ErrorBoundary>
)
