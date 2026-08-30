/**
 * @file features/inspector/rendererPropSections.ts
 * @description Renderer-type -> property-section dispatch for the inspector
 * Properties tab.
 *
 * The Properties tab always shows the renderer-common page first
 * (`schema/common`), then any renderer-type-specific sections. Those
 * type-specific sections are looked up here by the renderer's `type_name`
 * (e.g. `ribbon`, `cpk`, `tube`), mirroring how each UXP renderer property
 * dialog stacks its own tabs on top of the shared `renderer-common-page`
 * overlay.
 *
 * `RENDERER_SECTION_REGISTRY` is keyed by `type_name`. A type with no entry
 * resolves to an empty list and shows the common page plus the placeholder
 * section appended by PropertiesTab.
 */

import type { SchemaSectionDef } from "@renderer/features/inspector/schema/types";
import { SIMPLE_SECTIONS, TRACE_SECTIONS } from "@renderer/features/inspector/schema/simple";
import { ANISOU_SECTIONS } from "@renderer/features/inspector/schema/anisou";
import { BALLSTICK_SECTIONS } from "@renderer/features/inspector/schema/ballstick";
import { CPK_SECTIONS } from "@renderer/features/inspector/schema/cpk";
import { DISORDER_SECTIONS } from "@renderer/features/inspector/schema/disorder";
import { MOLSURF_SECTIONS } from "@renderer/features/inspector/schema/molsurf";
import { SPLINE_SECTIONS } from "@renderer/features/inspector/schema/spline";
import { DSURF2_SECTIONS, DSURFACE_SECTIONS } from "@renderer/features/inspector/schema/dsurface";
import { TUBE_SECTIONS } from "@renderer/features/inspector/schema/tube";
import { NUCL_SECTIONS } from "@renderer/features/inspector/schema/nucl";
import { CARTOON_SECTIONS } from "@renderer/features/inspector/schema/cartoon";
import { RIBBON_SECTIONS } from "@renderer/features/inspector/schema/ribbon";
import { ATOMINTR_SECTIONS } from "@renderer/features/inspector/schema/atomintr";
import { CONTOUR_SECTIONS, GPU_MAPMESH_SECTIONS, ISOSURF_SECTIONS } from "@renderer/features/inspector/schema/map";
import { SCENE_SECTIONS } from "@renderer/features/inspector/schema/scene";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from '@renderer/worker/shared/genericProps';

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** One property write in a multi-write atomic commit. */
export interface PropMultiWrite {
  key: string;
  valueType: string;
  value: string | number | boolean;
}

/** Props passed to every renderer property section body. */
export interface RendererPropSectionProps {
  /** Full live property list of the inspected renderer. */
  entries: GenericPropEntry[];
  /**
   * Write a property value (live-apply). `valueType` is the C++ type tag.
   * `opts` carries realtime-drag info (`mode` / `originalValue`); omit for a
   * plain single-step commit.
   */
  onSet: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
  /**
   * Write several properties in ONE undo step. Used when a single control
   * changes multiple properties together (e.g. the atomintr "Dashed" toggle
   * rewriting all six stipple values). Optional because most sections only edit
   * one property at a time; `PropertiesTab` always supplies it in production.
   */
  onSetMany?: (writes: PropMultiWrite[]) => void;
  /** Restore a property to its C++ default. */
  onReset: (key: string) => void;
  /** Active scene id (for selection / material / colour lookups). */
  sceneId: number | undefined;
  /**
   * UID of the inspected node (renderer). Threaded for sections that must query
   * the C++ side about the node itself rather than just its property list (e.g.
   * the disorder renderer's "Target" selector enumerates sibling renderers).
   * Optional because most sections only read the property list; `PropertiesTab`
   * always supplies it in production.
   */
  nodeId?: number;
  /**
   * UID of the molecule the node's selection properties are evaluated against
   * (resolved worker-side). Selection rows pass it to the picker so it can
   * count matched atoms; undefined when the node has no molecule.
   */
  molId?: number;
}

/**
 * One accordion section in the Properties tab.
 *
 * A section names its rows as data; `SchemaSection` renders them. The blocks
 * that are not rows (a synthetic toggle over six properties, a preset
 * dropdown backed by no single property) are `custom` rows inside a section,
 * not sections of their own.
 */
export type RendererPropSectionDef = SchemaSectionDef;

// ------------------------------------------------------------
// Registry
// ------------------------------------------------------------

/**
 * Renderer-type-specific sections, keyed by renderer `type_name`. Add an entry
 * here when porting a per-type page (ribbon / cpk / tube / ...). Unknown types
 * resolve to an empty list (common page only).
 */
