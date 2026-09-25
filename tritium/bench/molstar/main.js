/**
 * Mol* side of the CueMol3 / Mol* comparison: one measured cell per process.
 *
 * Takes the same arguments as CueMol's `--bench` mode and ends the same way:
 *   electron . --bench=<spec.json> --bench-out=<result.json> --canvas=WxH
 *              [--bench-snapshot=<png>] [--bench-profile=<cpuprofile>]
 *
 * Mol* runs as its prebuilt viewer bundle (node_modules/molstar/build/viewer)
 * in a plain page. Files reach it through the `bench://` scheme, so it reads
 * them as URLs, as a user of the viewer would, with no network in between.
 * The page prints its result behind a console marker; main adds the process
 * memory it sampled (`appmetrics.js`, the same logic as CueMol's) and exits.
 *
 * Chromium switches: the same as CueMol's main sets (only
 * `disable-renderer-backgrounding`; CueMol sets nothing GPU- or ANGLE-related).
 */

'use strict'

const { app, BrowserWindow, Menu, protocol, net, screen } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { startAppMetrics, stopAppMetrics, summarizeAppMetrics } = require('./appmetrics')

const RESULT_MARKER = '[BENCH_RESULT]'
const PHASE_MARKER = '[BENCH_PHASE]'
const HERE = __dirname
const BENCH_DIR = path.resolve(HERE, '..')
const PROFILE_MS = 5000
const TIMEOUT_MS = 10 * 60 * 1000

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

const specPath = argValue('bench')
if (!specPath) {
  console.error('usage: electron . --bench=<spec.json> --bench-out=<result.json> [--canvas=WxH]')
  process.exit(2)
}
const outPath = path.resolve(argValue('bench-out') || 'bench-result.json')
const snapshotPath = argValue('bench-snapshot')
const profilePath = argValue('bench-profile')
const canvasArg = /^(\d+)x(\d+)$/.exec(argValue('canvas') || '')

// Same switch CueMol's main sets for every run.
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// A throwaway profile, as CUEMOL_FRESH_PREFS gives CueMol.
const userData = path.join(os.tmpdir(), 'cuemol-bench-molstar-userdata')
fs.rmSync(userData, { recursive: true, force: true })
app.setPath('userData', userData)

protocol.registerSchemesAsPrivileged([
  { scheme: 'bench', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

/** Files handed to the page through bench://, for the result. */
const served = []

/**
 * bench://app/<file>   -> this directory (the page, and node_modules for Mol*)
 * bench://data/<file>  -> tritium/bench/data
 */
function resolveBenchUrl(url) {
  const u = new URL(url)
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  const root = u.host === 'data' ? path.join(BENCH_DIR, 'data') : HERE
  const abs = path.resolve(root, rel)
  if (!abs.startsWith(root)) throw new Error(`outside the served root: ${url}`)
  return abs
}

function loadSpec() {
  const abs = path.resolve(specPath)
  const spec = JSON.parse(fs.readFileSync(abs, 'utf8'))
  const dataRoot = path.join(BENCH_DIR, 'data')
  // Spec paths are relative to the spec file, as in CueMol; hand the page
  // bench://data URLs for them.
  const toUrl = (p) => {
    const file = path.resolve(path.dirname(abs), p)
    const rel = path.relative(dataRoot, file).split(path.sep).join('/')
    if (rel.startsWith('..')) throw new Error(`${p} is not under tritium/bench/data`)
    return `bench://data/${rel}`
  }
  return {
    spec,
    specPath: abs,
    topologyUrl: toUrl(spec.file),
    trajectoryUrls: (spec.trajectory?.files ?? []).map(toUrl),
  }
}

app.whenReady().then(() => {
  protocol.handle('bench', (req) => {
    const file = resolveBenchUrl(req.url)
    if (new URL(req.url).host === 'data') {
      served.push({ url: req.url, path: file, bytes: fs.statSync(file).size })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  const cell = loadSpec()
  // No menu bar: the window's content is then the view, so the canvas size in
  // device pixels is what --canvas asks for.
  Menu.setApplicationMenu(null)
  const scale = screen.getPrimaryDisplay().scaleFactor || 1
  const size = canvasArg
    ? { width: Math.round(Number(canvasArg[1]) / scale), height: Math.round(Number(canvasArg[2]) / scale) }
    : { width: 1280, height: 720 }

  const win = new BrowserWindow({
    ...size,
    useContentSize: true,
    show: true,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  })
  startAppMetrics()
  const startedAt = Date.now()
  let done = false

  const finish = async (payload, failed) => {
    if (done) return
    done = true
    stopAppMetrics()
    let result
    try {
      result = JSON.parse(payload)
    } catch (e) {
      result = { ok: false, error: `unparsable result: ${e.message}` }
    }
    result.appMetrics = summarizeAppMetrics(result.phases)
    result.served = served
    try {
      if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3')
      result.jsHeap = await win.webContents.debugger.sendCommand('Runtime.getHeapUsage')
    } catch (e) {
      result.jsHeap = null
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(result))
    console.log(`[Bench] wrote ${outPath}`)
    if (snapshotPath && !failed) {
      try {
        const img = await win.webContents.capturePage()
        fs.mkdirSync(path.dirname(path.resolve(snapshotPath)), { recursive: true })
        fs.writeFileSync(path.resolve(snapshotPath), img.toPNG())
        console.log(`[Bench] wrote ${snapshotPath}`)
      } catch (e) {
        console.error('[Bench] could not save the snapshot:', e)
      }
    }
    app.exit(failed ? 1 : 0)
  }

  win.webContents.on('console-message', (event) => {
    const message = event.message ?? ''
    console.log(`[renderer] ${message.slice(0, 400)}`)
    const at = message.indexOf(RESULT_MARKER)
    if (at >= 0) {
      void finish(message.slice(at + RESULT_MARKER.length).trim(), false)
      return
    }
    if (profilePath && message.includes(`${PHASE_MARKER} measure-start`)) {
      void (async () => {
        try {
          const dbg = win.webContents.debugger
          if (!dbg.isAttached()) dbg.attach('1.3')
          await dbg.sendCommand('Profiler.enable')
          await dbg.sendCommand('Profiler.start')
          await new Promise((r) => setTimeout(r, PROFILE_MS))
          const { profile } = await dbg.sendCommand('Profiler.stop')
          fs.writeFileSync(path.resolve(profilePath), JSON.stringify(profile))
          console.log(`[Bench] wrote ${profilePath}`)
        } catch (e) {
          console.error('[Bench] profiling failed:', e)
        }
      })()
    }
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[Bench] renderer gone: ${details.reason} (exit ${details.exitCode})`)
    void finish(JSON.stringify({
      ok: false,
      error: `render-process-gone: ${details.reason}`,
      exitCode: details.exitCode,
      elapsedMs: Date.now() - startedAt,
    }), true)
  })

  setTimeout(() => {
    if (done) return
    console.error(`[Bench] no result after ${TIMEOUT_MS} ms; giving up`)
    void finish(JSON.stringify({ ok: false, error: 'timeout', elapsedMs: Date.now() - startedAt }), true)
  }, TIMEOUT_MS)

  const query = new URLSearchParams({ cell: JSON.stringify(cell) })
  win.loadURL(`bench://app/index.html?${query}`)
})

app.on('window-all-closed', () => app.quit())
