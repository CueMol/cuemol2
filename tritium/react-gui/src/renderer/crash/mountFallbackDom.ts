/**
 * @file renderer/crash/mountFallbackDom.ts
 * @description Last-resort DOM-direct fallback UI.
 *
 * Mounted by `CrashReporter` on the first crash so the user is not stuck
 * staring at a white window. Built with raw DOM (no React, no Blueprint)
 * because the React tree may already be unmounted or in an
 * inconsistent state when a crash arrives via window.onerror or worker
 * onerror. The CrashOverlay component covers the React-survives case with
 * a nicer UI; this is the universal backstop.
 */

import { IPC } from '@shared/ipcChannels'
import type { CrashReport } from '@shared/types/crash'

const FALLBACK_DOM_ID = 'crash-fallback-dom'

/**
 * Insert a fullscreen crash UI directly into document.body. No-op if the
 * fallback (or the React CrashOverlay) is already mounted.
 */
export function mountFallbackDom(report: CrashReport): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(FALLBACK_DOM_ID)) return
  if (document.getElementById('crash-fallback-react')) return

  const root = document.createElement('div')
  root.id = FALLBACK_DOM_ID
  root.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483647;background:#1e2028;color:#e8e8e8;'
    + 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;'
    + 'padding:32px;overflow:auto;display:flex;flex-direction:column;gap:16px;'
    + 'box-sizing:border-box;',
  )

  const title = document.createElement('div')
  title.textContent = 'CueMol encountered an error and cannot continue'
  title.setAttribute(
    'style',
    'font-size:18px;font-weight:600;color:#ff7373;',
  )
  root.appendChild(title)

  const source = document.createElement('div')
  source.textContent = `Source: ${report.source}`
  source.setAttribute('style', 'font-size:12px;color:#9aa0a6;')
  root.appendChild(source)

  const message = document.createElement('div')
  message.textContent = report.message || '(no message)'
  message.setAttribute('style', 'font-size:14px;color:#ffd5d5;white-space:pre-wrap;')
  root.appendChild(message)

  if (report.filename) {
    const loc = document.createElement('div')
    const where = report.lineno !== undefined
      ? `${report.filename}:${report.lineno}:${report.colno ?? 0}`
      : report.filename
    loc.textContent = `at ${where}`
    loc.setAttribute('style', 'font-size:12px;color:#9aa0a6;')
    root.appendChild(loc)
  }

  if (report.stack || report.componentStack) {
    const pre = document.createElement('pre')
    const parts: string[] = []
    if (report.stack) parts.push(report.stack)
    if (report.componentStack) {
      parts.push('Component stack:' + report.componentStack)
    }
    pre.textContent = parts.join('\n\n')
    pre.setAttribute(
      'style',
      'font-family:Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.45;'
      + 'background:#13151b;color:#d0d0d0;padding:12px 14px;border-radius:6px;'
      + 'border:1px solid #2a2d36;white-space:pre;overflow:auto;flex:1;min-height:160px;',
    )
    root.appendChild(pre)
  }

  const buttons = document.createElement('div')
  buttons.setAttribute('style', 'display:flex;gap:8px;')

  const quit = document.createElement('button')
  quit.textContent = 'Quit'
  quit.setAttribute(
    'style',
    'background:#c0392b;color:white;border:none;padding:8px 16px;'
    + 'border-radius:4px;font-size:14px;cursor:pointer;',
  )
  quit.addEventListener('click', () => {
    quit.disabled = true
    forceQuit()
  })
  buttons.appendChild(quit)

  root.appendChild(buttons)
  document.body.appendChild(root)
}

function forceQuit(): void {
  const api = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { invoke: (c: string) => Promise<void> } }).electronAPI
    : undefined
  if (api) {
    api.invoke(IPC.FORCE_QUIT).catch(() => {
      // Last resort if IPC is also broken.
      try { window.close() } catch { /* ignore */ }
    })
  } else {
    try { window.close() } catch { /* ignore */ }
  }
}
