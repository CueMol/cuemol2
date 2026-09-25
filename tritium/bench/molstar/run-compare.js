#!/usr/bin/env node
/**
 * Runner for the CueMol3 / Mol* MD playback comparison.
 *
 * One Electron process per cell for both tools, as tritium/bench/run.js does
 * for CueMol alone. Both tools run on the same Electron binary (the one
 * tritium/react-gui installed) with the device scale factor pinned to 1, so
 * the canvas is sized in whole device pixels and both draw 1832x1010 -- the
 * size the M2 runs drew. Every repetition shuffles the order of tools and
 * cells (seeded; the seed is logged).
 *
 * Usage:
 *   node run-compare.js [--repeat=3] [--seed=N] [--only=a,b] [--tools=cuemol,molstar]
 *   node run-compare.js --snapshots        # frame 0 of each dataset, both tools (PNG)
 *   node run-compare.js --profile          # Mol* CPU profiles (yiip, a4nosol)
 */

'use strict'

const { spawnSync, execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HERE = __dirname
const BENCH = path.resolve(HERE, '..')
const APP_DIR = path.resolve(BENCH, '../react-gui')
const SPEC_DIR = path.join(BENCH, 'specs-compare')
const CELL_FILE = path.join(os.tmpdir(), `molstar-compare-cell-${process.pid}.json`)

/** --canvas per tool, device pixels, at DPR 1, so both draw 1832x1010. */
const CANVAS = { cuemol: '1876x1045', molstar: '1834x1012' }
const DPR_SWITCH = '--force-device-scale-factor=1'
const SETTLE_MS = 2000
const LARGE_SETTLE_MS = 30000
/** A cell whose file is at least this big gets the long settle before and after. */
const LARGE_BYTES = 500e6
const CELL_TIMEOUT_MS = 12 * 60 * 1000

function argValue(name) {
  const prefix = `--${name}=`
  const a = process.argv.find((x) => x.startsWith(prefix))
  return a ? a.slice(prefix.length) : null
}
const has = (flag) => process.argv.includes(`--${flag}`)

function electronBin() {
  const pkg = path.join(APP_DIR, 'node_modules', 'electron')
  return path.join(pkg, 'dist', fs.readFileSync(path.join(pkg, 'path.txt'), 'utf8').trim())
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** mulberry32: small, seedable, good enough to shuffle a run order. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(list, rand) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function loadSpecs() {
  const only = argValue('only')?.split(',')
  return fs.readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(SPEC_DIR, f)
      const spec = JSON.parse(fs.readFileSync(file, 'utf8'))
      const files = [spec.file, ...(spec.trajectory?.files ?? [])].map((p) => path.resolve(SPEC_DIR, p))
      return { stem: path.basename(f, '.json'), file, spec, files }
    })
    .filter((s) => !only || only.includes(s.stem))
}

function sha256(file) {
  const h = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(16 << 20)
  let n
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n))
  fs.closeSync(fd)
  return h.digest('hex')
}

/** Swap in use, MB: the page file on Windows, `vm.swapusage` on macOS. */
function pagefileMB() {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' })
      const m = /used\s*=\s*([\d.]+)M/.exec(out)
      return m ? Number(m[1]) : null
    }
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      '(Get-CimInstance Win32_PageFileUsage | Measure-Object CurrentUsage -Sum).Sum'], { encoding: 'utf8' })
    return Number(out.trim())
  } catch {
    return null
  }
}

/** Launch one cell; returns the parsed result (or a failure record). */
function runCell(tool, specFile, extra = []) {
  fs.rmSync(CELL_FILE, { force: true })
  const common = [DPR_SWITCH, `--bench=${specFile}`, `--bench-out=${CELL_FILE}`, `--canvas=${CANVAS[tool]}`, ...extra]
  const opts = { stdio: 'inherit', timeout: CELL_TIMEOUT_MS }
  const t0 = Date.now()
  let res
  if (tool === 'cuemol') {
    res = spawnSync(electronBin(), ['.', ...common], {
      ...opts,
      cwd: APP_DIR,
      env: {
        ...process.env,
        CUEMOL_FRESH_PREFS: '1',
        LIBCUEMOL2_ROOT: process.env.LIBCUEMOL2_ROOT || path.resolve(BENCH, '../../.build_out/cuemol2'),
        BUNDLE_APPS: process.env.BUNDLE_APPS || (process.platform === 'win32'
          ? 'C:\\tmp\\proj64_deplibs'
          : path.join(os.homedir(), 'tmp/proj64_deplibs')),
      },
    })
  } else {
    res = spawnSync(electronBin(), [HERE, ...common], { ...opts, cwd: HERE })
  }
  const wallMs = Date.now() - t0
  if (!fs.existsSync(CELL_FILE)) {
    return { ok: false, error: res.error ? String(res.error) : `no result (status ${res.status}, signal ${res.signal})`, wallMs }
  }
  try {
    const r = JSON.parse(fs.readFileSync(CELL_FILE, 'utf8'))
    r.wallMs = wallMs
    r.exitStatus = res.status
    return r
  } catch (e) {
    return { ok: false, error: `unparsable result: ${e.message}`, wallMs }
  }
}

