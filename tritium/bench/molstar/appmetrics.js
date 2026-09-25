/**
 * Process memory of a bench run, sampled from main.
 *
 * A copy of CueMol's react-gui/src/main/bench/appMetrics.ts, so both tools are
 * measured the same way: every process of the app (browser, renderer, GPU,
 * utilities) from `app.getAppMetrics()` every 250 ms over the whole run, then
 * placed against the phase times the renderer reports. Keep the two in step.
 *
 * Electron reports `workingSetSize` and `privateBytes` in kilobytes;
 * `privateBytes` exists on Windows only.
 */

'use strict'

const { app } = require('electron')

const samples = []
let intervalMs = 250
let timer = null

function takeSample() {
  try {
    samples.push({
      t: Date.now(),
      procs: app.getAppMetrics().map((m) => ({
        type: m.type,
        pid: m.pid,
        workingSetMB: (m.memory.workingSetSize ?? 0) / 1024,
        privateMB: (m.memory.privateBytes ?? 0) / 1024,
      })),
    })
  } catch (e) {
    console.warn('[Bench] getAppMetrics failed:', e)
  }
}

function startAppMetrics(everyMs = 250) {
  if (timer) return
  intervalMs = everyMs
  takeSample()
  timer = setInterval(takeSample, everyMs)
}

function stopAppMetrics() {
  if (timer) clearInterval(timer)
  timer = null
  takeSample()
}

function toPoint(s) {
  const byType = {}
  let ws = 0
  let priv = 0
  for (const p of s.procs) {
    ws += p.workingSetMB
    priv += p.privateMB
    const b = (byType[p.type] ??= { workingSetMB: 0, privateMB: 0 })
    b.workingSetMB += p.workingSetMB
    b.privateMB += p.privateMB
  }
  return { t: s.t, totalWorkingSetMB: ws, totalPrivateMB: priv, byType }
}

function maxBy(points) {
  let best = null
  for (const p of points) if (!best || p.totalWorkingSetMB > best.totalWorkingSetMB) best = p
  return best
}

function summarizeAppMetrics(phases) {
  const timeline = samples.map(toPoint)
  const loaded = phases ? timeline.find((p) => p.t >= phases.loadedEpochMs) ?? null : null
  const inMeasure = phases
    ? timeline.filter((p) => p.t >= phases.measureStartEpochMs && p.t <= phases.measureEndEpochMs)
    : []
  return {
    intervalMs,
    samples: timeline.length,
    peak: maxBy(timeline),
    loaded,
    measurePeak: maxBy(inMeasure),
    timeline,
  }
}

module.exports = { startAppMetrics, stopAppMetrics, summarizeAppMetrics }
