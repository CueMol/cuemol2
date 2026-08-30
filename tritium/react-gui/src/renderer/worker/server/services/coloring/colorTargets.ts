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
import type { MultiGradient } from '@cuemol/core/src/wrappers/MultiGradient';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
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
 * The isosurf map renderer (C++ `xtal::MapSurfRenderer`). It is the only
 * map renderer with the MOLFANC (`colormode="molecule"`) nearest-atom
 * coloring: it carries `coloring` / `target` / `sel` and a colormode
 * enumdef that includes "solid". Keep this a type_name check -- duck-typing
 * on `target` would misfire on renderers where the property means something
 * else (e.g. DisoRenderer), and dsurface's colormode has no "solid" entry.
 */
export function isMapSurf(rend: Renderer): boolean {
    return readTypeName(rend) === 'isosurf';
}

/**
 * Duck-typed probe for the `coloring` (ColoringScheme) property on a
 * renderer or object wrapper. Mirrors UXP `'coloring' in rend`, which
 * gates the Paint/CPK/Bfac/Rainbow/Reset items and decks.
 */
export function hasColoringProp(t: unknown): boolean {
    try {
        const c = (t as { coloring?: unknown })?.coloring;
        return c !== undefined;
    } catch {
        return false;
    }
}

/**
 * Read the renderer's MOLFANC reference-molecule name (`target` property).
 * Returns null when the renderer does not expose the property (the wrapper
 * getter throws or yields a non-string).
 */
export function readMolFancTargetOrNull(rend: Renderer): string | null {
    try {
        const t = (rend as unknown as { target?: unknown }).target;
        return typeof t === 'string' ? t : null;
    } catch {
        return null;
    }
}

/**
 * Walk the scene's top-level objects and return the first MolCoord's name.
 * Returns "" when the scene has none. Same shape as
 * `elepotWriter.findFirstElePotMapName`; the class test matches the
 * client-side `objectFilters.molCoord` (h3-kit/ObjectSelect).
 */
export function findFirstMolCoordName(scene: Scene): string {
    try {
        const parsed = JSON.parse(scene.getSceneDataJSON()) as unknown;
        if (!Array.isArray(parsed)) return '';
        for (let i = 1; i < parsed.length; i++) {
            const obj = parsed[i] as { type?: string; name?: string };
            const cls = obj?.type;
            if (typeof cls !== 'string') continue;
            if (cls === 'MolCoord' || cls.endsWith('Mol')) {
                if (typeof obj.name === 'string') return obj.name;
            }
        }
    } catch {
        // Fall through to empty.
    }
    return '';
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

/**
 * Renderers whose molecule-mode colouring needs a SECOND object to read atoms
 * from -- the "Coloring mol" / "Selection mol" target.
 *
 * A molsurf renders a MolSurfObj and an isosurf a DensityMap: neither carries
 * atoms, so colouring by molecule has nothing to read until it is pointed at
 * the MolCoord the surface was generated from. That is the whole job of the
 * `target` property.
 *
 * The direct-surface renderers are not in that position. They are
 * MolRenderers attached to a MolCoord and colour from `getClientMol()`, so
 * their molecule is never in doubt; their `target` is only an event-listening
 * hook the colouring never reads. Offering a selector for it asks the user to
 * choose something that cannot matter, and writing it stores a name with no
 * effect.
 */
export function needsMolFancTarget(rend: Renderer): boolean {
    return isMolSurf(rend) || isMapSurf(rend);
}

/**
 * The values this renderer's `colormode` accepts, read off the renderer.
 *
 * `colormode` decides which colouring path a surface or map renderer takes,
 * and the set of paths differs per type -- molsurf offers solid / potential /
 * molecule / multigrad, the map renderers drop potential, and the two
 * direct-surface renderers offer only potential / molecule. Restating that
 * list here is what produced the bug this replaces: a hard-coded
 * "molsurf or isosurf" gate stopped matching reality when dsurf2 gained a
 * potential mode, so the renderer could be put into a mode nothing took it
 * out of, and every later coloring choice was written but ignored.
 *
 * Empty for a renderer with no `colormode` at all (most of them).
 */
export function readColormodeValues(rend: Renderer): readonly string[] {
    try {
        const json = (rend as unknown as { getPropsJSON?: () => string })
            .getPropsJSON?.();
        if (!json) return [];
        const raw: unknown = JSON.parse(json);
        if (!Array.isArray(raw)) return [];
        const entry = raw.find(
            (p): p is { enumdef?: unknown } =>
                typeof p === 'object' && p !== null &&
                (p as { name?: unknown }).name === 'colormode',
        );
        if (!entry || !Array.isArray(entry.enumdef)) return [];
        return entry.enumdef.map(String);
    } catch {
        return [];
    }
}

/** Surface-class renderers eligible for the Elepot deck. */
export function isElepotCapable(rend: Renderer): boolean {
    const t = readTypeName(rend);
    return t === 'molsurf' || t === 'dsurface' || t === 'dsurf2';
}

/**
 * Duck-typed read of the renderer's `multi_grad` property (MapRenderer /
 * MolSurfRenderer subclasses only). Returns null when the renderer does
 * not expose the property (the wrapper getter throws).
 */
export function getMultiGradOrNull(rend: Renderer): MultiGradient | null {
    try {
        const mg = (rend as unknown as { multi_grad?: MultiGradient })
            .multi_grad;
        return mg ?? null;
    } catch {
        return null;
    }
}

/** Renderers eligible for the Multi-gradient deck. */
export function isMultiGradCapable(rend: Renderer): boolean {
    return getMultiGradOrNull(rend) !== null;
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
