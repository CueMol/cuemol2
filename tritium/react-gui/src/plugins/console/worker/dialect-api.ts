/**
 * @file plugins/console/worker/dialect-api.ts
 * @description What the console offers a plugin that adds a dialect to it.
 *
 * A dialect other than native lives in a plugin of its own (`pymol-console`,
 * `chimerax-console`) and reaches the console through this file only:
 * ESLint keeps those plugins out of every other console module, so what is
 * exported here is the whole contract, and the console's internals can
 * change behind it. A dialect plugin registers its implementation in the
 * worker with `registerDialect` and declares its `DialectMeta` to the
 * renderer under the `console.dialect` extension point
 * (`docs/architecture/tritium_plugin/contributions.md`).
 *
 * Worker code: the renderer half of a dialect plugin imports only
 * `@plugins/console/shared/dialectMeta`.
 */

// --- Registering a dialect ---
export { registerDialect } from './dialects/registry'

// --- What a dialect and its commands are ---
export type {
  ArgCompletion,
  ArgMode,
  BindResult,
  CmdContext,
  CmdOutcome,
  CompletionItem,
  ConsoleCommand,
  ConsoleDialect,
  DialectLine,
  DialectSyntax,
  ParamSpec,
  SourceContext,
} from './runtime/types'
export type { DialectMeta } from '../shared/dialectMeta'

// --- The comma grammar (PyMOL's argument language, also the native dialect's) ---
export { commaSyntax } from './parser/commaSyntax'
export { bindArgs, usageLine } from './parser/bindArgs'
export { parseArgs } from './parser/parseArgs'
export { interpretShortcut } from './parser/shortcut'
export { lookupCommand } from './parser/commandLookup'

// --- Tab, apart from any grammar ---
export { complain, fileOffers, settle } from './completion/engine'
export type { CompletionContext, CompletionOutcome, Group, Offer } from './completion/engine'

// --- Runtime helpers a command uses ---
export { resolvePath } from './runtime/paths'
export { opContextOf } from './runtime/opContext'
export { quitCommand } from './runtime/quitCommand'
export { closeLog, currentLog, openLog, writeLog } from './runtime/commandLog'
export { commandHelp, commandTable } from './help/helpMarkdown'
