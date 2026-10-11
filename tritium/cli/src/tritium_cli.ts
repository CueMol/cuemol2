#!/usr/bin/env node
/**
 * @file tritium_cli.ts
 * @description A command line for a running CueMol: the console panel's two
 * dialects (native and PyMOL), from a terminal.
 *
 * A thin client. Every line is sent to the app's local API server
 * (`/console/run`, `/console/complete`) and runs there exactly as if typed
 * into the panel, against the active tab. The port and token are read from
 * the info file the app writes while the server is up, so nothing has to be
 * pasted. The working directory is this process's: relative paths in a
 * command are resolved against it, and `cd` moves it for the session.
 *
 * Bundled by scripts/build.mjs into one file, `dist/tritium_cli.mjs`,
 * shipped with the app as `<resources>/cli/tritium_cli` (`.cmd` on Windows),
 * a wrapper that runs it in the app's own executable as Node
 * (ELECTRON_RUN_AS_NODE). Run that way, it starts the app when no running app
 * answers, and the app opens command line access for that run of it. From the
 * repo, `task run_tritium_cli` builds and runs it against the dev app.
 *
 *   tritium_cli                        interactive (Tab completes, Ctrl-C stops a run)
 *   tritium_cli -c "fetch 1crn; show cartoon"
 *   tritium_cli script.cml             run a file
 *   cat cmds.txt | tritium_cli         run what is piped in
 *   tritium_cli -c quit                quit the app (asks to save; quit --force does not)
 *   --dialect pymol                       speak PyMOL instead of native
 *   --echo                                print each command before its output
 *   --no-launch                           fail instead of starting the app
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import type {
  ConsoleCompleteResponse,
  ConsoleDialectId,
  ConsoleInfoResponse,
  ConsoleRunResponse,
  ConsoleWireEntry,
  LocalApiInfoFile,
} from '@cuemol/console-kit'
import { quitLine } from '@cuemol/console-kit'
import { ensureApp, NOT_RUNNING, post, quitApp, readInfo } from './connection'

const HISTORY_FILE = path.join(os.homedir(), '.tritium_cli_history')
const HISTORY_SIZE = 1000

const USAGE = `usage: tritium_cli [--dialect native|pymol] [--echo] [--no-launch] [-c COMMANDS | SCRIPT]

Runs CueMol console commands in the running app, against the active tab.
With no COMMANDS or SCRIPT and a terminal on stdin, starts an interactive
prompt; type "native" or "pymol" to switch dialect, "exit" or Ctrl-D to leave.
"quit" quits CueMol itself and then leaves (it asks to save changes;
"quit --force" or "quit force=true" does not).
Starts CueMol3 when it is not running (unless --no-launch).`

// --- Output ---

/** Colour only on a terminal, and not under NO_COLOR (no-color.org). */
const colourOn = (stream: NodeJS.WriteStream): boolean => stream.isTTY === true && !process.env.NO_COLOR
const sgr = (code: string, text: string, stream: NodeJS.WriteStream = process.stdout): string =>
  colourOn(stream) ? `\x1b[${code}m${text}\x1b[0m` : text

// No dim or gray: both read poorly on a dark terminal. Secondary text is the
// default colour; keys and values are picked out with `accent` (light violet).
const STYLE = { bold: '1', red: '31', green: '32', yellow: '33', magenta: '35', cyan: '36', accent: '38;5;147' }
const DIALECT_STYLE: Record<ConsoleDialectId, string> = { native: STYLE.cyan, pymol: STYLE.magenta }
const DIALECT_NAME: Record<ConsoleDialectId, string> = { native: 'CueMol', pymol: 'pymol' }

// Kept as escapes so the source stays ASCII.
const GLYPH = {
  prompt: '\u276f',
  ok: '\u2713',
  fail: '\u2717',
  dot: '\u00b7',
  ellipsis: '\u2026',
  boxTop: '\u256d\u2500',
  boxSide: '\u2502',
  boxBottom: '\u2570\u2500',
  spinner: ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'],
}

/** Print transcript entries: output to stdout, warnings and errors to stderr. */
function printEntries(entries: readonly ConsoleWireEntry[], echo: boolean): void {
  for (const e of entries) {
    if (e.kind === 'echo') {
      if (echo) process.stdout.write(`${`${sgr(STYLE.accent, GLYPH.prompt)} ${e.text}`}\n`)
    } else if (e.kind === 'error') {
      process.stderr.write(`${sgr(STYLE.red, e.text, process.stderr)}\n`)
    } else if (e.kind === 'warning') {
      process.stderr.write(`${sgr(STYLE.yellow, e.text, process.stderr)}\n`)
    } else {
      process.stdout.write(`${e.text}\n`)
    }
  }
}

