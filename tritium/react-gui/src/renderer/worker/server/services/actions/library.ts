// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
/**
 * @file worker/server/services/actions/library.ts
 * @description The Action library: the preset macros shipped with the app
 * and the user's own qax files, listed, run on the scene, and written from
 * the undo steps of the History pane.
 *
 * - A macro runs as one undo step. Run on several objects, it runs once per
 *   object, all in that one step; an object it fails on is skipped (what it
 *   had done to that object stays) and reported, and the step is dropped
 *   only when it failed on every object.
 * - A file's recorded actions run as the console runs a qax file: one undo
 *   step per action, stopping at the first that fails.
 * - Only files in the user's folder are written, renamed or created here.
 */

import * as fs from 'fs'
import * as nodePath from 'path'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpContext } from '@renderer/worker/server/catalog'
import { runInTxn, txnBusy, TXN_BUSY_MESSAGE, txnLabel } from '@renderer/worker/server/catalog/opRuntime'
import { nodePath as treeNodePath, sceneNodes } from '@renderer/worker/server/catalog/refs'
import { isObjectOfClass } from '@renderer/worker/server/catalog/refs'
import { actionRows } from '@renderer/worker/server/actions/actionLog'
import type { ActionRow } from '@renderer/worker/server/actions/actionLog'
import { rowsToQax } from '@renderer/worker/server/actions/export'
import { stepsToMacro } from '@renderer/worker/server/actions/macro'
import { parseQax, writeQax } from '@renderer/worker/server/actions/qax/codec'
import type { QaxDoc, QaxMacro } from '@renderer/worker/server/actions/qax/model'
import { QAX_EXT, QAX_VERSION } from '@renderer/worker/server/actions/qax/model'
import { bindMacroItems, macroShape, runQaxItems } from '@renderer/worker/server/actions/qax/run'
import type { QaxExec } from '@renderer/worker/server/actions/qax/run'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type {
  LibraryFile,
  LibraryRunFailure,
  ListActionLibraryArgs,
  RunLibraryEntryArgs,
} from '@renderer/worker/shared/actionLibraryTypes'
import type { ActionStepsArgs } from '@renderer/worker/shared/actionTypes'
import { fail, ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'

// --- reading ---

function readDoc(file: string): QaxDoc | { error: string } {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return { error: 'The file could not be read.' }
  }
  return parseQax(text)
}

function libraryFile(file: string, origin: LibraryFile['origin']): LibraryFile {
  const name = nodePath.basename(file).replace(/\.qax$/i, '')
  const doc = readDoc(file)
  if ('error' in doc) return { path: file, name, origin, macros: [], actionCount: 0, error: doc.error }
  return {
    path: file,
    name,
    origin,
    actionCount: doc.actions.length,
    macros: (doc.macros ?? []).map((m) => ({
      name: m.name,
      label: m.label ?? m.name,
      description: m.description ?? '',
      shape: macroShape(m),
    })),
  }
}

/** The shipped file (when there is one) and every qax file of the user's folder, by name. */
export function listActionLibrary(_ctx: WorkerContext, args: ListActionLibraryArgs): Result<{ files: LibraryFile[] }> {
  const files: LibraryFile[] = []
  if (args.bundledFile && fs.existsSync(args.bundledFile)) files.push(libraryFile(args.bundledFile, 'bundled'))
  let names: string[] = []
  try {
    names = fs.readdirSync(args.userDir).filter((n) => n.toLowerCase().endsWith(QAX_EXT)).sort((a, b) => a.localeCompare(b))
  } catch {
    // No folder yet: nothing saved.
  }
  for (const n of names) files.push(libraryFile(nodePath.join(args.userDir, n), 'user'))
  return ok({ files })
}

// --- running ---

/** The context an op run from the library gets. */
function libraryOpContext(sceneId: number, viewId: number, markMutated: () => void, seq: number): OpContext {
  let streams = 0
  return {
    sceneId,
    viewId,
    callId: `qax-${seq}`,
    markMutated,
    noteStream: () => undefined,
    streamId: (tag) => `qax-${seq}-${tag}-${++streams}`,
    // The person chose to run it; a preset writes where its op says.
    fileAccess: 'any',
  }
}

let runSeq = 0

/** The unique path of an object, by uid. */
function objectPath(ctx: WorkerContext, sceneId: number, objId: number): string | null {
  const nodes = sceneNodes(ctx, sceneId)
  const node = nodes.find((n) => n.id === objId && n.type === 'object')
  if (!node) return null
  const path = treeNodePath(node)
  return nodes.filter((n) => treeNodePath(n) === path).length === 1 ? path : null
}

