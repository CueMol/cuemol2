// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import type { NewRendererCommand } from '@cuemol/core/src/wrappers/NewRendererCommand';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { RendererOptions } from '../../../components/fopen-opt-dlgs/types';
import { getDefaultStyleName } from './helpers/getDefaultStyleName';
import { makeSel } from './helpers/makeSel';
import { molPostProc } from './helpers/molPostProc';

const log = console;

const NON_MOL_CLASSES = ['ElePotMap', 'MolSurfObj', 'DensityMap'];

export function setupRenderer(
    ctx: WorkerContext,
    mol: any,
    rendOpts: RendererOptions,
): Renderer | null {
    const cmd = ctx.cmdMgr.getCmd('new_renderer') as NewRendererCommand;
    cmd.target_object = mol;
    cmd.renderer_type = rendOpts.rendererType;
    cmd.renderer_name = rendOpts.rendererName;
    cmd.recenter_view = rendOpts.centerView;
    cmd.default_style_name = getDefaultStyleName(rendOpts.rendererType);
    cmd.run();
    const rend = cmd.result_renderer as Renderer | null;
    log.info('renderer created: rend=', rend);
    if (!rend) return null;

    const className = mol.getClassName();
    if (!NON_MOL_CLASSES.includes(className)) {
        molPostProc(ctx, mol, true);

        if (rendOpts.selectionEnabled && rendOpts.selection && rendOpts.selection !== '*') {
            const sel = makeSel(ctx, rendOpts.selection);
            if (sel) {
                (rend as unknown as MolRenderer).sel = sel;
            } else {
                log.warn(`selection compile failed: ${rendOpts.selection}`);
            }
        }
    }
    return rend;
}
