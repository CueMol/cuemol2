import { AsyncCueMol } from './AsyncCueMol'
import { createLogger } from "@/logger";

const log = createLogger(import.meta.url);

// Type for the Worker singleton wrapper
interface WorkerSingleton {
    value: AsyncCueMol | null;
}

// Singleton instance of CueMol
const _worker: WorkerSingleton = { value: null };

export function createCueMol(): AsyncCueMol {
    if (_worker.value && _worker.value.isReady()) {
        log.info('cuemol already created');
        return _worker.value;
    }

    _worker.value = new AsyncCueMol();
    return _worker.value;
}
