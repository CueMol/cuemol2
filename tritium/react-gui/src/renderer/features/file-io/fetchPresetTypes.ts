/**
 * @file features/file-io/fetchPresetTypes.ts
 * @description The renderer presets offered by the file-open option dialog.
 *
 * Shared by every path that opens the dialog: File > Open, and any plugin
 * that brings its own importer (Get PDB is one).
 */

import type { PresetTypeEntry } from '@renderer/dialogs/fopen-opt-dlgs/types'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'

/**
 * Fetch the renderer presets (`<objType>-rendpreset` styles) for the
 * file-open option dialog.
 *
 * Call AFTER the target scene is resolved: the renderer-type lookup itself
 * runs before a scene exists, but the preset lookup is scene-scoped.
 *
 * @returns the presets, or an empty list. Presets are optional decoration, so
 *   any failure (including a test mock resolving undefined) degrades quietly
 *   rather than failing the open.
 */
export async function fetchPresetTypes(
  cm: AsyncCueMol,
  sceneId: number,
  objType: string | undefined,
): Promise<PresetTypeEntry[]> {
  if (!objType) return []
  try {
    const r = await cm.invokeService('getRendPresetTypes', {
      sceneId,
      objClassName: objType,
    })
    return r?.presets ?? []
  } catch {
    return []
  }
}
