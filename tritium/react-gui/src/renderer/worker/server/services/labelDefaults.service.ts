// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// App-level atom-label defaults, backed by the C++ StyleManager "DefaultLabel"
// style (UXP `config-dialog.js` parity). Reads resolve against every style set
// in the global scope (`getStyleValue(0, "", ...)`); writes go to the writable
// "user" set (`setStyleValue(0, "user", ...)`) so they land in the user style
// file persisted on window close (see workerLifecycle.saveUserStyle).
//
// No undo transaction: this is global app config, not a scene edit -- UXP does
// not wrap it either.

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

const log = console;

const GLOBAL_SCOPE = 0;
const READ_SET = ''; // empty = resolve across all sets in the scope
const WRITE_SET = 'user';
const STYLE = 'DefaultLabel';

export interface LabelDefaults {
    fontName: string;
    fontSize: number;
    color: string; // "#rrggbb"
    bold: boolean;
    italic: boolean;
}

export interface LabelDefaultsResult {
    ok: boolean;
    defaults: LabelDefaults;
}

export interface SetLabelDefaultsArgs {
    fontName?: string;
    fontSize?: number;
    color?: string; // "#rrggbb" from the colour picker
    bold?: boolean;
    italic?: boolean;
}

const FALLBACK: LabelDefaults = {
    fontName: 'sans-serif',
    fontSize: 12,
    color: '#ffff00',
    bold: false,
    italic: false,
};

function packHex(r: number, g: number, b: number): string {
    const h = (v: number): string => (v < 16 ? '0' : '') + (v & 0xff).toString(16);
    return '#' + h(r) + h(g) + h(b);
}

/** Read one DefaultLabel property; returns '' when unset (matches UXP). */
function readVal(ctx: WorkerContext, prop: string): string {
    try {
        return ctx.styleMgr.getStyleValue(GLOBAL_SCOPE, READ_SET, `${STYLE}.${prop}`) ?? '';
    } catch {
        return '';
    }
}

/**
 * Resolve a stored colour string (named like "Yellow" or "#rrggbb") to a
 * lower-case "#rrggbb" for the colour picker. Falls back to the raw string
 * when the C++ compiler cannot parse it.
 */
function resolveColorHex(ctx: WorkerContext, raw: string): string {
    if (!raw) return FALLBACK.color;
    try {
        const color = ctx.styleMgr.compileColor(raw, GLOBAL_SCOPE);
        if (color) return packHex(color.r(), color.g(), color.b());
    } catch {
        // fall through
    }
    return raw;
}

function getLabelDefaults(ctx: WorkerContext, _args: Record<string, never>): LabelDefaultsResult {
    try {
        const fontSizeStr = readVal(ctx, 'font_size');
        const parsedSize = parseFloat(fontSizeStr);
        return {
            ok: true,
            defaults: {
                fontName: readVal(ctx, 'font_name') || FALLBACK.fontName,
                fontSize: Number.isFinite(parsedSize) ? parsedSize : FALLBACK.fontSize,
                color: resolveColorHex(ctx, readVal(ctx, 'color')),
                bold: readVal(ctx, 'font_weight') === 'bold',
                italic: readVal(ctx, 'font_style') === 'italic',
            },
        };
    } catch (e) {
        log.warn('getLabelDefaults failed:', e);
        return { ok: false, defaults: FALLBACK };
    }
}

/** Write only the provided fields to the "user" set, then fire style events. */
function setLabelDefaults(ctx: WorkerContext, args: SetLabelDefaultsArgs): { ok: boolean } {
    const set = (prop: string, value: string): void => {
        ctx.styleMgr.setStyleValue(GLOBAL_SCOPE, WRITE_SET, `${STYLE}.${prop}`, value);
    };
    try {
        if (args.fontName !== undefined) set('font_name', args.fontName);
        if (args.fontSize !== undefined) set('font_size', String(args.fontSize));
        if (args.color !== undefined) set('color', args.color);
        if (args.bold !== undefined) set('font_weight', args.bold ? 'bold' : 'normal');
        if (args.italic !== undefined) set('font_style', args.italic ? 'italic' : 'normal');
        // Propagate to already-rendered labels (UXP config-dialog.js parity).
        ctx.styleMgr.firePendingEvents();
        return { ok: true };
    } catch (e) {
        log.error('setLabelDefaults failed:', e);
        return { ok: false };
    }
}

export const services = { getLabelDefaults, setLabelDefaults };
