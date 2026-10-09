/**
 * @file plugins/console/worker/runtime/runCommand.ts
 * @description Running what was submitted, inside one undo transaction, in
 * whichever dialect the panel is speaking.
 *
 * One submission is one transaction, so Cmd+Z takes back what the user asked
 * for rather than the last of however many services it happened to call. The
 * commit rule is the op catalogue's (`runInTxn`), shared with the AI agent:
 * anything changed -> commit, even when a later command failed; nothing
 * changed -> roll back, so a read-only line does not cost the user their redo.
 *
 * A failure stops the rest of the submission. PyMOL can be told to carry on,
 * but carrying on inside a single transaction makes what Cmd+Z will do
 * impossible to state.
 *
 * `undo` and `redo` are intercepted here rather than implemented as commands:
 * they cannot run inside the transaction this opens.
 *
 * A script (`@file.pml` or `run file.pml`) runs inside the same submission,
 * so the whole script is one transaction: one Cmd+Z takes it all back, as it
 * would for the same lines pasted in. Stop (`runControl.ts`) is checked
 * before every command, script lines included.
 */

import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { redo } from '@renderer/worker/server/services/undo/redo'
import { undo } from '@renderer/worker/server/services/undo/undo'
import { runExclusive, runInTxn, TXN_BUSY_MESSAGE, txnBusy, txnLabel } from '@renderer/worker/server/catalog'
import { fail, failFrom, ok } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type {
  ConsoleEntry,
  RunCommandArgs,
  RunCommandResult,
  SceneRequest,
} from '../../shared/consoleTypes'
import { BindError, bindArgs } from '../parser/bindArgs'
import { lookupCommand } from '../parser/commandLookup'
import { ParseError, parseArgs } from '../parser/parseArgs'
import * as fs from 'fs'
import { joinCommands, splitCommands } from '../parser/splitCommands'
import type { SplitCommand } from '../parser/splitCommands'
import { dialectOf } from '../dialects'
import { resolvePath } from './paths'
import { beginRun, endRun, isStopped, noteRunStream } from './runControl'
import { writeLog } from './commandLog'
import type { CmdContext, CmdOutcome, ConsoleCommand, ConsoleDialect } from './types'

const log = console

/** Longest a single command's output may run before the tail is summarised. */
const MAX_OUTPUT_LINES = 200

/**
 * The working directory relative paths are read from.
 *
 * The one piece of state the worker half keeps. Everything else the console
 * knows -- what is loaded, what is selected, what is visible -- belongs to the
 * C++ scene, which is what makes a second window or a script see the same
 * thing the console does.
 */
let workingDir = ''

/** The directory a relative path is read from. Shared with completion. */
export function currentDir(): string {
  if (workingDir === '') {
    try {
      workingDir = process.cwd()
    } catch {
      workingDir = '/'
    }
  }
  return workingDir
}

/** A working directory a run reads and `cd` moves. */
interface WorkDir {
  get(): string
  set(dir: string): void
}

/**
 * The panel's directory, or the caller's own when it passed one. A caller
 * with its own (the command-line client, one per terminal) gets the result
 * back in the outcome, so the worker keeps nothing for it between runs.
 */
function workDirFor(args: { cwd?: string }): WorkDir {
  if (args.cwd === undefined) {
    return { get: currentDir, set: (dir) => { workingDir = dir } }
  }
  let dir = args.cwd
  return { get: () => dir, set: (d) => { dir = d } }
}

/** Collects one command's lines, bounded so a huge answer cannot flood. */
class EntrySink {
  private lines = 0

  constructor(private readonly entries: ConsoleEntry[]) {}

  push(kind: ConsoleEntry['kind'], text: string): void {
    this.lines += 1
    if (this.lines <= MAX_OUTPUT_LINES) {
      this.entries.push({ kind, text })
      return
    }
    if (this.lines === MAX_OUTPUT_LINES + 1) {
      this.entries.push({ kind: 'warning', text: '... more output omitted' })
    }
  }

  reset(): void {
    this.lines = 0
  }
}

/**
 * How deep `@` may nest. PyMOL has no limit; a script that includes itself
 * would then run until the worker ran out of stack.
 */
const MAX_SCRIPT_DEPTH = 8

/** Commands that are never written to the log: they are about the log. */
// The log commands of both dialects: native open_log / close_log, PyMOL log_open / log_close.
const UNLOGGED = new Set(['log', 'log_open', 'log_close', 'open_log', 'close_log'])

