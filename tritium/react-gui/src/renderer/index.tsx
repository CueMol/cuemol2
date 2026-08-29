import { createRoot } from 'react-dom/client'

// Blueprint.js styles (must come before app styles so overrides take effect)
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'

import './index.css'
import './app.css'

import App from './App'
import { WorkspaceProvider } from './state/workspace'
import { CueMolProvider } from '@renderer/hooks/cuemol/useCueMol'
import { LogProvider } from './contexts/LogContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { CommandProvider } from './commands/CommandRegistry'
import { DialogProvider } from './contexts/DialogContext'
import { ModalOpenCounterProvider } from './contexts/ModalOpenCounterContext'
import { RenderConfigProvider } from './contexts/RenderConfigContext'
import { ApbsConfigProvider } from './contexts/ApbsConfigContext'
import { ViewInputConfigProvider } from './contexts/ViewInputConfigContext'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import { ErrorBoundary } from './crash/ErrorBoundary'
import { installGlobalCrashHandlers } from './crash/installGlobalCrashHandlers'

// Install before React renders so that synchronous throws in any
// Provider's constructor still surface through the crash funnel.
installGlobalCrashHandlers()

const container = document.getElementById('root') as HTMLElement
createRoot(container).render(
  <ErrorBoundary>
    <CueMolProvider>
      {/* LogProvider owns the Output-panel buffer + the C++ log subscription;
          inside CueMolProvider so useLogEvent can reach the core, and above
          App so any component can append via useLogPanel(). */}
      <LogProvider>
        <ThemeProvider>
          <CommandProvider>
            <ModalOpenCounterProvider>
              {/* ApbsConfigProvider sits ABOVE DialogProvider so the
                  APBS tool dialog (rendered by DialogProvider) can read the
                  persisted exe paths live; SettingsPane (in <App/>) is below
                  it too. Other config providers stay below DialogProvider
                  because no dialog consumes them. */}
              <ApbsConfigProvider>
                <DialogProvider>
                  <RenderConfigProvider>
                    <ViewInputConfigProvider>
                      <AppSettingsProvider>
                        {/* Below DialogProvider and CommandProvider: closing
                            a tab runs the save prompt and the FileSave
                            command from inside the provider. */}
                        <WorkspaceProvider>
                          <App />
                        </WorkspaceProvider>
                      </AppSettingsProvider>
                    </ViewInputConfigProvider>
                  </RenderConfigProvider>
                </DialogProvider>
              </ApbsConfigProvider>
            </ModalOpenCounterProvider>
          </CommandProvider>
        </ThemeProvider>
      </LogProvider>
    </CueMolProvider>
  </ErrorBoundary>
)
