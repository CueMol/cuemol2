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
import type { WorkerContext } from '../../types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '../helpers/sceneResolver';
import { remove as styleRemove, push as stylePush } from '../helpers/styleutil';
import { makeColor } from '../helpers/makeColor';
import {
    resolveColoringTarget,
    isMolSurf,
    isElepotCapable,
    getColoringClassName,
    materializeColoringIfDefault,
} from './colorTargets';
import { findFirstElePotMapName } from './elepotWriter';
import type {
    SetRendererColoringArgs,
    SetRendererColoringResult,
    SetRendererDefaultColorArgs,
    SetRendererDefaultColorResult,
    SetColoringPropArgs,
    SetColoringPropResult,
} from './types';

/**
 * Apply a `style-XXX` coloring style.
 *
 * Steps mirror UXP:
 *   1. strip existing `*Paint$` entries from rend.style,
 *   2. push the new style name,
 *   3. on molsurf, force colormode = "molecule" (the surface ignores
 *      coloring when colormode != "molecule"),
 *   4. resetProp("coloring") so the new style's coloring takes effect,
 *   5. applyStyles(newStyle).
 */
function applyStyleColoring(rend: Renderer, styleName: string): void {
    const curStyle = rend.style ?? '';
    const stripped = styleRemove(curStyle, /Paint$/);
    const newStyle = stylePush(stripped, styleName);

    if (isMolSurf(rend)) {
        (rend as unknown as { colormode: string }).colormode = 'molecule';
    }
    rend.resetProp('coloring');
    rend.applyStyles(newStyle);
}

/**
 * Apply a `paint-type-XXX` coloring by instantiating a fresh coloring object
 * and assigning it. On molsurf, also force colormode = "molecule".
 */
function applyObjColoring(
    ctx: WorkerContext,
    rend: Renderer,
    coloringClassName: string,
): void {
    const coloring = ctx.svc.createObj(coloringClassName) as ColoringScheme;
    if (isMolSurf(rend)) {
        (rend as unknown as { colormode: string }).colormode = 'molecule';
    }
    (rend as unknown as MolRenderer).coloring = coloring;
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
            applyStyleColoring(rend, styleName);
        });
        return { ok: true };
    }

    switch (args.coloringId) {
        case 'paint-type-bfac':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'BfacColoring');
            });
            return { ok: true };
        case 'paint-type-rainbow':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'RainbowColoring');
            });
            return { ok: true };
        case 'paint-type-paint':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'PaintColoring');
            });
            return { ok: true };
        case 'paint-type-cpk':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'CPKColoring');
            });
            return { ok: true };
        case 'paint-type-solid':
        case 'paint-type-resetdef':
            // UXP `setRendColoring`: both Solid and "Reset to default" route
            // through `resetProp("coloring")`. The unknown deck then shows
            // the renderer's defaultcolor picker.
            withUndoTxn(scene, 'Reset coloring', () => {
                rend.resetProp('coloring');
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
