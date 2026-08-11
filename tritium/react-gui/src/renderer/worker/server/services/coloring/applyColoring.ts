/**
 * @file worker/server/services/coloring/applyColoring.ts
 * @description Coloring-application services: apply a coloring style /
 * scheme from a submenu selection (`setRendererColoring`), write the Solid
 * deck's default color (`setRendererDefaultColor`), and the generic
 * CPK/Rainbow/Bfac scheme-property writer (`setColoringProp`).
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../../types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '../helpers/sceneResolver';
import { remove as styleRemove, push as stylePush } from '../helpers/styleutil';
import { makeColor } from '../helpers/makeColor';
import {
    resolveColoringTarget,
    isMolSurf,
    isMapSurf,
    isElepotCapable,
    isMultiGradCapable,
    getMultiGradOrNull,
    getColoringClassName,
    materializeColoringIfDefault,
    readMolFancTargetOrNull,
    findFirstMolCoordName,
} from './colorTargets';
import { findFirstElePotMapName } from './elepotWriter';
import {
    findFirstScalarMapName,
    getColorMapObjOrNull,
    readMapStats,
} from './multiGrad';
import { buildPresetNodes } from '../../../../components/multigrad/multiGradPresets';
import type {
    SetRendererColoringArgs,
    SetRendererColoringResult,
    SetRendererDefaultColorArgs,
    SetRendererDefaultColorResult,
    SetColoringPropArgs,
    SetColoringPropResult,
    SetRendererColoringTargetArgs,
    SetRendererColoringTargetResult,
} from './types';

/**
 * Force `colormode = "molecule"` on renderers whose coloring only applies
 * in molecule mode (molsurf's MOLFANC, and the isosurf map renderer's
 * nearest-atom coloring). On these renderers the MOLFANC path also needs a
 * reference molecule, so when `target` is still empty the scene's first
 * MolCoord is picked as a sensible default (mirrors the elepot default in
 * `paint-type-elepot`). No-op for every other renderer.
 */
function forceMoleculeColormode(scene: Scene, rend: Renderer): void {
    if (!isMolSurf(rend) && !isMapSurf(rend)) return;
    (rend as unknown as { colormode: string }).colormode = 'molecule';
    const target = readMolFancTargetOrNull(rend);
    if (target === '') {
        const name = findFirstMolCoordName(scene);
        if (name) {
            (rend as unknown as { target: string }).target = name;
        }
    }
}

/**
 * Apply a `style-XXX` coloring style.
 *
 * Steps mirror UXP:
 *   1. strip existing `*Paint$` entries from rend.style,
 *   2. push the new style name,
 *   3. on molsurf / isosurf, force colormode = "molecule" (the surface
 *      ignores coloring when colormode != "molecule"),
 *   4. resetProp("coloring") so the new style's coloring takes effect,
 *   5. applyStyles(newStyle).
 */
function applyStyleColoring(scene: Scene, rend: Renderer, styleName: string): void {
    const curStyle = rend.style ?? '';
    const stripped = styleRemove(curStyle, /Paint$/);
    const newStyle = stylePush(stripped, styleName);

    forceMoleculeColormode(scene, rend);
    rend.resetProp('coloring');
    rend.applyStyles(newStyle);
}

/**
 * Apply a `paint-type-XXX` coloring by instantiating a fresh coloring object
 * and assigning it. On molsurf / isosurf, also force colormode = "molecule".
 */
function applyObjColoring(
    ctx: WorkerContext,
    scene: Scene,
    rend: Renderer,
    coloringClassName: string,
): void {
    const coloring = ctx.svc.createObj(coloringClassName) as ColoringScheme;
    forceMoleculeColormode(scene, rend);
    (rend as unknown as MolRenderer).coloring = coloring;
}

/** Scene wrapper type for the multigrad helpers below. */
type SceneW = Parameters<typeof findFirstScalarMapName>[0];

/**
 * Default color-map name for a renderer switching to multigrad: a map
 * renderer colors by its own client map; any other renderer (molsurf)
 * falls back to the scene's first scalar map.
 */
