/**
 * @file worker/server/services/helpers/mapRendererStyles.ts
 * @description The map-kind default styles of the density map renderers.
 *
 * A contour / isosurf renderer carries one of two default styles, picked by
 * the kind of the map it draws (DensityMap `map_type_resolved`): the
 * crystallographic `Default*` style or the cryo-EM `CryoEM*` style, both in
 * `data/default_style.xml`. The style is where a mode's default values live
 * (today the contour level: 1.1 sigma vs the top 1 percent of grid points),
 * so "reset to default" restores the mode's value instead of the class
 * default. The map kind stays the single source of truth on the object; the
 * style is derived from it when the renderer is created and re-derived when
 * `map_type` changes (`syncMapRendererStyles`). A renderer whose style list
 * carries neither name (a user-picked style) is left alone.
 *
 * Runs in the Web Worker thread (sync wrappers).
 */
import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import { safeRead } from './safeRead';

export type MapKind = 'xtal' | 'em';

/** Default style per map renderer type (`type_name`) and map kind. */
export const MAP_MODE_STYLES: Readonly<Record<string, Readonly<Record<MapKind, string>>>> = {
    contour: { xtal: 'DefaultContour', em: 'CryoEMContour' },
    isosurf: { xtal: 'DefaultIsoSurf', em: 'CryoEMIsoSurf' },
};

function otherKind(kind: MapKind): MapKind {
    return kind === 'em' ? 'xtal' : 'em';
}

/** Split a `rend.style` list ("a,b c") into its non-empty names. */
function splitStyles(styleList: string): string[] {
    return styleList.split(/[,\s]+/).filter((s) => s.length > 0);
}

/** The effective map kind of `obj`, or null when it is not a DensityMap. */
export function resolveMapKind(obj: unknown): MapKind | null {
    const v = safeRead(() => (obj as { map_type_resolved?: unknown }).map_type_resolved);
    return v === 'em' || v === 'xtal' ? v : null;
}

/**
 * Which mode's default style `styleList` carries for a renderer of
 * `typeName`, or null when it carries neither (or the type has no mode
 * styles). The later entry wins, as in C++ applyStyles.
 */
export function styleMapKind(styleList: string, typeName: string): MapKind | null {
    const pair = MAP_MODE_STYLES[typeName];
    if (!pair) return null;
    const names = splitStyles(styleList);
    for (let i = names.length - 1; i >= 0; --i) {
        if (names[i] === pair.em) return 'em';
        if (names[i] === pair.xtal) return 'xtal';
    }
    return null;
}

/**
 * `styleList` with the other mode's default style replaced by `kind`'s, in
 * place (other names and their order are kept), or null when there is
 * nothing to swap: no mode style in the list, already `kind`, or not a map
 * renderer type.
 */
export function swapMapModeStyle(
    styleList: string,
    typeName: string,
    kind: MapKind,
): string | null {
    const pair = MAP_MODE_STYLES[typeName];
    if (!pair) return null;
    const from = pair[otherKind(kind)];
    const names = splitStyles(styleList);
    if (!names.includes(from)) return null;
    const out: string[] = [];
    for (const n of names) {
        const m = n === from ? pair[kind] : n;
        if (!out.includes(m)) out.push(m);
    }
    return out.join(',');
}

/**
 * Re-derive the mode style of every contour / isosurf renderer of `obj` from
 * its current map kind (after a `map_type` write) and re-apply it. Runs
 * inside the caller's undo txn: `applyStyles` records the style change.
 *
 * @returns the number of renderers whose styles were re-applied
 */
export function syncMapRendererStyles(obj: CueObject): number {
    const kind = resolveMapKind(obj);
    if (!kind) return 0;
    let n = 0;
    const count = safeRead(() => obj.getRendCount()) ?? 0;
    for (let i = 0; i < count; ++i) {
        const rend = safeRead(() => obj.getRendererByIndex(i)) as
            | { type_name: string; style: string; applyStyles: (s: string) => void }
            | null
            | undefined;
        if (!rend) continue;
        const typeName = safeRead(() => rend.type_name) ?? '';
        const next = swapMapModeStyle(safeRead(() => rend.style) ?? '', typeName, kind);
        if (next === null) continue;
        rend.applyStyles(next);
        ++n;
    }
    return n;
}
