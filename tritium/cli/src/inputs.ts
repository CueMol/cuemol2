/**
 * @file inputs.ts
 * @description The files on the command line, as the runs to send.
 *
 * A file is a script to run, a scene to open, or data to load:
 *   - a script of one of the app's dialects (by extension, as `/console/info`
 *     lists them: `.qax`, `.pml`, ...), `.txt` (console commands in the
 *     session's dialect) or `-` (stdin): sent alone. A dialect's script is
 *     sent as its text, or by its path when the dialect reads the file
 *     itself (qax: each action its own undo step).
 *   - `.qsc`: a scene. Opening one cannot share a run with anything else (the
 *     app opens it after the run, into a tab, outside any transaction), so
 *     each scene is a run of its own, in the order given.
 *   - anything else: data, opened with native `load` -- the reader is picked
 *     the way File > Open picks it (by extension, or by the content).
 * Data and `-c` then go as one run (one undo step) into the active tab, which
 * is the last scene opened when there was one.
 *
 * Pure: the file system comes in through `InputFs`.
 */

import * as path from 'node:path'
import type { ConsoleDialectId } from '@cuemol/console-kit'
import { UsageError } from './args'
import { NATIVE_DIALECT, scriptDialect } from './dialects'
import type { AppDialects } from './dialects'

/** One run to send (`/console/run`): commands, or a script file by its path. */
export type Submission =
  | { text: string; dialect: ConsoleDialectId; scriptPath?: undefined }
  | { scriptPath: string; dialect: ConsoleDialectId; text?: undefined }

export type InputKind = 'script' | 'text' | 'stdin' | 'scene' | 'data'

export function classifyInput(file: string, dialects: AppDialects): InputKind {
  if (file === '-') return 'stdin'
  if (scriptDialect(dialects, file)) return 'script'
  const ext = path.extname(file).toLowerCase()
  if (ext === '.txt') return 'text'
  if (ext === '.qsc') return 'scene'
  return 'data'
}

/** What the files are read through; `readText('-')` is what was piped in. */
export interface InputFs {
  isFile(p: string): boolean
  readText(p: string): string | null
}

/**
 * `p` as one native string argument. The console has no escapes, so the
 * quote is one the path does not contain.
 */
export function quotePath(p: string): string | Error {
  if (/[\r\n]/.test(p)) return new Error(`cannot pass a path with a line break: ${p}`)
  if (!p.includes('"')) return `"${p}"`
  if (!p.includes("'")) return `'${p}'`
  return new Error(`cannot pass a path with both kinds of quote: ${p}`)
}

/**
 * The runs for `files` and `command`, in order.
 *
 * @param dialect - the dialect `-c` and a `.txt` script are written in
 * @param dialects - what the app speaks, and which script files are whose
 * @returns the runs (empty when there is nothing to send), a UsageError for a
 *   combination that makes no sense (exit 2), or an Error for a file that
 *   cannot be read (exit 1)
 */
export function buildSubmissions(
  files: readonly string[],
  command: string | null,
  dialect: ConsoleDialectId,
  cwd: string,
  fsys: InputFs,
  dialects: AppDialects,
): Submission[] | Error {
  const kinds = files.map((f) => ({ file: f, kind: classifyInput(f, dialects) }))
  const scripts = kinds.filter((k) => k.kind !== 'scene' && k.kind !== 'data')
  const scenes = kinds.filter((k) => k.kind === 'scene')
  const data = kinds.filter((k) => k.kind === 'data')

  if (scripts.length > 0) {
    if (files.length > 1 || command !== null) return new UsageError('a script is run alone: no other FILE or -c with it')
    const { file, kind } = scripts[0]
    const abs = kind === 'stdin' ? '-' : path.resolve(cwd, file)
    const owner = kind === 'script' ? scriptDialect(dialects, file) : null
    if (owner && owner.submit === 'path') {
      if (!fsys.isFile(abs)) return new Error(`cannot read ${file}`)
      if (dialects.sendsPath) return [{ scriptPath: abs, dialect: owner.dialect.id }]
      // An app from before scriptPath: its native `run` takes a qax file.
      const q = quotePath(abs)
      if (q instanceof Error) return q
      return [{ text: `run ${q}`, dialect: owner.dialect.id }]
    }
    const text = fsys.readText(abs)
    if (text === null) return new Error(`cannot read ${file}`)
    return [{ text, dialect: owner ? owner.dialect.id : dialect }]
  }

  if (scenes.length > 1 && (data.length > 0 || command !== null)) {
    return new UsageError('with several scenes, which one the other files and -c go into is unclear; open one scene')
  }

  const loads = (list: typeof kinds): string[] | Error => {
    const out: string[] = []
    for (const { file } of list) {
      const abs = path.resolve(cwd, file)
      if (!fsys.isFile(abs)) return new Error(`no such file: ${file}`)
      const q = quotePath(abs)
      if (q instanceof Error) return q
      out.push(`load ${q}`)
    }
    return out
  }
  const sceneLoads = loads(scenes)
  if (sceneLoads instanceof Error) return sceneLoads
  const dataLoads = loads(data)
  if (dataLoads instanceof Error) return dataLoads

  // `load` is the native dialect's: files are opened in it whatever the session speaks.
  const subs: Submission[] = sceneLoads.map((text) => ({ text, dialect: NATIVE_DIALECT }))
  // One line per command: a path's brackets cannot run into the next command.
  if (dialect === NATIVE_DIALECT || command === null) {
    const lines = command === null ? dataLoads : [...dataLoads, command]
    if (lines.length > 0) subs.push({ text: lines.join('\n'), dialect: NATIVE_DIALECT })
  } else {
    // Another dialect's commands go as a run of their own.
    if (dataLoads.length > 0) subs.push({ text: dataLoads.join('\n'), dialect: NATIVE_DIALECT })
    subs.push({ text: command, dialect })
  }
  return subs
}
