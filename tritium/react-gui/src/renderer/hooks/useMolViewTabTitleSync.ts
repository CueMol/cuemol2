/**
 * @file hooks/useMolViewTabTitleSync.ts
 * @description Keeps molview tab-strip titles in sync with their scene name.
 *
 * Subscribes to the CueMol event manager for scene `name` PROPCHG events
 * (scope = any scene, since several scenes may have open tabs) and rewrites
 * the affected tabs' titles to `<scene name>:<view name>`. This makes a rename
 * from the Explorer -- or any other UI / script path -- show up on the tab
 * strip without polling, instead of the title being frozen at tab-creation
 * time.
 *
 * Mirrors UXP `TabMolView.onScenePropChanged` / `updateTabLabel`
 * (`uxp_gui/cuemol2/base/content/tabmolview.js`): it filters PROPCHG on
 * `propname === "name"`, finds the tabs whose scene matches the event source,
 * and rebuilds each label via the worker (`getViewTabLabel`).
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { SEM_SCENE, SEM_PROPCHG, SEM_ANY } from '@renderer/event'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'

/** Logical molview tab: scene + view uid pair (from `useMolTabState`). */
interface MolTabSceneRef {
  view_id: number
  scene_uid: number
}

interface UseMolViewTabTitleSyncOptions {
  cm: AsyncCueMol | null
  /** Open molview tabs, used to map a renamed scene to its view ids. */
  molTabEntries: MolTabSceneRef[]
  /** Updates the visible tab-strip title for a molview tab. */
  updateMolViewTabTitle: (viewId: number, title: string) => void
}

export function useMolViewTabTitleSync({
  cm,
  molTabEntries,
  updateMolViewTabTitle,
}: UseMolViewTabTitleSyncOptions): void {
  const handler = useCallback(
    (args: unknown) => {
      const payload = args as { srcUID?: number; obj?: { propname?: string } }
      // Only a scene name change affects the tab label.
      if (payload?.obj?.propname !== 'name') return
      const sceneUid = payload.srcUID
      if (cm === null || sceneUid === undefined) return

      const viewIds = molTabEntries
        .filter((e) => e.scene_uid === sceneUid)
        .map((e) => e.view_id)

      for (const viewId of viewIds) {
        cm.invokeService('getViewTabLabel', { viewId })
          .then((res) => {
            if (res?.ok) updateMolViewTabTitle(viewId, res.title)
          })
          .catch((err: unknown) => console.warn('getViewTabLabel failed:', err))
      }
    },
    [cm, molTabEntries, updateMolViewTabTitle],
  )

  useCueMolEventListener({
    cm,
    category: '',
    srcMask: SEM_SCENE,
    evtMask: SEM_PROPCHG,
    scopeId: SEM_ANY,
    handler,
  })
}
