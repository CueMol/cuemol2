// Runs in renderer thread. Calls cross to worker via transport.invoke{Service,Method}.
import { WorkerTransport } from '../WorkerTransport';

const log = console;

export async function initCueMol(transport: WorkerTransport, sysConfigPath?: string): Promise<void> {
    log.info(`initCueMol sysConfigPath=<${sysConfigPath}>`);
    try {
        await transport.invokeMethod('initCueMol', sysConfigPath);
        log.info('initCueMol OK');
    } catch (e) {
        log.error('initCueMol failed:', e);
    }
}

export async function loadUserStyle(transport: WorkerTransport, userStylePath?: string): Promise<boolean> {
    try {
        return await transport.invokeMethod('loadUserStyle', userStylePath);
    } catch (e) {
        log.error('loadUserStyle failed:', e);
        return false;
    }
}

export async function setViewInputConfigStyle(transport: WorkerTransport, styleName: string): Promise<boolean> {
    try {
        return await transport.invokeMethod('setViewInputConfigStyle', styleName);
    } catch (e) {
        log.error('setViewInputConfigStyle failed:', e);
        return false;
    }
}

export async function terminateWorker(transport: WorkerTransport): Promise<void> {
    try {
        await transport.invokeMethod('terminateWorker');
        log.info('terminateWorker OK');
        transport.terminate();
    } catch (e) {
        log.error('terminateWorker failed:', e);
    }
}

export async function getAppInfo(transport: WorkerTransport): Promise<{ version: string; build: string }> {
    try {
        return await transport.invokeService('appInfo', {});
    } catch (e) {
        log.warn('getAppInfo failed:', e);
        return { version: '', build: '' };
    }
}
