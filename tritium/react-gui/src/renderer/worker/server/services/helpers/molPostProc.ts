import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { createDefPaintColoring } from './defPaintColoring';

const log = console;

/**
 * @param sceneUid - style scope for the default colouring. Named colours live
 *   in the scene's style set, so the scene's uid has to be threaded through;
 *   the coloring panel already passes it (coloring/applyColoring.ts).
 */
export function molPostProc(
    ctx: WorkerContext,
    mol: any,
    newObj: boolean,
    sceneUid = 0,
): void {
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
            const coloring = createDefPaintColoring(ctx, sceneUid);
            if (coloring) {
                mol.coloring = coloring;
                log.info('*** default paint coloring set');
            }
        } catch (e) {
            log.warn('set default paint coloring failed:', e);
        }
    }
}
