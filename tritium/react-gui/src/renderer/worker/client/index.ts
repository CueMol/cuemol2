/**
 * @file renderer/worker/client/index.ts
 * @description Renderer-side singleton entry point for the worker bridge.
 * Holds a single `AsyncCueMol` instance per renderer process and hands the
 * same one back to every caller.
 */
import { AsyncCueMol } from './AsyncCueMol'
import { createLogger } from "@/logger";

const log = createLogger(import.meta.url);

/** Renderer-process-wide singleton wrapper around `AsyncCueMol`. */
interface WorkerSingleton {
    value: AsyncCueMol | null;
}

const _worker: WorkerSingleton = { value: null };

/**
 * Return the renderer-process `AsyncCueMol` instance, creating it on first
 * call. Subsequent calls return the existing instance when it is still
 * ready, otherwise a fresh one is constructed.
 *
 * @returns The shared `AsyncCueMol` instance.
 */
export function createCueMol(): AsyncCueMol {
    if (_worker.value && _worker.value.isReady()) {
        log.info('cuemol already created');
        return _worker.value;
    }

    _worker.value = new AsyncCueMol();
    return _worker.value;
}
