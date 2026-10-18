/**
 * @file main/bench/appMetrics.ts
 * @description Process memory of a `--bench` run, sampled from main.
 *
 * The worker's own `process.memoryUsage()` sees one process, once. Comparing
 * with another application (the Mol* harness in `tritium/bench/molstar/`)
 * needs every process of the app -- browser, renderer, GPU, utilities -- over
 * the whole run, taken the same way on both sides, which only main can do
 * through `app.getAppMetrics()`. The Mol* harness carries a copy of this logic
 * (`appmetrics.js`); keep the two in step.
 *
 * `workingSetSize` and `privateBytes` are reported by Electron in kilobytes;
 * `privateBytes` exists on Windows only.
 *
 * CPU time: each sample also keeps every process's cumulative CPU time
 * (`cpu.cumulativeCPUUsage`, seconds since the process started). The CPU time
 * spent inside the measurement window, per process type, is interpolated at
 * the window's two ends (`cpuInMeasure`). Divided by the frames or updates of
 * the window it gives milliseconds of CPU per frame for the whole app --
 * worker, helper threads, GPU process -- which still compares two cells or
 * two tools when both are held at the display's 60 fps.
 */

import { app } from 'electron'

/** One process in one sample, in MB (1024 * 1024 bytes). */
interface ProcMem {
  type: string
  pid: number
  workingSetMB: number
  privateMB: number
  /** Cumulative CPU seconds of the process, or null when not reported. */
  cpuS: number | null
}

interface Sample {
  t: number
  procs: ProcMem[]
}

/** Totals over every process, and per process type, in MB. */
interface MemPoint {
  t: number
  totalWorkingSetMB: number
  totalPrivateMB: number
  byType: Record<string, { workingSetMB: number; privateMB: number }>
}

/** The phase boundaries the renderer side reports, as epoch milliseconds. */
export interface BenchPhases {
  loadStartEpochMs: number
  loadedEpochMs: number
  measureStartEpochMs: number
  measureEndEpochMs: number
}

export interface AppMetricsSummary {
  intervalMs: number
  samples: number
  /** Largest total over the whole run. */
  peak: MemPoint | null
  /** The first sample at or after the load finished. */
  loaded: MemPoint | null
  /** Largest total inside the measurement window. */
  measurePeak: MemPoint | null
  /** Every sample, reduced to totals and per-type values. */
  timeline: MemPoint[]
  /** CPU milliseconds spent in the measurement window, or null without phases. */
  cpuInMeasure: CpuInWindow | null
}

/** CPU time of a window: per process type and in all, in milliseconds. */
export interface CpuInWindow {
  windowMs: number
  totalMs: number
  byType: Record<string, number>
}

const samples: Sample[] = []
let intervalMs = 250
let timer: NodeJS.Timeout | null = null

function takeSample(): void {
  try {
    samples.push({
      t: Date.now(),
      procs: app.getAppMetrics().map((m) => ({
        type: m.type,
        pid: m.pid,
        workingSetMB: (m.memory.workingSetSize ?? 0) / 1024,
        privateMB: (m.memory.privateBytes ?? 0) / 1024,
        cpuS: typeof m.cpu?.cumulativeCPUUsage === 'number' ? m.cpu.cumulativeCPUUsage : null,
      })),
    })
  } catch (e) {
    console.warn('[Bench] getAppMetrics failed:', e)
  }
}

/** Start sampling every `everyMs` milliseconds until `stopAppMetrics`. */
export function startAppMetrics(everyMs = 100): void {
  if (timer) return
  intervalMs = everyMs
  takeSample()
  timer = setInterval(takeSample, everyMs)
}

export function stopAppMetrics(): void {
  if (timer) clearInterval(timer)
  timer = null
  takeSample()
}

function toPoint(s: Sample): MemPoint {
  const byType: MemPoint['byType'] = {}
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

function maxBy(points: MemPoint[]): MemPoint | null {
  let best: MemPoint | null = null
  for (const p of points) if (!best || p.totalWorkingSetMB > best.totalWorkingSetMB) best = p
  return best
}

/**
 * Summarise what was sampled. Without phases (a failed run) only the peak and
 * the timeline are filled in.
 */
export function summarizeAppMetrics(phases: BenchPhases | null | undefined): AppMetricsSummary {
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
    cpuInMeasure: phases ? cpuInWindow(phases.measureStartEpochMs, phases.measureEndEpochMs) : null,
  }
}

/**
 * Cumulative CPU seconds of process `pid` at time `t`, interpolated between
 * the samples around it; null when the process is not in both.
 */
function cpuAt(pid: number, t: number): number | null {
  let before: { t: number; cpuS: number } | null = null
  let after: { t: number; cpuS: number } | null = null
  for (const s of samples) {
    const p = s.procs.find((q) => q.pid === pid)
    if (!p || p.cpuS === null) continue
    if (s.t <= t) before = { t: s.t, cpuS: p.cpuS }
    if (s.t >= t && !after) after = { t: s.t, cpuS: p.cpuS }
  }
  if (!before || !after) return null
  if (after.t === before.t) return before.cpuS
  return before.cpuS + ((after.cpuS - before.cpuS) * (t - before.t)) / (after.t - before.t)
}

/** CPU time every process spent between t0 and t1 (epoch ms), by type. */
function cpuInWindow(t0: number, t1: number): CpuInWindow {
  const byType: Record<string, number> = {}
  const seen = new Map<number, string>()
  for (const s of samples) for (const p of s.procs) seen.set(p.pid, p.type)
  let totalMs = 0
  for (const [pid, type] of seen) {
    const a = cpuAt(pid, t0)
    const b = cpuAt(pid, t1)
    if (a === null || b === null) continue
    const ms = (b - a) * 1000
    byType[type] = (byType[type] ?? 0) + ms
    totalMs += ms
  }
  return { windowMs: t1 - t0, totalMs, byType }
}
