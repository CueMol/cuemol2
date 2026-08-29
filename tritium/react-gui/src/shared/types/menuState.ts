/**
 * @file shared/types/menuState.ts
 * @description Native application-menu state pushed from the renderer.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export type ViewCenterMark = 'none' | 'crosshair' | 'axis'

export type SceneBgColor = 'white' | 'black' | 'other'

export interface MenuState {
  viewProjection?: {
    enabled: boolean
    perspective: boolean | null
  }
  viewCenterMark?: {
    enabled: boolean
    centerMark: ViewCenterMark | null
  }
  sceneBgColor?: {
    enabled: boolean
    bgColor: SceneBgColor | null
  }
  undo?: {
    enabled: boolean
  }
  redo?: {
    enabled: boolean
  }
  /**
   * Enablement of menu items that act on an existing scene (Save / Save As /
   * Export / Reload / molecule tools, ...). Disabled when no molview tab is
   * active so they read as unavailable instead of silently doing nothing.
   */
  sceneOps?: {
    enabled: boolean
  }
  /**
   * Scene-exporter availability for the running libcuemol2 build: the set of
   * exporter nicknames registered in category 2. Export menu items whose
   * exporter is absent are hidden. An empty array is treated as "unknown" and
   * hides nothing (fail-open); pushed once at startup after the worker probe.
   */
  exportCaps?: {
    available: string[]
  }
}
