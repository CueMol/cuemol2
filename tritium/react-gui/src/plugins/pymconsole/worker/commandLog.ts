/**
 * @file plugins/pymconsole/worker/commandLog.ts
 * @description The log file `log_open` starts: what was typed, one line each.
 *
 * PyMOL's log records input, not output, so that replaying the file with `@`
 * does the same thing again. Only `.pml` logs are written: PyMOL's `.py` log
 * wraps each line in `cmd.do(...)`, which this console could not run back.
 *
 * One log at a time, held by the worker, like the working directory.
 */

import * as fs from 'fs'

let logPath: string | null = null

/** The file being logged to, or null. */
export function currentLog(): string | null {
  return logPath
}

/**
 * Start logging to `filePath`: `w` empties the file first, `a` appends.
 *
 * @throws when the file cannot be written; the caller reports it.
 */
export function openLog(filePath: string, mode: 'w' | 'a'): void {
  if (mode === 'w') fs.writeFileSync(filePath, '')
  // PyMOL starts an appended log on a new line (commanding.py log_open).
  else fs.appendFileSync(filePath, '\n')
  logPath = filePath
}

/** Stop logging. Nothing happens when no log is open. */
export function closeLog(): void {
  logPath = null
}

/**
 * Append one line to the open log. A write that fails closes the log rather
 * than failing the command that was being recorded.
 *
 * @returns false when the log had to be closed.
 */
export function writeLog(line: string): boolean {
  if (logPath === null) return true
  try {
    fs.appendFileSync(logPath, line.endsWith('\n') ? line : `${line}\n`)
    return true
  } catch {
    logPath = null
    return false
  }
}
