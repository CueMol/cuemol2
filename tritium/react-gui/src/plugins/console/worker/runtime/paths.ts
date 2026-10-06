/**
 * @file plugins/console/worker/runtime/paths.ts
 * @description Turning a typed path into a file the worker can open.
 */

import * as os from 'os'
import * as path from 'path'

/** Expand a leading `~` and make a relative path absolute against `cwd`. */
export function resolvePath(cwd: string, filePath: string): string {
  const expanded = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded)
}
