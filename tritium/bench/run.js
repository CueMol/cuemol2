#!/usr/bin/env node
/**
 * Benchmark runner: one Electron process per measured cell.
 *
 * Switching scene, renderer or canvas size inside a live process leaves the
 * previous cell's allocations, heap fragmentation and driver state behind, and
 * the next cell measures those as much as itself. Measured in the WebGPU PoC
 * this work grew out of: the same image cell reported 11 ms of native frame
 * time on its own and 71 ms when it followed a 10M-triangle sweep in the same
 * process.
 *
 * Usage:
 *   node run.js                                    # every spec in specs/
 *   node run.js --specs=1crn-cpk-orbit             # one, by file stem
 *   node run.js --canvases=1920x1080,2880x1800
 *   node run.js --repeat=3
 */

'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = __dirname
const APP_DIR = path.resolve(ROOT, '../react-gui')
const SPEC_DIR = path.join(ROOT, 'specs')
const RESULTS_DIR = path.join(ROOT, 'results')
const CELL_FILE = path.join(os.tmpdir(), `cuemol-bench-cell-${process.pid}.json`)

const DEFAULT_CANVAS = '1920x1080'
/** Between cells, so one cell's teardown is not inside the next one's warm-up. */
const SETTLE_MS = 2000

function argValue(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}
function argList(name) {
  const v = argValue(name)
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null
}

const filters = {
  specs: argList('specs'),
  canvases: argList('canvases') || [DEFAULT_CANVAS],
  repeat: Number(argValue('repeat')) || 1,
}

function buildPlan() {
  const specs = fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .filter((stem) => !filters.specs || filters.specs.includes(stem))

  const plan = []
  for (const stem of specs) {
    for (const canvas of filters.canvases) {
      for (let rep = 0; rep < filters.repeat; rep++) {
        plan.push({ stem, canvas, rep })
      }
    }
  }
  return plan
}

/** The electron executable this app's node_modules installed. */
function electronBin() {
  // The package writes the path to its binary here, relative to its own
  // directory, on every platform.
  const pkgDir = path.join(APP_DIR, 'node_modules', 'electron')
  try {
    const rel = fs.readFileSync(path.join(pkgDir, 'path.txt'), 'utf8').trim()
    const bin = path.join(pkgDir, 'dist', rel)
    if (fs.existsSync(bin)) return bin
  } catch { /* fall through to the launcher below */ }
  // pnpm may hoist it elsewhere; the CLI shim works when it does.
  return path.join(APP_DIR, 'node_modules', '.bin',
                   process.platform === 'win32' ? 'electron.cmd' : 'electron')
}

function runCell(cell) {
  fs.rmSync(CELL_FILE, { force: true })
  const args = [
    '.',
    `--bench=${path.join(SPEC_DIR, cell.stem + '.json')}`,
    `--bench-out=${CELL_FILE}`,
    `--canvas=${cell.canvas}`,
  ]
  const env = {
    ...process.env,
    // A throwaway profile, so no persisted preference from a previous run
    // leaks into a measurement.
    CUEMOL_FRESH_PREFS: '1',
    // Same two the `run_tritium` task sets; a bench launch bypasses it.
    LIBCUEMOL2_ROOT:
      process.env.LIBCUEMOL2_ROOT || path.resolve(ROOT, '../../.build_out/cuemol2'),
    BUNDLE_APPS:
      process.env.BUNDLE_APPS || path.join(os.homedir(), 'tmp/proj64_deplibs'),
  }
  // Run the local electron binary rather than going through npx: on Windows
  // npx is a .cmd, which spawnSync will not find without a shell, and putting
  // a shell in the way would make the command line quoting depend on which
  // shell answered.
  const res = spawnSync(electronBin(), args, {
    cwd: APP_DIR,
    env,
    stdio: 'inherit',
  })
  if (res.status !== 0) console.warn(`[runner] cell exited with status ${res.status}`)
  if (!fs.existsSync(CELL_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(CELL_FILE, 'utf8'))
  } catch (e) {
    console.warn('[runner] could not parse the cell result:', e.message)
    return null
  }
}

