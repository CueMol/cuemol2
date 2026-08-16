import type { WorkerContext } from '../../types/WorkerContext';
import { createDefPaintColoring } from './defPaintColoring';

const log = console;

export function molPostProc(ctx: WorkerContext, mol: any, newObj: boolean): void {
    try {
        const selRend = mol.getRendererByType('*selection');
        if (!selRend) {
            mol.createRenderer('*selection');
        }
    } catch (e) {
        log.warn('autoCreateSelRend failed:', e);
    }

    if (newObj) {
        try {
            const coloring = createDefPaintColoring(ctx);
            if (coloring) {
                mol.coloring = coloring;
                log.info('*** default paint coloring set');
            }
        } catch (e) {
            log.warn('set default paint coloring failed:', e);
        }
    }
}
