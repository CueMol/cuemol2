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
import { splitCommands } from './parser/splitCommands'
import { commandNames, findCommand } from './commands/registry'
import type { CmdContext } from './commands/types'

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

function currentDir(): string {
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
 * Run a submission.
 *
 * Async because `fetch` downloads; everything else resolves immediately.
 */
export async function runCommand(
  ctx: WorkerContext,
  args: RunCommandArgs,
): Promise<RunCommandResult> {
  const scene = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found')

  const commands = splitCommands(args.text)
  const entries: ConsoleEntry[] = []
  const sink = new EntrySink(entries)
  let mutated = false
  let aborted = false

  scene.startUndoTxn(txnLabel(args.text))
  try {
    for (const cmd of commands) {
      sink.reset()
      if (!cmd.quiet) entries.push({ kind: 'echo', text: `PyMOL> ${cmd.text}` })

      if (cmd.python) {
        sink.push('error', 'Error: Python expressions are not available in this console')
        aborted = true
        break
      }
      if (cmd.script) {
        sink.push('error', 'Error: running a script file is not supported yet; paste it instead')
        aborted = true
        break
      }

      const word = cmd.text.split(/\s+/)[0]
      const found = lookupCommand(word, commandNames())
      if (found.kind === 'none') {
        sink.push('error', `Error: unknown command: "${word}"`)
        aborted = true
        break
      }
      if (found.kind === 'ambiguous') {
        sink.push('error', `Error: ambiguous command: ${found.candidates.join(', ')}`)
        aborted = true
        break
      }
      const spec = findCommand(found.name)
      if (!spec) {
        sink.push('error', `Error: unknown command: "${word}"`)
        aborted = true
        break
      }

      // Undo and redo cannot run inside the transaction opened above.
      if (spec.name === 'undo' || spec.name === 'redo') {
        if (commands.length > 1) {
          sink.push('error', `Error: ${spec.name} must be the only command on the line`)
          aborted = true
          break
        }
        const res = spec.name === 'undo' ? undo(ctx, { sceneId: args.sceneId }) : redo(ctx, { sceneId: args.sceneId })
        // Close the (empty) transaction before touching the undo stack.
        scene.rollbackUndoTxn()
        if (!res.ok) {
          entries.push({ kind: 'error', text: `Error: nothing to ${spec.name}` })
          return ok({ entries, mutated: false, aborted: true })
        }
        return ok({ entries, mutated: false, aborted: false })
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
          aborted = true
          break
        }
        throw e
      }

      let commandMutated = false
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

      if (outcome.ok && (spec.mutates || commandMutated)) mutated = true
      if (!outcome.ok) {
        sink.push('error', outcome.error)
        aborted = true
        break
      }
    }
  } catch (e) {
    scene.rollbackUndoTxn()
    return failFrom(e)
  }

  if (mutated) scene.commitUndoTxn()
  else scene.rollbackUndoTxn()

  return ok({ entries, mutated, aborted })
}
