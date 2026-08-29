/**
 * @file shell/AppShell.tsx
 * @description The application chrome: menu bar, toolbar, the resizable
 * frame, the status bar and the file-drop overlay.
 *
 * Every child reads what it shows from a provider, so this composes them
 * without passing anything down and re-renders only when it is itself
 * remounted.
 */

import React from 'react'
import { IconContext } from '@phosphor-icons/react'
import { MenuBar } from '../components/MenuBar'
import { Toolbar } from '../components/Toolbar'
import { StatusBar } from '../components/StatusBar'
import { MainLayout } from './MainLayout'
import { FileDropLayer } from './FileDropLayer'

/**
 * Phosphor icon defaults: inherit the text colour (theme-aware), regular
 * weight. A module constant so the context value never changes identity --
 * a new object here would re-render every icon in the app.
 */
const PHOSPHOR_ICON_DEFAULTS = { color: 'currentColor', weight: 'regular' } as const

export const AppShell: React.FC = () => (
  <IconContext.Provider value={PHOSPHOR_ICON_DEFAULTS}>
    <div className="app">
      {/* macOS uses the native menu bar; other platforms render our own. */}
      {window.electronAPI?.platform !== 'darwin' && <MenuBar />}
      <Toolbar />
      <MainLayout />
      <StatusBar />
      <FileDropLayer />
    </div>
  </IconContext.Provider>
)
