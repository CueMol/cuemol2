/**
 * @file worker/server/services/props/read.ts
 * @description Every property of one node, as the Generic tab shows it.
 *
 * The list comes from the C++ `getPropsJSON()` bridge unfiltered -- what the
 * object says it has is what the tab offers.
 */
import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { resolvePropTarget } from './target';
import { parseGenericProps } from '@renderer/worker/server/services/helpers/parseGenericProps';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import type { GenericPropEntry, PropTargetType } from '@renderer/worker/shared/genericProps';
import { resolveSelContextMol } from './selContext';
import type { GetGenericPropsArgs, GetGenericPropsResult } from './types';
/** Read + parse a target's full property list. */
export function collectProps(target: BaseWrapper): GenericPropEntry[] {
    const json = target.getPropsJSON();
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return [];
    }
    return parseGenericProps(raw);
}

/** Derive the header type label for a node. */
export function typeLabelOf(target: BaseWrapper, nodeType: PropTargetType): string {
    const rec = target as unknown as Record<string, unknown>;
    if (nodeType === 'scene') return 'Scene';
    if (nodeType === 'view') return 'View';
    if (nodeType === 'renderer' || nodeType === 'rendGroup') {
        return (safeRead(() => rec.type_name) as string | undefined) ?? 'Renderer';
    }
    // object
    return (safeRead(() => rec.className) as string | undefined) ?? 'Object';
}

export function getGenericProps(
    ctx: WorkerContext,
    args: GetGenericPropsArgs,
): GetGenericPropsResult {
    const empty: GetGenericPropsResult = {
        ok: false,
        entries: [],
        displayName: '',
        typeLabel: '',
    };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!target) return empty;

    const entries = safeRead(() => collectProps(target)) ?? [];
    // A View has no `name` property - label it generically.
    const displayName =
        args.nodeType === 'view'
            ? 'View'
            : (safeRead(() => (target as unknown as { name: string }).name) as
                  | string
                  | undefined) ?? '';

    return {
        ok: true,
        entries,
        displayName,
        typeLabel: typeLabelOf(target, args.nodeType),
        molId: resolveSelContextMol(scene, target, args.nodeType),
    };
}
