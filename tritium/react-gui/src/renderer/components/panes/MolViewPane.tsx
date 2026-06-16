import React, { useRef, useEffect } from 'react'
import { useWheel } from '@use-gesture/react'
import styles from './MolViewPane.module.css'
import { useMolTabDispatch } from '../../hooks/useMolTab'
import { useCueMol } from '../../hooks/useCueMol'
import { useViewInputConfig } from '../../contexts/ViewInputConfigContext'
import { GES_PINCH, GES_ROTATE } from '../../worker/shared/gestureAxes'
import { IPC } from '../../../shared/ipcChannels'

/**
 * Tab content pane for "molview" tabs -- WebGL canvas for molecular visualization.
 *
 * Design notes:
 * - Wrapped in React.memo and subscribes only to `useMolTabDispatch` (stable
 *   dispatch context) to avoid re-renders caused by tab-list or molViewID
 *   state changes. Canvas re-renders trigger visual artifacts in WebGL.
 * - All event handlers and observers are registered once (empty deps []) and
 *   access mutable state via refs, so their identities remain stable.
 * - Scene/view creation is handled in App.tsx. MolViewPane only binds the
 *   canvas to the already-created view identified by `getActiveViewID()`.
 * - `getActiveViewIDRef` is a ref to the stable `getActiveViewID` callback so
 *   that stable effect callbacks (ResizeObserver, mouse handlers) can always
 *   read the currently active view without being re-registered.
 */
