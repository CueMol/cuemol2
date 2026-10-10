/**
 * @file plugins/console/worker/runtime/quitCommand.ts
 * @description `quit` and `exit` (the same in both dialects): quit the app.
 *
 * The worker cannot quit the app, so the command is handed to the panel like
 * a scene command (CmdContext.requestScene), which asks main
 * (IPC.APP_QUIT, main/appQuit.ts): Cmd+Q with its save prompts, or with
 * `force` a quit without them. Nothing after it in the submission runs.
 */

import { quitForce } from '@cuemol/console-kit'
import type { ConsoleCommand } from './types'

/**
 * @param name - `quit`, which takes `force`, or `exit`, the same without it
 *   (a forced quit is spelled one way only)
 */
export function quitCommand(name: 'quit' | 'exit'): ConsoleCommand {
  const quit = name === 'quit'
  return {
    name,
    group: 'console',
    params: quit ? [{ name: 'force', default: 'false' }] : [],
    mode: 'strict',
    mutates: false,
    summary: quit
      ? 'Quit CueMol, asking to save changes; force true (or --force) quits without asking.'
      : 'Quit CueMol, asking to save changes (quit --force skips that).',
    completions: quit ? [{ source: 'enum:true|false|--force', description: 'force' }] : [],
    run(_ctx, args, cc) {
      const force = quitForce(args.force ?? '')
      if (force === null) return { ok: false, error: `Error: ${name}: force must be true, false or --force` }
      if (cc.requestScene({ op: 'quit', force })) return { ok: true }
      return { ok: false, error: `Error: ${name} cannot run inside a script; put it on the command line` }
    },
  }
}