/** What one submission accumulates as its commands run. */
interface Submission {
  dialect: ConsoleDialect
  ctx: WorkerContext
  args: RunCommandArgs
  entries: ConsoleEntry[]
  sink: EntrySink
  mutated: boolean
  interrupted: boolean
  dir: WorkDir
  /** A scene file to hand to the panel (CmdContext.openScene). */
  openScene?: string
  /** A scene command the run stopped at, and what followed it (CmdContext.requestScene). */
  sceneRequest?: SceneRequest
  rest?: string
}

/** The command a typed word names in this dialect, by unique prefix. */
function resolveCommand(
  dialect: ConsoleDialect,
  word: string,
): { kind: 'found'; spec: ConsoleCommand } | { kind: 'error'; error: string } {
  const commands = dialect.commands()
  const found = lookupCommand(word, commands.map((c) => c.name))
  if (found.kind === 'ambiguous') {
    return { kind: 'error', error: `Error: ambiguous command: ${found.candidates.join(', ')}` }
  }
  const spec = found.kind === 'found' ? commands.find((c) => c.name === found.name) : undefined
  if (!spec) return { kind: 'error', error: `Error: unknown command: "${word}"` }
  return { kind: 'found', spec }
}

/**
 * Read a script file and run its commands in this submission.
 *
 * The dialect may refuse a file it cannot run (PyMOL's Python scripts).
 */
async function runScriptFile(sub: Submission, filePath: string, depth: number): Promise<CmdOutcome> {
  const resolved = resolvePath(sub.dir.get(), filePath)
  const refusal = sub.dialect.refuseScript(resolved)
  if (refusal !== null) return { ok: false, error: refusal.replace(resolved, filePath) }
  if (depth >= MAX_SCRIPT_DEPTH) {
    return { ok: false, error: `Error: scripts nested more than ${MAX_SCRIPT_DEPTH} deep (does ${filePath} run itself?)` }
  }
  let text: string
  try {
    text = fs.readFileSync(resolved, 'utf8')
  } catch {
    return { ok: false, error: `Error: cannot read script: ${resolved}` }
  }
  const completed = await runLines(sub, splitCommands(text), depth + 1)
  // The failing line has already said why; the caller only has to stop.
  return completed ? { ok: true } : { ok: false, error: '' }
}

/** What a `CmdContext` does differently where a command runs. */
type CmdContextHooks = Pick<CmdContext, 'markMutated' | 'runScript' | 'openScene' | 'requestScene'>

/** The context a command runs with: printing to `sink`, the run's streams and Stop. */
function makeCmdContext(args: RunCommandArgs, dir: WorkDir, sink: EntrySink, hooks: CmdContextHooks): CmdContext {
  let streamSeq = 0
  return {
    sceneId: args.sceneId,
    viewId: args.viewId,
    cwd: dir.get(),
    print: (text) => sink.push('output', text),
    warn: (text) => sink.push('warning', text),
    setCwd: (d) => dir.set(d),
    noteStream: (reqId) => { noteRunStream(args.runId, reqId) },
    stopped: () => isStopped(args.runId),
    streamId: (tag) => `console:${args.runId}:${tag}:${++streamSeq}`,
    ...hooks,
  }
}

/**
 * Run one command. A command should return its failures; a throw is a bug,
 * but it must not take the transaction with it, so it is reported as one.
 */