function defaultColorMapName(scene: SceneW, rend: Renderer): string {
    try {
        const client = rend.getClientObj();
        if (client) {
            const cls = client.getClassName();
            if (cls === 'DensityMap' || cls === 'ElePotMap') {
                return (client as unknown as { name: string }).name ?? '';
            }
        }
    } catch {
        // fall through to the scene-wide search
    }
    return findFirstScalarMapName(scene);
}

/**
 * Seed a heatmap gradient when the renderer's gradient is empty and its
 * color map resolves. Deviation from UXP (which left the gradient empty
 * until the modal editor was opened): with live in-panel editing, an empty
 * gradient would render the whole surface black on switch.
 */
function seedEmptyGradient(rend: Renderer): void {
    const mg = getMultiGradOrNull(rend);
    if (!mg) return;
    try {
        if (mg.size > 0) return;
    } catch {
        return;
    }
    const mapObj = getColorMapObjOrNull(rend);
    if (!mapObj) return;
    const stats = readMapStats(mapObj);
    if (!stats) return;
    const nodes = buildPresetNodes('heatmap1', stats);
    if (!nodes) return;
    mg.setNodesJSON(JSON.stringify(nodes));
}

/**
 * Apply a coloring to a renderer from a Coloring-submenu selection.
 *
 * `style-XXX` ids (both static items and dynamic Paint(SS) entries) route
 * through `applyStyleColoring`; `paint-type-XXX` ids instantiate a fresh
 * coloring object. Wrapped in an undo transaction.
 */
export function setRendererColoring(
    ctx: WorkerContext,
    args: SetRendererColoringArgs,
): SetRendererColoringResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };

    // style-* ids share one handler: static and dynamic Paint(SS) entries
    // both flow through the same applyStyles path. Objects have no
    // `applyStyles` so the style path is renderer-only.
    if (args.coloringId.startsWith('style-')) {
        if (args.targetKind === 'object') return { ok: false };
        const styleName = args.coloringId.substring('style-'.length);
        if (!styleName) return { ok: false };
        withUndoTxn(scene, 'Change coloring style', () => {
            applyStyleColoring(scene, rend, styleName);
        });
        return { ok: true };
    }

    switch (args.coloringId) {
        case 'paint-type-bfac':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, scene, rend, 'BfacColoring');
            });
            return { ok: true };
        case 'paint-type-rainbow':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, scene, rend, 'RainbowColoring');
            });
            return { ok: true };
        case 'paint-type-paint':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, scene, rend, 'PaintColoring');
            });
            return { ok: true };
        case 'paint-type-cpk':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, scene, rend, 'CPKColoring');
            });
            return { ok: true };
        case 'paint-type-solid':
            // UXP `setRendColoring`: Solid routes through
            // `resetProp("coloring")`; the unknown deck then shows the
            // renderer's defaultcolor picker. On the isosurf map renderer
            // the mesh color is governed by colormode, so also switch it
            // back to "solid" -- otherwise the MOLFANC nearest-atom path
            // keeps overriding the solid color.
            withUndoTxn(scene, 'Reset coloring', () => {
                rend.resetProp('coloring');
                if (isMapSurf(rend)) {
                    (rend as unknown as { colormode: string }).colormode = 'solid';
                }
            });
            return { ok: true };
        case 'paint-type-resetdef':
            // "Reset to default style": restore the style-inherited coloring.
            // On isosurf also reset colormode to its default ("solid") so the
            // renderer returns to its true default state.
            withUndoTxn(scene, 'Reset coloring', () => {
                rend.resetProp('coloring');
                if (isMapSurf(rend)) {
                    rend.resetProp('colormode');
                }
            });
            return { ok: true };
        case 'paint-type-multigrad':
            // Switch a map / surface renderer to multi-gradient coloring.
            // Steps (one txn): (1) default `color_mapname` when empty -- a
            // map renderer colors by its own client map, a surface renderer
            // by the scene's first scalar map; (2) colormode = "multigrad";
            // (3) deviation from UXP: seed a heatmap gradient when the
            // gradient is empty, so the live (non-modal) switch does not
            // paint everything black.
            if (!isMultiGradCapable(rend)) return { ok: false };
            withUndoTxn(scene, 'Change to multi gradient coloring', () => {
                const r = rend as unknown as {
                    color_mapname: string;
                    colormode: string;
                };
                if (!r.color_mapname) {
                    const defName = defaultColorMapName(scene, rend);
                    if (defName) r.color_mapname = defName;
                }
                r.colormode = 'multigrad';
                seedEmptyGradient(rend);
            });
            return { ok: true };
        case 'paint-type-elepot':
            // UXP `setDefaultElepot`: only valid for molsurf / dsurface.
            // Switches `colormode = "potential"` and, when the renderer has
            // no `elepot` yet, picks the first ElePotMap in the scene as a
            // sensible default. Mirrors `setDefaultElepot` in coloring-panel.js.
            if (!isElepotCapable(rend)) return { ok: false };
            withUndoTxn(scene, 'Change to elepot coloring', () => {
                const r = rend as unknown as {
                    colormode: string;
                    elepot: string;
                };
                if (!r.elepot) {
                    const defName = findFirstElePotMapName(ctx, scene);
                    if (defName) r.elepot = defName;
                }
                r.colormode = 'potential';
            });
            return { ok: true };
        default:
            // Defensive - typed contract prevents reaching here at compile
            // time, but template-literal widening (`style-${string}`) leaks
            // through the narrowed default branch.
            return { ok: false };
    }
}