export interface RunLibraryEntryResult {
  /** Objects (or 1 for a macro without parameters / a file) it ran on. */
  done: number
  failures: LibraryRunFailure[]
}

/** Run a macro of a library file, or the file's recorded actions. */
export async function runLibraryEntry(
  ctx: WorkerContext,
  args: RunLibraryEntryArgs,
): Promise<Result<RunLibraryEntryResult>> {
  const scene = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return fail('scene not found', 'not-found')
  if (txnBusy()) return fail(TXN_BUSY_MESSAGE, 'unsupported')
  const doc = readDoc(args.file)
  if ('error' in doc) return fail(`${nodePath.basename(args.file)}: ${doc.error}`, 'io')

  let mutated = false
  const seq = ++runSeq
  const errors: string[] = []
  const exec = (): QaxExec => ({
    ctx,
    sceneId: args.sceneId,
    opContext: () => libraryOpContext(args.sceneId, args.viewId, () => { mutated = true }, seq),
    stopped: () => false,
    error: (text) => errors.push(text.replace(/^Error: /, '')),
  })

  if (args.macro === undefined) {
    // Recorded actions: one undo step each, as the console replays a file.
    for (const action of doc.actions) {
      mutated = false
      const done = await runInTxn(
        scene,
        action.label || txnLabel('qax: ', nodePath.basename(args.file)),
        () => mutated,
        () => runQaxItems(action.items, exec()),
        'qax',
      )
      if (!done) return fail(errors.join('\n') || 'The action failed.', 'native')
    }
    return ok({ done: 1, failures: [] })
  }

  const macro = (doc.macros ?? []).find((m) => m.name === args.macro)
  if (!macro) return fail(`No macro "${args.macro}" in ${nodePath.basename(args.file)}.`, 'not-found')
  const shape = macroShape(macro)
  if (shape.kind === 'unsupported') return fail(shape.reason, 'unsupported')
  const label = macro.label ?? macro.name

  if (shape.kind === 'none') {
    const items = bindMacroItems(macro, {})
    if ('error' in items) return fail(items.error, 'invalid-args')
    const done = await runInTxn(scene, label, () => mutated, () => runQaxItems(items, exec()), 'qax')
    return done ? ok({ done: 1, failures: [] }) : fail(errors.join('\n') || 'The macro failed.', 'native')
  }

  const targets = args.targetIds ?? []
  if (targets.length === 0) return fail(`Select the ${shape.targetType} object to run it on.`, 'invalid-args')
  const param = macro.params[0].name
  const failures: LibraryRunFailure[] = []
  let done = 0
  await runInTxn(
    scene,
    targets.length > 1 ? `${label} (${targets.length} objects)` : label,
    () => mutated && done > 0,
    async () => {
      for (const id of targets) {
        const path = objectPath(ctx, args.sceneId, id)
        const name = path ?? `#${id}`
        if (path === null) {
          failures.push({ target: name, error: 'The object has no unique name.' })
          continue
        }
        if (!isObjectOfClass(ctx, args.sceneId, id, shape.targetType)) {
          failures.push({ target: name, error: `It is not a ${shape.targetType} object.` })
          continue
        }
        const items = bindMacroItems(macro, { [param]: path })
        if ('error' in items) {
          failures.push({ target: name, error: items.error })
          continue
        }
        errors.length = 0
        if (await runQaxItems(items, exec())) done++
        else failures.push({ target: name, error: errors.join('\n') || 'The macro failed.' })
      }
    },
    'qax',
  )
  if (done === 0) {
    const why = failures.map((f) => `${f.target}: ${f.error}`).join('\n')
    return fail(why || 'The macro did not run.', 'native')
  }
  return ok({ done, failures })
}

// --- writing ---

/** A path in the user's folder for `name`, or why there is none. */
function userFilePath(userDir: string, name: string): string | { error: string } {
  const base = name.trim()
  if (base === '' || /[\\/]/.test(base)) return { error: 'That name cannot be a file name.' }
  try {
    fs.mkdirSync(userDir, { recursive: true })
  } catch {
    return { error: 'The actions folder could not be made.' }
  }
  const file = nodePath.join(userDir, `${base}${QAX_EXT}`)
  if (fs.existsSync(file)) return { error: `"${base}" exists already; pick another name.` }
  return file
}

function writeDoc(file: string, doc: QaxDoc): string | null {
  try {
    fs.writeFileSync(file, writeQax(doc), 'utf8')
    return null
  } catch {
    return `${nodePath.basename(file)} could not be written.`
  }
}

