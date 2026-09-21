/**
 * @file renderer/bench/BenchRoot.tsx
 * @description Mount point for the `--bench` run.
 *
 * A component of its own so that `App` gains one line rather than a hook call
 * and an import of the harness's internals. Renders nothing, and does nothing
 * at all unless the launch carried a spec.
 *
 * Lives on the `bench/perf-harness` branch and is not part of a release.
 */

import React from 'react'
import { useBenchRun } from './useBenchRun'

export const BenchRoot: React.FC = () => {
  useBenchRun()
  return null
}
