/**
 * @file plugins/pymconsole/worker/runCommand.ts
 * @description Running what was submitted, inside one undo transaction.
 *
 * One submission is one transaction, so Cmd+Z takes back what the user asked
 * for rather than the last of however many services it happened to call. The
 * commit rule is the AI agent's (`ai-agent-plugin.md` section 3.1) and for the same
 * reasons:
 *
 * - anything changed -> commit, even when a later command failed. C++
 *   `rollbackTxn` really reverts, so rolling back here would undo edits the
 *   user has already seen on screen.
 * - nothing changed -> roll back. Committing an empty transaction clears the
 *   redo stack, so a read-only line would silently cost the user their redo.
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
import { fail, failFrom, ok } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type {
  ConsoleEntry,
  RunCommandArgs,
  RunCommandResult,
} from '../shared/consoleTypes'
import { BindError, bindArgs } from './parser/bindArgs'
import { lookupCommand } from './parser/commandLookup'
import { ParseError, parseArgs } from './parser/parseArgs'
import * as fs from 'fs'
import { splitCommands } from './parser/splitCommands'
import type { SplitCommand } from './parser/splitCommands'
import { resolvePath } from './commands/helpers'
import { beginRun, endRun, isStopped, noteRunStream } from './runControl'
import { writeLog } from './commandLog'
import { commandNames, findCommand } from './commands/registry'
import type { CmdContext, CmdOutcome } from './commands/types'

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

/** The first line of a submission, shortened, as the transaction's name. */
function txnLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return `pym: ${flat.length > 40 ? `${flat.slice(0, 40)}...` : flat}`
}

/**
 * How deep `@` may nest. PyMOL has no limit; a script that includes itself
 * would then run until the worker ran out of stack.
 */
const MAX_SCRIPT_DEPTH = 8

/** Commands that are never written to the log: they are about the log. */
const UNLOGGED = new Set(['log', 'log_open', 'log_close'])

/** What one submission accumulates as its commands run. */
interface Submission {
  ctx: WorkerContext
  args: RunCommandArgs
  entries: ConsoleEntry[]
  sink: EntrySink
  mutated: boolean
  interrupted: boolean
}

/**
 * Read a `.pml` file and run its commands in this submission.
 *
 * Python files are refused: this console has no Python (PyMOL runs them
 * through `run`, and warns when they are given to `@`).
 */
