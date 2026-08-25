// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Resolve an NPR hatch style name to umbreon's spec text (the layer editor's
// template) through the umbreon exporter's getHatchStyleSpec.
import type { WorkerContext } from '../types/WorkerContext';

export interface GetHatchStyleSpecArgs {
    style: string;
}

export type GetHatchStyleSpecResult =
    | { ok: true; spec: string }
    | { ok: false; error: string };

function getHatchStyleSpec(ctx: WorkerContext, args: GetHatchStyleSpecArgs): GetHatchStyleSpecResult {
    // Same handler the render backends create; a build without umbreon has none.
    let exporter: Record<string, unknown> | null = null;
    try {
        exporter = ctx.strMgr.createHandler('umbreon', 2) as unknown as Record<string, unknown>;
    } catch {
        exporter = null;
    }
    if (!exporter) return { ok: false, error: 'umbreon is not available in this build' };
    // Probe the method: an addon built against an older libcuemol2 lacks it.
    const fn = exporter.getHatchStyleSpec;
    if (typeof fn !== 'function') {
        return { ok: false, error: 'this build has no hatch style spec API' };
    }
    const spec = String((fn as (name: string) => string).call(exporter, args.style) ?? '');
    if (!spec) return { ok: false, error: `unknown hatch style: ${args.style}` };
    return { ok: true, spec };
}

export const services = {
    getHatchStyleSpec,
};
