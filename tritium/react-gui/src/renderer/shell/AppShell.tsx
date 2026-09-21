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
import { MenuBar } from './MenuBar'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { MainLayout } from './MainLayout'
import { FileDropLayer } from './FileDropLayer'
// Benchmark harness (bench/perf-harness branch only; never merged to develop).
import { isBenchMode } from '@renderer/bench/isBenchMode'

/**
 * Phosphor icon defaults: inherit the text colour (theme-aware), regular
 * weight. A module constant so the context value never changes identity --
 * a new object here would re-render every icon in the app.
 */
const PHOSPHOR_ICON_DEFAULTS = { color: 'currentColor', weight: 'regular' } as const

export const AppShell: React.FC = () => {
  // A measured run gives the whole window to the 3D view; see MainLayout.
  const bench = isBenchMode()
  return (
    <IconContext.Provider value={PHOSPHOR_ICON_DEFAULTS}>
      <div className="app">
        {/* macOS uses the native menu bar; other platforms render our own. */}
        {!bench && window.electronAPI?.platform !== 'darwin' && <MenuBar />}
        {!bench && <Toolbar />}
        <MainLayout />
        {!bench && <StatusBar />}
        <FileDropLayer />
      </div>
    </IconContext.Provider>
  )
}
