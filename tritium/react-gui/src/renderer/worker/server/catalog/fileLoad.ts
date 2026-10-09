/**
 * @file worker/server/catalog/fileLoad.ts
 * @description Loading a file the way File > Open does, for the load ops.
 *
 * The reader is picked by the rule the GUI uses (`shared/openFileKind.ts`):
 * a scene file opens as a scene; an object file's extension decides its
 * reader when exactly one reader claims it, and its content otherwise. The
 * load then follows `OpenObjByPath`: the reader's own defaults for the
 * options (what the option dialog starts with), then `loadObject` with that
 * reader. `load_file` takes the defaults as they are; a format's own load op
 * (`load_pdb`, `load_mtz`, ...) changes the options it was given first.
 */

import { getCompatibleRendererNames } from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import { getOpenFilters } from '@renderer/worker/server/services/file/getOpenFilters'
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen'
import { loadObject } from '@renderer/worker/server/services/file/loadObject'
import { OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { FormatKind, FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import { formatKindForReader } from '@renderer/worker/shared/fileOpenDefaults'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { fileStem } from '@shared/fileExt'
import { classifyOpenFile } from '@shared/openFileKind'
import type { OpContext, OpOutcome } from './op'
import { callerPath } from './outputFile'

/** InOutHandler::IOH_CAT_SCEREADER. */
const SCENE_READER_CATEGORY = 3

/** A scene file, by the one scene reader's extension; for `outsideTxn`, which is asked before any reader is. */
export const SCENE_FILE_RE = /\.qsc$/i

/** What a path opens as: a scene, or an object with the reader the GUI would pick. */
export type OpenTarget = { scene: true; filePath: string } | { scene: false; filePath: string; readerName: string; contentFirst: boolean }

/**
 * Where `raw` (as a caller gave it) opens. A file no reader claims by
 * extension is sniffed, as File > Open does with "All Files".
 *
 * @returns the target, or why none
 */
export function openTarget(ctx: WorkerContext, raw: string): OpenTarget | { error: string } {
  const filePath = callerPath(raw)
  const kind = classifyOpenFile(
    filePath,
    getOpenFilters(ctx, { catId: OBJREADER_CATEGORY }),
    getOpenFilters(ctx, { catId: SCENE_READER_CATEGORY }),
  )
  if (kind.kind === 'scene') return { scene: true, filePath }
  // Claimed by no reader at all: let the content decide, as File > Open does.
  const contentFirst = kind.kind === 'unsupported' ? true : kind.contentFirst
  const readerName = getCompatibleRendererNames(ctx, { filePath, contentFirst }).readerName
  if (!readerName) return { error: `No reader can handle "${filePath}". Check the path and the format.` }
  return { scene: false, filePath, readerName, contentFirst }
}

/** The arguments every load op takes. */
export interface LoadArgs {
  rendererType: string | null
  selection: string | null
  name: string | null
}

/**
 * Load an object file into the scene.
 *
 * @param adjust - changes the reader's default format options (a format's
 *   own load op), or says why it cannot
 */
export function loadObjectFile(
  ctx: WorkerContext,
  oc: OpContext,
  target: Extract<OpenTarget, { scene: false }>,
  args: LoadArgs,
  adjust?: (format: FormatOptions) => FormatOptions | { error: string },
): OpOutcome {
  const options = buildHeadlessFileOpenOptions(ctx, {
    readerName: target.readerName,
    objectName: args.name?.trim() || fileStem(target.filePath) || 'object',
    rendererType: args.rendererType,
    selection: args.selection,
    filePath: target.filePath,
  })
  if (adjust) {
    const format = adjust(options.format)
    if ('error' in format) return { ok: false, error: format.error }
    options.format = format
  }
  const result = loadObject(ctx, {
    filePath: target.filePath,
    sceneId: oc.sceneId,
    options,
    contentFirst: target.contentFirst,
    readerName: target.readerName,
  })
  return normalizeServiceResult(result, `"${target.filePath}" could not be opened.`)
}

/** The format a reader reads, for a format's load op to check. */
export function formatOf(readerName: string): FormatKind {
  return formatKindForReader(readerName)
}
