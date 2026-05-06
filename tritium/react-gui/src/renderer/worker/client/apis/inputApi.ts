// Runs in renderer thread. Calls cross to worker via transport.invokeWorker.
import { WorkerTransport } from '../WorkerTransport';

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

export function onWheelEvent(transport: WorkerTransport, view_id: number, event: any): void {
    const { offsetX, offsetY, screenX, screenY, deltaX, deltaY,
            ctrlKey, shiftKey, altKey } = event;
    const ev = { offsetX, offsetY, screenX, screenY, deltaX, deltaY,
                 ctrlKey, shiftKey, altKey };
    const cur_seq = transport.getSeqNo();
    transport.postMessage('wheel', cur_seq, [view_id, ev]);
}

export function onGestureEvent(
    transport: WorkerTransport, view_id: number, axisID: number, delta: number, event?: any,
): void {
    const { offsetX = 0, offsetY = 0, screenX = 0, screenY = 0,
            ctrlKey = false, shiftKey = false, altKey = false } = event ?? {};
    const ev = { offsetX, offsetY, screenX, screenY, ctrlKey, shiftKey, altKey, axisID, delta };
    const cur_seq = transport.getSeqNo();
    transport.postMessage('gesture', cur_seq, [view_id, ev]);
}
