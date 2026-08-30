/**
 * @file renderer/__test__/errorBoundary.test.tsx
 * @description Pin ErrorBoundary -> CrashReporter wiring.
 *
 * A render-path throw must (1) replace children with the CrashOverlay and
 * (2) forward a `react-error-boundary` report (with componentStack) to the
 * CrashReporter. Refactors that change the boundary wiring (e.g. moving
 * the boundary, swapping to a hook) need to keep both contracts intact.
 */

import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@renderer/crash/CrashReporter', () => ({
  report: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  getCurrentCrash: vi.fn(() => null),
}))

import { ErrorBoundary } from '@renderer/crash/ErrorBoundary'
import * as CrashReporter from '@renderer/crash/CrashReporter'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

void React

const Boom: React.FC = () => {
  throw new Error('child blew up')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('renders CrashOverlay when a child throws', () => {
    const { container, unmount } = mountTree(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(container.querySelector('#crash-fallback-react')).not.toBeNull()
    unmount()
  })

  it('calls CrashReporter.report with source=react-error-boundary and componentStack', () => {
    const { unmount } = mountTree(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
    const payload = (CrashReporter.report as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.source).toBe('react-error-boundary')
    expect(payload.message).toBe('child blew up')
    expect(payload.componentStack).toMatch(/Boom/)
    unmount()
  })
})
