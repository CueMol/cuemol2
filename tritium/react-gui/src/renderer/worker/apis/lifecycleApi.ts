import { WorkerTransport } from '../WorkerTransport';

const log = console;

export async function initCueMol(transport: WorkerTransport, sysConfigPath?: string): Promise<void> {
    log.info(`initCueMol sysConfigPath=<${sysConfigPath}>`);
    try {
        await transport.invokeWorker('initCueMol', sysConfigPath);
        log.info('initCueMol OK');
    } catch (e) {
        log.error('initCueMol failed:', e);
    }
}

export async function loadUserStyle(transport: WorkerTransport, userStylePath?: string): Promise<boolean> {
    try {
        const result = await transport.invokeWorker('loadUserStyle', userStylePath);
        return result[0] as boolean;
    } catch (e) {
        log.error('loadUserStyle failed:', e);
        return false;
    }
}

export async function setViewInputConfigStyle(transport: WorkerTransport, styleName: string): Promise<boolean> {
    try {
        const result = await transport.invokeWorker('setViewInputConfigStyle', styleName);
        return result[0] as boolean;
    } catch (e) {
        log.error('setViewInputConfigStyle failed:', e);
        return false;
    }
}

export async function terminateWorker(transport: WorkerTransport): Promise<void> {
    try {
        await transport.invokeWorker('terminateWorker');
        log.info('terminateWorker OK');
        transport.terminate();
    } catch (e) {
        log.error('terminateWorker failed:', e);
    }
}

export async function getAppInfo(transport: WorkerTransport): Promise<{ version: string; build: string }> {
    try {
        const result = await transport.invokeWorker('appInfo', {});
        return result?.[0] ?? { version: '', build: '' };
    } catch (e) {
        log.warn('getAppInfo failed:', e);
        return { version: '', build: '' };
    }
}
