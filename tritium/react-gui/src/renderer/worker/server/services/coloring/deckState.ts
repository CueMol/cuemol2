/**
 * @file worker/server/services/coloring/deckState.ts
 * @description Coloring panel read path: snapshot a renderer's current
 * coloring into the deck DTO (`getRendererColoringState`), plus the
 * per-scheme readers (Paint / CPK / Rainbow / Bfac / Elepot).
 *
 * The class-dispatched scheme readers are driven by a single
 * `COLORING_DESCRIPTORS` table (className -> reader + DTO field) so the
 * read path, and the colour-valued whitelist it exposes, live in one place.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '../../types/WorkerContext';
import { getSceneOrNull } from '../helpers/sceneResolver';
import {
    resolveColoringTarget,
    readTypeName,
    isElepotCapable,
    isMultiGradCapable,
    getColoringClassName,
} from './colorTargets';
import type {
    GetRendererColoringStateArgs,
    GetRendererColoringStateResult,
    PaintEntryDto,
    CpkColors,
    RainbowParams,
    BfacParams,
    ElepotParams,
} from './types';

function readDefaultColor(rend: Renderer): string {
    try {
        const c = (rend as unknown as { defaultcolor: AbstractColor })
            .defaultcolor;
        return c ? c.toString() : '';
    } catch {
        return '';
    }
}

function readPaintEntries(coloring: PaintColoring): PaintEntryDto[] {
    const out: PaintEntryDto[] = [];
    let size = 0;
    try {
        size = coloring.size;
    } catch {
        return out;
    }
    for (let i = 0; i < size; i++) {
        let selStr = '';
        let colorValue = '';
        try {
            const sel = coloring.getSelAt(i);
            selStr = sel ? sel.toString() : '';
        } catch {
            selStr = '';
        }
        try {
            const col = coloring.getColorAt(i);
            colorValue = col ? col.toString() : '';
        } catch {
            colorValue = '';
        }
        out.push({ idx: i, selStr, colorValue });
    }
    return out;
}

/** Safe property read with stringified fallback. Used for colour props. */
function safeReadColorString(obj: unknown, prop: string): string {
    try {
        const v = (obj as Record<string, AbstractColor | undefined>)[prop];
        return v ? v.toString() : '';
    } catch {
        return '';
    }
}

function safeReadString(obj: unknown, prop: string): string {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'string' ? v : '';
    } catch {
        return '';
    }
}

function safeReadNumber(obj: unknown, prop: string): number {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'number' ? v : 0;
    } catch {
        return 0;
    }
}

function safeReadBool(obj: unknown, prop: string): boolean {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return v === true;
    } catch {
        return false;
    }
}

function readCpkColors(coloring: unknown): CpkColors {
    return {
        colC: safeReadColorString(coloring, 'col_C'),
        colN: safeReadColorString(coloring, 'col_N'),
        colO: safeReadColorString(coloring, 'col_O'),
        colS: safeReadColorString(coloring, 'col_S'),
        colP: safeReadColorString(coloring, 'col_P'),
        colH: safeReadColorString(coloring, 'col_H'),
        colX: safeReadColorString(coloring, 'col_X'),
    };
}

function readRainbowParams(coloring: unknown): RainbowParams {
    return {
        mode: safeReadString(coloring, 'mode'),
        incrMode: safeReadString(coloring, 'incr_mode'),
        startHue: safeReadNumber(coloring, 'start_hue'),
        endHue: safeReadNumber(coloring, 'end_hue'),
        saturation: safeReadNumber(coloring, 'sat'),
        brightness: safeReadNumber(coloring, 'bri'),
    };
}

function readBfacParams(coloring: unknown): BfacParams {
    return {
        mode: safeReadString(coloring, 'mode'),
        lowColor: safeReadColorString(coloring, 'lowcol'),
        highColor: safeReadColorString(coloring, 'highcol'),
        autoMode: safeReadString(coloring, 'auto'),
        lowParam: safeReadNumber(coloring, 'lowpar'),
        highParam: safeReadNumber(coloring, 'highpar'),
    };
}

