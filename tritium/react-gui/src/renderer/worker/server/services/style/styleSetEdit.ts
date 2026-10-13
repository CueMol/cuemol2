// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// style-set editor (UXP `style/style_editor.xul`). Style-set-scoped
// CRUD for the three editor tabs: named colors, named selections (MolSel defs,
// the "sel" str-data category), and style entries. Edits are live-applied (one
// undo step each) like the ColorPane decks; the dialog refetches after each.
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { recordOp } from '@renderer/worker/server/actions/serviceOps';

/** "sel" str-data category = named MolSel definitions (UXP Selection tab). */
const SEL_CAT = 'sel';

interface AbstractColorLike {
    r(): number;
    g(): number;
    b(): number;
}

interface StyleSetLike {
    name: string;
    readonly: boolean;
    getColorDefsJSON(): string;
    getColor(name: string): AbstractColorLike | null;
    setColor(name: string, col: AbstractColorLike): boolean;
    removeColor(name: string): boolean;
    getStrDataNamesJSON(cat: string): string;
    getStrData(cat: string, key: string): string;
    setStrData(cat: string, key: string, value: string): boolean;
    removeStrData(cat: string, key: string): boolean;
    getStyleNamesJSON(): string;
    removeStyle(name: string): boolean;
}

interface StyleMgrLike {
    getStyleSet(id: number): StyleSetLike | null;
    compileColor(str: string, scopeId: number): AbstractColorLike | null;
    firePendingEvents?(): void;
}

function getMgr(ctx: WorkerContext): StyleMgrLike | null {
    const mgr = ctx.svc.getService('StyleManager') as unknown as StyleMgrLike | null;
    return mgr ?? null;
}

function packHex(r: number, g: number, b: number): string {
    const h = (v: number): string => (v < 16 ? '0' : '') + (v & 0xff).toString(16);
    return `#${h(r)}${h(g)}${h(b)}`;
}

// --- read ---

export interface StyleColorEntry {
    name: string;
    hex: string;
}
export interface StyleSelEntry {
    name: string;
    value: string;
}
export interface StyleEntry {
    name: string;
    type: string;
}

export interface GetStyleSetContentsArgs {
    styleSetId: number;
}

export interface GetStyleSetContentsResult {
    ok: boolean;
    name: string;
    readonly: boolean;
    colors: StyleColorEntry[];
    selections: StyleSelEntry[];
    styles: StyleEntry[];
}

const EMPTY_CONTENTS: GetStyleSetContentsResult = {
    ok: false,
    name: '',
    readonly: false,
    colors: [],
    selections: [],
    styles: [],
};

function parseStringArray(json: string): string[] {
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? (v.filter((s) => typeof s === 'string') as string[]) : [];
    } catch {
        return [];
    }
}

export function getStyleSetContents(
    ctx: WorkerContext,
    args: GetStyleSetContentsArgs,
): GetStyleSetContentsResult {
    const mgr = getMgr(ctx);
    if (!mgr) return EMPTY_CONTENTS;
    const set = mgr.getStyleSet(args.styleSetId);
    if (!set) return EMPTY_CONTENTS;

    const colors: StyleColorEntry[] = [];
    for (const name of parseStringArray(set.getColorDefsJSON())) {
        try {
            const c = set.getColor(name);
            if (c) colors.push({ name, hex: packHex(c.r(), c.g(), c.b()) });
        } catch {
            // skip un-resolvable colour entries (UXP swallows these too)
        }
    }

    const selections: StyleSelEntry[] = [];
    for (const name of parseStringArray(set.getStrDataNamesJSON(SEL_CAT))) {
        try {
            selections.push({ name, value: set.getStrData(SEL_CAT, name) ?? '' });
        } catch {
            // skip
        }
    }

    const styles: StyleEntry[] = [];
    try {
        const parsed = JSON.parse(set.getStyleNamesJSON()) as { name?: string; type?: string }[];
        if (Array.isArray(parsed)) {
            for (const s of parsed) if (s.name) styles.push({ name: s.name, type: s.type ?? '' });
        }
    } catch {
        // leave empty
    }

    return { ok: true, name: set.name, readonly: set.readonly, colors, selections, styles };
}

// --- writes (live-applied, one undo step each) ---

/** Resolve set + scene, run `fn` in an undo txn, fire pending events. */
function mutate(
    ctx: WorkerContext,
    sceneId: number,
    styleSetId: number,
    label: string,
    fn: (set: StyleSetLike, mgr: StyleMgrLike) => void,
): boolean {
    const scene = getSceneOrNull(ctx, sceneId);
    if (!scene) return false;
    const mgr = getMgr(ctx);
    if (!mgr) return false;
    const set = mgr.getStyleSet(styleSetId);
    if (!set) return false;

    let ok = false;
    withUndoTxn(scene, label, () => {
        fn(set, mgr);
        ok = true;
    });
    mgr.firePendingEvents?.();
    return ok;
}

