/**
 * @file worker/server/services/helpers/defPaintColoring.ts
 * @description The app's default Paint coloring -- a `PaintColoring` seeded
 * with the four secondary-structure entries UXP `createDefPaintColoring`
 * (`renderer.js`) builds.
 *
 * Two call sites share it, which is why it lives here rather than beside
 * either: the post-load hook that paints a freshly-created molecule
 * (`molPostProc`), and the Coloring panel / renderer menu's "Paint coloring"
 * -> Default item (`setRendererColoring` with `paint-type-paint`). Building a
 * bare `PaintColoring` there instead left the paint table empty, so the entry
 * looked like it had done nothing.
 *
 * Each molecule is painted in one colour family: the n-th molecule of the
 * scene (in load order) takes the palette colour `palette_n`, cycling, and
 * the other structures' colours are that colour with a modifier: helix and
 * sheet take it as it is (their shapes tell them apart), the nucleic acid
 * shifts its hue (`palette_2{mod_h:15}`), and the coil is washed out to near
 * white. A difference in brightness alone does not read as another colour in
 * 3D, where the shading already varies it; a hue difference does.
 *
 * The palette's values are global named colours in `data/default_style.xml`
 * (the Okabe-Ito set), and building the painting copies them into the
 * scene's own style set first (`ensureScenePalette`). The scene file then
 * carries the definitions with the names that refer to them, so an older
 * CueMol that has no such global names still resolves them, and changing the
 * global values later leaves a saved scene as it was. Recolouring a scene is
 * an edit of its palette; swapping in another palette set is the same edit.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { makeSel } from './makeSel';
import { makeColor } from './makeColor';
import { ensureWritableSceneSet } from '@renderer/worker/server/services/select/saveSelDef';
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects';

const log = console;

/** The palette colours, by name; the n-th molecule takes the n-th (cycling). */
const PALETTE: readonly string[] = [1, 2, 3, 4, 5, 6, 7].map((n) => `palette_${n}`);

/**
 * Selection -> how its colour derives from the molecule's palette colour, in
 * UXP's order. NamedColor modifiers: a hue shift in degrees, saturation and
 * brightness as offsets (clamped to 0-1). A hue shift is written positive
 * (350 for -10): C++ wraps the hue with fmod, which leaves a negative one
 * negative.
 */
const DEFAULT_PAINT_ENTRIES: { sel: string; modifier: string }[] = [
    { sel: 'sheet', modifier: '' },
    { sel: 'helix', modifier: '' },
    { sel: 'nucleic', modifier: '{mod_h:15}' },
    { sel: '*', modifier: '{mod_s:-0.6;mod_b:0.1}' },
];

/** `#rrggbb` from 0-255 components. */
function toHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((v) => (v & 0xff).toString(16).padStart(2, '0')).join('');
}

/**
 * Define in the scene's own style set each palette colour the scene does not
 * define yet, with the value of its global definition. A definition already
 * there (the user's recolouring, or a loaded scene's) is left as it is. Call
 * inside an undo txn: it may make the style set.
 */
function ensureScenePalette(ctx: WorkerContext, sceneUid: number): void {
    const styleMgr = ctx.styleMgr;
    let defined: string[] = [];
    try {
        // The scene scope's names only; the global ones are listed apart.
        defined = JSON.parse(styleMgr.getColorDefsJSON(sceneUid)) as string[];
    } catch {
        defined = [];
    }
    const missing = PALETTE.filter((n) => !defined.includes(n));
    if (missing.length === 0) return;
    const setId = ensureWritableSceneSet(ctx, sceneUid);
    if (setId === null) return;
    for (const name of missing) {
        let hex: string;
        try {
            // Scope 0 is the global one (qlib::invalid_uid).
            const global = styleMgr.getColor(name, 0);
            hex = toHex(global.r(), global.g(), global.b());
        } catch (e) {
            // No global definition: the paint shows the name unresolved.
            log.warn(`palette colour "${name}" is not defined:`, e);
            continue;
        }
        styleMgr.setColor(name, makeColor(ctx, hex, sceneUid), sceneUid, setId);
    }
}

/**
 * The palette colour of a molecule: by its place among the scene's molecules
 * in load order (uid order), so the n-th molecule loaded takes the n-th
 * colour, and painting the same molecule again gives the same one.
 */
function paletteColorOf(ctx: WorkerContext, sceneUid: number, molUid: number): string {
    const mols = listSceneObjects(ctx, { sceneId: sceneUid }).objects
        .filter((o) => o.className === 'MolCoord' || o.className.endsWith('Mol'))
        .map((o) => o.uid)
        .sort((x, y) => x - y);
    const index = Math.max(0, mols.indexOf(molUid));
    return PALETTE[index % PALETTE.length];
}

/**
 * Build a `PaintColoring` carrying the default painting of one molecule.
 *
 * @param ctx - worker context.
 * @param sceneUid - scene scope for compiling the selections and named
 *   colours. Required: a scene-local name compiled in the global scope
 *   (uid 0) silently fails to resolve, and every caller has a scene in hand,
 *   so a default here would only make that mistake reachable.
 * @param molUid - the molecule painted, which picks its palette colour.
 * @returns the coloring, or null when the object or any selection could not be
 *   built (the caller then leaves the renderer's coloring alone).
 */
export function createDefPaintColoring(
    ctx: WorkerContext,
    sceneUid: number,
    molUid: number,
): PaintColoring | null {
    const coloring = ctx.svc.createObj('PaintColoring') as PaintColoring;
    if (!coloring) return null;
    ensureScenePalette(ctx, sceneUid);
    const base = paletteColorOf(ctx, sceneUid, molUid);
    for (const entry of DEFAULT_PAINT_ENTRIES) {
        const sel = makeSel(ctx, entry.sel, sceneUid);
        if (!sel) return null;
        coloring.append(sel, makeColor(ctx, base + entry.modifier, sceneUid));
    }
    return coloring;
}
