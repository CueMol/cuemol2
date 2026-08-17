/**
 * @file main/helpers/parseFileArgs.ts
 * @description Extracts file paths from a command line, for the OS-shell open
 * path (UXP dragdropopen.js convCmdLineFiles parity).
 *
 * Kept pure -- no electron, no module-level fs -- so the argv-slicing rules
 * below are unit-testable. Those rules are the whole reason this file exists:
 * a packaged run carries the app at argv[0] and files from argv[1], while a
 * dev run under electron-vite is spawned as `electron <entry> ...args`, so
 * files start at argv[2].
 *
 * No extension filtering happens here. Which files CueMol can read is decided
 * by the C++ reader table, which only the Web Worker can query, so main just
 * separates existing files from missing ones and lets the renderer classify
 * them (utils/classifyDropFile.ts, the same path an OS drop takes).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export interface ParseFileArgsOptions {
  /** `process.argv`, or the argv handed over by the 'second-instance' event. */
  argv: readonly string[]
  /** `app.isPackaged`. A dev run carries the app entry at argv[1]. */
  isPackaged: boolean
  /** Base for relative paths: `process.cwd()`, or the event's workingDirectory. */
  cwd: string
  /** Injected to keep the parser pure. Defaults to a statSync file check. */
  isFile?: (p: string) => boolean
}

export interface ParsedFileArgs {
  /** Absolute, de-duplicated paths of files that exist. */
  paths: string[]
  /** Absolute paths that were named but are not existing files. */
  missing: string[]
}

function defaultIsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a single argument to an absolute path, or null when it is not a
 * file reference at all.
 */
function resolveArg(arg: string, cwd: string): string | null {
  // Chromium / Electron switches (--no-sandbox, --inspect), macOS process
  // serial numbers (-psn_0_12345), and the UXP -file / -url marker tokens.
  // The token after a UXP marker is a plain path and survives on its own.
  if (arg.startsWith('-')) return null
  // electron-vite preview spawns `electron .`, so the entry is a literal '.'.
  // The argv slice above normally removes it; this is the safety net that
  // keeps a slice mismatch from trying to open the working directory.
  if (arg === '.' || arg === '..') return null

  if (/^[a-z][a-z0-9+.-]*:/i.test(arg)) {
    // Only file: URLs name a local file. Anything else (http:, cuemol:) is
    // dropped, matching UXP convCmdLineFiles, which resolves -url through
    // nsIFileURL and discards what fails the cast.
    if (!/^file:/i.test(arg)) {
      console.warn('[Main] ignoring non-file URL argument:', arg)
      return null
    }
    try {
      return path.normalize(fileURLToPath(arg))
    } catch (e) {
      console.warn('[Main] could not resolve file URL argument:', arg, e)
      return null
    }
  }

  return path.normalize(path.resolve(cwd, arg))
}

/**
 * Resolve a list of file references (paths or file: URLs) to absolute paths,
 * split by whether they exist.
 *
 * Used directly for macOS 'open-file', which hands over one path at a time
 * rather than a command line.
 *
 * @returns Existing files in `paths`, named-but-absent ones in `missing`
 *   (reported to the user before any open, as UXP alerted on them).
 *   Directories land in `missing`: opening a folder is not defined.
 */
export function resolveShellPaths(
  args: readonly string[],
  cwd: string,
  isFile: (p: string) => boolean = defaultIsFile,
): ParsedFileArgs {
  const paths: string[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  for (const arg of args) {
    if (arg === '') continue
    const resolved = resolveArg(arg, cwd)
    if (resolved === null) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (isFile(resolved)) paths.push(resolved)
    else missing.push(resolved)
  }

  return { paths, missing }
}

/** Pick the file paths out of a command line. */
export function parseFileArgs({
  argv,
  isPackaged,
  cwd,
  isFile = defaultIsFile,
}: ParseFileArgsOptions): ParsedFileArgs {
  return resolveShellPaths(isPackaged ? argv.slice(1) : argv.slice(2), cwd, isFile)
}
