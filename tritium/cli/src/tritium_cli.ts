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
 *   tritium_cli -c "fetch 1crn; create_renderer 1crn, ribbon"
 *   tritium_cli 1crn.pdb map.ccp4      open files (inputs.ts), then exit; -i stays interactive
 *   tritium_cli script.qax             run a script (.qax, .pml, .txt)
 *   cat cmds.txt | tritium_cli         run what is piped in
 *   tritium_cli skill [install]        the agent skill (skill.ts)
 *   tritium_cli mcp                    MCP over stdio, relayed to /mcp (mcpBridge.ts)
 *   tritium_cli status | --version     about the app, without starting it
 *
 * The command line is read in args.ts. A command line that is several runs
 * holds the app's edit lock across them (runs.ts).
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { displayWidth, layoutSections, menuText, moveMenu, sectionRows } from '@cuemol/console-kit'
import type {
  CandidateKind,
  CompletionMenu,
  GridSection,
  MenuMove,
  ConsoleCompleteResponse,
  ConsoleDialectId,
  ConsoleInfoResponse,
  ConsoleRunRequest,
  ConsoleRunResponse,
  ConsoleWireEntry,
  LocalApiInfoFile,
} from '@cuemol/console-kit'
import { CONSOLE_PROTOCOL, quitLine } from '@cuemol/console-kit'
import { randomBytes } from 'node:crypto'
import type { LocalApiEndpoint } from '@cuemol/console-kit'
import { parseArgv, SUBCOMMAND_USAGE, USAGE, UsageError } from './args'
import type { RunCommand } from './args'
import { alive, ensureApp, MCP_NOT_RUNNING, post, quitApp, readInfo, readInfoFile } from './connection'
import { appDialects, findDialect, NATIVE_DIALECT } from './dialects'
import type { AppDialects } from './dialects'
import { buildSubmissions } from './inputs'
import type { Submission } from './inputs'
import { createMcpBridge } from './mcpBridge'
import { defaultSkillDir, installSkill } from './skill'
import SKILL_TEXT from './skill/SKILL.md'
import { statusReport } from './status'
import { packageVersion, versionLines } from './version'
import { LOCK_UNSUPPORTED, sendRuns } from './runs'
import type { LockApi } from './runs'
import { markdownToAnsi } from './markdownAnsi'

const HISTORY_FILE = path.join(os.homedir(), '.tritium_cli_history')
const HISTORY_SIZE = 1000

// --- Output ---

/** Colour only on a terminal, and not under NO_COLOR (no-color.org). */
const colourOn = (stream: NodeJS.WriteStream): boolean => stream.isTTY === true && !process.env.NO_COLOR
const sgr = (code: string, text: string, stream: NodeJS.WriteStream = process.stdout): string =>
  colourOn(stream) ? `\x1b[${code}m${text}\x1b[0m` : text

// No dim or gray: both read poorly on a dark terminal. Secondary text is the
// default colour; keys and values are picked out with `accent` (light violet).
const STYLE = { bold: '1', red: '31', green: '32', yellow: '33', magenta: '35', cyan: '36', accent: '38;5;147', dir: '1;34' }
/** The SGR code of a dialect's `cliColor`; an unknown name is drawn in the default colour. */
const COLOUR_CODE: Record<string, string> = { cyan: '36', magenta: '35', green: '32', yellow: '33', blue: '34' }

/** What the app speaks, from its `/console/info`; set once connected. */
let dialects: AppDialects = appDialects(null)

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
  boxH: '\u2500',
  boxTL: '\u256d',
  boxTR: '\u256e',
  boxBL: '\u2570',
  boxBR: '\u256f',
  halfUp: '\u2580',
  halfDown: '\u2584',
  full: '\u2588',
  spinner: ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'],
}

/** Print transcript entries: output to stdout, warnings and errors to stderr; Markdown formatted on a terminal. */
function printEntries(entries: readonly ConsoleWireEntry[], echo: boolean): void {
  for (const e of entries) {
    if (e.kind === 'echo') {
      if (echo) process.stdout.write(`${`${sgr(STYLE.accent, GLYPH.prompt)} ${e.text}`}\n`)
    } else if (e.kind === 'error') {
      process.stderr.write(`${sgr(STYLE.red, e.text, process.stderr)}\n`)
    } else if (e.kind === 'warning') {
      process.stderr.write(`${sgr(STYLE.yellow, e.text, process.stderr)}\n`)
    } else if (e.format === 'markdown' && process.stdout.isTTY) {
      // Formatted on a terminal; piped, the Markdown itself, to reuse as is.
      const width = Math.max(20, (process.stdout.columns || 80) - 1)
      for (const l of markdownToAnsi(e.text, width, colourOn(process.stdout))) process.stdout.write(`${l}\n`)
    } else {
      process.stdout.write(`${e.text}\n`)
    }
  }
}

