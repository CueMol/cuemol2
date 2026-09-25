/**
 * @file main/bench/benchMode.ts
 * @description `--bench`: run one measured cell and exit.
 *
 * Lives on the `bench/perf-harness` branch and is not part of a release. The
 * matrix is expanded by `tritium/bench/run.js`, which starts one process per
 * cell, because switching scene or renderer inside a live process leaves the
 * previous cell's allocations and driver state behind for the next one to
 * measure.
 *
 * The result travels back on the console rather than over IPC: main already
 * forwards the renderer's console to stdout, so a marker line needs no new
 * channel, no preload change, and nothing in the shared IPC contract -- which
 * is what keeps this branch from conflicting with develop over those files.
 */

import { app, type BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { startAppMetrics, stopAppMetrics, summarizeAppMetrics } from './appMetrics'

/** Prefix the renderer prints its result JSON behind. */
export const BENCH_RESULT_MARKER = '[BENCH_RESULT]'

export interface BenchArgs {
  /** Absolute path of the spec file. */
  specPath: string
  /** Where to write the result JSON. */
  outPath: string
  /** Canvas size in device pixels, or null to leave the window at its default. */
  canvas: { width: number; height: number } | null
  /** `--bench-snapshot=<png>`: save the window as it is when the result arrives. */
  snapshotPath: string | null
}

function argValue(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  const found = argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

/**
 * Read the benchmark arguments, or null for a normal run.
 *
 * `parseFileArgs` drops anything starting with `-`, so these never reach the
 * shell-open queue and a bench launch opens no file by that route.
 */
export function parseBenchArgs(argv: string[], cwd: string): BenchArgs | null {
  const spec = argValue(argv, 'bench')
  if (!spec) return null

  const out = argValue(argv, 'bench-out')
  const snapshot = argValue(argv, 'bench-snapshot')
  const canvasArg = argValue(argv, 'canvas')
  let canvas: BenchArgs['canvas'] = null
  if (canvasArg) {
    const m = /^(\d+)x(\d+)$/.exec(canvasArg)
    if (m) canvas = { width: Number(m[1]), height: Number(m[2]) }
    else console.error(`[Bench] --canvas expects WxH in device pixels, got "${canvasArg}"`)
  }

  return {
    specPath: path.resolve(cwd, spec),
    outPath: out ? path.resolve(cwd, out) : path.resolve(cwd, 'bench-result.json'),
    canvas,
    snapshotPath: snapshot ? path.resolve(cwd, snapshot) : null,
  }
}

/**
 * Window content size, in CSS pixels, for the requested device-pixel canvas.
 *
 * The canvas backing store is CSS size times `devicePixelRatio`, so a size
 * given in device pixels is the only one that means the same thing on two
 * machines. `useContentSize` keeps the title bar out of it.
 */
export function benchContentSize(args: BenchArgs): { width: number; height: number } | null {
  if (!args.canvas) return null
  const scale = screen.getPrimaryDisplay().scaleFactor || 1
  return {
    width: Math.round(args.canvas.width / scale),
    height: Math.round(args.canvas.height / scale),
  }
}

/**
 * Watch the window's console for the result line, write it out, and quit.
 *
 * A separate listener from the one `forwardConsoleMessages` installs, so the
 * output still reaches stdout as usual.
 *
 * Main samples every process's memory for the whole run (`appMetrics.ts`) and
 * adds the summary to the result as `appMetrics`, placed against the phase
 * times the result carries. A renderer that dies is recorded as a failed
 * result with its reason, since for a large trajectory the failure is the
 * finding.
 */
export function installBenchResultWatcher(win: BrowserWindow, args: BenchArgs): void {
  let done = false
  const startedAt = Date.now()
  startAppMetrics()

  const finish = async (payload: string, failed: boolean): Promise<void> => {
    if (done) return
    done = true
    stopAppMetrics()
    let out = payload
    try {
      const result = JSON.parse(payload)
      result.appMetrics = summarizeAppMetrics(result.phases)
      out = JSON.stringify(result)
    } catch (e) {
      console.error('[Bench] could not attach appMetrics to the result:', e)
    }
    try {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true })
      fs.writeFileSync(args.outPath, out)
      console.log(`[Bench] wrote ${args.outPath}`)
    } catch (e) {
      console.error('[Bench] could not write the result:', e)
    }
    if (args.snapshotPath && !failed) {
      try {
        const img = await win.webContents.capturePage()
        fs.mkdirSync(path.dirname(args.snapshotPath), { recursive: true })
        fs.writeFileSync(args.snapshotPath, img.toPNG())
        console.log(`[Bench] wrote ${args.snapshotPath}`)
      } catch (e) {
        console.error('[Bench] could not save the snapshot:', e)
      }
    }
    // A modified scene would otherwise raise the save-confirm dialog on the
    // way out and hang a run that nobody is watching.
    app.exit(failed ? 1 : 0)
  }

  win.webContents.on('console-message', (_event, _level, message) => {
    const at = message.indexOf(BENCH_RESULT_MARKER)
    if (at < 0) return
    void finish(message.slice(at + BENCH_RESULT_MARKER.length).trim(), false)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Bench] renderer gone: ${details.reason} (exit ${details.exitCode})`)
    void finish(
      JSON.stringify({
        ok: false,
        error: `render-process-gone: ${details.reason}`,
        exitCode: details.exitCode,
        elapsedMs: Date.now() - startedAt,
      }),
      true,
    )
  })

  // A cell that never reports is a failure, not a process to leave running.
  const timeoutMs = 10 * 60 * 1000
  setTimeout(() => {
    if (done) return
    console.error(`[Bench] no result after ${timeoutMs} ms; giving up`)
    void finish(JSON.stringify({ ok: false, error: 'timeout', elapsedMs: Date.now() - startedAt }), true)
  }, timeoutMs)
}
