/**
 * @file renderer/bench/isBenchMode.ts
 * @description Whether this launch is a measured `--bench` cell.
 *
 * Its own module, with no imports, so the few places in the shell that ask can
 * do so without pulling in the harness.
 *
 * Lives on the `bench/perf-harness` branch and is not part of a release.
 */

/** The spec path this launch was given, or null for a normal run. */
export function benchSpecPath(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('benchSpec')
  } catch {
    return null
  }
}

/**
 * True while a benchmark cell is running.
 *
 * The shell uses it to start with every panel closed: the canvas backing
 * store is the surface being measured, and with the normal chrome in place a
 * 1920x1080 window leaves the 3D view about 1312x490, so the size the runner
 * asked for would not be the size anything was measured at.
 */
export function isBenchMode(): boolean {
  return benchSpecPath() !== null
}
