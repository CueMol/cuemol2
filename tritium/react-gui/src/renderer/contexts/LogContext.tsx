/**
 * @file contexts/LogContext.tsx
 * @description Owns the Output-panel log buffer and exposes a React-side API
 * to append to it (and read it).
 *
 * Two producers feed the same buffer:
 *   - the cuemol3 core log stream, via `useLogEvent` (C++ MsgLog events); and
 *   - any renderer-side code that calls `useLogActions().appendLine(...)`.
 *
 * The second path lets the renderer write straight to the Output panel
 * WITHOUT routing through the C++ MsgLog -- used for startup diagnostics
 * (e.g. devicePixelRatio) and available for any future renderer-only logging.
 *
 * The API is split across two contexts on purpose:
 *   - `useLogActions()` returns append / appendLine / clear with identities
 *     that never change, so a WRITE-ONLY consumer (e.g. the memoized WebGL
 *     `MolViewPane`) does NOT re-render when the buffer grows.
 *   - `useLogContents()` returns the buffer string and changes on every
 *     append; only the Output viewer subscribes to it.
 *
 * The buffer lives here (not in BottomPanel) so it survives bottom-tab
 * switches and is reachable from anywhere under the provider.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useLogEvent } from '@renderer/features/log/useLogEvent'

export interface LogActions {
  /** Append raw text (no implicit newline). Used by the C++ log stream. */
  append: (text: string) => void
  /** Append a line, adding a single trailing newline. */
  appendLine: (line: string) => void
  /** Clear the whole buffer. */
  clear: () => void
}

const LogActionsContext = createContext<LogActions | null>(null)
const LogContentsContext = createContext<string | null>(null)

/**
 * Append / clear the Output-panel log. Stable identities -- safe to use from
 * a memoized component without causing re-renders when the buffer grows.
 * Must be used under `LogProvider`.
 */
export function useLogActions(): LogActions {
  const ctx = useContext(LogActionsContext)
  if (!ctx) throw new Error('useLogActions must be used within LogProvider')
  return ctx
}

/**
 * The Output-panel buffer text. Re-renders the consumer on every append, so
 * use only where the text is actually displayed. Must be used under `LogProvider`.
 */
export function useLogContents(): string {
  const ctx = useContext(LogContentsContext)
  if (ctx === null) throw new Error('useLogContents must be used within LogProvider')
  return ctx
}

export const LogProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [contents, setContents] = useState('')

  const append = useCallback((text: string) => setContents((c) => c + text), [])
  const appendLine = useCallback((line: string) => setContents((c) => c + line + '\n'), [])
  const clear = useCallback(() => setContents(''), [])

  // Pipe the cuemol3 core log stream into the same buffer. This is the only
  // useLogEvent subscription in the app (moved here from BottomPanel).
  useLogEvent(append)

  // Stable for the provider's lifetime (append/appendLine/clear never change),
  // so write-only consumers do not re-render as the buffer grows.
  const actions = useMemo<LogActions>(
    () => ({ append, appendLine, clear }),
    [append, appendLine, clear],
  )

  return (
    <LogActionsContext.Provider value={actions}>
      <LogContentsContext.Provider value={contents}>{children}</LogContentsContext.Provider>
    </LogActionsContext.Provider>
  )
}
