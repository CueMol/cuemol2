/**
 * @file worker/server/services/file/headlessOpen.ts
 * @description The load options a load without a dialog starts from.
 *
 * `loadObject` and `streamLoadFromUrl` both take the `FileOpenOptions` the
 * File Open dialog produces. A caller with no dialog in front of it -- the AI
 * agent's load tool, the PyMOL console's `load` command -- assembles the same
 * defaults that dialog starts with: the reader's own values for the format
 * half (from C++, via `getReaderDefaultOptions`), and the standard renderer
 * row for the other.
 *
 * `centerView` is left on: a file someone just asked for should be in frame
 * when it appears.
 *
 * Not in `worker/shared/fileOpenDefaults` (where the pure default builders
 * live) because this reaches a worker service, and that module is imported
 * from the renderer thread by the File Open dialogs.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes'
import {
  buildDefaultFormatOptions,
  formatKindForReader,
  getDefaultRendererOptions,
  initialRendererType,
  mapReaderDefaultsToFormatOptions,
} from '@renderer/worker/shared/fileOpenDefaults'
import { getReaderDefaultOptions } from './getReaderDefaultOptions'
import { getCompatibleRendererNames } from './getCompatibleRendererNames'

export interface HeadlessOpenArgs {
  /** Resolved reader nickname (pdb / mmcif / ...). */
  readerName: string
  /** Name for the new object; also seeds the renderer name. */
  objectName: string
  /** Renderer to create, or null for the object type's default (`initialRendererType`). */
  rendererType: string | null
  /** The file being loaded, if any; only to ask its reader's object what it can show. */
  filePath?: string
  /** Draw only this selection, or null for everything. */
  selection: string | null
}

/** Options equivalent to opening the file through the dialog and pressing OK. */
export function buildHeadlessFileOpenOptions(
  ctx: WorkerContext,
  args: HeadlessOpenArgs,
): FileOpenOptions {
  const kind = formatKindForReader(args.readerName)
  const defaults = getReaderDefaultOptions(ctx, { nickname: args.readerName })
  const format = defaults.ok
    ? mapReaderDefaultsToFormatOptions(kind, defaults.values)
    : buildDefaultFormatOptions(kind)

  // Not chosen: what this kind of object starts with, not a molecule's `simple`.
  const rendererType = args.rendererType ??
    initialRendererType(getCompatibleRendererNames(ctx, { filePath: args.filePath ?? '', readerName: args.readerName }).types)
  const renderer = getDefaultRendererOptions(args.objectName, rendererType || undefined)

  return {
    format,
    renderer: {
      ...renderer,
      objectName: args.objectName,
      rendererName: `${renderer.rendererType}1`,
      selectionEnabled: args.selection !== null,
      selection: args.selection ?? '*',
      centerView: true,
    },
  }
}
