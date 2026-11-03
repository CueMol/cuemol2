/**
 * @file inputs.ts
 * @description The files on the command line, as the runs to send.
 *
 * A file is a script to run, a scene to open, or data to load:
 *   - `.qax` (actions, read by the app: each action its own undo step),
 *     `.pml` (PyMOL syntax), `.txt` (console commands), `-` (stdin): a script,
 *     sent alone.
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

/** One run to send (`/console/run`). */
export interface Submission {
  text: string
  dialect: ConsoleDialectId
}

export type InputKind = 'qax' | 'pml' | 'text' | 'stdin' | 'scene' | 'data'

export function classifyInput(file: string): InputKind {
  if (file === '-') return 'stdin'
  const ext = path.extname(file).toLowerCase()
  if (ext === '.qax') return 'qax'
  if (ext === '.pml') return 'pml'
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
): Submission[] | Error {
  const kinds = files.map((f) => ({ file: f, kind: classifyInput(f) }))
  const scripts = kinds.filter((k) => k.kind !== 'scene' && k.kind !== 'data')
  const scenes = kinds.filter((k) => k.kind === 'scene')
  const data = kinds.filter((k) => k.kind === 'data')

  if (scripts.length > 0) {
    if (files.length > 1 || command !== null) return new UsageError('a script is run alone: no other FILE or -c with it')
    const { file, kind } = scripts[0]
    const abs = kind === 'stdin' ? '-' : path.resolve(cwd, file)
    if (kind === 'qax') {
      if (!fsys.isFile(abs)) return new Error(`cannot read ${file}`)
      const q = quotePath(abs)
      if (q instanceof Error) return q
      // `run` of a .qax is native; PyMOL's run takes .pml only.
      return [{ text: `run ${q}`, dialect: 'native' }]
    }
    const text = fsys.readText(abs)
    if (text === null) return new Error(`cannot read ${file}`)
    return [{ text, dialect: kind === 'pml' ? 'pymol' : dialect }]
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

  const subs: Submission[] = sceneLoads.map((text) => ({ text, dialect: 'native' }))
  // One line per command: a path's brackets cannot run into the next command.
  if (dialect === 'native' || command === null) {
    const lines = command === null ? dataLoads : [...dataLoads, command]
    if (lines.length > 0) subs.push({ text: lines.join('\n'), dialect: 'native' })
  } else {
    // `load` here is the native one; PyMOL commands go as a run of their own.
    if (dataLoads.length > 0) subs.push({ text: dataLoads.join('\n'), dialect: 'native' })
    subs.push({ text: command, dialect })
  }
  return subs
}
