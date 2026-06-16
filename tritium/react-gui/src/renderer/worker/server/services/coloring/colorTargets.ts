/**
 * @file worker/server/services/coloring/colorTargets.ts
 * @description Shared low-level helpers for the Coloring / Paint services:
 * target resolution (object vs renderer), renderer type / coloring-class
 * probes, mol-selection reads, the `materializeColoringIfDefault` undo
 * helper, and the Paint-CRUD prologue.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../../types/WorkerContext';
import { getSceneOrNull } from '../helpers/sceneResolver';
import type { ColoringTargetKind } from './types';

/**
 * Resolve a coloring target (object or renderer) to a single wrapper that
 * exposes the `coloring` / `defaultcolor` / `resetProp` interface.
 */
export function resolveColoringTarget(
    scene: Scene,
    kind: ColoringTargetKind | undefined,
    id: number,
): Renderer | null {
    if (kind === 'object') {
        return (scene.getObject(id) as unknown as Renderer | null) ?? null;
    }
    return (scene.getRenderer(id) as Renderer | null) ?? null;
}

export function isMolSurf(rend: Renderer): boolean {
    try {
        return (rend as unknown as { type_name: string }).type_name === 'molsurf';
    } catch {
        return false;
    }
}

/**
 * Read `type_name` from a renderer; returns "" for wrappers that don't expose
 * the field (e.g. some renderer groups, or non-renderer objects).
 */
export function readTypeName(rend: Renderer): string {
    try {
        const t = (rend as unknown as { type_name?: unknown }).type_name;
        return typeof t === 'string' ? t : '';
    } catch {
        return '';
    }
}

/** Surface-class renderers eligible for the Elepot deck. */
export function isElepotCapable(rend: Renderer): boolean {
    const t = readTypeName(rend);
    return t === 'molsurf' || t === 'dsurface' || t === 'dsurf2';
}

export function getColoringClassName(rend: Renderer): string {
    try {
        const c = (rend as unknown as MolRenderer).coloring;
        if (!c) return '';
        return c.getClassName();
    } catch {
        return '';
    }
}

export function getObjectColoringClassName(mol: MolCoord): string {
    try {
        const c = (mol as unknown as { coloring: ColoringScheme | null }).coloring;
        if (!c) return '';
        return c.getClassName();
    } catch {
        return '';
    }
}

export function getMolFromRenderer(rend: Renderer): MolCoord | null {
    try {
        const client = rend.getClientObj();
        return (client as unknown as MolCoord | null) ?? null;
    } catch {
        return null;
    }
}

export function getMolSel(mol: MolCoord): MolSelection | null {
    try {
        return mol.sel ?? null;
    } catch {
        return null;
    }
}

export function isSelEmpty(sel: MolSelection): boolean {
    try {
        // `MolSelection.isEmpty()` matches UXP's `sel.isEmpty()` gate.
        const isEmpty = (sel as unknown as { isEmpty?: () => boolean }).isEmpty;
        return typeof isEmpty === 'function' ? isEmpty.call(sel) : false;
    } catch {
        return false;
    }
}

export function getPaintColoring(rend: Renderer): PaintColoring | null {
    if (getColoringClassName(rend) !== 'PaintColoring') return null;
    try {
        return (rend as unknown as MolRenderer).coloring as PaintColoring;
    } catch {
        return null;
    }
}

/**
 * Mirror UXP `if (rend._wrapped.isPropDefault("coloring")) rend.coloring = coloring`.
 *
 * When the renderer's `coloring` property is still at its style-inherited
 * default value, the wrapper returns a shared `ColoringScheme` instance.
 * Mutating that shared object would either leak into other renderers or
 * be silently discarded on the next reload. Re-assigning the same value
 * back through the setter materializes a per-renderer non-default copy
 * so subsequent mutations stick. Must be called inside the same undo
 * transaction as the mutation.
 */
export function materializeColoringIfDefault(rend: Renderer): void {
    try {
        if (rend.hasPropDefault('coloring')) {
            const coloring = (rend as unknown as MolRenderer).coloring;
            (rend as unknown as MolRenderer).coloring = coloring;
        }
    } catch {
        // hasPropDefault throws for renderers without the property; if it
        // throws we wouldn't have reached here (getPaintColoring would
        // have failed earlier), so swallow defensively and proceed.
    }
}

/**
 * Resolved context for a Paint-CRUD mutation: scene, target renderer, and
 * its live PaintColoring. Returned by `resolvePaintTarget`.
 */
export interface PaintTarget {
    scene: Scene;
    rend: Renderer;
    coloring: PaintColoring;
}

/**
 * Shared prologue for the Paint-CRUD mutations (add/remove/update/move).
 *
 * Resolves the scene and coloring target and gates on the target carrying a
 * live `PaintColoring`; returns `null` when any step fails so the caller can
 * `return { ok: false }`. Does NOT open the undo txn or materialize the
 * coloring - those happen inside each mutation's `withUndoTxn` body so that
 * `materializeColoringIfDefault` stays within the mutation's transaction.
 */
export function resolvePaintTarget(
    ctx: WorkerContext,
    args: { sceneId: number; rendId: number; targetKind?: ColoringTargetKind },
): PaintTarget | null {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return null;
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return null;
    const coloring = getPaintColoring(rend);
    if (!coloring) return null;
    return { scene, rend, coloring };
}
