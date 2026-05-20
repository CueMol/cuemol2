import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import { PERF_MEASURE, perfCounters } from './perf';

/**
 * Pointer / wheel / gesture input handling for the Worker thread.
 *
 * Each `handle*` function takes an already-resolved `GUIView` and the raw
 * DOM-event-like payload forwarded from the renderer, and drives the
 * corresponding `View::on*` C++ entry point. `WorkerService` keeps the
 * thin dispatch methods that resolve `view_id → GUIView` and delegate here.
 */

/**
 * Translate a DOM mouse event's button / modifier state into the CueMol
 * modifier bitmask. Button bits: left=1, middle=2, right=4 (DOM's middle=4
 * / right=2 are swapped). Modifiers: ctrl=+32, shift=+64.
 */
export function makeModif(event: any): number {
    let modif = 0;
    if (event.buttons & 1) modif |= 1; // left button
    if (event.buttons & 4) modif |= 2; // middle button (DOM:4 → CueMol:2)
    if (event.buttons & 2) modif |= 4; // right button  (DOM:2 → CueMol:4)
    if (event.ctrlKey) {
        modif += 32;
    }
    if (event.shiftKey) {
        modif += 64;
    }
    return modif;
}

/** Forward a pointer-down event to `View::onMouseDown`. */
export function handleMouseDown(view: GUIView, event: any): void {
    const modif = makeModif(event);
    view.onMouseDown(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
}

/**
 * Forward a pointer-up event to `View::onMouseUp`.
 *
 * @remarks On mouseup `event.buttons` is already 0, so the button modifier
 * is derived from `event.button` (0=left, 1=middle, 2=right) instead.
 */
export function handleMouseUp(view: GUIView, event: any): void {
    const buttonMap: number[] = [1, 2, 4];
    let modif = buttonMap[event.button] ?? 0;
    if (event.ctrlKey) modif += 32;
    if (event.shiftKey) modif += 64;
    view.onMouseUp(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
}

/** Forward a pointer-move event to `View::onMouseMove`. */
export function handleMouseMove(view: GUIView, event: any): void {
    if (PERF_MEASURE) perfCounters.mouseMoveCount++;
    const modif = makeModif(event);
    view.onMouseMove(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
}

/**
 * Forward a trackpad gesture (pinch / rotate) to `View::onGesture`.
 *
 * @remarks The pinch (3.2x) and rotate (-16x) scale constants reproduce the
 * gesture feel of the pre-refactor wheel/rotate path; see the inline notes.
 */
export function handleGesture(view: GUIView, event: any): void {
    let modif = 0;
    if (event.ctrlKey)  modif |= 32;
    if (event.shiftKey) modif |= 64;
    if (event.altKey)   modif |= 128;

    // Scale constants preserve the gesture feel from the pre-refactor path.
    // GES_PINCH: was deltaY*8 (PINCH_ZOOM_SCALE) then View::mouseWheel prescaled /2.5
    //   => net multiplier 8/2.5 = 3.2 into handleMouseDragImpl.
    // GES_ROTATE: was view.rotateView(0,0,-rotation*4.0); handleMouseDragImpl for
    //   VIEW_ROTZ applies delta/4.0 => send delta_rotate=-rotation*16 to yield -rotation*4.
    const GES_PINCH  = 6;
    const GES_ROTATE = 7;
    let scaled = event.delta;
    if (event.axisID === GES_PINCH)  scaled = event.delta * 3.2;
    if (event.axisID === GES_ROTATE) scaled = -event.delta * 16.0;

    view.onGesture(event.offsetX, event.offsetY, event.screenX, event.screenY,
        modif, event.axisID, scaled);
}

/** Forward a wheel / scroll event to `View::onWheel`. */
export function handleWheel(view: GUIView, event: any): void {
    // ctrl=32, shift=64, alt=128 (buttons bits 0-2 unused for wheel)
    let modif = 0;
    if (event.ctrlKey)  modif |= 32;
    if (event.shiftKey) modif |= 64;
    if (event.altKey)   modif |= 128;

    view.onWheel(event.offsetX, event.offsetY, event.screenX, event.screenY,
        modif, event.deltaX, event.deltaY);
}
