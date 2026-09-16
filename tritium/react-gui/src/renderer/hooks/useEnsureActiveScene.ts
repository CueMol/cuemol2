/**
 * @file hooks/useEnsureActiveScene.ts
 * @description Resolve the active molview's scene and view, creating a fresh
 * scene plus view (a new tab) when there is none.
 *
 * UXP always kept an active view, so a load always had somewhere to go.
 * Tritium has no implicit scene: with no tab open, or after every molview tab
 * was closed, a load command would otherwise silently do nothing. Every
 * command that loads something -- File > Open, Get PDB, a plugin that brings
 * its own importer -- resolves its target through here first.
 *
 * The scene is created only once the caller commits to loading, so a
 * cancelled dialog never leaves a stray empty tab behind.
 *
 * Two entry points, one behaviour: the command hooks are handed their
 * dependencies by `useCommandRegistrations` and use {@link
 * makeEnsureActiveScene}; a plugin has no such injector and reads the
 * providers itself through {@link useEnsureActiveScene}.
 *
 * {@link makeResolveOpenTarget} adds the "new scene" variant that the drop and
 * shell-open preferences select. It is a separate function rather than an
 * option on the above so that Get PDB and the agent plugin, which continue
 * work on the current scene, are not silently swept along.
 */

import { useMemo } from 'react'
import type { ActiveSceneCommandDeps } from '@renderer/commands/commandTypes'
import type { OpenFileTarget } from '@renderer/data/openFileTarget'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useWorkspaceDispatch } from '@renderer/state/workspace'
import { useNewSceneAction } from './useNewSceneAction'
import type { NewSceneAction } from './useNewSceneAction'

/** The ids a load needs: where the object goes, and which view shows it. */
export interface ActiveSceneTarget {
  scene_uid: number
  view_id: number
}

export type EnsureActiveScene = () => Promise<ActiveSceneTarget | undefined>

/**
 * Build the resolver over explicit dependencies.
 *
 * @returns the active scene and view, or undefined when none is active and
 *   creating one failed.
 */
export function makeEnsureActiveScene(
  getActiveSceneInfo: ActiveSceneCommandDeps,
  newScene: NewSceneAction,
): EnsureActiveScene {
  return async (): Promise<ActiveSceneTarget | undefined> => {
    const info = getActiveSceneInfo()
    if (info) return info
    const created = await newScene()
    if (!created) return undefined
    return { scene_uid: created.scene_uid, view_id: created.view_uid }
  }
}

/**
 * Reports whether a scene is still untouched (no objects, no cameras, not
 * modified). Injected so the resolver stays free of the worker client.
 */
export type IsSceneJustCreated = (sceneId: number) => Promise<boolean>

/**
 * A resolved open target, split so the scene is created as late as possible.
 *
 * `previewSceneId` is what the file-open option dialog should preview names
 * against -- the active scene when the file is going there, and 0 ("no scene
 * yet") when a new one is still to be made. `commit` then makes or returns the
 * real scene, and is called only once the dialog has been confirmed, so a
 * cancel never leaves an empty tab behind.
 */
export interface OpenTargetPlan {
  previewSceneId: number
  commit: () => Promise<ActiveSceneTarget | undefined>
}

export type ResolveOpenTarget = (target: OpenFileTarget) => Promise<OpenTargetPlan>

/**
 * Build the open-target resolver over explicit dependencies.
 *
 * 'active' behaves exactly like {@link makeEnsureActiveScene} and asks the
 * worker nothing. 'new' takes a scene of its own, except when the active scene
 * is still untouched -- the launch tab, or one just made with New Tab -- which
 * it loads into instead, so an opened file never leaves an empty "Untitled"
 * stranded beside it. That exemption is the rule a scene file already uses.
 */
export function makeResolveOpenTarget(
  getActiveSceneInfo: ActiveSceneCommandDeps,
  newScene: NewSceneAction,
  isSceneJustCreated: IsSceneJustCreated,
): ResolveOpenTarget {
  const create = async (): Promise<ActiveSceneTarget | undefined> => {
    const created = await newScene()
    if (!created) return undefined
    return { scene_uid: created.scene_uid, view_id: created.view_uid }
  }

  return async (target: OpenFileTarget): Promise<OpenTargetPlan> => {
    const info = getActiveSceneInfo()
    if (!info) return { previewSceneId: 0, commit: create }
    if (target === 'active') {
      return { previewSceneId: info.scene_uid, commit: async () => info }
    }
    // 'new': reuse an untouched active scene rather than stranding it.
    if (await isSceneJustCreated(info.scene_uid)) {
      return { previewSceneId: info.scene_uid, commit: async () => info }
    }
    return { previewSceneId: 0, commit: create }
  }
}

/** The resolver over the live providers, for callers nothing injects into. */
export function useEnsureActiveScene(): EnsureActiveScene {
  const { cm } = useCueMol()
  const { getActiveSceneInfo } = useWorkspaceDispatch()
  const newScene = useNewSceneAction({ cm })

  return useMemo(
    () => makeEnsureActiveScene(getActiveSceneInfo, newScene),
    [getActiveSceneInfo, newScene],
  )
}
