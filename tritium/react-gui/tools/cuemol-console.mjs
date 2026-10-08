#!/usr/bin/env node
/**
 * @file tools/cuemol-console.mjs
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
 * Needs only Node (18 or later, for fetch). In the app, turn on
 * Settings > Plugins > Console > Command line access.
 *
 *   cuemol-console                        interactive (Tab completes, Ctrl-C stops a run)
 *   cuemol-console -c "fetch 1crn; show cartoon"
 *   cuemol-console script.cml             run a file
 *   cat cmds.txt | cuemol-console         run what is piped in
 *   --dialect pymol                       speak PyMOL instead of native
 *   --echo                                print each command before its output
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const PROMPTS = { native: 'CueMol>', pymol: 'PyM>' }
const HISTORY_FILE = path.join(os.homedir(), '.cuemol_console_history')
const HISTORY_SIZE = 1000

const USAGE = `usage: cuemol-console [--dialect native|pymol] [--echo] [-c COMMANDS | SCRIPT]

Runs CueMol console commands in the running app, against the active tab.
With no COMMANDS or SCRIPT and a terminal on stdin, starts an interactive
prompt; type "native" or "pymol" to switch dialect, "exit" or Ctrl-D to leave.
Requires Settings > Plugins > Console > Command line access in the app.`

// --- Connection ---

/** Where the app writes its port and token. */
export function infoFilePath(env = process.env) {
  return env.CUEMOL_LOCAL_API_INFO || path.join(os.homedir(), '.cuemol', 'local-api.json')
}

const NOT_RUNNING =
  'CueMol is not running, or command line access is off ' +
  '(Settings > Plugins > Console > Command line access).'

/** The connection info, or an Error saying why there is none. */
export function readInfo(file = infoFilePath()) {
  let info
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return new Error(NOT_RUNNING)
  }
  if (!Array.isArray(info.endpoints) || !info.endpoints.includes('console')) return new Error(NOT_RUNNING)
  return info
}

/**
 * POST `body` to `route` and return the parsed answer.
 *
 * The info file is read per request: the app may have moved to another port
 * or made a new token since the last one.
 */
export async function post(route, body, signal) {
  const info = readInfo()
  if (info instanceof Error) throw info
  let res
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(NOT_RUNNING)
  }
  const answer = await res.json().catch(() => ({}))
  if (res.status === 404) throw new Error(NOT_RUNNING)
  if (!res.ok) throw new Error(answer.error || `The app answered ${res.status}.`)
  return answer
}

// --- Output ---

const colour = (code, text, tty) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text)

/** Print transcript entries: output to stdout, warnings and errors to stderr. */
function printEntries(entries, echo) {
  for (const e of entries) {
    if (e.kind === 'echo') {
      if (echo) process.stdout.write(`${e.text}\n`)
    } else if (e.kind === 'error') {
      process.stderr.write(`${colour('31', e.text, process.stderr.isTTY)}\n`)
    } else if (e.kind === 'warning') {
      process.stderr.write(`${colour('33', e.text, process.stderr.isTTY)}\n`)
    } else {
      process.stdout.write(`${e.text}\n`)
    }
  }
}

// --- Running ---

/** Session state: what the next request carries. */
const session = { dialect: 'native', cwd: process.cwd(), echo: false }

/** Run `text` as one submission; resolves to whether it all ran. */
async function run(text, signal) {
  const res = await post('/console/run', { dialect: session.dialect, text, cwd: session.cwd }, signal)
  printEntries(res.entries, session.echo)
  if (typeof res.cwd === 'string') session.cwd = res.cwd
  return !res.aborted
}

/** Non-interactive: one submission, exit status 1 when any of it failed. */
async function runOnce(text) {
  const ac = new AbortController()
  process.on('SIGINT', () => ac.abort())
  try {
    return (await run(text, ac.signal)) ? 0 : 1
  } catch (e) {
    if (ac.signal.aborted) return 130
    process.stderr.write(`${e.message}\n`)
    return 1
  }
}

function loadHistory() {
  try {
    return fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter((l) => l !== '').reverse().slice(0, HISTORY_SIZE)
  } catch {
    return []
  }
}

function appendHistory(line) {
  try {
    fs.appendFileSync(HISTORY_FILE, `${line}\n`, { mode: 0o600 })
  } catch {
    // History is a convenience; a read-only home must not stop the session.
  }
}

/** Interactive: a prompt until exit / Ctrl-D. */
function interactive() {
  const info = readInfo()
  if (info instanceof Error) {
    process.stderr.write(`${info.message}\n`)
    return Promise.resolve(1)
  }

  /** The request in flight, for Ctrl-C. */
  let inflight = null

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
    completer: (line, callback) => {
      post('/console/complete', { dialect: session.dialect, line, cwd: session.cwd })
        .then((res) => {
          callback(null, [[], line])
          // The answer rewrites the whole line, which readline's own
          // completion (append a suffix) cannot express.
          setImmediate(() => {
            if (res.messages?.length) {
              process.stdout.write('\n')
              printEntries(res.messages, true)
            }
            if (res.replacement !== null && res.replacement !== undefined && res.replacement !== line) {
              rl.write(null, { ctrl: true, name: 'e' })
              rl.write(null, { ctrl: true, name: 'u' })
              rl.write(res.replacement)
            } else if (res.messages?.length) {
              rl.prompt(true)
            }
          })
        })
        .catch(() => callback(null, [[], line]))
    },
  })
  const prompt = () => {
    rl.setPrompt(`${PROMPTS[session.dialect]} `)
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

  rl.on('line', async (raw) => {
    const line = raw.trim()
    if (inflight) {
      process.stderr.write('A command is still running; press Ctrl-C to stop it.\n')
      return
    }
    if (line === '') return prompt()
    appendHistory(line)
    if (line === 'exit') return rl.close()
    if (line === 'native' || line === 'pymol') {
      session.dialect = line
      return prompt()
    }
    inflight = new AbortController()
    try {
      await run(line, inflight.signal)
    } catch (e) {
      if (inflight.signal.aborted) process.stderr.write(`${colour('33', 'Interrupted.', process.stderr.isTTY)}\n`)
      else process.stderr.write(`${colour('31', e.message, process.stderr.isTTY)}\n`)
    } finally {
      inflight = null
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
export function parseArgv(argv) {
  const opts = { dialect: 'native', echo: false, command: null, script: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') opts.help = true
    else if (a === '--echo') opts.echo = true
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

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

async function main(argv) {
  const opts = parseArgv(argv)
  if (opts instanceof Error) {
    process.stderr.write(`cuemol-console: ${opts.message}\n${USAGE}\n`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  session.dialect = opts.dialect
  session.echo = opts.echo

  if (opts.command !== null) return runOnce(opts.command)
  if (opts.script !== null && opts.script !== '-') {
    let text
    try {
      text = fs.readFileSync(opts.script, 'utf8')
    } catch {
      process.stderr.write(`cuemol-console: cannot read ${opts.script}\n`)
      return 1
    }
    return runOnce(text)
  }
  if (!process.stdin.isTTY || opts.script === '-') return runOnce(await readStdin())
  return interactive()
}

// Run only when executed, so a test can import the helpers above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