/**
 * Read the eight Elepot widget values directly off the surface renderer.
 * Mirrors `updateElepotWidgets` in UXP coloring-panel.js. All reads are
 * defensive because dsurface lacks some of the props that molsurf carries.
 */
function readElepotParams(rend: Renderer): ElepotParams {
    return {
        elepot: safeReadString(rend, 'elepot'),
        rampAbove: safeReadBool(rend, 'ramp_above'),
        lowColor: safeReadColorString(rend, 'lowcol'),
        midColor: safeReadColorString(rend, 'midcol'),
        highColor: safeReadColorString(rend, 'highcol'),
        lowParam: safeReadNumber(rend, 'lowpar'),
        midParam: safeReadNumber(rend, 'midpar'),
        highParam: safeReadNumber(rend, 'highpar'),
    };
}

/**
 * One read descriptor: given the renderer's live ColoringScheme, read its
 * deck params and write them onto the result DTO under the right field.
 *
 * Driving the className-dispatch off this table keeps the read path (and
 * the per-scheme param shape it exposes) in one place. The writer
 * (`setColoringProp`) is intentionally NOT descriptor-driven - it is
 * already a generic property-name writer.
 */
interface ColoringReadDescriptor {
    apply(
        result: GetRendererColoringStateResult,
        coloring: unknown,
    ): void;
}

const COLORING_DESCRIPTORS: Record<string, ColoringReadDescriptor> = {
    PaintColoring: {
        apply(result, coloring) {
            result.paintEntries = readPaintEntries(coloring as PaintColoring);
        },
    },
    CPKColoring: {
        apply(result, coloring) {
            result.cpkColors = readCpkColors(coloring);
        },
    },
    RainbowColoring: {
        apply(result, coloring) {
            result.rainbowParams = readRainbowParams(coloring);
        },
    },
    BfacColoring: {
        apply(result, coloring) {
            result.bfacParams = readBfacParams(coloring);
        },
    },
};

/**
 * Snapshot of the renderer's current coloring for the Coloring panel.
 *
 * The panel uses `className` to decide which deck page to show (PaintColoring
 * -> Paint deck; "" or unknown class -> Solid/Unknown deck). For the Paint
 * deck the entries are returned eagerly so the panel can render the table
 * without round-tripping.
 */
export function getRendererColoringState(
    ctx: WorkerContext,
    args: GetRendererColoringStateArgs,
): GetRendererColoringStateResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) {
        return {
            ok: false, className: '', defaultColor: '',
            paintEntries: [], surfaceType: '', colormode: '',
            multiGradCapable: false,
        };
    }
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) {
        return {
            ok: false, className: '', defaultColor: '',
            paintEntries: [], surfaceType: '', colormode: '',
            multiGradCapable: false,
        };
    }

    const className = getColoringClassName(rend);
    const defaultColor = readDefaultColor(rend);
    // Surface info (only meaningful for renderers; objects have no type_name
    // / colormode and yield empty strings).
    const surfaceType =
        args.targetKind === 'object' ? '' : readTypeName(rend);
    const multiGradCapable =
        args.targetKind !== 'object' && isMultiGradCapable(rend);
    const colormode = isElepotCapable(rend) || multiGradCapable
        ? safeReadString(rend, 'colormode')
        : '';

    const result: GetRendererColoringStateResult = {
        ok: true,
        className,
        defaultColor,
        paintEntries: [],
        surfaceType,
        colormode,
        multiGradCapable,
    };

    // Elepot deck takes priority over the coloring class on surface renderers
    // (mirrors UXP `_setupData` which checks colormode === "potential" before
    // dispatching by coloring class).
    if (isElepotCapable(rend) && colormode === 'potential') {
        result.elepotParams = readElepotParams(rend);
        return result;
    }

    const descriptor = COLORING_DESCRIPTORS[className];
    if (descriptor) {
        const coloring = (rend as unknown as MolRenderer).coloring;
        descriptor.apply(result, coloring);
    }

    return result;
}
