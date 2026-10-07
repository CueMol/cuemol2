/**
 * @file plugins/mcp/renderer/mcpActivity.ts
 * @description The calls the server is running right now, for the status bar.
 *
 * Written by `McpRoot` (which answers the calls) and read by the status bar
 * item; a module store rather than React state because the two are mounted
 * in different places.
 */

import { useSyncExternalStore } from 'react'

export interface McpActivity {
  /** Calls in progress. */
  running: number
  /** The tool of the most recent call still running, else null. */
  tool: string | null
}

let state: McpActivity = { running: 0, tool: null }
const active: string[] = []
const listeners = new Set<() => void>()

function publish(): void {
  state = { running: active.length, tool: active[active.length - 1] ?? null }
  for (const l of listeners) l()
}

/** Record a call to `tool` as started; the returned function records its end. */
export function beginMcpCall(tool: string): () => void {
  active.push(tool)
  publish()
  let done = false
  return () => {
    if (done) return
    done = true
    const i = active.lastIndexOf(tool)
    if (i >= 0) active.splice(i, 1)
    publish()
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useMcpActivity(): McpActivity {
  return useSyncExternalStore(subscribe, () => state)
}
