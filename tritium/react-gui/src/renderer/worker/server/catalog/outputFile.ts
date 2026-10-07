/**
 * @file worker/server/catalog/outputFile.ts
 * @description Where an op that writes a file may write it.
 */

import * as os from 'os'
import * as nodePath from 'path'
import type { OpContext } from './op'

/** A bare file name: no directory part, nothing that climbs out of one. */
const SAFE_BASENAME_RE = /^[A-Za-z0-9._-]+$/

/**
 * The user's desktop, where a model's files go.
 *
 * From `os.homedir()`, not `process.env.HOME`: the worker's environment need
 * not carry HOME, and falling back to the working directory once put a
 * model's file somewhere nobody would look.
 */
export function desktopDir(): string {
  return nodePath.join(os.homedir(), 'Desktop')
}

/**
 * The path an op writes `raw` to, with `ext` added when it has no extension.
 *
 * A caller with `fileAccess: 'any'` (the console, an MCP client) writes where
 * it said; a relative path is taken from the desktop, because an MCP client's
 * working directory is not the worker's (the console resolves its own against
 * its cwd before the op sees it). Any other caller (the agent) gives a bare
 * name and the file goes to the desktop.
 *
 * @returns the path, or why the name is refused.
 */
export function outputPath(oc: OpContext, raw: string, ext: string): { path: string } | { error: string } {
  const name = raw.trim()
  if (name === '') return { error: 'Give a file name.' }
  const withExt = nodePath.extname(name) === '' ? `${name}${ext}` : name
  // Absolute either way, so what an op reports is a path the reader can use.
  if (oc.fileAccess === 'any') return { path: nodePath.resolve(desktopDir(), withExt) }
  if (!SAFE_BASENAME_RE.test(withExt)) {
    return { error: `Give a plain file name with no directory, for example picture${ext}; it is saved to the desktop.` }
  }
  return { path: nodePath.join(desktopDir(), withExt) }
}