const n3 = (v) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(3)) : '')
const q = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)

const COLUMNS = [
  'tool', 'spec', 'rep', 'order', 'ok', 'error', 'canvas_w', 'canvas_h', 'dpr', 'atoms', 'traj_frames',
  'traj_lazy', 'render_fps', 'update_fps', 'frame_ms_mean', 'frame_ms_p95', 'first_draw_ms', 'load_ms',
  'ws_peak_mb', 'ws_loaded_mb', 'ws_measure_peak_mb', 'private_peak_mb',
  'ws_peak_renderer_mb', 'ws_peak_gpu_mb', 'ws_peak_browser_mb',
  'upload_bytes_per_frame', 'upload_bytes_per_update', 'wall_ms', 'pagefile_before_mb', 'pagefile_after_mb',
  'gpu',
]

function uploadPerFrame(r) {
  const g = r.glPerFrame || {}
  return (g.bufferDataBytes || 0) + (g.bufferSubDataBytes || 0) + (g.texImageBytes || 0) + (g.texSubImageBytes || 0)
}

function toRow(c) {
  const r = c.result
  const a = r.appMetrics || {}
  const bt = (p, k) => (p && p.byType && p.byType[k] ? p.byType[k].workingSetMB : '')
  const upf = r.ok ? uploadPerFrame(r) : ''
  const updates = r.ok ? (r.updateFps || 0) * ((r.frames || 0) / (r.renderFps || 1)) : 0
  return [
    c.tool, c.stem, c.rep, c.order, r.ok ? 1 : 0, q(r.error),
    r.canvas?.width ?? '', r.canvas?.height ?? '', r.canvas?.dpr ?? '', r.atomCount ?? '',
    r.trajectory?.frames ?? '', r.trajectory?.lazy ?? '',
    n3(r.renderFps), n3(r.updateFps), n3(r.frameMs?.mean), n3(r.frameMs?.p95), n3(r.firstDrawMs), n3(r.loadMs),
    n3(a.peak?.totalWorkingSetMB), n3(a.loaded?.totalWorkingSetMB), n3(a.measurePeak?.totalWorkingSetMB),
    n3(a.peak?.totalPrivateMB),
    n3(bt(a.peak, 'Tab')), n3(bt(a.peak, 'GPU')), n3(bt(a.peak, 'Browser')),
    n3(upf), updates > 0 ? n3((upf * (r.frames || 0)) / updates) : '',
    c.result.wallMs ?? '', n3(c.pagefileBefore), n3(c.pagefileAfter),
    q(r.machine?.unmaskedRenderer),
  ].join(',')
}

function outDir() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const host = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform
  const dir = path.join(BENCH, 'results', `molstar-compare-${host}-${date}`)
  fs.mkdirSync(path.join(dir, 'cells'), { recursive: true })
  return dir
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: BENCH, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** Frame 0 of each dataset, idle, both tools, as PNG. */
function snapshots(specs, dir) {
  const snapDir = path.join(dir, 'snapshots')
  fs.mkdirSync(snapDir, { recursive: true })
  for (const s of specs.filter((x) => x.stem.endsWith('-md') && x.spec.tools.length === 2)) {
    const tmp = path.join(os.tmpdir(), `snap-${s.stem}.json`)
    const spec = { ...s.spec, scenario: 'idle', warmupMs: 1500, measureMs: 500 }
    spec.file = path.resolve(SPEC_DIR, s.spec.file)
    spec.trajectory = { ...spec.trajectory, files: spec.trajectory.files.map((p) => path.resolve(SPEC_DIR, p)) }
    fs.writeFileSync(tmp, JSON.stringify(spec))
    for (const tool of ['cuemol', 'molstar']) {
      const png = path.join(snapDir, `${s.stem.replace(/-md$/, '')}-${tool}.png`)
      const r = runCell(tool, tmp, [`--bench-snapshot=${png}`])
      console.log(`[compare] snapshot ${tool} ${s.stem}: ${r.ok ? 'ok' : r.error} atoms=${r.atomCount ?? '?'}`)
      fs.writeFileSync(path.join(snapDir, `${s.stem.replace(/-md$/, '')}-${tool}.json`), JSON.stringify(r, null, 1))
      sleep(SETTLE_MS)
    }
    fs.rmSync(tmp, { force: true })
  }
}

