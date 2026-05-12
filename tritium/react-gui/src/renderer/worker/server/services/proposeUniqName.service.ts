// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export type ProposeUniqNameArgs =
    | { kind: 'scene'; prefix: string }
    | { kind: 'view'; prefix: string; sceneId: number }
    | { kind: 'object'; prefix: string; sceneId: number }
    | { kind: 'renderer'; prefix: string; sceneId: number; molId: number }
    | { kind: 'sceneRenderer'; prefix: string; sceneId: number }
    | { kind: 'styleSet'; prefix: string; sceneId: number };

export interface ProposeUniqNameResult {
    name: string;
}

const MAX_ITER = 9999;

function proposeUniqName(ctx: WorkerContext, args: ProposeUniqNameArgs): ProposeUniqNameResult {
    const { prefix } = args;

    let tryFunc: (name: string) => unknown;

    switch (args.kind) {
        case 'scene': {
            tryFunc = (name) => ctx.sceMgr.getSceneByName(name);
            break;
        }
        case 'view': {
            const scene = ctx.sceMgr.getScene(args.sceneId);
            if (!scene) {
                return { name: prefix + '1' };
            }
            tryFunc = (name) => scene.getViewByName(name);
            break;
        }
        case 'object': {
            const scene = ctx.sceMgr.getScene(args.sceneId);
            if (!scene) {
                return { name: prefix + '1' };
            }
            tryFunc = (name) => scene.getObjectByName(name);
            break;
        }
        case 'renderer': {
            const scene = ctx.sceMgr.getScene(args.sceneId);
            if (!scene) {
                return { name: prefix + '1' };
            }
            const mol = scene.getObject(args.molId);
            if (!mol) {
                return { name: prefix + '1' };
            }
            tryFunc = (name) => (mol as any).getRendererByName(name);
            break;
        }
        case 'sceneRenderer': {
            const scene = ctx.sceMgr.getScene(args.sceneId);
            if (!scene) {
                return { name: prefix + '1' };
            }
            // Scene-wide rendgroup naming: matches UXP `onNewRendGrp`'s
            // `scene.getRendByName` lookup so group names don't collide
            // with sibling renderers on other objects.
            tryFunc = (name) => scene.getRendByName(name);
            break;
        }
        case 'styleSet': {
            // StyleManager.hasStyleSet returns 0 when no set exists for
            // the (name, scope) pair, matching UXP `createStyle`'s loop.
            const mgr = ctx.svc.getService('StyleManager') as unknown as
                | { hasStyleSet: (name: string, scopeId: number) => number }
                | null;
            if (!mgr) return { name: prefix + '_0' };
            tryFunc = (name) =>
                mgr.hasStyleSet(name, args.sceneId) === 0 ? null : { __taken: true };
            // UXP starts at `style_0`; mirror that by using underscore.
            for (let i = 0; i <= MAX_ITER; ++i) {
                const candidate = `${prefix}_${i}`;
                const existing = tryFunc(candidate);
                if (existing === null || existing === undefined) {
                    return { name: candidate };
                }
            }
            return { name: `${prefix}_${Date.now()}` };
        }
    }

    for (let i = 1; i <= MAX_ITER; ++i) {
        const candidate = prefix + i.toString();
        const existing = tryFunc(candidate);
        if (existing === null || existing === undefined) {
            return { name: candidate };
        }
    }

    // Fallback: should not happen in practice
    return { name: prefix + Date.now().toString() };
}

export const services = { proposeUniqName };
