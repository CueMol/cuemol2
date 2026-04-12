import path from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { WorkerAdapter } from './WorkerAdapter';
import { createLogger } from '@/logger';

const log = createLogger(import.meta.url);

// Creates a WorkerAdapter backed by a Node.js worker_threads Worker.
// Call this only in Node.js environments (not in browser/renderer).
export function createNodeWorkerAdapter(): WorkerAdapter {
    const cwd = dirname(fileURLToPath(import.meta.url));
    log.debug('launch node worker from: %s', cwd);
    const nodeWorker = new Worker(path.join(cwd, 'worker.ts'), {
        execArgv: ['--import', 'tsx/esm'],
    });
    log.info('launch worker OK');
    return {
        postMessage: (data, xfer) => {
            if (xfer != null) nodeWorker.postMessage(data, [xfer]);
            else nodeWorker.postMessage(data);
        },
        onMessage: (handler) => nodeWorker.on('message', handler),
        terminate: () => nodeWorker.terminate(),
    };
}
