/**
 * @file worker/server/services/coloring/types.ts
 * @description Shared DTO / args / result types for the renderer- and
 * object-level Coloring / Paint services.
 *
 * These types are split out of `rendererColoring.service.ts` for locality;
 * the service file re-exports them verbatim, so external importers
 * (`WorkerCalls.ts`, `ColorPane.tsx`, the coloring hooks) are unchanged.
 */
import type { Result } from '../../../shared/result';
import type { RendColoringId } from '@shared/ipcTypes';

/**
 * Discriminator for the Coloring panel's selector: both top-level objects
 * (`MolCoord`) and renderers (`MolRenderer`, `MolSurfRenderer`) expose the
 * same `coloring` / `defaultcolor` / `resetProp` interface; UXP's
 * `paint_coloring_filter` accepts both. We default `targetKind` to
 * `'renderer'` so existing renderer-ctxmenu callers stay unchanged.
 */
export type ColoringTargetKind = 'object' | 'renderer';

export interface GetPaintColoringStylesArgs {
    sceneId: number;
}

export interface PaintColoringStyleEntry {
    /** Raw style name; the action dispatches `style-<name>`. */
    name: string;
    /** Human-friendly label - `desc` when present, otherwise the raw name. */
    label: string;
}

export interface GetPaintColoringStylesResult {
    ok: boolean;
    entries: PaintColoringStyleEntry[];
}

export interface SetRendererColoringArgs {
    sceneId: number;
    rendId: number;
    coloringId: RendColoringId;
    /** Default 'renderer' for back-compat with the renderer ctxmenu callers. */
    targetKind?: ColoringTargetKind;
}

export interface SetRendererColoringResult {
    ok: boolean;
}

export interface PaintRendererSelectionArgs {
    sceneId: number;
    rendId: number;
    /** CueMol color value string, e.g. "#FFF", "hsb(0, 1.0, 1.0)". */
    colorValue: string;
}

export interface PaintRendererSelectionResult {
    ok: boolean;
}

export interface GetRendererPaintInfoArgs {
    sceneId: number;
    rendId: number;
}

export interface GetRendererPaintInfoResult {
    /** True iff coloring is PaintColoring AND the parent mol has a non-empty sel. */
    canPaint: boolean;
}

export interface PaintObjectSelectionArgs {
    sceneId: number;
    objId: number;
    /** CueMol color value string, e.g. "#FFF", "hsb(0, 1.0, 1.0)". */
    colorValue: string;
}

export interface PaintObjectSelectionResult {
    ok: boolean;
}

export interface GetObjectPaintInfoArgs {
    sceneId: number;
    objId: number;
}

export interface GetObjectPaintInfoResult {
    /** True iff sel is non-empty. Coloring class is not gated here. */
    canPaint: boolean;
}

export interface ListPaintCapableRenderersArgs {
    sceneId: number;
}

/**
 * One row in the Coloring panel's selector. Mirrors UXP
 * `paint_coloring_filter`, which accepts both top-level objects
 * (`elem.cat === 'obj'`) and renderers (`elem.cat === 'rend'`) that expose
 * a `coloring` property. For objects the panel edits `mol.coloring`
 * directly; for renderers it edits `rend.coloring` (or `rend.defaultcolor`
 * for the Solid deck).
 */
export interface PaintCapableRendererEntry {
    /** 'object' for MolCoord rows, 'renderer' for child renderer rows. */
    targetKind: ColoringTargetKind;
    /** C++ uid of the object or renderer this row represents. */
    rendId: number;
    /** Display name of the target. */
    name: string;
    /**
     * For renderer rows this is `type_name` (e.g. "cartoon"); for object
     * rows it is the object's class name (e.g. "MolCoord"). Used purely
     * for the secondary label in the selector.
     */
    typeName: string;
    /** Parent object id; equal to `rendId` for object rows. */
    objId: number;
    /** Parent object name; equal to `name` for object rows. */
    objName: string;
}

export interface ListPaintCapableRenderersResult {
    ok: boolean;
    renderers: PaintCapableRendererEntry[];
}

export interface GetRendererColoringStateArgs {
    sceneId: number;
    rendId: number;
    /** Default 'renderer' for back-compat. */
    targetKind?: ColoringTargetKind;
}