export interface SetStyleSetColorArgs {
    sceneId: number;
    styleSetId: number;
    scopeId: number;
    name: string;
    colorStr: string;
}
export interface StyleSetEditResult {
    ok: boolean;
}

export function setStyleSetColor(ctx: WorkerContext, args: SetStyleSetColorArgs): StyleSetEditResult {
    const name = args.name.trim();
    if (name.length === 0) return { ok: false };
    const ok = mutate(ctx, args.sceneId, args.styleSetId, `Set style color ${name}`, (set, mgr) => {
        const col = mgr.compileColor(args.colorStr, args.scopeId);
        if (col) set.setColor(name, col);
    });
    return { ok };
}

export interface RemoveStyleSetKeyArgs {
    sceneId: number;
    styleSetId: number;
    name: string;
}

export function removeStyleSetColor(ctx: WorkerContext, args: RemoveStyleSetKeyArgs): StyleSetEditResult {
    const ok = mutate(ctx, args.sceneId, args.styleSetId, `Remove style color ${args.name}`, (set) => {
        set.removeColor(args.name);
    });
    return { ok };
}

export interface SetStyleSetSelectionArgs {
    sceneId: number;
    styleSetId: number;
    name: string;
    value: string;
}

interface StyleSetInfo {
    name?: string;
    scene_id?: number;
    uid?: number;
    readonly?: boolean;
}

function styleSetsOf(ctx: WorkerContext, sceneId: number): StyleSetInfo[] {
    try {
        const parsed: unknown = JSON.parse(ctx.styleMgr.getStyleSetsJSON(sceneId));
        return Array.isArray(parsed) ? (parsed as StyleSetInfo[]) : [];
    } catch {
        return [];
    }
}

/**
 * Whether `styleSetId` is the set `define_selection` writes to: the first
 * writable set of the scene's own scope (as `saveSelDef` picks it).
 */
function isDefineSelectionSet(ctx: WorkerContext, sceneId: number, styleSetId: number): boolean {
    const entry = styleSetsOf(ctx, sceneId).find((e) => e.scene_id === sceneId && e.readonly === false);
    return entry?.uid === styleSetId;
}

/**
 * The uid of the style set a scene reaches by `name`: its own set of that
 * name before a global one. Null when there is none, or two in one scope.
 */
export function styleSetByName(ctx: WorkerContext, sceneId: number, name: string): number | null {
    const named = styleSetsOf(ctx, sceneId).filter((e) => e.name === name && typeof e.uid === 'number');
    const own = named.filter((e) => e.scene_id === sceneId);
    const pick = own.length > 0 ? own : named;
    return pick.length === 1 ? (pick[0].uid as number) : null;
}

/** The name `styleSetByName` finds this set by, or null when the name does not lead back to it. */
function styleSetNameOf(ctx: WorkerContext, sceneId: number, styleSetId: number): string | null {
    const name = styleSetsOf(ctx, sceneId).find((e) => e.uid === styleSetId)?.name;
    return name !== undefined && styleSetByName(ctx, sceneId, name) === styleSetId ? name : null;
}

export function setStyleSetSelection(
    ctx: WorkerContext,
    args: SetStyleSetSelectionArgs,
): StyleSetEditResult {
    const name = args.name.trim();
    if (name.length === 0) return { ok: false };
    // define_selection trims the expression it stores, and names any set
    // but its own by name.
    const styleSet = isDefineSelectionSet(ctx, args.sceneId, args.styleSetId)
        ? null
        : styleSetNameOf(ctx, args.sceneId, args.styleSetId);
    const opEquivalent =
        args.value.trim() === args.value &&
        args.value !== '' &&
        (styleSet !== null || isDefineSelectionSet(ctx, args.sceneId, args.styleSetId));
    const ok = mutate(ctx, args.sceneId, args.styleSetId, `Set style selection ${name}`, (set) => {
        if (opEquivalent) {
            recordOp(ctx, args.sceneId, 'define_selection', { name, selection: args.value, styleSet });
        }
        set.setStrData(SEL_CAT, name, args.value);
    });
    return { ok };
}

export function removeStyleSetSelection(
    ctx: WorkerContext,
    args: RemoveStyleSetKeyArgs,
): StyleSetEditResult {
    const ok = mutate(ctx, args.sceneId, args.styleSetId, `Remove style selection ${args.name}`, (set) => {
        set.removeStrData(SEL_CAT, args.name);
    });
    return { ok };
}

export function removeStyleSetStyle(ctx: WorkerContext, args: RemoveStyleSetKeyArgs): StyleSetEditResult {
    const ok = mutate(ctx, args.sceneId, args.styleSetId, `Remove style entry ${args.name}`, (set) => {
        set.removeStyle(args.name);
    });
    return { ok };
}
