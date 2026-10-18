/**
 * @file shared/openFileKind.ts
 * @description What a file is to open as, and whether its reader is picked
 * by extension or by content -- one rule for every way a file is opened.
 *
 * File > Open, a drop, the command line's `load` and an MCP `load_file` all
 * decide the same way:
 * - a scene file (a scene reader's extension) opens as a scene;
 * - when exactly one object reader's filter claims the extension, the
 *   extension decides the reader;
 * - when several claim it, or none does, the reader is picked by sniffing
 *   the content (`contentFirst`), so a renamed file still opens.
 *
 * The filters are the open dialog's rows (`getOpenFilters`): the aggregate
 * "All Supported" row and the "All Files" wildcard identify no reader and
 * are skipped. Extensions may have dots of their own (`pdb.gz`).
 */

import { hasExt } from './fileExt'

/** One open-dialog filter row. */
export interface OpenFilter {
  name: string
  extensions: string[]
}

/** How a path is opened. */
export interface OpenFileKind {
  kind: 'obj' | 'scene' | 'unsupported'
  /** For 'obj': pick the reader by content rather than by extension. */
  contentFirst: boolean
}

/** The rows that stand for one reader each. */
function readerRows(filters: readonly OpenFilter[]): OpenFilter[] {
  return filters.filter((f) => f.name !== 'All Supported' && !f.extensions.includes('*'))
}

/** How many reader rows claim the extension of `path`. */
function claims(path: string, filters: readonly OpenFilter[]): number {
  return readerRows(filters).filter((f) => f.extensions.some((e) => hasExt(path, e))).length
}

/** Whether an object file's reader is picked by content: unless exactly one reader claims its extension. */
export function inferContentFirst(path: string, objFilters: readonly OpenFilter[]): boolean {
  return claims(path, objFilters) !== 1
}

/**
 * How to open `path`, from its extension alone.
 *
 * @param objFilters - the object readers' rows
 * @param sceneFilters - the scene readers' rows
 */
export function classifyOpenFile(
  path: string,
  objFilters: readonly OpenFilter[],
  sceneFilters: readonly OpenFilter[],
): OpenFileKind {
  if (claims(path, objFilters) > 0) return { kind: 'obj', contentFirst: inferContentFirst(path, objFilters) }
  if (claims(path, sceneFilters) > 0) return { kind: 'scene', contentFirst: false }
  return { kind: 'unsupported', contentFirst: false }
}
