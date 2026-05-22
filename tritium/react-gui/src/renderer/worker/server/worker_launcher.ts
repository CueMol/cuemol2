import { WorkerService } from './WorkerService';
import { registerAllServices } from './services';

interface WorkerCrashPayload {
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    type: 'error' | 'unhandledrejection';
}

function postCrash(payload: WorkerCrashPayload): void {
    try {
        self.postMessage(['__worker_crash__', payload]);
    } catch (_) {
        // Worker may already be in a torn-down state; nothing more we can do.
    }
}

// Catch top-level synchronous throws in worker callbacks and unhandled
// async rejections. Per-RPC errors are still reported through
// WorkerService.invoke's try-catch; this is the backstop for everything
// else, including re-thrown render-loop faults from gfx_manager.
self.addEventListener('error', (event: Event) => {
    const e = event as ErrorEvent;
    postCrash({
        message: e.message || String(e.error ?? '(unknown worker error)'),
        stack: e.error instanceof Error ? e.error.stack : undefined,
        filename: e.filename || undefined,
        lineno: e.lineno || undefined,
        colno: e.colno || undefined,
        type: 'error',
    });
});

self.addEventListener('unhandledrejection', (event: Event) => {
    const e = event as PromiseRejectionEvent;
    const reason = e.reason as unknown;
    const message = reason instanceof Error
        ? reason.message
        : (typeof reason === 'string' ? reason : String(reason));
    postCrash({
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        type: 'unhandledrejection',
    });
});

const svc = new WorkerService(
    (data: any[]) => self.postMessage(data),
    () => self.close()
);

registerAllServices(svc);

self.onmessage = (event: MessageEvent) => {
    const method: string = event.data[0];
    const seqno: number = event.data[1];
    const args: any[] = event.data.slice(2);
    svc.invoke(method, seqno, args);
};