export const MolViewPane = React.memo((): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { getActiveViewID } = useMolTabDispatch()
  const { cueMolReady, cm } = useCueMol()

  // Ref to the stable getActiveViewID callback -- lets ResizeObserver and
  // mouse handlers always query the active view without re-registration.
  const getActiveViewIDRef = useRef(getActiveViewID)
  useEffect(() => { getActiveViewIDRef.current = getActiveViewID }, [getActiveViewID])

  // Ref to the latest cm instance for stable callbacks
  const cmRef = useRef(cm)
  useEffect(() => { cmRef.current = cm }, [cm])

  // Auto device-detect: feed the wheel / gesture stream to the detector via the
  // ViewInputConfig context (these no-op unless the preference is 'auto').
  const { feedWheelSample, noteTrackpadGesture } = useViewInputConfig()
  const feedWheelRef = useRef(feedWheelSample)
  useEffect(() => { feedWheelRef.current = feedWheelSample }, [feedWheelSample])
  const noteGestureRef = useRef(noteTrackpadGesture)
  useEffect(() => { noteGestureRef.current = noteTrackpadGesture }, [noteTrackpadGesture])

  // Guard against double-initialization (React StrictMode remounts effects)
  const initStartedRef = useRef(false)

  /**
   * One-time initialization effect: binds the canvas to the OffscreenCanvas
   * in the Web Worker using the view that was already created in App.tsx,
   * then triggers an explicit initial resize.
   *
   * Why the explicit resize?
   *   `transferControlToOffscreen()` captures the canvas at whatever pixel size
   *   it has at call time (often 0×0 due to `height: 0px` in CSS + flex).
   *   The ResizeObserver may have already fired once at that point, but
   *   `getActiveViewID()` was null so the event was ignored.
   *   After this effect completes, the size no longer changes and the
   *   ResizeObserver will not re-fire -- so we must push the correct
   *   dimensions to the worker explicitly here.
   */
  useEffect(() => {
    if (!cueMolReady || !cm || !canvasRef.current) return
    const view_uid = getActiveViewID()
    if (view_uid === undefined) return
    if (initStartedRef.current) return
    initStartedRef.current = true

    let cancelled = false
    ;(async () => {
      if (cancelled || !canvasRef.current) return
      const dpr = window.devicePixelRatio || 1
      await cm.bindCanvas(canvasRef.current, view_uid, dpr)

      // Send initial resize with actual layout dimensions.
      // The ResizeObserver may have already fired (and been ignored because
      // getActiveViewID() returned undefined), so we must explicitly sync.
      if (canvasRef.current) {
        const { width, height } = canvasRef.current.getBoundingClientRect()
        if (width > 0 && height > 0) {
          cm.resized(view_uid, width, height, dpr)
        }
      }
    })()
    return () => { cancelled = true }
  }, [cueMolReady, cm, getActiveViewID])

  /**
   * ResizeObserver effect registered once; reads latest IDs from refs.
   *
   * Why no rAF throttle?
   *   The browser already batches ResizeObserver callbacks to once per frame.
   *   Adding a requestAnimationFrame delay would cause the resize message to
   *   reach the worker one frame late. In the worker, `resized()` clears the
   *   WebGL buffer immediately when setting canvas.width/height, so a one-frame
   *   delay results in a blank (flickering) canvas before the next draw.
   *   By sending the message synchronously from the ResizeObserver callback,
   *   the worker can resize and redraw within the same message-handler
   *   execution, eliminating the blank frame.
   *
   * DPR is read at callback time (not at mount) so that moving the window
   * between displays with different pixel ratios is handled correctly.
   */
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const viewID = getActiveViewIDRef.current()
      const currentCm = cmRef.current
      if (viewID === undefined || !currentCm) return
      const dpr = window.devicePixelRatio || 1
      const entry = entries[entries.length - 1]
      const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0]
      if (width > 0 && height > 0) {
        currentCm.resized(viewID, width, height, dpr)
      }
    })
    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current)
    }
    return () => {
      resizeObserver.disconnect()
    }
  }, []) // stable -- reads state via refs

  // Trackpad wheel handler:
  //   - ctrl+wheel: Chromium's encoding of a trackpad pinch gesture -> dispatch as
  //     GES_PINCH so ViewInputConfig bindings route it (e.g. to VIEW_ZOOM).
  //   - plain wheel: 2-finger swipe or physical mouse wheel -> INDEV_WHEEL path
  //     (MOUSE_WHEEL1/2 bindings for translate). Registered with passive:false so
  //     preventDefault() suppresses browser page-scroll / OS page-zoom.
  useWheel(
    ({ event }) => {
      const viewID = getActiveViewIDRef.current()
      if (viewID === undefined || !cmRef.current) return
      event.preventDefault()
      if (event.ctrlKey) {
        // Chromium signals trackpad pinch as wheel + synthetic ctrlKey=true.
        // Strip that fake ctrl so the GES_PINCH binding in ViewInputConfig
        // (stored with modifier bits = 0) matches in findEvent().
        const synth = {
          offsetX: event.offsetX, offsetY: event.offsetY,
          screenX: event.screenX, screenY: event.screenY,
          ctrlKey: false, shiftKey: event.shiftKey, altKey: event.altKey,
        }
        cmRef.current.onGestureEvent(viewID, GES_PINCH, event.deltaY, synth)
        // Pinch is a definitive trackpad signal for the auto detector.
        noteGestureRef.current()
      } else {
        cmRef.current.onWheelEvent(viewID, event)
        // Feed the plain wheel to the auto device detector.
        feedWheelRef.current({
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
        })
      }
    },
    {
      target: canvasRef,
      eventOptions: { passive: false },
    },
  )

  // macOS trackpad 2-finger rotate gesture -- sourced from Electron main's
  // BrowserWindow 'rotate-gesture' event (Chromium has no DOM event for this).
  // Forwarded via GES_ROTATE axis so ViewInputConfig bindings can route it
  // (e.g. conf_rotz = "...,GES_ROTATE" in default_style.xml).
  useEffect(() => {
    const unsubscribe = window.electronAPI.onPush(IPC.ROTATE_GESTURE, (rotation) => {
      const viewID = getActiveViewIDRef.current()
      if (viewID === undefined || !cmRef.current) return
      cmRef.current.onGestureEvent(viewID, GES_ROTATE, rotation)
      // Rotate is a definitive trackpad signal for the auto detector.
      noteGestureRef.current()
    })
    return unsubscribe
  }, [])

  // Mouse event listeners registered once; reads latest IDs from refs
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleMouse = (method: string) => (event: MouseEvent): void => {
      const viewID = getActiveViewIDRef.current()
      if (viewID !== undefined && cmRef.current) cmRef.current.onMouseEvent(viewID, method, event)
    }
    const onMouseDown = handleMouse('mouseDown')
    const onMouseUp = handleMouse('mouseUp')
    const onMouseMove = handleMouse('mouseMove')
    // Prevent browser/Electron default context menu; navi tool opens its own.
    const onContextMenu = (e: MouseEvent): void => { e.preventDefault() }
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('contextmenu', onContextMenu)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, []) // stable -- reads state via refs

  return <canvas className={styles.molView} ref={canvasRef} />
})

MolViewPane.displayName = 'MolViewPane'
