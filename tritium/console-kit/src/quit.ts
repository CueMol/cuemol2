/**
 * @file quit.ts
 * @description The console's `quit` syntax, shared so that the app's
 * command (react-gui quitCommand.ts) and tritium_cli, which quits the app
 * itself and then leaves, read the same line the same way.
 */

/** `force` as typed: `true` / `false`, or the command-line style `--force` / `-f`; null when neither. */
export function quitForce(text: string): boolean | null {
  const t = text.trim().toLowerCase()
  if (t === '' || t === 'false') return false
  if (t === 'true' || t === '--force' || t === '-f') return true
  return null
}

/**
 * A whole line that is `quit` with at most the force argument, positional or
 * as `force=...` (`quit`, `quit --force`, `quit force=true`). `exit` takes no
 * argument and is left to each client (the CLI leaves, the app quits).
 * Null for anything else, including a bad force value, which is left to the
 * app's command to report.
 */
export function quitLine(text: string): { force: boolean } | null {
  const m = /^quit(?:\s+(?:force\s*=\s*)?(\S+))?$/.exec(text.trim())
  if (!m) return null
  const force = quitForce(m[1] ?? '')
  return force === null ? null : { force }
}