/**
 * Solid-deck color picker: write the renderer's `defaultcolor` property.
 */
export function setRendererDefaultColor(
    ctx: WorkerContext,
    args: SetRendererDefaultColorArgs,
): SetRendererDefaultColorResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };

    const color = makeColor(ctx, args.colorValue, scene.uid);
    withUndoTxn(scene, 'Change default color', () => {
        (rend as unknown as { defaultcolor: AbstractColor }).defaultcolor = color;
    });
    return { ok: true };
}

/**
 * Property names whose value is a CueMol colour string and must be
 * compiled through `makeColor` before being assigned. Keep this set
 * tight: every entry was confirmed against the UXP `coloring-panel.js`
 * commit sites (`onCPKColChanged`, `onBfacChange` `lowcol`/`highcol`).
 */
const COLOR_VALUED_PROPS = new Set<string>([
    'col_C', 'col_N', 'col_O', 'col_S', 'col_P', 'col_H', 'col_X',
    'lowcol', 'highcol',
]);

/**
 * Mirror UXP `commitPropChange`: open an undo txn, materialize the
 * renderer's coloring if still style-default, then assign one property
 * on the active ColoringScheme.
 *
 * Used by the CPK / Rainbow / Bfac decks. Paint deck CRUD has dedicated
 * services (`addPaintEntry`, ...) because it mutates list items rather
 * than scalar properties.
 */
export function setColoringProp(
    ctx: WorkerContext,
    args: SetColoringPropArgs,
): SetColoringPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    if (getColoringClassName(rend) === '') return { ok: false };

    // For colour-valued props, compile the string into an AbstractColor
    // wrapper and pass the raw `.wrapped` native object -- this mirrors
    // UXP `commitPropChange` which passes `color._wrapped` directly.
    // For non-colour props (mode/incr_mode/auto strings, sliders/params
    // numbers), forward the value as-is.
    let value: unknown = args.propValue;
    if (COLOR_VALUED_PROPS.has(args.propName) && typeof args.propValue === 'string') {
        const ac = makeColor(ctx, args.propValue, scene.uid);
        value = ac.wrapped;
    }

    withUndoTxn(scene, 'Change coloring property', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring;
        if (!live) return;
        live.setProp(args.propName, value);
    });
    return { ok: true };
}

/**
 * Write the MOLFANC reference-molecule name (`target` property) on a
 * renderer. Drives the Coloring panel's "Coloring mol" selector shown in
 * molecule colormode. Refuses on renderers without the `target` property.
 */
export function setRendererColoringTarget(
    ctx: WorkerContext,
    args: SetRendererColoringTargetArgs,
): SetRendererColoringTargetResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    if (readMolFancTargetOrNull(rend) === null) return { ok: false };

    withUndoTxn(scene, 'Change coloring target', () => {
        // `target` lives directly on the renderer's native wrapper; use the
        // setProp escape hatch (same shape as setRendererElepotProp).
        (rend as unknown as { setProp: (n: string, v: unknown) => void })
            .setProp('target', args.targetName);
    });
    return { ok: true };
}