export const RENDERER_SECTION_REGISTRY: Record<string, RendererPropSectionDef[]> = {
  // Scene: no dedicated UXP dialog (scene props were generic-tree only). Curated
  // rendering/display sections backed by the same generic-props bridge. Keyed by
  // the scene's typeLabel ("Scene") -- the value PropertiesTab receives as
  // `rendererType` (genericProps `typeLabelOf` returns "Scene" for nodeType
  // "scene"), not the lowercase tree node type.
  Scene: SCENE_SECTIONS,
  // SimpleRenderer ("simple"): UXP simple-propdlg "Simple" tab -- line width only.
  simple: SIMPLE_SECTIONS,
  // TraceRenderer ("trace"): shares the UXP simple-propdlg with SimpleRenderer
  // (line width only), so the same SimpleRendererSection is reused here.
  trace: TRACE_SECTIONS,
  // SplineRenderer ("spline"): no dedicated UXP dialog; curated from the C++
  // SplineRenderer.qif. A single section (no nested cross-section / putty), the
  // tube cap-type props are omitted (non-functional on a line).
  spline: SPLINE_SECTIONS,
  // BallStickRenderer ("ballstick"): UXP ballstick-propdlg "Ball & Stick" tab.
  ballstick: BALLSTICK_SECTIONS,
  // CPKRenderer ("cpk"): UXP cpk-propdlg "Atom radii" tab. The seven per-element
  // radii form the "Atom radii" groupbox; `detail` is a loose row outside it.
  cpk: CPK_SECTIONS,
  // AnIsoURenderer ("anisou"): ORTEP-like anisotropic-displacement variant of
  // ball-and-stick. The inherited base controls reuse the shared ball-and-stick
  // section; the disc-only controls live in their own section.
  anisou: ANISOU_SECTIONS,
  // AtomIntrRenderer ("atomintr"): UXP atomintr-propdlg "Interaction" tab.
  // The line / dashed-pattern / 3D-tube / label-font groupboxes become four
  // accordion sections; the dashed toggle writes all six stipple values in one
  // undo step via `onSetMany`.
  atomintr: ATOMINTR_SECTIONS,
  // Ribbon2Renderer ("cartoon"): UXP cartoon-propdlg tabs. Only the flat
  // top-level properties are surfaced here; the per-section shape controls live
  // on nested sub-objects (TubeSection / JctTable) and remain in the Generic tab
  // for now. Those nested props ARE editable (dot-path writes route through
  // setNestedProperty); wiring them onto this page is a follow-up, not a gap.
  cartoon: CARTOON_SECTIONS,
  // MapMeshRenderer ("contour"): UXP contour-propdlg "Map" tab. One section
  // surfacing center-update mode, line width, buffer size, periodic boundary,
  // and the limit-display target / selection / distance. Coloring stays out
  // (not on the UXP Map tab).
  contour: CONTOUR_SECTIONS,
  // GLSLMapMeshRenderer2 ("gpu_mapmesh"): the GPU marching-squares contour.
  // No UXP dialog of its own; it carries the same property set as the
  // contour renderer (both extend MapRenderer, same width / bufsize /
  // autoupdate / dragupdate), so the contour section is reused verbatim.
  gpu_mapmesh: GPU_MAPMESH_SECTIONS,
  // MapSurfRenderer ("isosurf"): UXP isosurf-propdlg "Map" tab. One section --
  // drawing mode, line/point size (off for fill), max grid size, back-face
  // culling, plus the Center update / Limit display block shared with contour
  // (both extend MapRenderer). Coloring (colormode / target / MOLFANC scheme)
  // is owned by the Coloring panel (ColorPane), same as molsurf; tuning props
  // stay out.
  isosurf: ISOSURF_SECTIONS,
  // DisoRenderer ("disorder"): UXP disorder-propdlg "Disorder" tab. One section
  // surfacing the target main-chain renderer, tessellation detail, dot size /
  // separation, the two loop strengths and the default color.
  disorder: DISORDER_SECTIONS,
  // DirectSurfRenderer ("dsurface"): UXP dsurf-propdlg "MolSurf" + "Atom radii"
  // tabs. The MolSurf "Draw" groupbox (draw mode / line-point size / surface
  // type / detail) becomes the "Surface" section; the per-element van der Waals
  // radii form the "Atom radii" section. The MolSurf coloring controls (target /
  // showsel / coloring mode) stay out (UXP Coloring panel, not migrated yet).
  dsurface: DSURFACE_SECTIONS,
  // DirectSurfRenderer2 ("dsurf2"): the distance-field surface.
  // Temporary exposure alongside dsurface -- it shares the same property set
  // (surftype / detail / proberad / draw mode / per-element radii), so it
  // reuses the dsurface property sections verbatim.
  dsurf2: DSURF2_SECTIONS,
  // MolSurfRenderer ("molsurf"): UXP molsurf-propdlg "MolSurf" tab (shared
  // molsurf-page with dsurface, but Surface type / Detail / Atom radii are
  // dsurface-only while the "Selection mol" target is molsurf-only). One section:
  // drawing mode, line/point size (off for fill), reference-molecule target and
  // shown selection. Coloring (colormode + the colors that go with it) is owned
  // by the Coloring panel (ColorPane), same as isosurf and dsurface.
  molsurf: MOLSURF_SECTIONS,
  // TubeRenderer ("tube"): UXP tube-propdlg "Tube" tab. The loose controls form
  // the "Tube" section; the nested TubeSection shape (edited via dot-path keys
  // section.type / section.width / ...) forms the "Section" section; the putty
  // radius-scaling controls form the "Putty" section.
  tube: TUBE_SECTIONS,
  // RibbonRenderer ("ribbon"): UXP ribbon-propdlg Common/Helix/Sheet/Coil tabs.
  // Section shapes (TubeSection) and head/tail junctions (JctTable) are nested,
  // edited by dotted keys.
  ribbon: RIBBON_SECTIONS,
  // NARenderer ("nucl"): extends TubeRenderer. UXP nucl-propdlg adds a
  // "Nucleic acid" tab on top of the shared tube-page (Tube / Section / Putty),
  // which are reused here. The reused tube sections are disabled when
  // "Show tube" is off (UXP gTube.disableAll gate).
  nucl: NUCL_SECTIONS,
};

/**
 * Resolve the type-specific sections for a renderer type. Unknown types return
 * an empty list (common page only).
 */
export function getRendererPropSections(rendererType: string): RendererPropSectionDef[] {
  return RENDERER_SECTION_REGISTRY[rendererType] ?? [];
}

