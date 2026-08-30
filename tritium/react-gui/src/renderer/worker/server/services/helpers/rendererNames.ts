/**
 * @file worker/server/services/helpers/rendererNames.ts
 * @description Names of an object's renderers, filtered by type.
 *
 * Mirrors UXP `cuemol.getRendNameList(obj, ...types)`. Two callers need it:
 * the disorder renderer's "Target" selector (which offers the main-chain
 * renderers of the same molecule) and renderer creation (which seeds that
 * target so a freshly created disorder overlay draws something).
 */

import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import { safeRead } from './safeRead';

/**
 * Renderer types a disorder overlay can follow (UXP `molPostProc`). The
 * inspector's Target dropdown offers the same list from the UI side
 * (`features/inspector/schema/disorder.ts`).
 */
export const DISORDER_TARGET_TYPES = ['tube', 'ribbon', 'cartoon', 'nucl'];

/**
 * Names of `obj`'s renderers whose `type_name` is in `typeNames`, in
 * attachment order. Reads defensively: a renderer that throws on any accessor
 * is skipped rather than failing the whole list.
 */
export function listRendererNamesByType(
    obj: CueObject,
    typeNames: readonly string[],
): string[] {
    const wanted = new Set(typeNames);
    const out: string[] = [];
    const count = safeRead(() => obj.getRendCount()) ?? 0;
    for (let i = 0; i < count; ++i) {
        const rend = safeRead(() => obj.getRendererByIndex(i)) as
            | (BaseWrapper & { type_name: string; name: string })
            | undefined;
        if (!rend) continue;
        const typeName = safeRead(() => rend.type_name);
        if (typeName === undefined || !wanted.has(typeName)) continue;
        const name = safeRead(() => rend.name);
        if (name) out.push(name);
    }
    return out;
}
