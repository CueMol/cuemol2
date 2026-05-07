import type { WorkerContext } from '../../types/WorkerContext';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import { makeSel } from './makeSel';
import { makeColor } from './makeColor';

const log = console;

function createDefPaintColoring(ctx: WorkerContext): PaintColoring | null {
    const coloring = ctx.svc.createObj('PaintColoring') as PaintColoring;
    if (!coloring) return null;
    const selSheet = makeSel(ctx, 'sheet');
    const selHelix = makeSel(ctx, 'helix');
    const selNucleic = makeSel(ctx, 'nucleic');
    const selAll = makeSel(ctx, '*');
    if (!selSheet || !selHelix || !selNucleic || !selAll) return null;
    coloring.append(selSheet, makeColor(ctx, 'SteelBlue'));
    coloring.append(selHelix, makeColor(ctx, 'khaki'));
    coloring.append(selNucleic, makeColor(ctx, 'yellow'));
    coloring.append(selAll, makeColor(ctx, 'FloralWhite'));
    return coloring;
}

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