export interface PaintEntryDto {
    /** Zero-based index in PaintColoring. */
    idx: number;
    /** Compiled MolSelection re-stringified for display. */
    selStr: string;
    /** Color value formatted by `AbstractColor.toString()`. */
    colorValue: string;
}

/** Per-element colour palette for `CPKColoring`. */
export interface CpkColors {
    colC: string; colN: string; colO: string; colS: string;
    colP: string; colH: string; colX: string;
}

/** Editor params for `RainbowColoring`. */
export interface RainbowParams {
    /** "mol" | "chain" - mirrors UXP `coloring.mode`. */
    mode: string;
    /** "chain" | "resid" | "protss" - UXP `coloring.incr_mode`. */
    incrMode: string;
    /** Hue range start, 0-360 degrees. UXP `coloring.start_hue`. */
    startHue: number;
    /** Hue range end, 0-360 degrees. UXP `coloring.end_hue`. */
    endHue: number;
    /** 0..1; UXP `coloring.sat` (panel widget shows 0..100). */
    saturation: number;
    /** 0..1; UXP `coloring.bri`. */
    brightness: number;
}

/**
 * Editor params for the Elepot deck. Unlike CPK/Rainbow/Bfac these properties
 * live on the **renderer** itself (lowpar/midpar/highpar/lowcol/midcol/highcol/
 * elepot/ramp_above), not on a ColoringScheme; the deck appears when a
 * surface renderer has `colormode === "potential"`.
 */
export interface ElepotParams {
    /** Currently selected ElePotMap object name (empty when none). */
    elepot: string;
    /** UXP `ramp_above` -- "Color by SAS" checkbox. */
    rampAbove: boolean;
    lowColor: string;
    midColor: string;
    highColor: string;
    lowParam: number;
    midParam: number;
    highParam: number;
}

/** Editor params for `BfacColoring`. */
export interface BfacParams {
    /** "bfac" | "occ" | "center"; UXP `coloring.mode`. */
    mode: string;
    /** Low-side colour as a CueMol colour string. */
    lowColor: string;
    /** High-side colour. */
    highColor: string;
    /** "none" | "mol" | "rend"; UXP `coloring.auto`. */
    autoMode: string;
    /** Low parameter value; UXP `coloring.lowpar` (manual mode only). */
    lowParam: number;
    /** High parameter value; UXP `coloring.highpar`. */
    highParam: number;
}

export interface GetRendererColoringStateResult {
    ok: boolean;
    /** Coloring class name (e.g. "PaintColoring"), or "" when coloring is null. */
    className: string;
    /** Stringified renderer.defaultcolor (falls back to "" if unreadable). */
    defaultColor: string;
    /** Populated only when className === "PaintColoring". */
    paintEntries: PaintEntryDto[];
    /** Populated only when className === "CPKColoring". */
    cpkColors?: CpkColors;
    /** Populated only when className === "RainbowColoring". */
    rainbowParams?: RainbowParams;
    /** Populated only when className === "BfacColoring". */
    bfacParams?: BfacParams;
    /**
     * Renderer type name (e.g. "molsurf", "dsurface", "cartoon"). Empty for
     * objects and groups. Used by the renderer-side dropdown to gate the
     * "Electrostatic potential" item.
     */
    surfaceType: string;
    /**
     * MolSurfRenderer / MapRenderer colormode (e.g. "molecule", "potential",
     * "solid", "multigrad"). Empty for renderers without the property.
     */
    colormode: string;
    /** Populated only when the renderer is a surface AND colormode === "potential". */
    elepotParams?: ElepotParams;
    /** True iff the renderer exposes a `multi_grad` property. */
    multiGradCapable: boolean;
    /**
     * True iff the target exposes a `coloring` (ColoringScheme) property.
     * Mirrors UXP `'coloring' in rend`; gates the Paint/CPK/Bfac/Rainbow/
     * Reset dropdown items (map renderers without it offer only multigrad).
     */
    hasColoring: boolean;
    /**
     * MOLFANC reference-molecule name (renderer `target` property). Present
     * only for renderers that expose both a colormode and the property
     * (molsurf / dsurface / isosurf); drives the "Coloring mol" selector.
     */
    molFancTarget?: string;
}

