/**
 * @file renderer/crash/ErrorBoundary.tsx
 * @description Top-level React error boundary.
 *
 * Wraps the entire renderer root inside `index.tsx`. Catches any synchronous
 * render-path throw beneath it, including throws inside Context Provider
 * constructors. Anything that throws *above* the boundary (e.g. a React
 * runtime bug) or *outside* the React render path (timers, event handlers,
 * worker errors) is caught by the window.onerror / unhandledrejection
 * listeners installed by `installGlobalCrashHandlers`; both routes converge
 * on `CrashReporter`, which renders this boundary's overlay AND a
 * DOM-direct fallback for the worst case.
 */

import React from 'react'
import type { CrashReport } from '../../shared/ipcTypes'
import { CrashOverlay } from './CrashOverlay'
import { report } from './CrashReporter'

interface State {
  crashed: boolean
  payload: CrashReport | null
}

interface Props {
  children: React.ReactNode
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { crashed: false, payload: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      crashed: true,
      payload: {
        source: 'react-error-boundary',
        message: error.message || String(error),
        stack: error.stack,
        timestamp: Date.now(),
      },
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    report({
      source: 'react-error-boundary',
      message: error.message || String(error),
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      timestamp: Date.now(),
    })
  }

  render(): React.ReactNode {
    if (this.state.crashed) {
      return <CrashOverlay initialReport={this.state.payload} />
    }
    return this.props.children
  }
}
