/**
 * @file plugins/agent/worker/tools/defaultFileOpenOptions.ts
 * @description The load options a headless load starts from.
 *
 * `loadObject` and `streamLoadFromUrl` both take the `FileOpenOptions` the
 * File Open dialog produces. There is no dialog here, so the same defaults
 * that dialog starts with are assembled directly: the reader's own values for
 * the format half (from C++, via `getReaderDefaultOptions`), and the standard
 * renderer row for the other.
 *
 * `centerView` is left on, unlike the renderer tool's default: a file the user
 * just asked for should be in frame when it appears.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes'
import {
  buildDefaultFormatOptions,
  formatKindForReader,
  getDefaultRendererOptions,
  mapReaderDefaultsToFormatOptions,
} from '@renderer/worker/shared/fileOpenDefaults'
import { getReaderDefaultOptions } from '@renderer/worker/server/services/file/getReaderDefaultOptions'

export interface HeadlessOpenArgs {
  /** Resolved reader nickname (pdb / mmcif / ...). */
  readerName: string
  /** Name for the new object; also seeds the renderer name. */
  objectName: string
  /** Renderer to create, or null for the reader's default. */
  rendererType: string | null
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

  const renderer = getDefaultRendererOptions(
    args.objectName,
    args.rendererType ?? undefined,
  )

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