/** The width a string takes on screen, its colour codes not counted. */
function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').length
}

/**
 * Tab's candidates, as zsh shows them. A list that fits on the screen goes
 * under the prompt, with the cursor left on the prompt line, and is gone at
 * the next key: the prompt line never moves. A list taller than the screen
 * cannot sit under a prompt that stays in view, so it is printed into the
 * scrollback and the prompt is drawn again below it, as bash (and zsh) do.
 */
function makeCompletionList(rl: readline.Interface) {
  const out = process.stdout
  let rows = 0
  return {
    clear() {
      if (rows === 0) return
      // Save the cursor, step to the line under the prompt, erase to the end
      // of the screen, and come back.
      out.write('\x1b7\x1b[1B\r\x1b[J\x1b8')
      rows = 0
    },
    show(entries: readonly ConsoleWireEntry[]) {
      this.clear()
      const width = out.columns || 80
      let text = ''
      let count = 0
      for (const e of entries) {
        const line = e.kind === 'error' ? sgr(STYLE.red, e.text) : e.kind === 'warning' ? sgr(STYLE.yellow, e.text) : e.text
        text += `\n\r\x1b[K${line}`
        count += Math.max(1, Math.ceil(visibleLength(e.text) / width))
      }
      // The prompt line plus the list must fit on the screen to come back to it.
      if (count + 1 > (out.rows || 24)) {
        out.write(`${text}\n`)
        rl.prompt(true)
        return
      }
      // Back up to the prompt line, to the column readline left the cursor at.
      const col = rl.getCursorPos().cols
      out.write(`${text}\x1b[${count}A\r${col > 0 ? `\x1b[${col}C` : ''}`)
      rows = count
    },
  }
}

/**
 * A spinner with the elapsed time on stderr, while waiting. It shows only
 * after `delayMs`, so a quick command prints nothing extra. Returns the stop
 * function, which also erases it.
 */
function startSpinner(label: string, delayMs = 250): () => void {
  const err = process.stderr
  if (!err.isTTY) return () => {}
  const t0 = Date.now()
  let frame = 0
  let shown = false
  let timer: NodeJS.Timeout | null = null
  const draw = () => {
    shown = true
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    const glyph = GLYPH.spinner[frame++ % GLYPH.spinner.length]
    err.write(`\r\x1b[K${sgr(STYLE.cyan, glyph, err)} ${label}  ${sgr(STYLE.accent, `${secs}s`, err)}`)
  }
  const delay = setTimeout(() => {
    draw()
    timer = setInterval(draw, 80)
  }, delayMs)
  return () => {
    clearTimeout(delay)
    if (timer) clearInterval(timer)
    if (shown) err.write('\r\x1b[K')
  }
}

/** A command as a spinner label: its first line, cut short. */
function spinnerLabel(text: string): string {
  const first = text.trim().split('\n')[0]
  return first.length > 40 ? `${first.slice(0, 39)}${GLYPH.ellipsis}` : first
}

/** `dir` with the home directory as ~ and only the last three parts. */
function shortDir(dir: string): string {
  const home = os.homedir()
  let d = dir === home || dir.startsWith(home + path.sep) ? `~${dir.slice(home.length)}` : dir
  const parts = d.split(path.sep)
  if (parts.length > 4) d = [GLYPH.ellipsis, ...parts.slice(-3)].join(path.sep)
  return d
}

/** The prompt: dialect, working directory, arrow. */
function promptText(): string {
  const name = sgr(DIALECT_STYLE[session.dialect], DIALECT_NAME[session.dialect])
  return `${name} ${shortDir(session.cwd)} ${sgr(STYLE.bold, GLYPH.prompt)} `
}

/** The banner at the top of an interactive session. */
function printBanner(info: LocalApiInfoFile, appInfo: ConsoleInfoResponse | null): void {
  const key = (t: string): string => sgr(STYLE.accent, t)
  const dot = ` ${GLYPH.dot} `
  // `build` is the source revision; the build number is already in `version`.
  const version = appInfo ? `${appInfo.version}${appInfo.build ? ` ${key(appInfo.build)}` : ''}` : ''
  const lines = [
    `${GLYPH.boxTop} ${sgr(STYLE.bold, 'CueMol3')} ${version}`,
    `${GLYPH.boxSide}  ${['tritium_cli', key(`127.0.0.1:${info.port}`), `pid ${info.pid}`].join(dot)}`,
    `${GLYPH.boxBottom} ${[
      `${key('Tab')} completes`,
      `${key('Ctrl-C')} stops a run`,
      `${key('pymol')} / ${key('native')} switch`,
      `${key('help')} lists commands`,
      `${key('exit')} leaves`,
      `${key('quit')} quits CueMol`,
    ].join(dot)}`,
  ]
  process.stdout.write(`\n${lines.join('\n')}\n\n`)
}

// --- Running ---

/** Session state: what the next request carries. */
const session: { dialect: ConsoleDialectId; cwd: string; echo: boolean } = {
  dialect: 'native',
  cwd: process.cwd(),
  echo: false,
}

/** Run `text` as one submission; resolves to whether it all ran. */
async function run(text: string, signal: AbortSignal): Promise<boolean> {
  const stop = startSpinner(spinnerLabel(text))
  let res: ConsoleRunResponse
  try {
    res = await post<ConsoleRunResponse>('/console/run', { dialect: session.dialect, text, cwd: session.cwd }, signal)
  } finally {
    stop()
  }
  printEntries(res.entries, session.echo)
  if (typeof res.cwd === 'string') session.cwd = res.cwd
  return !res.aborted
}

/** Non-interactive: one submission, exit status 1 when any of it failed. */
async function runOnce(text: string): Promise<number> {
  const ac = new AbortController()
  process.on('SIGINT', () => ac.abort())
  const quit = quitLine(text)
  if (quit) return (await requestQuit(quit.force, ac.signal)) ? 0 : 1
  try {
    return (await run(text, ac.signal)) ? 0 : 1
  } catch (e) {
    if (ac.signal.aborted) return 130
    process.stderr.write(`${sgr(STYLE.red, (e as Error).message, process.stderr)}\n`)
    return 1
  }
}

/**
 * Ask the app to quit and say how it went; resolves to whether it did.
 *
 * A normal quit waits on the app's save prompts, which the app brings to the
 * front. Ctrl-C stops waiting but cannot take the prompt back.
 */
async function requestQuit(force: boolean, signal: AbortSignal): Promise<boolean> {
  const stop = force ? () => {} : startSpinner('Waiting for CueMol to confirm', 0)
  try {
    const outcome = await quitApp(force, signal)
    stop()
    if (outcome === 'cancelled') {
      process.stderr.write(`${sgr(STYLE.yellow, 'Quit cancelled in CueMol.', process.stderr)}\n`)
      return false
    }
    process.stdout.write('CueMol quit.\n')
    return true
  } catch (e) {
    stop()
    const text = signal.aborted ? 'Stopped waiting; CueMol may still be asking.' : (e as Error).message
    process.stderr.write(`${sgr(signal.aborted ? STYLE.yellow : STYLE.red, text, process.stderr)}\n`)
    return false
  }
}

function loadHistory(): string[] {
  try {
    return fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter((l) => l !== '').reverse().slice(0, HISTORY_SIZE)
  } catch {
    return []
  }
}

function appendHistory(line: string): void {
  try {
    fs.appendFileSync(HISTORY_FILE, `${line}\n`, { mode: 0o600 })
  } catch {
    // History is a convenience; a read-only home must not stop the session.
  }
}

/** Interactive: a banner, then a prompt until exit / Ctrl-D. */
async function interactive(): Promise<number> {
  const info = readInfo()
  if (info instanceof Error) throw info
  const appInfo = await post<ConsoleInfoResponse>('/console/info', {}).catch(() => null)
  printBanner(info, appInfo)

  /** The request in flight, for Ctrl-C. */
  let inflight: AbortController | null = null

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
    completer: (line: string, callback: (err: null, result: [string[], string]) => void) => {
      post<ConsoleCompleteResponse>('/console/complete', { dialect: session.dialect, line, cwd: session.cwd })
        .then((res) => {
          callback(null, [[], line])
          // The answer rewrites the whole line, which readline's own
          // completion (append a suffix) cannot express.
          setImmediate(() => {
            // `line` is the text before the cursor, as bash completes the
            // word before it; what follows the cursor is kept.
            if (res.replacement !== null && res.replacement !== undefined && res.replacement !== line) {
              const rest = rl.line.slice(line.length)
              let head = res.replacement
              if (head.endsWith(', ') && /^\s*,/.test(rest)) head = head.slice(0, -2)
              else if (head.endsWith(' ') && /^\s/.test(rest)) head = head.slice(0, -1)
              rl.write(null, { ctrl: true, name: 'e' })
              rl.write(null, { ctrl: true, name: 'u' })
              rl.write(head + rest)
              for (let i = 0; i < rest.length; i++) rl.write(null, { name: 'left' })
            }
            if (res.messages?.length) completionList.show(res.messages)
          })
        })
        .catch(() => callback(null, [[], line]))
    },
  })
  const completionList = makeCompletionList(rl)
  // The next key, whatever it is, takes the list away first -- before
  // readline acts on it, so a line that runs is printed below a clean prompt.
  process.stdin.prependListener('keypress', () => completionList.clear())
  const prompt = () => {
    rl.setPrompt(promptText())
    rl.prompt()
  }

  rl.on('SIGINT', () => {
    if (inflight) {
      inflight.abort()
      return
    }
    if (rl.line !== '') {
      rl.write(null, { ctrl: true, name: 'u' })
      return
    }
    rl.close()
  })

  rl.on('line', async (raw: string) => {
    const line = raw.trim()
    if (inflight) {
      process.stderr.write('A command is still running; press Ctrl-C to stop it.\n')
      return
    }
    if (line === '') return prompt()
    appendHistory(line)
    if (line === 'exit') return rl.close()
    const quit = quitLine(line)
    if (quit) {
      inflight = new AbortController()
      let done = false
      try {
        done = await requestQuit(quit.force, inflight.signal)
      } finally {
        inflight = null
      }
      return done ? rl.close() : prompt()
    }
    if (line === 'native' || line === 'pymol') {
      session.dialect = line
      process.stdout.write(`${`Switched to the ${line === 'pymol' ? 'PyMOL' : 'native'} dialect.`}\n`)
      return prompt()
    }
    inflight = new AbortController()
    const t0 = Date.now()
    let ok = false
    try {
      ok = await run(line, inflight.signal)
    } catch (e) {
      if (inflight.signal.aborted) process.stderr.write(`${sgr(STYLE.yellow, 'Interrupted.', process.stderr)}\n`)
      else process.stderr.write(`${sgr(STYLE.red, (e as Error).message, process.stderr)}\n`)
    } finally {
      inflight = null
    }
    // Say how long a slow command took, and whether it all ran.
    const secs = (Date.now() - t0) / 1000
    if (secs >= 1) {
      const mark = ok ? sgr(STYLE.green, GLYPH.ok) : sgr(STYLE.red, GLYPH.fail)
      process.stdout.write(`${mark} ${secs.toFixed(1)}s\n`)
    }
    prompt()
  })

  prompt()
  return new Promise((resolve) => rl.on('close', () => {
    process.stdout.write('\n')
    resolve(0)
  }))
}