async function runSpec(spec: ConsoleCommand, ctx: WorkerContext, bound: Record<string, string>, cc: CmdContext): Promise<CmdOutcome> {
  try {
    return await spec.run(ctx, bound, cc)
  } catch (e) {
    log.warn(`[worker] console: ${spec.name} threw:`, e)
    return { ok: false, error: `Error: ${spec.name}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Run commands in order until one fails or Stop is pressed.
 *
 * @param depth - 0 for what the user typed, 1 and up inside scripts.
 * @returns whether every command ran.
 */
async function runLines(sub: Submission, commands: SplitCommand[], depth: number): Promise<boolean> {
  const { dialect, ctx, args, entries, sink } = sub
  for (const [index, cmd] of commands.entries()) {
    if (isStopped(args.runId)) {
      entries.push({ kind: 'warning', text: 'Interrupted.' })
      sub.interrupted = true
      return false
    }
    sink.reset()
    if (!cmd.quiet) entries.push({ kind: 'echo', text: `${dialect.prompt} ${cmd.script ? '@' : ''}${cmd.text}` })

    const refusal = dialect.refuseLine(cmd)
    if (refusal !== null) {
      sink.push('error', refusal)
      return false
    }
    if (cmd.script) {
      if (depth === 0 && !cmd.quiet) writeLog(`@${cmd.text}`)
      const res = await runScriptFile(sub, cmd.text, depth)
      if (!res.ok) {
        if (res.error !== '') sink.push('error', res.error)
        return false
      }
      continue
    }

    const word = cmd.text.split(/\s+/)[0]
    const resolved = resolveCommand(dialect, word)
    if (resolved.kind === 'error') {
      sink.push('error', resolved.error)
      return false
    }
    const spec = resolved.spec
    // A lone undo or redo was handled before the transaction opened.
    if (spec.name === 'undo' || spec.name === 'redo') {
      sink.push('error', `Error: ${spec.name} must be the only command on the line`)
      return false
    }

    let bound: Record<string, string>
    try {
      const parsed = parseArgs(cmd.text, spec.mode)
      const result = bindArgs(spec.name, spec.params, parsed, spec.mode, dialect.argRule)
      if (result.kind === 'usage') {
        sink.push('output', result.usage)
        continue
      }
      bound = result.args
    } catch (e) {
      if (e instanceof ParseError || e instanceof BindError) {
        sink.push('error', e.message)
        return false
      }
      throw e
    }
    // A lone one of these was handled before the transaction opened.
    if (spec.outsideTxn?.(bound)) {
      sink.push('error', `Error: this ${spec.name} must be the only command on the line`)
      return false
    }

    // What was typed, not what a script it ran contained: replaying the log
    // runs the script again.
    if (depth === 0 && !cmd.quiet && !UNLOGGED.has(spec.name)) {
      if (!writeLog(cmd.text)) sink.push('warning', 'Warning: the log file could not be written; logging stopped')
    }

    let commandMutated = false
    const cc = makeCmdContext(args, sub.dir, sink, {
      markMutated: () => {
        commandMutated = true
      },
      runScript: (filePath) => runScriptFile(sub, filePath, depth),
      openScene: (filePath) => { sub.openScene = filePath },
      requestScene: (req) => {
        if (depth > 0) return false
        sub.sceneRequest = req
        sub.rest = joinCommands(commands.slice(index + 1))
        return true
      },
    })
    const outcome = await runSpec(spec, ctx, bound, cc)

    if (outcome.ok && (spec.mutates || commandMutated)) sub.mutated = true
    if (!outcome.ok) {
      // A stopped download fails as canceled; say it was Stop, not a fault.
      if (isStopped(args.runId)) {
        entries.push({ kind: 'warning', text: 'Interrupted.' })
        sub.interrupted = true
      } else if (outcome.error !== '') {
        sink.push('error', outcome.error)
      }
      return false
    }
    // The panel does the scene command, then submits the rest itself.
    if (sub.sceneRequest) return true
  }
  return true
}

/**
 * A submission that is exactly one command that cannot run inside a
 * transaction -- `undo` / `redo`, which move the undo stack, or a command
 * whose `outsideTxn` says so for these arguments -- run without one.
 *
 * @returns null when the submission is anything else.
 */
async function runStandalone(
  dialect: ConsoleDialect,
  ctx: WorkerContext,
  args: RunCommandArgs,
  commands: SplitCommand[],
): Promise<RunCommandResult | null> {
  if (commands.length !== 1 || commands[0].script || dialect.refuseLine(commands[0]) !== null) return null
  const cmd = commands[0]
  const resolved = resolveCommand(dialect, cmd.text.split(/\s+/)[0])
  if (resolved.kind !== 'found') return null
  const spec = resolved.spec

  const entries: ConsoleEntry[] = []
  const dir = workDirFor(args)
  const cwdOut = args.cwd !== undefined ? { cwd: dir.get() } : {}
  const echo = (): void => { if (!cmd.quiet) entries.push({ kind: 'echo', text: `${dialect.prompt} ${cmd.text}` }) }

  if (spec.name === 'undo' || spec.name === 'redo') {
    echo()
    const res = spec.name === 'undo' ? undo(ctx, { sceneId: args.sceneId }) : redo(ctx, { sceneId: args.sceneId })
    if (!res.ok) {
      entries.push({ kind: 'error', text: `Error: nothing to ${spec.name}` })
      return ok({ entries, mutated: false, aborted: true, interrupted: false, ...cwdOut })
    }
    if (!cmd.quiet) writeLog(cmd.text)
    return ok({ entries, mutated: false, aborted: false, interrupted: false, ...cwdOut })
  }

  if (!spec.outsideTxn) return null
  let bound: Record<string, string>
  try {
    const result = bindArgs(spec.name, spec.params, parseArgs(cmd.text, spec.mode), spec.mode, dialect.argRule)
    // Usage and argument errors are reported by the ordinary path.
    if (result.kind === 'usage') return null
    bound = result.args
  } catch {
    return null
  }
  if (!spec.outsideTxn(bound)) return null

  echo()
  if (!cmd.quiet) writeLog(cmd.text)
  const sink = new EntrySink(entries)
  let openScene: string | undefined
  const cc = makeCmdContext(args, dir, sink, {
    markMutated: () => undefined,
    runScript: () => Promise.resolve({ ok: false, error: 'Error: a script cannot run from here' }),
    openScene: (filePath) => { openScene = filePath },
    requestScene: () => false,
  })
  const outcome = await runExclusive(() => runSpec(spec, ctx, bound, cc))
  if (!outcome.ok) sink.push('error', outcome.error)
  return ok({
    entries,
    mutated: false,
    aborted: !outcome.ok,
    interrupted: false,
    ...(outcome.ok && openScene ? { openScene } : {}),
    ...(args.cwd !== undefined ? { cwd: dir.get() } : {}),
  })
}

/** Whether the first command of a submission is a tab command, which needs no scene. */
function startsWithTabCommand(dialect: ConsoleDialect, commands: SplitCommand[]): boolean {
  const first = commands[0]
  if (!first || first.script) return false
  const resolved = resolveCommand(dialect, first.text.split(/\s+/)[0])
  return resolved.kind === 'found' && resolved.spec.group === 'tabs'
}

/**
 * Run a submission that starts with a tab command while no scene exists. The
 * tab command hands its request back, so nothing reaches a scene and no
 * transaction is needed; the rest is sent again once the window has acted.
 */
async function runWithoutScene(
  dialect: ConsoleDialect,
  ctx: WorkerContext,
  args: RunCommandArgs,
  commands: SplitCommand[],
): Promise<RunCommandResult> {
  const entries: ConsoleEntry[] = []
  const sub: Submission = {
    dialect, ctx, args, entries, sink: new EntrySink(entries), mutated: false, interrupted: false, dir: workDirFor(args),
  }
  beginRun(args.runId)
  let completed: boolean
  try {
    completed = await runLines(sub, commands, 0)
  } finally {
    endRun(args.runId)
  }
  return ok({
    entries,
    mutated: false,
    aborted: !completed,
    interrupted: sub.interrupted,
    ...(sub.sceneRequest ? { sceneRequest: sub.sceneRequest, rest: sub.rest ?? '' } : {}),
    ...(args.cwd !== undefined ? { cwd: sub.dir.get() } : {}),
  })
}

/**
 * Run a submission.
 *
 * Async because `fetch` downloads and a script reads its file; everything
 * else resolves immediately.
 */
export async function runCommand(
  ctx: WorkerContext,
  args: RunCommandArgs,
): Promise<RunCommandResult> {
  const dialect = dialectOf(args.dialect)
  const commands = splitCommands(args.text)
  const scene = getSceneOrNull(ctx, args.sceneId)
  if (!scene) {
    // No tab is open. A tab command (list_scenes, create_scene) needs none, so
    // it runs here; anything else is refused as not-found, and the window
    // makes a scene and sends the submission again.
    if (!startsWithTabCommand(dialect, commands)) return fail(`scene ${args.sceneId} not found`, 'not-found')
    return runWithoutScene(dialect, ctx, args, commands)
  }
  if (txnBusy()) return fail(TXN_BUSY_MESSAGE, 'unsupported')
  const standalone = await runStandalone(dialect, ctx, args, commands)
  if (standalone) return standalone

  const entries: ConsoleEntry[] = []
  const sub: Submission = {
    dialect,
    ctx,
    args,
    entries,
    sink: new EntrySink(entries),
    mutated: false,
    interrupted: false,
    dir: workDirFor(args),
  }

  beginRun(args.runId)
  let completed: boolean
  try {
    completed = await runInTxn(scene, txnLabel(dialect.txnPrefix, args.text), () => sub.mutated, () =>
      runLines(sub, commands, 0),
    )
  } catch (e) {
    return failFrom(e)
  } finally {
    endRun(args.runId)
  }

  return ok({
    entries,
    mutated: sub.mutated,
    aborted: !completed,
    interrupted: sub.interrupted,
    ...(sub.openScene ? { openScene: sub.openScene } : {}),
    ...(sub.sceneRequest ? { sceneRequest: sub.sceneRequest, rest: sub.rest ?? '' } : {}),
    ...(args.cwd !== undefined ? { cwd: sub.dir.get() } : {}),
  })
}
