/**
 * @file renderer/worker/client/apis/lifecycleApi.ts
 * @description Renderer-thread thin wrappers for worker lifecycle calls
 * (init / user-style load / view-input style / terminate / app info).
 * Each function returns a Promise resolved with the worker reply and
 * swallows transport errors with a logged warning.
 */
import { WorkerTransport } from '../WorkerTransport';

const log = console;

/**
 * Boot the worker-side CueMol runtime by loading `sysconfig.xml`.
 *
 * @param transport - Worker transport.
 * @param sysConfigPath - Absolute path to `sysconfig.xml`. Defaults to the
 *   worker-side baked-in path when omitted.
 */
export async function initCueMol(transport: WorkerTransport, sysConfigPath?: string): Promise<void> {
    log.info(`initCueMol sysConfigPath=<${sysConfigPath}>`);
    try {
        await transport.invokeMethod('initCueMol', sysConfigPath);
        log.info('initCueMol OK');
    } catch (e) {
        log.error('initCueMol failed:', e);
    }
}

/**
 * Apply a user style sheet (XML) to the running scene manager.
 *
 * @param transport - Worker transport.
 * @param userStylePath - Absolute path to the user style XML. May be
 *   omitted to apply the built-in default.
 * @returns `true` on success, `false` on transport failure.
 */
export async function loadUserStyle(transport: WorkerTransport, userStylePath?: string): Promise<boolean> {
    try {
        return await transport.invokeMethod('loadUserStyle', userStylePath);
    } catch (e) {
        log.error('loadUserStyle failed:', e);
        return false;
    }
}

/**
 * Switch the renderer's view-input style (e.g. mouse-button bindings).
 *
 * @param transport - Worker transport.
 * @param styleName - Registered input-style name.
 * @returns `true` if accepted by the worker, `false` on failure.
 */
export async function setViewInputConfigStyle(transport: WorkerTransport, styleName: string): Promise<boolean> {
    try {
        return await transport.invokeMethod('setViewInputConfigStyle', styleName);
    } catch (e) {
        log.error('setViewInputConfigStyle failed:', e);
        return false;
    }
}

/**
 * Tell the worker to shut down and then terminate the underlying Web
 * Worker handle.
 *
 * @param transport - Worker transport (terminated after the reply).
 */
export async function terminateWorker(transport: WorkerTransport): Promise<void> {
    try {
        await transport.invokeMethod('terminateWorker');
        log.info('terminateWorker OK');
        transport.terminate();
    } catch (e) {
        log.error('terminateWorker failed:', e);
    }
}

/**
 * Fetch the running app's version / build metadata from the worker.
 *
 * @param transport - Worker transport.
 * @returns Object `{ version, build }`; both empty strings on failure.
 */
export async function getAppInfo(transport: WorkerTransport): Promise<{ version: string; build: string }> {
    try {
        return await transport.invokeService('appInfo', {});
    } catch (e) {
        log.warn('getAppInfo failed:', e);
        return { version: '', build: '' };
    }
}
