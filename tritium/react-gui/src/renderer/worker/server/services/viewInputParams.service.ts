// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// App-level view-input scalars (turntable-rotation sensitivity `tbrad` and
// pick precision `hitprec`), backed by the global singleton ViewInputConfig
// service (UXP `config-mouse.js` parity). Mirrors UXP's two-step write: set the
// live singleton AND persist into the "user" style set under "UserViewConf.*"
// so the value survives across sessions (saved to the user style file on
// window close; re-applied at startup when the input style is set).
//
// tbrad / hitprec are properties of the singleton, so they are global -- one
// setter affects all views. No undo transaction (global app config).

import type { WorkerContext } from '../types/WorkerContext';
import type { ViewInputConfig } from '@cuemol/core/src/wrappers/ViewInputConfig';

const log = console;

const GLOBAL_SCOPE = 0;
const WRITE_SET = 'user';
const STYLE = 'UserViewConf';

export interface ViewInputParams {
    tbrad: number;
    hitprec: number;
}

export interface ViewInputParamsResult {
    ok: boolean;
    params: ViewInputParams;
}

export interface SetViewInputParamsArgs {
    tbrad?: number;
    hitprec?: number;
}

const FALLBACK: ViewInputParams = { tbrad: 0.8, hitprec: 10.0 };

function getVic(ctx: WorkerContext): ViewInputConfig | null {
    return ctx.svc.getService('ViewInputConfig') as ViewInputConfig | null;
}

function getViewInputParams(ctx: WorkerContext, _args: Record<string, never>): ViewInputParamsResult {
    const vic = getVic(ctx);
    if (!vic) {
        log.warn('getViewInputParams: ViewInputConfig unavailable');
        return { ok: false, params: FALLBACK };
    }
    try {
        return { ok: true, params: { tbrad: vic.tbrad, hitprec: vic.hitprec } };
    } catch (e) {
        log.warn('getViewInputParams read failed:', e);
        return { ok: false, params: FALLBACK };
    }
}

/**
 * Set the provided scalars on the live singleton and persist them into the
 * "user" style set. Ignores non-positive / non-finite values (UXP `newval>0`
 * guard).
 */
function setViewInputParams(ctx: WorkerContext, args: SetViewInputParamsArgs): { ok: boolean } {
    const vic = getVic(ctx);
    if (!vic) {
        log.error('setViewInputParams: ViewInputConfig unavailable');
        return { ok: false };
    }
    const valid = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
    try {
        if (valid(args.tbrad)) {
            vic.tbrad = args.tbrad;
            ctx.styleMgr.setStyleValue(GLOBAL_SCOPE, WRITE_SET, `${STYLE}.tbrad`, String(args.tbrad));
        }
        if (valid(args.hitprec)) {
            vic.hitprec = args.hitprec;
            ctx.styleMgr.setStyleValue(GLOBAL_SCOPE, WRITE_SET, `${STYLE}.hitprec`, String(args.hitprec));
        }
        return { ok: true };
    } catch (e) {
        log.error('setViewInputParams failed:', e);
        return { ok: false };
    }
}

export const services = { getViewInputParams, setViewInputParams };
