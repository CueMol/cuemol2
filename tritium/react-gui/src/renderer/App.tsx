/**
 * Root component of the CueMol desktop application.
 *
 * Layout: Toolbar / [ActivityBar | SidePanel | [ContentArea / BottomPanel] | InspectorPanel] / StatusBar
 *
 * Everything with state lives elsewhere: the providers under state/ own the
 * domain state, shell/ owns the chrome and the window-level wiring. App
 * subscribes to nothing, so it renders once and the panes below it re-render
 * only for the provider slice each one reads.
 */

import React from 'react'
import { AppBoot, AppCommands, AppShell, RenderWindowBridge } from './shell'

const App: React.FC = () => (
  <>
    {/* No UI of their own: the launch / OS wiring, the command handlers and
        the Rendering-window bridge. Mounted as components so the provider
        slices they read re-render them alone, not the chrome. */}
    <AppBoot />
    <AppCommands />
    <RenderWindowBridge />
    <AppShell />
  </>
)

export default App
