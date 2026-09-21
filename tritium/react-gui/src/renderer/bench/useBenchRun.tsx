/**
 * @file renderer/bench/useBenchRun.tsx
 * @description Starts the measured cell when the app was launched with
 * `--bench`, and prints its result for the main process to pick up.
 *
 * Lives on the `bench/perf-harness` branch and is not part of a release: the
 * hook returns immediately when the query string carries no spec, which is
 * every normal launch.
 *
 * The result goes out on the console behind a marker rather than over IPC.
 * Main already forwards the renderer console to stdout and watches for the
 * marker (main/bench/benchMode.ts), so nothing has to be added to the shared
 * IPC contract or the preload surface.
 */

import { useEffect, useRef } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useEnsureActiveScene } from '@renderer/hooks/useEnsureActiveScene'
import { benchSpecPath } from './isBenchMode'
import { MOLVIEW_CANVAS_SELECTOR } from '@renderer/features/molview/molViewCanvas'

/** Marker main greps the console for. Keep in step with benchMode.ts. */
const BENCH_RESULT_MARKER = '[BENCH_RESULT]'

/**
 * Run the cell once the worker and the canvas are up.
 *
 * Waits for a bound view rather than firing on mount: the measurement needs a
 * GL context, and `bindCanvas` happens when the molview pane mounts.
 */
export function useBenchRun(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const started = useRef(false)

  useEffect(() => {
    const specPath = benchSpecPath()
    if (!specPath || !cm || started.current) return
    started.current = true

    void (async () => {
      const report = (payload: unknown): void => {
        console.log(BENCH_RESULT_MARKER + ' ' + JSON.stringify(payload))
      }

      try {
        // The canvas first: a scene cannot be created before `bindCanvas` has
        // run (the worker's view creation needs the GL context), and the app's
        // own boot has made one by the time the pane is up.
        await waitForCanvas()

        const target = await ensureActiveScene()
        if (!target) {
          report({ ok: false, error: 'no scene could be created' })
          return
        }

        const dpr = window.devicePixelRatio || 1
        // The 3D canvas specifically: the sequence panel and the gradient
        // histogram are canvases too, and a bare `querySelector('canvas')`
        // takes whichever comes first in the DOM.
        const canvas = document.querySelector<HTMLCanvasElement>(MOLVIEW_CANVAS_SELECTOR)
        const width = canvas ? canvas.width : 0
        const height = canvas ? canvas.height : 0

        const res = await cm.invokeService('benchRun', {
          specPath,
          sceneId: target.scene_uid,
          viewId: target.view_id,
          canvasWidth: width,
          canvasHeight: height,
          dpr,
        })

        report(res.ok ? res.result : { ok: false, error: res.error })
      } catch (e) {
        report({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })()
  }, [cm, ensureActiveScene])
}

/** Resolve once a canvas with a real backing store exists. */
function waitForCanvas(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const check = (): void => {
      const canvas = document.querySelector<HTMLCanvasElement>(MOLVIEW_CANVAS_SELECTOR)
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        resolve()
        return
      }
      if (Date.now() > deadline) {
        reject(new Error('no canvas was bound'))
        return
      }
      setTimeout(check, 50)
    }
    check()
  })
}