/** The width a string takes on screen, its colour codes not counted. */
function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return displayWidth(text.replace(/\x1b\[[0-9;]*m/g, ''))
}

/** A candidate's colour, after ls: directories, programs, links. */
const KIND_STYLE: Partial<Record<CandidateKind, string>> = { dir: STYLE.dir, exec: STYLE.green, link: STYLE.cyan }

/** A readline Interface with the internals Tab's menu takes over. */
type MenuInterface = readline.Interface & {
  _ttyWrite(s: string | undefined, key: readline.Key | undefined): void
  line: string
  cursor: number
}

/**
 * Tab, as zsh does it (@cuemol/console-kit completion.ts, shared with the
 * panel): one candidate is written in, several are listed under the prompt,
 * and a second Tab walks them in a menu -- Tab / Shift-Tab and the arrows
 * move, Enter accepts, Esc or Ctrl-G puts back what was typed, any other key
 * accepts and goes on.
 *
 * The list is drawn under the prompt with the cursor left on the prompt
 * line, so the prompt never moves; a list taller than the screen shows the
 * rows around the selection. Keys reach readline through `_ttyWrite`, which
 * this wraps to see them first.
 */
function installCompletion(rl: MenuInterface, complete: (line: string) => Promise<ConsoleCompleteResponse>): void {
  const out = process.stdout
  const ttyWrite = rl._ttyWrite.bind(rl)
  /** Lines drawn under the prompt. */
  let rows = 0
  let notes: readonly ConsoleWireEntry[] = []
  let menu: { view: CompletionMenu; rest: string; sections: GridSection[] } | null = null
  /** Set while this writes the line itself, so those keys go straight to readline. */
  let writing = false

  const clear = () => {
    if (rows === 0) return
    // Save the cursor, step to the line under the prompt, erase to the end
    // of the screen, and come back.
    out.write('\x1b7\x1b[1B\r\x1b[J\x1b8')
    rows = 0
  }

  const close = () => {
    clear()
    menu = null
    notes = []
  }

  /** Replace the text before the cursor, keeping what follows it. */
  const setHead = (head: string, rest: string) => {
    if (head.endsWith(', ') && /^\s*,/.test(rest)) head = head.slice(0, -2)
    else if (head.endsWith(' ') && /^\s/.test(rest)) head = head.slice(0, -1)
    if (head + rest === rl.line && rl.cursor === head.length) return
    writing = true
    try {
      rl.write(null, { ctrl: true, name: 'e' })
      rl.write(null, { ctrl: true, name: 'u' })
      rl.write(head + rest)
      for (let i = 0; i < rest.length; i++) rl.write(null, { name: 'left' })
    } finally {
      writing = false
    }
  }

  /** The list as screen lines, and which one holds the selection. */
  const listLines = (): { lines: string[]; at: number } => {
    const lines = notes.map((e) =>
      e.kind === 'error' ? sgr(STYLE.red, e.text) : e.kind === 'warning' ? sgr(STYLE.yellow, e.text) : e.text,
    )
    let at = -1
    if (menu) {
      const { view, sections } = menu
      for (const sec of sections) {
        if (sections.length > 1) lines.push(sgr(STYLE.accent, sec.group))
        for (const row of sectionRows(sec)) {
          if (row.includes(view.selected)) at = lines.length
          const cells = row.map((i) => {
            const c = view.candidates[i]
            const padded = c.label + ' '.repeat(Math.max(0, sec.cellWidth - displayWidth(c.label)))
            // Reverse video marks the selection even without colour.
            if (i === view.selected) return `\x1b[7m${padded}\x1b[27m`
            const style = KIND_STYLE[c.kind]
            return style ? sgr(style, padded) : padded
          })
          lines.push(cells.join('  ').trimEnd())
        }
      }
    }
    return { lines, at }
  }

  const draw = () => {
    clear()
    const width = (out.columns || 80) - 1
    const { lines, at } = listLines()
    if (lines.length === 0) return
    // The prompt line stays on screen: show a window of rows around the selection.
    const room = Math.max(2, (out.rows || 24) - 2)
    let shown = lines
    if (lines.length > room) {
      const top = Math.min(Math.max(0, at - Math.floor((room - 1) / 2)), lines.length - (room - 1))
      shown = [...lines.slice(top, top + room - 1), sgr(STYLE.accent, `rows ${top + 1}-${top + room - 1} of ${lines.length}`)]
    }
    let count = 0
    let text = ''
    for (const l of shown) {
      text += `\n\r\x1b[K${l}`
      count += Math.max(1, Math.ceil(visibleLength(l) / (width + 1)))
    }
    // Back up to the prompt line, to the column readline left the cursor at.
    const col = rl.getCursorPos().cols
    out.write(`${text}\x1b[${count}A\r${col > 0 ? `\x1b[${col}C` : ''}`)
    rows = count
  }

  const walk = (move: MenuMove) => {
    if (!menu) return
    menu.view = moveMenu(menu.view, move, menu.sections)
    setHead(menuText(menu.view), menu.rest)
    draw()
  }

  const tab = () => {
    const line = rl.line.slice(0, rl.cursor)
    const rest = rl.line.slice(rl.cursor)
    complete(line)
      .then((res) => {
        // Typed on while asking: the answer is for a line that is gone.
        if (rl.line.slice(0, rl.cursor) !== line) return
        notes = res.messages ?? []
        const head = res.replacement ?? line
        if (res.replacement !== null && res.replacement !== undefined) setHead(head, rest)
        const candidates = res.candidates ?? []
        menu =
          candidates.length > 1
            ? {
                view: { candidates, original: head, selected: -1 },
                rest,
                sections: layoutSections(candidates, (out.columns || 80) - 1),
              }
            : null
        draw()
      })
      .catch(() => {})
  }

  const ARROWS: Record<string, MenuMove> = { up: 'up', down: 'down', left: 'left', right: 'right' }

  rl._ttyWrite = (str, key) => {
    if (writing || !key) return ttyWrite(str, key)
    const plain = !key.ctrl && !key.meta
    if (key.name === 'tab' && plain) {
      if (menu) walk(key.shift ? 'prev' : 'next')
      else if (!key.shift) tab()
      return
    }
    const cancel = key.name === 'escape' || (key.ctrl && key.name === 'g')
    if (menu && menu.view.selected >= 0) {
      const arrow = key.name ? ARROWS[key.name] : undefined
      if (arrow && plain && !key.shift) return walk(arrow)
      if (key.name === 'return' || key.name === 'enter') return close()
      if (cancel) {
        setHead(menu.view.original, menu.rest)
        return close()
      }
    }
    if (cancel && (menu || notes.length > 0)) return close()
    // Anything else accepts what is shown and does what it does.
    if (rows > 0 || menu) close()
    ttyWrite(str, key)
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
  const d = findDialect(dialects, session.dialect)
  const name = d ? sgr(COLOUR_CODE[d.cliColor] ?? '0', d.label) : session.dialect
  return `${name} ${shortDir(session.cwd)} ${sgr(STYLE.bold, GLYPH.prompt)} `
}

/**
 * The app icon (a large dark sphere and two small pale ones) as pixels, two
 * per character cell with half blocks. Letters pick the 256-colour index in
 * ICON_COLOUR; `.` is transparent. Drawn by hand after build/icon.png.
 */
const ICON = [
  '................',
  '.......33322....',
  '.....33www322...',
  '...cc333333221..',
  '..cc33w3333221..',
  '.ccc3333332221..',
  '.ccc2333322211..',
  '.cccc222222111..',
  '..ccc22222111c..',
  '......111111ccc.',
  '........111cccc.',
  '.........cccccc.',
  '..........cccc..',
  '................',
]
const ICON_COLOUR: Record<string, number> = { 1: 240, 2: 242, 3: 245, w: 255, c: 152 }

/** ICON as terminal lines (colour required). */
function iconLines(): string[] {
  const fg = (n: number): string => `38;5;${n}`
  const lines: string[] = []
  for (let y = 0; y < ICON.length; y += 2) {
    let line = ''
    for (let x = 0; x < ICON[y].length; x++) {
      const top = ICON_COLOUR[ICON[y][x]]
      const bottom = ICON_COLOUR[ICON[y + 1][x]]
      if (top === undefined && bottom === undefined) line += ' '
      else if (top === undefined) line += sgr(fg(bottom), GLYPH.halfDown)
      else if (bottom === undefined || bottom === top) line += sgr(fg(top), bottom === top ? GLYPH.full : GLYPH.halfUp)
      else line += sgr(`${fg(top)};48;5;${bottom}`, GLYPH.halfUp)
    }
    lines.push(line)
  }
  return lines
}

/** The banner at the top of an interactive session. */
function printBanner(info: LocalApiInfoFile, appInfo: ConsoleInfoResponse | null): void {
  const key = (t: string): string => sgr(STYLE.accent, t)
  const dot = ` ${GLYPH.dot} `
  // `build` is the source revision; the build number is already in `version`.
  const version = appInfo ? `${appInfo.version}${appInfo.build ? ` ${key(appInfo.build)}` : ''}` : ''
  const title = `${sgr(STYLE.bold, 'CueMol3')} ${version}`
  const connection = ['tritium_cli', key(`127.0.0.1:${info.port}`), `pid ${info.pid}`].join(dot)
  const hints = [
    [`${key('Tab')} completes`, `${key('Ctrl-C')} stops a run`, `${key('help')} lists commands`].join(dot),
    [`${dialects.list.map((d) => key(d.id)).join(' / ')} switch`, `${key('exit')} leaves`, `${key('quit')} quits CueMol`].join(dot),
  ]

  // The icon beside the details in a box, like Claude Code's; where it would
  // not fit or cannot be drawn without colour, the details alone.
  const icon = colourOn(process.stdout) ? iconLines() : []
  const details = ['', '', title, connection, `cwd ${key(shortDir(session.cwd))}`]
  const body = [...icon.map((l, i) => `${l}   ${details[i] ?? ''}`.trimEnd()), '', ...hints]
  const inner = Math.max(...body.map(visibleLength))
  let lines: string[]
  if (icon.length > 0 && inner + 4 <= (process.stdout.columns || 80)) {
    const frame = (t: string): string => key(t)
    lines = [
      frame(`${GLYPH.boxTL}${GLYPH.boxH.repeat(inner + 2)}${GLYPH.boxTR}`),
      ...body.map((l) => `${frame(GLYPH.boxSide)} ${l}${' '.repeat(inner - visibleLength(l))} ${frame(GLYPH.boxSide)}`),
      frame(`${GLYPH.boxBL}${GLYPH.boxH.repeat(inner + 2)}${GLYPH.boxBR}`),
    ]
  } else {
    lines = [
      `${GLYPH.boxTop} ${title}`,
      `${GLYPH.boxSide}  ${connection}`,
      `${GLYPH.boxBottom} ${hints.join(dot)}`,
    ]
  }
  process.stdout.write(`\n${lines.join('\n')}\n\n`)
  // Installed from npm, this command and the app update separately.
  if (appInfo && appInfo.protocol !== CONSOLE_PROTOCOL) {
    const [older, newer] = (appInfo.protocol ?? 0) < CONSOLE_PROTOCOL ? ['CueMol3', 'tritium_cli'] : ['tritium_cli', 'CueMol3']
    const text = `${older} is older than ${newer}; some commands may not work. Update ${older}.`
    process.stderr.write(`${sgr(STYLE.yellow, text, process.stderr)}\n\n`)
  }
}

// --- Running ---

/** Session state: what the next request carries. */
const session: { dialect: ConsoleDialectId; cwd: string; echo: boolean } = {
  dialect: NATIVE_DIALECT,
  cwd: process.cwd(),
  echo: false,
}

/**
 * Run one submission (commands, or a script file by its path); resolves to
 * whether it all ran.
 *
 * @param lock - the edit lock it runs under (`withEditLock`); none takes one for this run alone
 */
async function run(sub: Submission, signal: AbortSignal, lock?: string): Promise<boolean> {
  const stop = startSpinner(spinnerLabel(sub.text ?? path.basename(sub.scriptPath ?? '')))
  let res: ConsoleRunResponse
  try {
    const what = sub.scriptPath !== undefined ? { scriptPath: sub.scriptPath } : { text: sub.text }
    const body: ConsoleRunRequest = { dialect: sub.dialect, ...what, cwd: session.cwd, ...(lock ? { lock } : {}) }
    res = await post<ConsoleRunResponse>('/console/run', body, signal)
  } finally {
    stop()
  }
  printEntries(res.entries, session.echo)
  if (typeof res.cwd === 'string') session.cwd = res.cwd
  return !res.aborted
}

/**
 * Non-interactive: the runs in order, stopping at the first that fails;
 * exit status 1 when any of it failed.
 *
 * Several runs hold the edit lock from the first to the last (sendRuns), so
 * no other client edits or switches tabs in between.
 */
async function runOnce(subs: readonly Submission[]): Promise<number> {
  const ac = new AbortController()
  process.on('SIGINT', () => ac.abort())
  const quit = subs.length === 1 && subs[0].text !== undefined ? quitLine(subs[0].text) : null
  if (quit) return (await requestQuit(quit.force, ac.signal)) ? 0 : 1
  try {
    return (await sendRuns(subs, (s, lock) => run(s, ac.signal, lock), lockApi)) ? 0 : 1
  } catch (e) {
    if (ac.signal.aborted) return 130
    process.stderr.write(`${sgr(STYLE.red, (e as Error).message, process.stderr)}\n`)
    return 1
  }
}

/** `/console/lock` over the connection. */
const lockApi: LockApi = {
  acquire: async (owner) => {
    try {
      await post('/console/lock', { action: 'acquire', owner }, undefined, LOCK_UNSUPPORTED)
      return 'held'
    } catch (e) {
      // An app from before the lock: go on without one.
      if ((e as Error).message === LOCK_UNSUPPORTED) return 'unsupported'
      throw e
    }
  },
  release: async (owner) => {
    await post('/console/lock', { action: 'release', owner }, undefined, LOCK_UNSUPPORTED).catch(() => {})
  },
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
async function interactive(appInfo: ConsoleInfoResponse | null): Promise<number> {
  const info = readInfo()
  if (info instanceof Error) throw info
  printBanner(info, appInfo)

  /** The request in flight, for Ctrl-C. */
  let inflight: AbortController | null = null

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
  })
  installCompletion(rl as MenuInterface, (line) =>
    post<ConsoleCompleteResponse>('/console/complete', { dialect: session.dialect, line, cwd: session.cwd }),
  )
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
    const named = findDialect(dialects, line)
    if (named) {
      session.dialect = named.id
      process.stdout.write(`Switched to the ${named.label} dialect.\n`)
      return prompt()
    }
    inflight = new AbortController()
    const t0 = Date.now()
    let ok = false
    try {
      ok = await run({ text: line, dialect: session.dialect }, inflight.signal)
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

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** Print an error the way every failure is printed. */
function fail(message: string): void {
  process.stderr.write(`${sgr(STYLE.red, message, process.stderr)}\n`)
}

/** The app's /console/info when it is running with the console open, without starting it. */
async function appInfoIfRunning(): Promise<ConsoleInfoResponse | null> {
  const info = readInfo()
  if (info instanceof Error || !alive(info.pid)) return null
  return post<ConsoleInfoResponse>('/console/info', {}).catch(() => null)
}

/** Start the app if asked to and needed; false (with the reason printed) when it is not there. */
async function connect(launch: boolean, endpoint: LocalApiEndpoint = 'console'): Promise<boolean> {
  let stopSpinner = () => {}
  try {
    if (launch) {
      await ensureApp({
        endpoint,
        onStart: () => {
          if (process.stderr.isTTY) stopSpinner = startSpinner('Starting CueMol3', 0)
          else process.stderr.write('Starting CueMol3...\n')
        },
      })
    } else {
      const info = readInfo(undefined, endpoint)
      if (info instanceof Error) throw info
    }
    return true
  } catch (e) {
    stopSpinner()
    fail((e as Error).message)
    return false
  } finally {
    stopSpinner()
  }
}

/** The console's own command line: files, -c, piped text, or the prompt. */
async function runMain(opts: RunCommand): Promise<number> {
  session.echo = opts.echo
  const stdinText = opts.files.includes('-') ? await readStdin() : null
  // Which dialects exist, and which files are their scripts, is the app's to
  // say: connect before reading the command line's files.
  if (!(await connect(opts.launch))) return 1
  const appInfo = await post<ConsoleInfoResponse>('/console/info', {}).catch(() => null)
  dialects = appDialects(appInfo)
  if (opts.dialect !== null && !findDialect(dialects, opts.dialect)) {
    process.stderr.write(`tritium_cli: no such dialect: ${opts.dialect} (CueMol speaks ${dialects.list.map((d) => d.id).join(', ')})\n`)
    return 2
  }
  session.dialect = opts.dialect ?? NATIVE_DIALECT
  const subs = buildSubmissions(opts.files, opts.command, session.dialect, session.cwd, {
    isFile,
    readText: (p) => {
      if (p === '-') return stdinText
      try {
        return fs.readFileSync(p, 'utf8')
      } catch {
        return null
      }
    },
  }, dialects)
  if (subs instanceof UsageError) {
    process.stderr.write(`tritium_cli: ${subs.message}\n${USAGE}\n`)
    return 2
  }
  if (subs instanceof Error) {
    fail(`tritium_cli: ${subs.message}`)
    return 1
  }

  if (subs.length > 0) {
    const code = await runOnce(subs)
    if (code !== 0 || !opts.interactive || !process.stdin.isTTY) return code
    return interactive(appInfo)
  }
  if (!process.stdin.isTTY) return runOnce([{ text: await readStdin(), dialect: session.dialect }])
  return interactive(appInfo)
}

/** `tritium_cli mcp`: the stdio transport over the app's /mcp. */
async function mcpMain(launch: boolean): Promise<number> {
  if (!(await connect(launch, 'mcp'))) return 1
  const bridge = createMcpBridge({
    prefix: `tcli-${process.pid}-${randomBytes(4).toString('hex')}-`,
    write: (line) => process.stdout.write(`${line}\n`),
    post: async (body, headers) => {
      const info = readInfo(undefined, 'mcp')
      if (info instanceof Error) throw info
      let res: Response
      try {
        res = await fetch(`http://127.0.0.1:${info.port}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${info.token}`,
            ...headers,
          },
          body: JSON.stringify(body),
        })
      } catch {
        throw new Error(MCP_NOT_RUNNING)
      }
      if (res.status === 404) throw new Error(MCP_NOT_RUNNING)
      if (res.status === 401 || res.status === 403) throw new Error(`CueMol refused the connection (${res.status}).`)
      return { status: res.status, text: await res.text() }
    },
  })
  const rl = readline.createInterface({ input: process.stdin, terminal: false })
  const pending = new Set<Promise<void>>()
  rl.on('line', (line) => {
    const p = bridge.handleLine(line).catch((e: unknown) => fail(`tritium_cli mcp: ${(e as Error).message}`))
    pending.add(p)
    void p.finally(() => pending.delete(p))
  })
  await new Promise<void>((resolve) => rl.on('close', () => resolve()))
  await Promise.allSettled([...pending])
  return 0
}

async function main(argv: string[]): Promise<number> {
  const cmd = parseArgv(argv)
  if (cmd instanceof UsageError) {
    process.stderr.write(`tritium_cli: ${cmd.message}\n${USAGE}\n`)
    return 2
  }
  switch (cmd.kind) {
    case 'help':
      process.stdout.write(`${cmd.topic ? SUBCOMMAND_USAGE[cmd.topic] : USAGE}\n`)
      return 0
    case 'version':
      for (const l of versionLines(packageVersion(), await appInfoIfRunning())) process.stdout.write(`${l}\n`)
      return 0
    case 'status': {
      const { lines, code } = statusReport(readInfoFile(), alive, await appInfoIfRunning())
      for (const l of lines) process.stdout.write(`${l}\n`)
      return code
    }
    case 'skill': {
      if (!cmd.install) {
        process.stdout.write(SKILL_TEXT)
        return 0
      }
      const written = installSkill(SKILL_TEXT, cmd.dir ? path.resolve(cmd.dir) : defaultSkillDir(), cmd.force)
      if (written instanceof Error) {
        fail(`tritium_cli: ${written.message}`)
        return 1
      }
      process.stdout.write(`Installed ${written}\n`)
      return 0
    }
    case 'mcp':
      return mcpMain(cmd.launch)
    case 'run':
      return runMain(cmd)
  }
}

/** Whether this module is the script Node was started with (through a symlink, as npm's bin link is). */
function isEntry(): boolean {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

/** Resolves once everything written to `stream` so far has gone out (a pipe is written asynchronously). */
const flushed = (stream: NodeJS.WriteStream): Promise<void> => new Promise((resolve) => stream.write('', () => resolve()))

if (isEntry()) {
  // Exit only after the output is out: piped, a large answer (MCP tools/list,
  // help) is still queued when main returns, and process.exit would cut it.
  void main(process.argv.slice(2))
    .then(async (code) => {
      await Promise.all([flushed(process.stdout), flushed(process.stderr)])
      return code
    })
    .then((code) => process.exit(code))
}