export interface AddPaintEntryArgs {
    sceneId: number;
    rendId: number;
    /** Default 'renderer'. */
    targetKind?: ColoringTargetKind;
    /** Insert position; pass `size` to append. */
    idx: number;
    selStr: string;
    colorValue: string;
}

export interface PaintMutationResult {
    ok: boolean;
}

export interface RemovePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    idx: number;
}

export interface UpdatePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    idx: number;
    selStr: string;
    colorValue: string;
}

export interface MovePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    fromIdx: number;
    toIdx: number;
}

/**
 * One paint row as it travels to and from the clipboard: the C++ string
 * forms of the entry (`MolSelection.toString()` /
 * `AbstractColor.toString()`) rather than live wrappers. Strings survive
 * the source renderer being deleted and recompile against whichever scene
 * the paste targets -- the property UXP's JSON `qscpaint` flavour has.
 *
 * The wire spelling on the clipboard is UXP's (`sel` / `col`); the
 * translation lives in `shared/cuemolClipboard.ts`.
 */
export interface PaintClipboardEntry {
    selStr: string;
    colorValue: string;
}

/** Args for both Copy and Cut; Cut additionally removes the rows. */
export interface CopyPaintEntriesArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /** Row indices to copy. Order and duplicates do not matter. */
    idxs: number[];
}

/**
 * Result of Copy / Cut: the rows read, for the caller to put on the OS
 * clipboard. Empty when nothing could be read (the caller then leaves the
 * clipboard untouched).
 */
export interface CopyPaintEntriesResult {
    ok: boolean;
    entries: PaintClipboardEntry[];
}

export interface PastePaintEntriesArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /**
     * Insert before this row; `null` (no row selected) appends at the end.
     * Mirrors UXP `_getPaintSelImpl` returning -1 for an empty selection.
     */
    idx: number | null;
    /** Rows to insert, as read from the clipboard. */
    entries: PaintClipboardEntry[];
}

export interface PastePaintEntriesResult {
    ok: boolean;
    /** Rows actually inserted; entries that fail to compile are skipped. */
    count: number;
    /** Index of the first pasted row, or -1 when nothing was inserted. */
    startIdx: number;
}

export interface ClearPaintEntriesArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
}

export interface SetRendererDefaultColorArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    colorValue: string;
}

export interface SetRendererDefaultColorResult {
    ok: boolean;
}

export interface SetColoringPropArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /** Property name on the ColoringScheme (e.g. "col_C", "mode", "bri"). */
    propName: string;
    /**
     * Value to write. Strings whose `propName` is in the colour whitelist
     * are compiled via `makeColor` first; otherwise the value is passed
     * through (mode/incr_mode/auto are string enums, hue / params are
     * numbers).
     */
    propValue: string | number;
}

export interface SetColoringPropResult {
    ok: boolean;
}

export interface ListElePotMapObjectsArgs {
    sceneId: number;
}

export interface ElePotMapObjectEntry {
    /** C++ uid of the ElePotMap object. */
    objId: number;
    /** Object name shown in the selector. */
    name: string;
}

export interface ListElePotMapObjectsResult {
    ok: boolean;
    objects: ElePotMapObjectEntry[];
}

export interface SetRendererElepotPropArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /**
     * Property name on the surface renderer
     * (`elepot` | `ramp_above` | `lowcol` | `midcol` | `highcol` |
     *  `lowpar` | `midpar` | `highpar`).
     */
    propName: string;
    /**
     * Value to write. Colour-valued props compile to `AbstractColor.wrapped`;
     * `ramp_above` is a boolean; numeric params come through as numbers;
     * `elepot` is the target ElePotMap object name (string).
     */
    propValue: string | number | boolean;
}

export interface SetRendererElepotPropResult {
    ok: boolean;
}

export interface SetRendererColoringTargetArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /** MolCoord object name to write into the renderer's `target` property. */
    targetName: string;
}

export interface SetRendererColoringTargetResult {
    ok: boolean;
}

// --- Multi-gradient (multigrad) deck ---

/** One gradient node as read from / written to the C++ MultiGradient. */
export interface MultiGradNodeDto {
    /** Map-density value of the node. */
    value: number;
    /** CueMol color string (hex or named), round-trips through C++. */
    color: string;
    /** Resolved #RRGGBB for UI display (from the C++ r/g/b fields). */
    hex: string;
}