async function runScriptFile(sub: Submission, filePath: string, depth: number): Promise<CmdOutcome> {
  const resolved = resolvePath(currentDir(), filePath)
  if (/\.(py|pym)$/i.test(resolved)) {
    return { ok: false, error: `Error: ${filePath} is a Python script; Python is not available in this console` }
  }
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

/**
 * Run commands in order until one fails or Stop is pressed.
 *
 * @param depth - 0 for what the user typed, 1 and up inside scripts.
 * @returns whether every command ran.
 */
async function runLines(sub: Submission, commands: SplitCommand[], depth: number): Promise<boolean> {
  const { ctx, args, entries, sink } = sub
  for (const cmd of commands) {
    if (isStopped(args.runId)) {
      entries.push({ kind: 'warning', text: 'Interrupted.' })
      sub.interrupted = true
      return false
    }
    sink.reset()
    if (!cmd.quiet) entries.push({ kind: 'echo', text: `PyM> ${cmd.script ? '@' : ''}${cmd.text}` })

    if (cmd.python) {
      sink.push('error', 'Error: Python expressions are not available in this console')
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
    const found = lookupCommand(word, commandNames())
    if (found.kind === 'none') {
      sink.push('error', `Error: unknown command: "${word}"`)
      return false
    }
    if (found.kind === 'ambiguous') {
      sink.push('error', `Error: ambiguous command: ${found.candidates.join(', ')}`)
      return false
    }
    const spec = findCommand(found.name)
    if (!spec) {
      sink.push('error', `Error: unknown command: "${word}"`)
      return false
    }
    // A lone undo or redo was handled before the transaction opened.
    if (spec.name === 'undo' || spec.name === 'redo') {
      sink.push('error', `Error: ${spec.name} must be the only command on the line`)
      return false
    }

    let bound: Record<string, string>
    try {
      const parsed = parseArgs(cmd.text, spec.mode)
      const result = bindArgs(spec.name, spec.params, parsed, spec.mode)
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

    // What was typed, not what a script it ran contained: replaying the log
    // runs the script again.
    if (depth === 0 && !cmd.quiet && !UNLOGGED.has(spec.name)) {
      if (!writeLog(cmd.text)) sink.push('warning', 'Warning: the log file could not be written; logging stopped')
    }

    let commandMutated = false
    let streamSeq = 0
    const cc: CmdContext = {
      sceneId: args.sceneId,
      viewId: args.viewId,
      cwd: currentDir(),
      print: (text) => sink.push('output', text),
      warn: (text) => sink.push('warning', text),
      markMutated: () => {
        commandMutated = true
      },
      setCwd: (dir) => {
        workingDir = dir
      },
      noteStream: (reqId) => { noteRunStream(args.runId, reqId) },
      streamId: (tag) => `pymconsole:${args.runId}:${tag}:${++streamSeq}`,
      runScript: (filePath) => runScriptFile(sub, filePath, depth),
    }

    let outcome
    try {
      outcome = await spec.run(ctx, bound, cc)
    } catch (e) {
      // A command should return its failures; a throw is a bug, but it must
      // not take the transaction with it.
      log.warn(`[worker] pymconsole: ${spec.name} threw:`, e)
      const msg = e instanceof Error ? e.message : String(e)
      outcome = { ok: false as const, error: `Error: ${spec.name}: ${msg}` }
    }

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
  }
  return true
}

/**
 * A submission that is exactly one `undo` or `redo`, run without a
 * transaction: they move the undo stack, which cannot happen inside one.
 *
 * @returns null when the submission is anything else.
 */
function runUndoRedo(ctx: WorkerContext, args: RunCommandArgs, commands: SplitCommand[]): RunCommandResult | null {
  if (commands.length !== 1 || commands[0].python || commands[0].script) return null
  const cmd = commands[0]
  const word = cmd.text.split(/\s+/)[0]
  const found = lookupCommand(word, commandNames())
  if (found.kind !== 'found') return null
  if (found.name !== 'undo' && found.name !== 'redo') return null

  const entries: ConsoleEntry[] = []
  if (!cmd.quiet) entries.push({ kind: 'echo', text: `PyM> ${cmd.text}` })
  const res = found.name === 'undo' ? undo(ctx, { sceneId: args.sceneId }) : redo(ctx, { sceneId: args.sceneId })
  if (!res.ok) {
    entries.push({ kind: 'error', text: `Error: nothing to ${found.name}` })
    return ok({ entries, mutated: false, aborted: true, interrupted: false })
  }
  if (!cmd.quiet) writeLog(cmd.text)
  return ok({ entries, mutated: false, aborted: false, interrupted: false })
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
  const scene = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found')

  const commands = splitCommands(args.text)
  const undoRedo = runUndoRedo(ctx, args, commands)
  if (undoRedo) return undoRedo

  const entries: ConsoleEntry[] = []
  const sub: Submission = {
    ctx,
    args,
    entries,
    sink: new EntrySink(entries),
    mutated: false,
    interrupted: false,
  }

  beginRun(args.runId)
  scene.startUndoTxn(txnLabel(args.text))
  let completed: boolean
  try {
    completed = await runLines(sub, commands, 0)
  } catch (e) {
    scene.rollbackUndoTxn()
    return failFrom(e)
  } finally {
    endRun(args.runId)
  }

  if (sub.mutated) scene.commitUndoTxn()
  else scene.rollbackUndoTxn()

  return ok({ entries, mutated: sub.mutated, aborted: !completed, interrupted: sub.interrupted })
}
