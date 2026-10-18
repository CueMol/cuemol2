/**
 * @file plugins/console/worker/dialects/pymol/commands/types.ts
 * @description The console's command types under the names the PyMOL
 * commands were written against.
 *
 * A PyMOL command is an ordinary console command; the alias keeps the 77 of
 * them reading as what they are. Anything PyMOL-shaped -- the argument
 * grammar, the settings name table, the wording of an error -- belongs in
 * this dialect, not in the runtime.
 */

export type {
  ArgCompletion,
  ArgMode,
  CmdContext,
  CmdOutcome,
  ConsoleCommand as PymCommand,
  ParamSpec,
} from '@plugins/console/worker/runtime/types'
