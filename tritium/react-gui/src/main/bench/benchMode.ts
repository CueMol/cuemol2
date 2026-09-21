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

/** Prefix the renderer prints its result JSON behind. */
export const BENCH_RESULT_MARKER = '[BENCH_RESULT]'

export interface BenchArgs {
  /** Absolute path of the spec file. */
  specPath: string
  /** Where to write the result JSON. */
  outPath: string
  /** Canvas size in device pixels, or null to leave the window at its default. */
  canvas: { width: number; height: number } | null
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
 */
export function installBenchResultWatcher(win: BrowserWindow, args: BenchArgs): void {
  let done = false

  const finish = (payload: string, failed: boolean): void => {
    if (done) return
    done = true
    try {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true })
      fs.writeFileSync(args.outPath, payload)
      console.log(`[Bench] wrote ${args.outPath}`)
    } catch (e) {
      console.error('[Bench] could not write the result:', e)
    }
    // A modified scene would otherwise raise the save-confirm dialog on the
    // way out and hang a run that nobody is watching.
    app.exit(failed ? 1 : 0)
  }

  win.webContents.on('console-message', (_event, _level, message) => {
    const at = message.indexOf(BENCH_RESULT_MARKER)
    if (at < 0) return
    finish(message.slice(at + BENCH_RESULT_MARKER.length).trim(), false)
  })

  // A cell that never reports is a failure, not a process to leave running.
  const timeoutMs = 10 * 60 * 1000
  setTimeout(() => {
    if (done) return
    console.error(`[Bench] no result after ${timeoutMs} ms; giving up`)
    finish(JSON.stringify({ ok: false, error: 'timeout' }), true)
  }, timeoutMs)
}
