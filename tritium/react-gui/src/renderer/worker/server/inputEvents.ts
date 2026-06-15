import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import { PERF_MEASURE, perfCounters } from './perf';

/**
 * Pointer / wheel / gesture input handling for the Worker thread.
 *
 * Each `handle*` function takes an already-resolved `GUIView` and the raw
 * DOM-event-like payload forwarded from the renderer, and drives the
 * corresponding `View::on*` C++ entry point. `WorkerService` keeps the
 * thin dispatch methods that resolve `view_id -> GUIView` and delegate here.
 */

/**
 * CueMol modifier bits decoded by `GUIView::setupInDevEvent` on the C++ side.
 * Kept here as named constants so the per-handler bit math is self-documenting.
 */
const MODIF_CTRL = 32;
const MODIF_SHIFT = 64;
const MODIF_ALT = 128;

/**
 * CueMol mouse-button bits keyed by DOM `event.button` (0=left, 1=middle,
 * 2=right). Maps DOM left -> 1, DOM middle -> 4, DOM right -> 2, matching
 * `makeModif` and the C++ decode in `GUIView::setupInDevEvent`
 * (2 -> INDEV_RBTN, 4 -> INDEV_MBTN), so `RBUTTON|...` ViewInputConfig
 * bindings match a real right drag.
 */
const BUTTON_BITS: number[] = [1, 4, 2];

/**
 * Build the CueMol modifier bits for the held keyboard modifiers.
 *
 * @param event - DOM-event-like payload with `ctrlKey` / `shiftKey` / `altKey`.
 * @param includeAlt - whether to fold in the alt bit. Pointer down/up/move
 *   intentionally omit alt (parity with the pre-refactor path); wheel and
 *   gesture include it.
 * @returns the OR-combined ctrl / shift (/ alt) modifier bits.
 */
function modifierFromKeys(event: any, includeAlt: boolean): number {
    let modif = 0;
    if (event.ctrlKey) modif |= MODIF_CTRL;
    if (event.shiftKey) modif |= MODIF_SHIFT;
    if (includeAlt && event.altKey) modif |= MODIF_ALT;
    return modif;
}

/**
 * Translate a DOM mouse event's button / modifier state into the CueMol
 * modifier bitmask. CueMol button bits left=1 / right=2 / middle=4 match the
 * C++ decode in `GUIView::setupInDevEvent` (2 -> INDEV_RBTN, 4 -> INDEV_MBTN),
 * so `RBUTTON|...` ViewInputConfig bindings match a real right drag. Modifiers:
 * ctrl / shift (alt is not folded in here).
 */
export function makeModif(event: any): number {
    let modif = 0;
    if (event.buttons & 1) modif |= 1; // left button
    if (event.buttons & 2) modif |= 2; // right button (DOM buttons bit 1)
    if (event.buttons & 4) modif |= 4; // middle button (DOM buttons bit 2)
    modif |= modifierFromKeys(event, false);
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
 * is derived from `event.button` (0=left, 1=middle, 2=right) instead. The map
 * matches `makeModif` / the C++ decode: left=1, middle=4, right=2.
 */
export function handleMouseUp(view: GUIView, event: any): void {
    let modif = BUTTON_BITS[event.button] ?? 0;
    modif |= modifierFromKeys(event, false);
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
    const modif = modifierFromKeys(event, true);

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
    // Button bits 0-2 are unused for wheel; only keyboard modifiers apply.
    const modif = modifierFromKeys(event, true);

    view.onWheel(event.offsetX, event.offsetY, event.screenX, event.screenY,
        modif, event.deltaX, event.deltaY);
}