function profiles(specs, dir) {
  const profDir = path.join(dir, 'profiles')
  fs.mkdirSync(profDir, { recursive: true })
  for (const s of specs.filter((x) => x.stem === 'yiip-md' || x.stem === 'a4nosol-md')) {
    const out = path.join(profDir, `${s.stem}-molstar.cpuprofile`)
    const r = runCell('molstar', s.file, [`--bench-profile=${out}`])
    fs.writeFileSync(path.join(profDir, `${s.stem}-molstar.json`), JSON.stringify(r, null, 1))
    console.log(`[compare] profile ${s.stem}: ${r.ok ? 'ok' : r.error}`)
    sleep(SETTLE_MS)
  }
}

function main() {
  const specs = loadSpecs()
  const dir = outDir()
  if (has('snapshots')) return snapshots(specs, dir)
  if (has('profile')) return profiles(specs, dir)

  const repeat = Number(argValue('repeat')) || 3
  const seed = Number(argValue('seed')) || Date.now() % 2147483647
  const tools = argValue('tools')?.split(',') ?? ['cuemol', 'molstar']
  const rand = rng(seed)

  // Every file a cell reads, hashed once: both tools read these same paths.
  const hashes = {}
  for (const s of specs) {
    for (const f of s.files) {
      if (!hashes[f]) hashes[f] = { sha256: sha256(f), bytes: fs.statSync(f).size }
    }
  }

  const cells = []
  for (const s of specs) for (const tool of s.spec.tools) if (tools.includes(tool)) cells.push({ tool, s })
  const log = {
    started: new Date().toISOString(), seed, repeat, gitSha: gitSha(), electron: electronBin(),
    canvas: CANVAS, dprSwitch: DPR_SWITCH, files: hashes, order: [],
  }
  const logPath = path.join(dir, `run-log-${Date.now()}.json`)
  const done = []
  // A Mol* cell that fails stops longer trajectories of the same data set.
  const failedAt = {}
  // Data set = the stem's first word; frames = the "-<n>f" in the stem, or the
  // whole file's length for the main cell of the set.
  const FULL_FRAMES = { ifabp: 500, yiip: 901, mcv448: 300, a4nosol: 100, a4all: 100 }
  const dataset = (stem) => stem.split('-')[0]
  const framesOf = (s) => {
    const m = /-(\d+)f-/.exec(s.stem)
    return m ? Number(m[1]) : FULL_FRAMES[dataset(s.stem)] ?? Infinity
  }

  let order = 0
  for (let rep = 0; rep < repeat; rep++) {
    for (const c of shuffle(cells, rand)) {
      order++
      const ds = dataset(c.s.stem)
      const key = `${c.tool}:${ds}`
      if (c.tool === 'molstar' && failedAt[key] !== undefined && framesOf(c.s) >= failedAt[key]) {
        const rec = { tool: c.tool, stem: c.s.stem, rep, order, result: { ok: false, error: `skipped: failed at ${failedAt[key]} frames` } }
        done.push(rec)
        log.order.push({ order, tool: c.tool, spec: c.s.stem, rep, skipped: true })
        continue
      }
      const large = c.s.files.some((f) => hashes[f].bytes >= LARGE_BYTES)
      if (large) sleep(LARGE_SETTLE_MS)
      const pagefileBefore = pagefileMB()
      console.log(`[compare] (${order}/${cells.length * repeat}) rep=${rep} ${c.tool} ${c.s.stem}`)
      const result = runCell(c.tool, c.s.file)
      const pagefileAfter = pagefileMB()
      const rec = { tool: c.tool, stem: c.s.stem, rep, order, pagefileBefore, pagefileAfter, result }
      done.push(rec)
      log.order.push({ order, tool: c.tool, spec: c.s.stem, rep, ok: !!result.ok })
      const name = `${String(order).padStart(3, '0')}-${c.tool}-${c.s.stem}-r${rep}.json`
      fs.writeFileSync(path.join(dir, 'cells', name), JSON.stringify(rec))
      if (!result.ok) {
        console.warn(`[compare]   failed: ${result.error}`)
        if (c.tool === 'molstar' && isFinite(framesOf(c.s))) {
          failedAt[key] = Math.min(failedAt[key] ?? Infinity, framesOf(c.s))
        }
      } else {
        console.log(`[compare]   render=${result.renderFps.toFixed(1)} update=${result.updateFps.toFixed(1)} ` +
          `firstDraw=${(result.firstDrawMs ?? 0).toFixed(0)}ms peakWS=${(result.appMetrics?.peak?.totalWorkingSetMB ?? 0).toFixed(0)}MB`)
      }
      fs.writeFileSync(logPath, JSON.stringify(log, null, 1))
      sleep(large ? LARGE_SETTLE_MS : SETTLE_MS)
    }
  }
  log.finished = new Date().toISOString()
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1))
  const csv = path.join(dir, `compare-${Date.now()}.csv`)
  fs.writeFileSync(csv, [COLUMNS.join(','), ...done.map(toRow)].join('\n') + '\n')
  console.log(`[compare] wrote ${csv}`)
  fs.rmSync(CELL_FILE, { force: true })
}

main()
