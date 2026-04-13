/**
 * @file hooks/useElectronIpc.ts
 * @description Registers Electron IPC listeners for the renderer process.
 *
 * Handles:
 *  - file:opened  — routes mol/scene files to CueMol, text files to the tab editor
 *  - file:error   — logs load errors
 *  - menu:new-tab / menu:close-tab / menu:save / menu:new-scene — menu commands
 *
 * Also owns the `createNewScene` helper that creates a CueMol scene + view
 * and opens a molview tab for it.
 */

import { useEffect, useCallback } from 'react'
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager'
import type { AsyncCueMol } from '../worker/AsyncCueMol'

// Extensions that CueMol loads directly from disk; no need to send content.
const NEW_SCENE_EXTS = new Set(['qsc'])
const MOL_EXTS = new Set(['pdb', 'cif', 'mol2', 'sdf'])

interface UseElectronIpcOptions {
  cm: AsyncCueMol | null
  addMolTab: (title: string, viewId: number, sceneId: number) => void
  addMolViewTab: (title: string, viewId: number) => void
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
  openFileFromData: (name: string, content: string, filePath?: string) => void
  handleNewTab: () => void
  handleCloseTab: (id: string) => void
  handleSave: () => void
  activeTab: string | null
}

export function useElectronIpc({
  cm,
  addMolTab,
  addMolViewTab,
  getActiveSceneInfo,
  openFileFromData,
  handleNewTab,
  handleCloseTab,
  handleSave,
  activeTab,
}: UseElectronIpcOptions): void {

  // ── createNewScene ──────────────────────────────────────────────────────────

  const createNewScene = useCallback(async (filePath?: string) => {
    if (!cm) return
    const sceMgr = (await cm.getService('SceneManager')) as SceneManager
    if (!sceMgr) return
    const scene = await sceMgr.createScene()
    const scene_uid = await scene.getUID()
    const view = await scene.createView()
    const view_uid = await view.getUID()
    const dpr = window.devicePixelRatio || 1
    await cm.addView(view_uid, dpr)
    const title = `Scene ${scene_uid}`
    addMolTab(title, view_uid, scene_uid)
    addMolViewTab(title, view_uid)
    if (filePath) {
      await cm.loadFile(filePath, scene_uid, view_uid)
    }
  }, [cm, addMolTab, addMolViewTab])

  // ── IPC listeners ───────────────────────────────────────────────────────────

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubs = [
      api.onFileOpened((data) => {
        const ext = data.path?.split('.').pop()?.toLowerCase() ?? ''
        if (cm && NEW_SCENE_EXTS.has(ext)) {
          createNewScene(data.path!).catch((e: unknown) =>
            console.error('createNewScene failed:', e)
          )
          return
        }
        if (cm && MOL_EXTS.has(ext)) {
          const info = getActiveSceneInfo()
          if (info) {
            cm.loadFile(data.path!, info.scene_uid, info.view_id)
              .catch((e: unknown) => console.error('loadFile failed:', e))
            return
          }
        }
        // Text/unknown files — open in tab editor (content required)
        openFileFromData(data.name, data.content ?? '', data.path)
      }),
      api.onFileError((data) =>
        console.error(`Failed to open ${data.path}: ${data.error}`)
      ),
      api.onMenuNewTab(() => handleNewTab()),
      api.onMenuCloseTab(() => { if (activeTab) handleCloseTab(activeTab) }),
      api.onMenuSave(() => handleSave()),
      api.onMenuNewScene(() => {
        createNewScene().catch((e: unknown) =>
          console.error('createNewScene failed:', e)
        )
      }),
    ]

    return () => unsubs.forEach((unsub) => unsub())
  }, [
    openFileFromData, handleNewTab, handleCloseTab, handleSave,
    createNewScene, activeTab, cm, getActiveSceneInfo,
  ])
}
