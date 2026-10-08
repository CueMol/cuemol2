/**
 * @file plugin-host/sceneTabs.ts
 * @description The open scenes, as the tab strip shows them, for a plugin
 * that manages them by name rather than by mouse (the console's scene
 * commands).
 *
 * A scene is open while a molview tab shows one of its views; closing its
 * last tab destroys it. So "the scenes" are read off the strip, in strip
 * order, and every action here is a tab action.
 *
 * Each action resolves only once the strip shows its result, so a caller
 * that carries on (a command line that runs `new_scene; fetch 1crn`) finds
 * the scene it just made already active. The workspace's state is read
 * through refs that move on render, not on dispatch.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useNewSceneAction } from '@renderer/hooks/useNewSceneAction'
import { molViewTabsOf, useWorkspaceDispatch, useWorkspaceTabs } from '@renderer/state/workspace'

/** One open scene. */
export interface OpenScene {
  sceneId: number
  name: string
  /** Its views that have a tab, in strip order. */
  viewIds: number[]
  /** Whether the visible tab shows it. */
  active: boolean
  /** Whether it has changes that were not saved. */
  modified: boolean
}

export interface SceneTabs {
  /** The open scenes, in the order their first tabs appear. */
  list(): Promise<OpenScene[]>
  /** Make a scene (named, or with the next default name) in a new tab, and show it. */
  create(name?: string): Promise<{ sceneId: number; name: string } | null>
  /** Show the scene's first tab. */
  activate(sceneId: number): Promise<void>
  /**
   * Close every tab of the scene, without the save prompt: the caller has
   * decided what happens to unsaved changes. Resolves false when a tab
   * stayed open.
   */
  close(sceneId: number): Promise<boolean>
}

/** How long an action waits for the strip to show it before giving up. */
const SETTLE_MS = 2000

export function useSceneTabs(): SceneTabs {
  const { cm } = useCueMol()
  const newScene = useNewSceneAction({ cm })
  const ws = useWorkspaceDispatch()
  const { tabs, activeTabId } = useWorkspaceTabs()

  // Conditions waiting for the strip to change; checked after every render.
  const waiters = useRef<{ done: () => boolean; resolve: () => void }[]>([])
  useEffect(() => {
    waiters.current = waiters.current.filter((w) => {
      if (!w.done()) return true
      w.resolve()
      return false
    })
  }, [tabs, activeTabId])

  const settle = useCallback((done: () => boolean): Promise<void> => {
    if (done()) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w.resolve !== finish)
        resolve()
      }, SETTLE_MS)
      const finish = (): void => {
        clearTimeout(timer)
        resolve()
      }
      waiters.current.push({ done, resolve: finish })
    })
  }, [])

  const activeSceneId = useCallback(() => ws.getActiveSceneInfo()?.scene_uid, [ws])
  const viewsOf = useCallback(
    (sceneId: number) => molViewTabsOf(ws.tabsRef.current ?? []).filter((t) => t.sceneId === sceneId),
    [ws],
  )

  const list = useCallback(async (): Promise<OpenScene[]> => {
    const byScene = new Map<number, number[]>()
    for (const t of molViewTabsOf(ws.tabsRef.current ?? [])) {
      if (t.sceneId === undefined || t.viewId === undefined) continue
      byScene.set(t.sceneId, [...(byScene.get(t.sceneId) ?? []), t.viewId])
    }
    const active = activeSceneId()
    const out: OpenScene[] = []
    for (const [sceneId, viewIds] of byScene) {
      const info = cm ? await cm.invokeService('getSceneCloseInfo', { viewId: viewIds[0] }) : null
      out.push({
        sceneId,
        name: info?.ok ? info.sceneName : '',
        viewIds,
        active: sceneId === active,
        modified: info?.ok ? info.modified : false,
      })
    }
    return out
  }, [cm, ws, activeSceneId])

  const create = useCallback(async (name?: string) => {
    const made = await newScene(name ? { name } : undefined)
    if (!made) return null
    await settle(() => activeSceneId() === made.scene_uid)
    return { sceneId: made.scene_uid, name: made.scene_name }
  }, [newScene, settle, activeSceneId])

  const activate = useCallback(async (sceneId: number) => {
    if (activeSceneId() === sceneId) return
    const first = viewsOf(sceneId)[0]
    if (first?.viewId === undefined) return
    ws.activateView(first.viewId)
    await settle(() => activeSceneId() === sceneId)
  }, [ws, settle, activeSceneId, viewsOf])

  const close = useCallback(async (sceneId: number) => {
    for (const tab of viewsOf(sceneId)) {
      if (!(await ws.closeTab(tab.id, { confirm: false }))) return false
    }
    await settle(() => viewsOf(sceneId).length === 0)
    return true
  }, [ws, settle, viewsOf])

  return useMemo(() => ({ list, create, activate, close }), [list, create, activate, close])
}
