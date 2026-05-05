import { WorkerTransport } from '../WorkerTransport';

const log = console;

export async function bindCanvas(
    transport: WorkerTransport, canvas: any, view_id: number, dpr: number,
): Promise<any[]> {
    const offscreen = canvas.transferControlToOffscreen();
    return await transport.invokeWorkerWithTransfer(
        'bindCanvas', offscreen, offscreen, view_id, dpr,
    );
}

export async function addView(
    transport: WorkerTransport, view_id: number, dpr: number,
): Promise<boolean> {
    const result = await transport.invokeWorker('addView', view_id, dpr);
    if (result === null) {
        log.warn(`addView failed for view_id: ${view_id}`);
        return false;
    }
    return result[0] as boolean;
}

export async function activateView(transport: WorkerTransport, view_id: number): Promise<void> {
    await transport.invokeWorker('activateView', view_id);
}

export async function removeView(transport: WorkerTransport, view_id: number): Promise<void> {
    await transport.invokeWorker('removeView', view_id);
}

export function resized(
    transport: WorkerTransport, view_id: number, w: number, h: number, dpr: number,
): void {
    const cur_seq = transport.getSeqNo();
    transport.postMessage('resized', cur_seq, [view_id, w, h, dpr]);
}
