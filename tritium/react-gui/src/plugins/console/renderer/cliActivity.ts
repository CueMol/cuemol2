/**
 * @file plugins/console/renderer/cliActivity.ts
 * @description The tritium_cli submissions running right now, for the status
 * bar.
 *
 * Written by `useConsoleEndpoint` (which answers them) and read by the status
 * bar item; a module store because the two are mounted in different places.
 */

import { useSyncExternalStore } from 'react'

let running = 0
const listeners = new Set<() => void>()

function publish(): void {
  for (const l of listeners) l()
}

/** Record a submission as started; the returned function records its end. */
export function beginCliRun(): () => void {
  running += 1
  publish()
  let done = false
  return () => {
    if (done) return
    done = true
    running -= 1
    publish()
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** How many submissions from tritium_cli are running. */
export function useCliRunning(): number {
  return useSyncExternalStore(subscribe, () => running)
}
