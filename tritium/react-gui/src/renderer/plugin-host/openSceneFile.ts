/**
 * @file renderer/plugin-host/openSceneFile.ts
 * @description Open a .qsc file the way File > Open does, for a plugin.
 *
 * A scene is a tab, which only the window can make: the console and MCP both
 * learn from the worker that a command named a scene file, and open it here.
 * One hook, so both read the outcome the same way -- a command that is not
 * registered yet or fails counts as not opened.
 */

import { useCallback } from 'react'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'

/** Where the file went: the scene it opened into, or that it did not open. */
export type OpenSceneFileResult = { ok: true; sceneId?: number } | { ok: false }

/** A function that opens a scene file into a tab (the current one when it is new and empty). */
export function useOpenSceneFile(): (filePath: string) => Promise<OpenSceneFileResult> {
  const { dispatch } = useCommands()
  return useCallback(async (filePath: string) => {
    try {
      const opened = await dispatch(CmdId.OpenSceneByPath, filePath)
      return opened.loaded ? { ok: true, sceneId: opened.sceneId } : { ok: false }
    } catch {
      return { ok: false }
    }
  }, [dispatch])
}
