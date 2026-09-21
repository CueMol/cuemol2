/**
 * @file main/bench/benchState.ts
 * @description Where the parsed `--bench` arguments live for the main process.
 *
 * A module singleton so that `index.ts` can read the command line before any
 * window exists and `mainWindow.ts` can act on it while building one, without
 * either of them growing a parameter for something a release build never has.
 */

import type { BenchArgs } from './benchMode'

let benchArgs: BenchArgs | null = null

export function setBenchArgs(args: BenchArgs | null): void {
  benchArgs = args
  if (args) {
    console.log(
      `[Bench] spec=${args.specPath} out=${args.outPath}` +
        (args.canvas ? ` canvas=${args.canvas.width}x${args.canvas.height}` : ''),
    )
  }
}

export function getBenchArgs(): BenchArgs | null {
  return benchArgs
}