const CSV_COLUMNS = [
  'timestamp', 'spec', 'rep', 'canvas_w', 'canvas_h', 'dpr',
  'scenario', 'renderer', 'atoms',
  'render_fps', 'update_fps', 'frames', 'drawn_frames',
  'frame_ms_mean', 'frame_ms_p50', 'frame_ms_p95', 'frame_ms_p99',
  'cpu_ms_mean', 'gpu_ms_mean', 'load_ms',
  'gl_total', 'gl_draw', 'gl_use_program', 'gl_buffer_sub_data',
  'gl_buffer_sub_data_bytes', 'gl_get_uniform_location',
  'rss_mb',
  // Which machine produced the row. Two rows are only comparable if these
  // agree, and more than usual here: how a driver treats a write into a
  // texture the GPU is reading is what the coordinate-texture ring is built
  // around, and ANGLE's Metal, D3D11 and Vulkan backends differ on it.
  'gpu', 'gl_version', 'platform',
]

function toRow(cell, r) {
  const gl = r.glPerFrame || {}
  const n = (v) => (typeof v === 'number' ? Number(v.toFixed(3)) : '')
  // GPU strings carry commas ("ANGLE (Apple, Apple M2, ...)"), so they are
  // quoted rather than left to break the column count.
  const csv = (v) => (typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : '')
  return [
    r.timestamp, cell.stem, cell.rep,
    r.canvas?.width ?? '', r.canvas?.height ?? '', r.canvas?.dpr ?? '',
    r.spec?.scenario ?? '', r.spec?.renderer ?? '', r.atomCount ?? '',
    n(r.renderFps), n(r.updateFps), r.frames, r.drawnFrames,
    n(r.frameMs?.mean), n(r.frameMs?.p50), n(r.frameMs?.p95), n(r.frameMs?.p99),
    n(r.cpuMs?.mean), r.gpuMs ? n(r.gpuMs.mean) : '', n(r.loadMs),
    n(gl.total), n(gl.draw), n(gl.useProgram), n(gl.bufferSubData),
    n(gl.bufferSubDataBytes), n(gl.getUniformLocation),
    n(r.memory?.rssMB),
    csv(r.machine?.unmaskedRenderer || r.machine?.renderer),
    csv(r.machine?.version),
    csv(r.machine?.platform),
  ].join(',')
}

function main() {
  const plan = buildPlan()
  if (plan.length === 0) {
    console.error('[runner] no spec matched the filters')
    process.exit(1)
  }
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  console.log(`[runner] ${plan.length} cell(s), one process each`)

  const cells = []
  const rows = []
  plan.forEach((cell, i) => {
    console.log(`[runner] (${i + 1}/${plan.length}) ${cell.stem} @${cell.canvas} rep=${cell.rep}`)
    const r = runCell(cell)
    if (!r || !r.ok) {
      console.warn(`[runner]   failed: ${r ? r.error : 'no result file'}`)
    } else {
      cells.push({ cell, result: r })
      rows.push(toRow(cell, r))
      console.log(
        `[runner]   render=${r.renderFps.toFixed(1)}fps update=${r.updateFps.toFixed(1)}fps ` +
          `frame=${r.frameMs.mean.toFixed(2)}ms load=${r.loadMs.toFixed(0)}ms`,
      )
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SETTLE_MS)
  })

  if (cells.length === 0) {
    console.error('[runner] every cell failed')
    process.exit(1)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const csvPath = path.join(RESULTS_DIR, `bench-${stamp}.csv`)
  const jsonPath = path.join(RESULTS_DIR, `bench-${stamp}.json`)
  fs.writeFileSync(csvPath, [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n')
  fs.writeFileSync(jsonPath, JSON.stringify({ cells }, null, 2))
  console.log(`[runner] wrote ${csvPath}`)
  fs.rmSync(CELL_FILE, { force: true })
}

main()
