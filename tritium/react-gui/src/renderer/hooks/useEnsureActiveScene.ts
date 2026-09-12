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
 */

import { useMemo } from 'react'
import type { ActiveSceneCommandDeps } from '@renderer/commands/commandTypes'
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
