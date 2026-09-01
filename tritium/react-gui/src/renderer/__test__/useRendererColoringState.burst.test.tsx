/**
 * @file __test__/useRendererColoringState.burst.test.tsx
 * @description Burst-pin (degrade-detection) test for the coloring deck's
 * refetch filter in features/coloring/useRendererColoringState.ts.
 *
 * THE BUG: one coloring change fires several CueMol events, and the listener
 * debounce is leading-edge -- the FIRST event of a burst opens the window and
 * is the one the handler is given; the rest are dropped. With the propname
 * whitelist applied AFTER the debounce, a burst that opens with an unrelated
 * event (a `visible` PROPCHG, say) had its window consumed by that event, the
 * whitelist then rejected it, and the `coloring` event that arrived inside the
 * window was gone. The deck went on showing Solid after a switch to Paint
 * until the target was changed and changed back, which refetches for its own
 * reasons.
 *
 * The filter therefore has to run BEFORE the debounce, so an unrelated event
 * neither opens nor consumes a window. This test drives that interleave and
 * asserts the refetch happens; it fails against the post-debounce placement.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useRendererColoringState } from '@renderer/features/coloring/useRendererColoringState'

void React
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const SCENE_ID = 7
const REND_ID = 100

function coloringState(className: string) {
  return {
    ok: true,
    className,
    defaultColor: '#000000',
    paintEntries: [],
    surfaceType: '',
    colormode: '',
  }
}

/** A cm that records subscriptions and lets the test deliver events. */
function makeCm(className: () => string) {
  let fire: ((args: unknown) => void) | null = null
  const invokeService = vi.fn(async () => coloringState(className()))
  const addEventListener = vi.fn(async (
    _cat: string,
    _src: number,
    _evt: number,
    _scope: number,
    cb: (args: unknown) => void,
  ) => {
    fire = cb
    return 42
  })
  return {
    invokeService,
    addEventListener,
    removeEventListener: vi.fn(async () => {}),
    /** Deliver one event to the subscription, as the worker bridge would. */
    emit(propname: string | undefined) {
      fire?.({ srcUID: SCENE_ID, obj: propname === undefined ? {} : { propname } })
    },
  }
}

function mountHook(cm: ReturnType<typeof makeCm>) {
  let result!: ReturnType<typeof useRendererColoringState>
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root
  const Probe: React.FC = () => {
    result = useRendererColoringState({
      cm: cm as unknown as Parameters<typeof useRendererColoringState>[0]['cm'],
      sceneId: SCENE_ID,
      rendId: REND_ID,
    })
    return null
  }
  act(() => {
    root = createRoot(container)
    root.render(React.createElement(Probe))
  })
  return {
    get result() {
      return result
    },
    unmount() {
      act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Let the listener's debounce window elapse. */
async function settleDebounce(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80))
  })
  await flush()
}

afterEach(() => vi.clearAllMocks())

describe('useRendererColoringState -- event bursts', () => {
  it('refetches on a coloring event that arrives behind an unrelated one', async () => {
    let className = 'SolidColoring'
    const cm = makeCm(() => className)
    const h = mountHook(cm)
    await flush()
    expect(h.result.state).toMatchObject({ className: 'SolidColoring' })
    const fetchesAfterMount = cm.invokeService.mock.calls.length

    // The switch to Paint lands, and the burst opens with an unrelated
    // PROPCHG -- exactly the case that used to swallow the coloring event.
    className = 'PaintColoring'
    act(() => {
      cm.emit('visible')
      cm.emit('coloring')
    })
    await settleDebounce()

    expect(cm.invokeService.mock.calls.length).toBeGreaterThan(fetchesAfterMount)
    expect(h.result.state).toMatchObject({ className: 'PaintColoring' })
    h.unmount()
  })

  it('does not refetch for a burst of unrelated events alone', async () => {
    const cm = makeCm(() => 'SolidColoring')
    const h = mountHook(cm)
    await flush()
    const fetchesAfterMount = cm.invokeService.mock.calls.length

    act(() => {
      cm.emit('visible')
      cm.emit('locked')
    })
    await settleDebounce()

    expect(cm.invokeService.mock.calls.length).toBe(fetchesAfterMount)
    h.unmount()
  })
})
