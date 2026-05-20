/**
 * @file renderer/worker/client/apis/inputApi.ts
 * @description Renderer-thread input-event forwarders. Each function picks
 * the fields the worker actually consumes off a DOM event and fires it as
 * a `postMessage` (no await; no reply).
 */
import { WorkerTransport } from '../WorkerTransport';

/**
 * Forward a mouse event (mousedown / mousemove / mouseup / etc.) to the
 * worker.
 *
 * @param transport - Worker transport.
 * @param view_id - Target view uid.
 * @param method - Worker-side handler name (e.g. `'mouseDown'`,
 *   `'mouseMove'`).
 * @param event - DOM `MouseEvent`. Only the fields needed by the worker
 *   are serialised.
 */
export function onMouseEvent(
    transport: WorkerTransport, view_id: number, method: string, event: any,
): void {
    const { clientX, clientY, screenX, screenY, offsetX, offsetY,
            buttons, button, ctrlKey, shiftKey } = event;
    const ev = { clientX, clientY, screenX, screenY, offsetX, offsetY,
                 buttons, button, ctrlKey, shiftKey };
    const cur_seq = transport.getSeqNo();
    transport.postMessage(method, cur_seq, [view_id, ev]);
}

/**
 * Forward a wheel event to the worker.
 *
 * @param transport - Worker transport.
 * @param view_id - Target view uid.
 * @param event - DOM `WheelEvent`.
 */
export function onWheelEvent(transport: WorkerTransport, view_id: number, event: any): void {
    const { offsetX, offsetY, screenX, screenY, deltaX, deltaY,
            ctrlKey, shiftKey, altKey } = event;
    const ev = { offsetX, offsetY, screenX, screenY, deltaX, deltaY,
                 ctrlKey, shiftKey, altKey };
    const cur_seq = transport.getSeqNo();
    transport.postMessage('wheel', cur_seq, [view_id, ev]);
}

/**
 * Forward a trackpad gesture (pinch / rotate / pan) to the worker.
 *
 * @param transport - Worker transport.
 * @param view_id - Target view uid.
 * @param axisID - Gesture axis (see `gestureAxes` in `worker/shared`).
 * @param delta - Signed magnitude along `axisID`.
 * @param event - Optional originating DOM event for modifier-key / coords;
 *   defaults to zeroes when omitted.
 */
export function onGestureEvent(
    transport: WorkerTransport, view_id: number, axisID: number, delta: number, event?: any,
): void {
    const { offsetX = 0, offsetY = 0, screenX = 0, screenY = 0,
            ctrlKey = false, shiftKey = false, altKey = false } = event ?? {};
    const ev = { offsetX, offsetY, screenX, screenY, ctrlKey, shiftKey, altKey, axisID, delta };
    const cur_seq = transport.getSeqNo();
    transport.postMessage('gesture', cur_seq, [view_id, ev]);
}