/** The qif class to give a macro's parameter for the object at `path`. */
function classOfPath(ctx: WorkerContext, sceneId: number, path: string): string {
  const node = sceneNodes(ctx, sceneId).find((n) => n.type === 'object' && treeNodePath(n) === path)
  return node && isObjectOfClass(ctx, sceneId, node.id, 'MolCoord') ? 'MolCoord' : 'Object'
}

/** The steps named, in log order; a failure when one is no longer there. */
function pickSteps(ctx: WorkerContext, args: ActionStepsArgs): { rows: ActionRow[] } | { error: string } {
  const scene = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return { error: 'scene not found' }
  const wanted = new Set(args.stepIds)
  const rows = actionRows(scene, args.sceneId).filter((r) => wanted.has(r.id))
  if (rows.length === 0) return { error: 'No steps given.' }
  if (rows.length !== wanted.size) return { error: 'A step is no longer in the undo history.' }
  return { rows }
}

function macroOf(ctx: WorkerContext, args: ActionStepsArgs, name: string, label: string): QaxMacro | { error: string } {
  const picked = pickSteps(ctx, args)
  if ('error' in picked) return { error: picked.error }
  const made = stepsToMacro(picked.rows, { name, label, classOf: (p) => classOfPath(ctx, args.sceneId, p) })
  return made.ok ? made.macro : { error: made.error }
}

/** Whether the steps can be saved as a macro; the reason when not. */
export function canSaveAsMacro(ctx: WorkerContext, args: ActionStepsArgs): Result<object> {
  const m = macroOf(ctx, args, 'check', 'check')
  return 'error' in m ? fail(m.error, 'invalid-args') : ok({})
}

export interface SaveStepsToLibraryArgs extends ActionStepsArgs {
  userDir: string
  /** The file name, without `.qax`. */
  name: string
  /** What the user typed; the macro's label. */
  label?: string
  asMacro: boolean
}

/** Write History steps into the user's folder, as recorded or as one macro. */
export function saveStepsToLibrary(ctx: WorkerContext, args: SaveStepsToLibraryArgs): Result<{ file: string }> {
  const file = userFilePath(args.userDir, args.name)
  if (typeof file !== 'string') return fail(file.error, 'invalid-args')
  let doc: QaxDoc
  if (args.asMacro) {
    const m = macroOf(ctx, args, args.name, args.label ?? args.name)
    if ('error' in m) return fail(m.error, 'invalid-args')
    doc = { version: QAX_VERSION, actions: [], macros: [m] }
  } else {
    const picked = pickSteps(ctx, args)
    if ('error' in picked) return fail(picked.error, 'not-found')
    doc = rowsToQax(picked.rows)
  }
  const problem = writeDoc(file, doc)
  return problem === null ? ok({ file }) : fail(problem, 'io')
}

export interface CopyMacroToLibraryArgs {
  file: string
  macro: string
  userDir: string
}

/** Copy one macro (a preset) into a file of its own in the user's folder. */
export function copyMacroToLibrary(_ctx: WorkerContext, args: CopyMacroToLibraryArgs): Result<{ file: string }> {
  const doc = readDoc(args.file)
  if ('error' in doc) return fail(doc.error, 'io')
  const macro = (doc.macros ?? []).find((m) => m.name === args.macro)
  if (!macro) return fail(`No macro "${args.macro}".`, 'not-found')
  const file = userFilePath(args.userDir, macro.name)
  if (typeof file !== 'string') return fail(file.error, 'invalid-args')
  const problem = writeDoc(file, { version: QAX_VERSION, actions: [], macros: [macro] })
  return problem === null ? ok({ file }) : fail(problem, 'io')
}

export interface RenameLibraryFileArgs {
  file: string
  name: string
  userDir: string
}

/** Rename one of the user's files (and the macro, when it holds just one). */
export function renameLibraryFile(_ctx: WorkerContext, args: RenameLibraryFileArgs): Result<{ file: string }> {
  if (nodePath.dirname(nodePath.resolve(args.file)) !== nodePath.resolve(args.userDir)) {
    return fail('Only a file in User Actions can be renamed.', 'invalid-args')
  }
  const to = userFilePath(args.userDir, args.name)
  if (typeof to !== 'string') return fail(to.error, 'invalid-args')
  try {
    fs.renameSync(args.file, to)
  } catch {
    return fail('The file could not be renamed.', 'io')
  }
  // A file of one macro is shown as that macro, so the macro takes the name too.
  const doc = readDoc(to)
  if (!('error' in doc) && doc.actions.length === 0 && doc.macros?.length === 1) {
    const [m] = doc.macros
    const problem = writeDoc(to, { ...doc, macros: [{ ...m, name: args.name, label: args.name }] })
    if (problem !== null) return fail(problem, 'io')
  }
  return ok({ file: to })
}