// --- Entry ---

/** The options on the command line, or an Error. */
/** What the command line asked for. */
export interface CliOptions {
  dialect: ConsoleDialectId
  echo: boolean
  launch: boolean
  command: string | null
  script: string | null
  help: boolean
}

export function parseArgv(argv: readonly string[]): CliOptions | Error {
  const opts: CliOptions = { dialect: 'native', echo: false, launch: true, command: null, script: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') opts.help = true
    else if (a === '--echo') opts.echo = true
    else if (a === '--no-launch') opts.launch = false
    else if (a === '-c' || a === '--command') {
      if (i + 1 >= argv.length) return new Error(`${a} needs the commands to run`)
      opts.command = argv[++i]
    } else if (a === '--dialect' || a.startsWith('--dialect=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i]
      if (v !== 'native' && v !== 'pymol') return new Error('--dialect must be native or pymol')
      opts.dialect = v
    } else if (a.startsWith('-') && a !== '-') return new Error(`unknown option ${a}`)
    else if (opts.script === null) opts.script = a
    else return new Error('only one script can be given')
  }
  return opts
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

async function main(argv: string[]): Promise<number> {
  const opts = parseArgv(argv)
  if (opts instanceof Error) {
    process.stderr.write(`tritium_cli: ${opts.message}\n${USAGE}\n`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  session.dialect = opts.dialect
  session.echo = opts.echo

  let stopSpinner = () => {}
  try {
    if (opts.launch) {
      await ensureApp({
        onStart: () => {
          if (process.stderr.isTTY) stopSpinner = startSpinner('Starting CueMol3', 0)
          else process.stderr.write('Starting CueMol3...\n')
        },
      })
    } else if (readInfo() instanceof Error) {
      throw new Error(NOT_RUNNING)
    }
  } catch (e) {
    stopSpinner()
    process.stderr.write(`${sgr(STYLE.red, (e as Error).message, process.stderr)}\n`)
    return 1
  }
  stopSpinner()

  if (opts.command !== null) return runOnce(opts.command)
  if (opts.script !== null && opts.script !== '-') {
    let text
    try {
      text = fs.readFileSync(opts.script, 'utf8')
    } catch {
      process.stderr.write(`tritium_cli: cannot read ${opts.script}\n`)
      return 1
    }
    return runOnce(text)
  }
  if (!process.stdin.isTTY || opts.script === '-') return runOnce(await readStdin())
  return interactive()
}

// Run only when executed, so a test can import the helpers above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => process.exit(code))
}
