/**
 * @file renderer/crash/CrashOverlay.tsx
 * @description React-side crash UI rendered by `ErrorBoundary`.
 *
 * Used when the React tree is still alive enough to render fallback
 * content but a subtree threw. Self-contained: no Blueprint Provider, no
 * Context, no theme dependency -- everything is inline styles so the
 * overlay can render even when the surrounding tree is in a broken
 * state. The DOM-direct fallback in `mountFallbackDom` covers the case
 * where React itself is dead.
 */

import React, { useEffect, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { CrashReport } from '@shared/ipcTypes'
import { getCurrentCrash, subscribe } from './CrashReporter'

interface Props {
  /** Crash payload passed by ErrorBoundary's getDerivedStateFromError path. */
  initialReport?: CrashReport | null
}

export function CrashOverlay({ initialReport }: Props): React.ReactElement | null {
  const [report, setReport] = useState<CrashReport | null>(
    initialReport ?? getCurrentCrash(),
  )

  useEffect(() => {
    if (report !== null) return
    return subscribe((r) => setReport(r))
  }, [report])

  if (report === null) return null

  return (
    <div
      id="crash-fallback-react"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: '#1e2028',
        color: '#e8e8e8',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        padding: 32,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: '#ff7373' }}>
        CueMol encountered an error and cannot continue
      </div>
      <div style={{ fontSize: 12, color: '#9aa0a6' }}>
        Source: {report.source}
      </div>
      <div style={{ fontSize: 14, color: '#ffd5d5', whiteSpace: 'pre-wrap' }}>
        {report.message || '(no message)'}
      </div>
      {report.filename ? (
        <div style={{ fontSize: 12, color: '#9aa0a6' }}>
          at {report.lineno !== undefined
            ? `${report.filename}:${report.lineno}:${report.colno ?? 0}`
            : report.filename}
        </div>
      ) : null}
      {(report.stack || report.componentStack) ? (
        <pre
          style={{
            fontFamily: 'Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.45,
            background: '#13151b',
            color: '#d0d0d0',
            padding: '12px 14px',
            borderRadius: 6,
            border: '1px solid #2a2d36',
            whiteSpace: 'pre',
            overflow: 'auto',
            flex: 1,
            minHeight: 160,
            margin: 0,
          }}
        >
          {[report.stack, report.componentStack ? 'Component stack:' + report.componentStack : null]
            .filter(Boolean)
            .join('\n\n')}
        </pre>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onQuit}
          style={{
            background: '#c0392b',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 4,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Quit
        </button>
      </div>
    </div>
  )
}

function onQuit(): void {
  const api = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { invoke: (c: string) => Promise<void> } }).electronAPI
    : undefined
  if (api) {
    api.invoke(IPC.FORCE_QUIT).catch(() => {
      try { window.close() } catch { /* ignore */ }
    })
  } else {
    try { window.close() } catch { /* ignore */ }
  }
}