/** A gradient node to write; display hex is not needed on the write path. */
export interface MultiGradWriteNode {
    value: number;
    color: string;
}

/** Scene map object eligible as a multigrad color source. */
export interface MultiGradMapObjectEntry {
    objId: number;
    name: string;
    /** C++ class name (e.g. "DensityMap", "ElePotMap"). */
    className: string;
}

/** Density statistics of the resolved color-map object. */
export interface MultiGradMapStats {
    min: number;
    max: number;
    mean: number;
    sigma: number;
    /**
     * Spacing of the discrete value lattice of the stored samples; 0
     * when the map stores continuous (float) values. 8-bit maps
     * (CCP4/MRC via DensityMap) quantize to (max-min)/256, far coarser
     * than the sigma/1000 base-histogram resolution, so this bounds how
     * fine the display bins can get before empty comb teeth appear.
     */
    quantStep: number;
}

/**
 * Central-95% density range of the color-map object (2.5th / 97.5th
 * percentile points of its histogram). Used as the default view range
 * when no gradient nodes exist -- the raw min/max is usually blown up
 * by outliers.
 */
export interface MultiGradPercentiles {
    lo: number;
    hi: number;
}

export interface GetMultiGradStateArgs {
    sceneId: number;
    rendId: number;
}

export interface GetMultiGradStateResult {
    ok: boolean;
    /** True iff the renderer exposes a `multi_grad` property. */
    capable: boolean;
    /** Renderer colormode as a string (e.g. "solid", "multigrad"). */
    colormode: string;
    /** Renderer `color_mapname` (may name a non-existent object). */
    colorMapName: string;
    /** Current gradient nodes, sorted ascending by value. */
    nodes: MultiGradNodeDto[];
    /** Scene maps selectable as the color source. */
    mapObjects: MultiGradMapObjectEntry[];
    /** Stats of the resolved color-map object; null when unresolved. */
    mapStats: MultiGradMapStats | null;
    /** Central-95% range of the map histogram; null when unavailable. */
    mapPercentiles: MultiGradPercentiles | null;
    /**
     * Voxels counted over the map's full density range, and the largest
     * single-bin count in that histogram (the dominant peak, e.g. the
     * zero bin of a solvent-flattened map). Together they bound how fine
     * the display bins can usefully get; null when unavailable.
     */
    mapVoxelCount: number | null;
    mapPeakCount: number | null;
}

export interface GetMultiGradHistogramArgs {
    sceneId: number;
    rendId: number;
    /** Histogram domain lower bound (density units). */
    min: number;
    /** Histogram domain upper bound. */
    max: number;
    /** Number of bins. */
    nbins: number;
}

export interface GetMultiGradHistogramResult {
    ok: boolean;
    /** Bin counts over [min, max]; length nbins. */
    histo: number[];
    /** Max bin count within the requested range (normalization factor). */
    nmax: number;
    /**
     * Max bin count over the map's FULL density range at the same bin
     * width and grid alignment, so the y-scale stays fixed while the
     * view pans. Null when unavailable (unresolved stats, degenerate
     * bin width, or an extreme zoom-in where the full-range rebin would
     * exceed the bin cap).
     */
    globalNmax: number | null;
}

export interface SetMultiGradNodesArgs {
    sceneId: number;
    rendId: number;
    /** Full replacement node set. */
    nodes: MultiGradWriteNode[];
    /**
     * `preview`: txn-free write (live drag frame, no undo entry).
     * `abort`: txn-free restore of `originalNodes` (drag cancelled).
     * `commit` (default): restore `originalNodes` txn-free when given,
     * then write `nodes` inside one undo txn.
     */
    mode?: 'preview' | 'commit' | 'abort';
    /** Pre-drag snapshot; required for `abort`, optional for `commit`. */
    originalNodes?: MultiGradWriteNode[];
    /** Undo label override (default "Change multi gradient color"). */
    label?: string;
}

export type SetMultiGradNodesResult = Result;

export interface SetMultiGradColorMapArgs {
    sceneId: number;
    rendId: number;
    /** Name of the map object to color by. */
    mapName: string;
}

export interface SetMultiGradColorMapResult {
    ok: boolean;
}
