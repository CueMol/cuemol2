// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Backs the colour-picker widget (ports UXP `colpicker.js` StyleManager
// usage): compiling colour strings to RGB + gamut info, and listing the
// named colours defined for a scene plus the global scope.
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { WorkerContext } from '../types/WorkerContext';

// --- compileColor ---

export interface CompileColorArgs {
    /** CueMol colour string: "#RRGGBB", "rgb(...)", "hsb(...)", a named
     *  colour, or "$molcol". */
    colorStr: string;
    /** Scene scope for named-colour / device-profile resolution (0 = global). */
    sceneId: number;
}

export interface CompileColorResult {
    ok: boolean;
    /** Resolved RGB (0-255). Absent when ok === false. */
    r?: number;
    g?: number;
    b?: number;
    /** Lower-case "#rrggbb" of the resolved colour. */
    hex?: string;
    /** C++ wrapper class name; "NamedColor" identifies a named colour. */
    className?: string;
    /** False when the colour falls outside the scene's proofing gamut. */
    inGamut?: boolean;
    /** Device-gamut-clamped RGB (only meaningful when inGamut === false). */
    devR?: number;
    devG?: number;
    devB?: number;
}

function packHex(r: number, g: number, b: number): string {
    const h = (v: number): string => (v < 16 ? '0' : '') + (v & 0xff).toString(16);
    return '#' + h(r) + h(g) + h(b);
}

/**
 * Compile a colour string via the C++ StyleManager and report its RGB,
 * class name, and proofing-gamut status.
 *
 * Mirrors UXP `ColorPicker.updateColorBox` (colpicker.js): the gamut check
 * and device-colour read are folded into a single worker call so the
 * renderer never chains multiple IPC round-trips per colour edit.
 */
function compileColor(ctx: WorkerContext, args: CompileColorArgs): CompileColorResult {
    const sceneId = args.sceneId || 0;
    // An empty string is never a valid colour; short-circuit so the C++
    // compiler does not log a parse error (and returns null) for it.
    if (!args.colorStr) {
        return { ok: false };
    }
    let color: AbstractColor | null;
    try {
        color = ctx.styleMgr.compileColor(args.colorStr, sceneId);
    } catch {
        return { ok: false };
    }
    // compileColor returns null (not throws) for an unparseable colour
    // string -- guard before reading components to avoid a null deref.
    if (!color) {
        return { ok: false };
    }

    const r = color.r();
    const g = color.g();
    const b = color.b();
    let className: string | undefined;
    try {
        className = color.getClassName();
    } catch {
        className = undefined;
    }

    const result: CompileColorResult = {
        ok: true,
        r,
        g,
        b,
        hex: packHex(r, g, b),
        className,
        inGamut: true,
    };

    // Gamut / device-colour check is only meaningful under colour proofing.
    // Treat any failure (method missing, proofing off) as "in gamut".
    try {
        if (!color.isInGamut(sceneId)) {
            const devcc = color.getDevCode(sceneId);
            result.inGamut = false;
            result.devR = (devcc >> 16) & 0xff;
            result.devG = (devcc >> 8) & 0xff;
            result.devB = devcc & 0xff;
        }
    } catch {
        result.inGamut = true;
    }

    return result;
}

// --- getNamedColors ---

export interface GetNamedColorsArgs {
    sceneId: number;
}

export interface NamedColorEntry {
    name: string;
    r: number;
    g: number;
    b: number;
    hex: string;
}

export interface GetNamedColorsResult {
    /** Scene-scoped colour definitions (empty when sceneId is 0). */
    scene: NamedColorEntry[];
    /** Global colour definitions. */
    global: NamedColorEntry[];
}

function resolveDefs(ctx: WorkerContext, sceneId: number): NamedColorEntry[] {
    let names: string[];
    try {
        names = JSON.parse(ctx.styleMgr.getColorDefsJSON(sceneId));
    } catch {
        return [];
    }
    const out: NamedColorEntry[] = [];
    for (const name of names) {
        try {
            const color = ctx.styleMgr.getColor(name, sceneId);
            const r = color.r();
            const g = color.g();
            const b = color.b();
            out.push({ name, r, g, b, hex: packHex(r, g, b) });
        } catch {
            // Skip undefined / un-resolvable entries (UXP swallows these too).
        }
    }
    return out;
}

/**
 * List named colours for the scene scope and the global scope, each with
 * resolved RGB previews. Mirrors UXP `setupNamedList` / `appendColorList`.
 */
function getNamedColors(ctx: WorkerContext, args: GetNamedColorsArgs): GetNamedColorsResult {
    const sceneId = args.sceneId || 0;
    return {
        scene: sceneId !== 0 ? resolveDefs(ctx, sceneId) : [],
        global: resolveDefs(ctx, 0),
    };
}

export const services = { compileColor, getNamedColors };
