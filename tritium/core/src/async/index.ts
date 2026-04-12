import { AsyncCueMol } from './AsyncCueMol'
import { createNodeWorkerAdapter } from './NodeWorkerAdapter'
import type { WorkerAdapter } from './WorkerAdapter'
import { createLogger } from '@/logger';

const log = createLogger(import.meta.url);

export type { WorkerAdapter };

// Type for the Worker singleton wrapper
interface WorkerSingleton {
    value: AsyncCueMol | null;
}

// Singleton instance of CueMol
const _worker: WorkerSingleton = { value: null };

export function createCueMol(adapter?: WorkerAdapter): AsyncCueMol {
    if (_worker.value && _worker.value.isReady()) {
        log.info('cuemol already created');
        return _worker.value;
    }

    const resolvedAdapter = adapter ?? createNodeWorkerAdapter();
    _worker.value = new AsyncCueMol(resolvedAdapter);
    return _worker.value;
}
