#!/usr/bin/env node
/**
 * Run the ring x staging ablation (docs/plans/ablation-bench-instructions.md,
 * sections 3 and 4) over the four worktrees setup-worktrees.sh built.
 *
 * The outer loop is the repetition and the inner one the conditions in a
 * seeded shuffle, so that drift over time does not land on one condition.
 * Each condition runs its own worktree's run.js, one process per cell.
 *
 * Usage:
 *   node run-ablation.js --work=/path/to/abl --out=/path/to/results/ablation-m2-DATE
 *   node run-ablation.js --work=... --out=... --overhead     # section 3 check only
 *   node run-ablation.js ... --reps=3 --only=3j3q-cpk-coord-morph   # extra reps
 */

'use strict'

const { spawnSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function arg(name, def) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return def
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true
}

const WORK = path.resolve(arg('work', path.join(__dirname, '../../../../abl')))
const OUT = path.resolve(arg('out', ''))
const REPS = Number(arg('reps', 3))
// Conditions to run; --conds=D,F picks a subset or an extra condition such as
// F (PBO upload), which lives in its own worktree next to A-D.
const CONDS = String(arg('conds', 'A,B,C,D')).split(',')

const SPECS = arg('only', '') ? String(arg('only')).split(',') : [
  '1crn-cpk-coord-morph', '4hhb-cpk-coord-morph', '1aon-cpk-coord-morph',
  '4v6x-cpk-coord-morph', '3j3q-cpk-coord-morph',
  '1crn-cpk-static-orbit', '4hhb-cpk-static-orbit', '1aon-cpk-static-orbit',
  '4v6x-cpk-static-orbit', '3j3q-cpk-static-orbit',
  '4v6x-cpk-idle',
]

if (!OUT || OUT === path.resolve('')) {
  console.error('--out=<results dir> is required')
  process.exit(2)
}

/** mulberry32: a small seeded PRNG, so the shuffle is reproducible. */
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

function shuffle(xs, seed) {
  // Small consecutive seeds give mulberry32 near-identical first draws (the
  // first run got B D A C for both seeds 2 and 3), so spread the seed first.
  const r = rng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35)
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; --i) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()
  } catch (e) {
    return `(${cmd} failed: ${e.message.split('\n')[0]})`
  }
}

const patchSha = fs.readFileSync(path.join(WORK, 'harness-overlay.sha256'), 'utf8').split(/\s+/)[0]
const condInfo = Object.fromEntries(CONDS.map((c) => {
  const dir = path.join(WORK, c)
  return [c, {
    dir,
    head: sh('git', ['-C', dir, 'rev-parse', 'HEAD']),
    subject: sh('git', ['-C', dir, 'log', '-1', '--format=%s']),
    addon: path.join(dir, 'tritium/core/build/Release/cuemol_internal.node'),
  }]
}))

fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true })
const logPath = path.join(OUT, 'run-log.json')
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {
  started: new Date().toISOString(),
  patchSha256: patchSha,
  conditions: condInfo,
  machine: {
    cpu: sh('sysctl', ['-n', 'machdep.cpu.brand_string']),
    memBytes: sh('sysctl', ['-n', 'hw.memsize']),
    os: sh('sw_vers', ['-productVersion']),
    power: sh('pmset', ['-g', 'batt']).split('\n')[0],
    lowPowerMode: sh('pmset', ['-g']).split('\n').filter((l) => /lowpowermode/i.test(l)).join(' ').trim(),
  },
  runs: [],
}

function runCond(cond, rep, specs, extraEnv = {}, tag = '') {
  const info = condInfo[cond]
  const label = `${cond}-r${rep}${tag}`
  const thermBefore = sh('pmset', ['-g', 'therm'])
  const t0 = Date.now()
  console.log(`[ablation] ${label}: ${specs.length} spec(s) in ${info.dir}`)
  const res = spawnSync(process.execPath, [
    'run.js', `--specs=${specs.join(',')}`, '--repeat=1',
    `--label=${label}`, `--out-dir=${path.join(OUT, 'raw')}`,
  ], {
    cwd: path.join(info.dir, 'tritium/bench'),
    env: {
      ...process.env,
      CUEMOL_BENCH_GIT_SHA: info.head,
      CUEMOL_BENCH_PATCH_SHA256: patchSha,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  const runnerLines = (res.stdout + res.stderr).split('\n').filter((l) => /^\[runner\]/.test(l))
  for (const l of runnerLines) console.log(`  ${l}`)
  log.runs.push({
    label, cond, rep, tag, specs, env: extraEnv,
    status: res.status, seconds: (Date.now() - t0) / 1000,
    thermBefore, thermAfter: sh('pmset', ['-g', 'therm']),
    runner: runnerLines,
  })
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2))
}

if (arg('overhead', false)) {
  // Section 3: timers on vs off, interleaved so drift hits both alike.
  for (let rep = 1; rep <= 3; ++rep) {
    runCond('D', rep, ['4v6x-cpk-coord-morph'], {}, '-timers-on')
    runCond('D', rep, ['4v6x-cpk-coord-morph'], { CUEMOL_BENCH_TIMERS: '0' }, '-timers-off')
  }
} else {
  for (let rep = 1; rep <= REPS; ++rep) {
    const order = shuffle(CONDS, rep)
    console.log(`[ablation] rep ${rep}: ${order.join(' ')}`)
    for (const cond of order) runCond(cond, rep, SPECS)
  }
}
log.finished = new Date().toISOString()
fs.writeFileSync(logPath, JSON.stringify(log, null, 2))
console.log(`[ablation] log: ${logPath}`)
