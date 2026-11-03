/**
 * @file plugins/console/worker/parser/commaSyntax.ts
 * @description The comma grammar as a dialect's syntax: how the native and
 * PyMOL dialects read their lines.
 *
 * PyMOL's command language (`parsing.py` / `parser.py`), ported in this
 * directory: lines split at `;` outside brackets and quotes, a backslash
 * continuing a line, the `_ ` (quiet), `/` (Python) and `@` (script)
 * prefixes, the command word by unique prefix, and comma-separated
 * arguments that may be named (`name=value`). The two dialects that speak
 * it differ only in how arguments meet parameters (`ArgRule`) and in
 * whether Tab falls back to file names; each makes its syntax here with its
 * own choice. The runtime never reads a line itself.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CompletionContext, CompletionOutcome } from '../completion/engine'
import type { BindResult, ConsoleCommand, DialectLine, DialectSyntax } from '../runtime/types'
import { BindError, bindArgs } from './bindArgs'
import { completeLine } from './commaComplete'
import type { CommaGrammar } from './commaComplete'
import { lookupCommand } from './commandLookup'
import { ParseError, parseArgs } from './parseArgs'
import { joinCommands, splitCommands } from './splitCommands'
import type { SplitCommand } from './splitCommands'

/** What a dialect chooses about the comma grammar. */
export interface CommaSyntaxOptions extends CommaGrammar {
  /** What a line starting `/` (Python, in PyMOL) is refused with. */
  pythonRefusal: string
}

/** A split command as the runtime sees it. */
function toLine(cmd: SplitCommand, pythonRefusal: string): DialectLine {
  return {
    text: cmd.text,
    display: `${cmd.script ? '@' : ''}${cmd.text}`,
    quiet: cmd.quiet,
    ...(cmd.script ? { scriptPath: cmd.text } : {}),
    ...(cmd.python ? { error: pythonRefusal } : {}),
    source: joinCommands([cmd]),
  }
}

/** The comma grammar, with the dialect's choices. */
export function commaSyntax(opts: CommaSyntaxOptions): DialectSyntax {
  const grammar: CommaGrammar = { rule: opts.rule, fileFallback: opts.fileFallback }
  return {
    split(text: string): DialectLine[] {
      return splitCommands(text).map((c) => toLine(c, opts.pythonRefusal))
    },

    resolve(text: string, commands: readonly ConsoleCommand[]) {
      const word = text.split(/\s+/)[0]
      const found = lookupCommand(word, commands.map((c) => c.name))
      if (found.kind === 'ambiguous') {
        return { kind: 'error', error: `Error: ambiguous command: ${found.candidates.join(', ')}` }
      }
      const spec = found.kind === 'found' ? commands.find((c) => c.name === found.name) : undefined
      if (!spec) return { kind: 'error', error: `Error: unknown command: "${word}"` }
      return { kind: 'found', spec }
    },

    bind(spec: ConsoleCommand, text: string): BindResult {
      try {
        const result = bindArgs(spec.name, spec.params, parseArgs(text, spec.mode), spec.mode, opts.rule)
        return result.kind === 'usage' ? result : { kind: 'args', args: result.args }
      } catch (e) {
        if (e instanceof ParseError || e instanceof BindError) return { kind: 'error', error: e.message }
        throw e
      }
    },

    complete(ctx: WorkerContext, line: string, cc: CompletionContext): CompletionOutcome {
      return completeLine(ctx, line, cc, grammar)
    },
  }
}
