/**
 * @file components/inspector/rendererPropSections.tsx
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

import React from "react";
import type { SchemaSectionDef } from "./schema/types";
import { SIMPLE_SECTIONS, TRACE_SECTIONS } from "./schema/simple";
import { ANISOU_SECTIONS } from "./schema/anisou";
import { BALLSTICK_SECTIONS } from "./schema/ballstick";
import { CPK_SECTIONS } from "./schema/cpk";
import { DISORDER_SECTIONS } from "./schema/disorder";
import { MOLSURF_SECTIONS } from "./schema/molsurf";
import { SPLINE_SECTIONS } from "./schema/spline";
import { DSURF2_SECTIONS, DSURFACE_SECTIONS } from "./schema/dsurface";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from '@renderer/worker/shared/genericProps';
import {
  SceneAmbientOcclusionSection,
  SceneAntialiasingSection,
  SceneBackgroundSection,
  SceneColorProofingSection,
} from "./SceneRenderingSection";
import {
  AtomIntrMainSection,
  AtomIntrDashedSection,
  AtomIntrTubeSection,
  AtomIntrLabelSection,
} from "./AtomIntrRendererSection";
import {
  CartoonMainSection,
  CartoonHelixSection,
  CartoonSheetSection,
  CartoonCoilSection,
} from "./CartoonRendererSection";
import { ContourMainSection } from "./ContourRendererSection";
import { IsosurfMainSection } from "./IsosurfRendererSection";
import {
  TubeMainSection,
  TubeSectionSection,
  TubePuttySection,
} from "./TubeRendererSection";
import {
  NuclBaseSection,
  NuclTubeMainSection,
  NuclSectionSection,
  NuclPuttySection,
} from "./NuclRendererSection";
import {
  RibbonMainSection,
  RibbonHelixSection,
  RibbonSheetSection,
  RibbonCoilSection,
} from "./RibbonRendererSection";

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
 * A section either names its rows as data (`rows`, rendered by
 * `SchemaSection`) or supplies a component that renders them itself. The
 * schema form is where the per-type pages are heading; the component form is
 * what the types not migrated yet still use, so the registry carries both
 * while that is true.
 */
export type RendererPropSectionDef = SchemaSectionDef | ComponentSectionDef;

/** A section whose body is a hand-written component. */
export interface ComponentSectionDef {
  /** Stable React key / accordion identity. */
  key: string;
  /** Accordion header title. */
  title: string;
  /** Whether the accordion starts expanded. */
  defaultExpanded?: boolean;
  /** Section body. */
  Component: React.FC<RendererPropSectionProps>;
}

/** Narrow a registry entry to the component form. */
export function isComponentSection(
  section: RendererPropSectionDef,
): section is ComponentSectionDef {
  return 'Component' in section;
}

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
  Scene: [
    {
      key: "scene-ao",
      title: "Ambient occlusion",
      defaultExpanded: true,
      Component: SceneAmbientOcclusionSection,
    },
    {
      key: "scene-aa",
      title: "Anti-aliasing",
      defaultExpanded: false,
      Component: SceneAntialiasingSection,
    },
    {
      key: "scene-bg",
      title: "Background",
      defaultExpanded: false,
      Component: SceneBackgroundSection,
    },
    {
      key: "scene-proof",
      title: "Color proofing",
      defaultExpanded: false,
      Component: SceneColorProofingSection,
    },
  ],
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
  atomintr: [
    {
      key: "atomintr-main",
      title: "Interaction",
      defaultExpanded: true,
      Component: AtomIntrMainSection,
    },
    {
      key: "atomintr-dashed",
      title: "Dashed line",
      defaultExpanded: true,
      Component: AtomIntrDashedSection,
    },
    {
      key: "atomintr-tube",
      title: "3D tube",
      defaultExpanded: true,
      Component: AtomIntrTubeSection,
    },
    {
      key: "atomintr-label",
      title: "Value label",
      defaultExpanded: true,
      Component: AtomIntrLabelSection,
    },
  ],
  // Ribbon2Renderer ("cartoon"): UXP cartoon-propdlg tabs. Only the flat
  // top-level properties are surfaced here; the per-section shape controls live
  // on nested sub-objects (TubeSection / JctTable) and remain in the Generic tab
  // for now. Those nested props ARE editable (dot-path writes route through
  // setNestedProperty); wiring them onto this page is a follow-up, not a gap.
  cartoon: [
    {
      key: "cartoon-main",
      title: "Cartoon",
      defaultExpanded: true,
      Component: CartoonMainSection,
    },
    {
      key: "cartoon-helix",
      title: "Helix",
      defaultExpanded: true,
      Component: CartoonHelixSection,
    },
    {
      key: "cartoon-sheet",
      title: "Sheet",
      defaultExpanded: true,
      Component: CartoonSheetSection,
    },
    {
      key: "cartoon-coil",
      title: "Coil",
      defaultExpanded: true,
      Component: CartoonCoilSection,
    },
  ],
  // MapMeshRenderer ("contour"): UXP contour-propdlg "Map" tab. One section
  // surfacing center-update mode, line width, buffer size, periodic boundary,
  // and the limit-display target / selection / distance. Coloring stays out
  // (not on the UXP Map tab).
  contour: [
    {
      key: "contour-main",
      title: "Contour",
      defaultExpanded: true,
      Component: ContourMainSection,
    },
  ],
  // GLSLMapMeshRenderer2 ("gpu_mapmesh"): the GPU marching-squares contour.
  // No UXP dialog of its own; it carries the same property set as the
  // contour renderer (both extend MapRenderer, same width / bufsize /
  // autoupdate / dragupdate), so the contour section is reused verbatim.
  gpu_mapmesh: [
    {
      key: "gpu-mapmesh-main",
      title: "GPU contour",
      defaultExpanded: true,
      Component: ContourMainSection,
    },
  ],
  // MapSurfRenderer ("isosurf"): UXP isosurf-propdlg "Map" tab. One section --
  // drawing mode, line/point size (off for fill), max grid size, back-face
  // culling, plus the Center update / Limit display block shared with contour
  // (both extend MapRenderer). Coloring (colormode / target / MOLFANC scheme)
  // is owned by the Coloring panel (ColorPane), same as molsurf; tuning props
  // stay out.
  isosurf: [
    {
      key: "isosurf-main",
      title: "Isosurf",
      defaultExpanded: true,
      Component: IsosurfMainSection,
    },
  ],
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
  tube: [
    {
      key: "tube-main",
      title: "Tube",
      defaultExpanded: true,
      Component: TubeMainSection,
    },
    {
      key: "tube-section",
      title: "Section",
      defaultExpanded: true,
      Component: TubeSectionSection,
    },
    {
      key: "tube-putty",
      title: "Putty",
      defaultExpanded: true,
      Component: TubePuttySection,
    },
  ],
  // RibbonRenderer ("ribbon"): UXP ribbon-propdlg Common/Helix/Sheet/Coil tabs.
  // Section shapes (TubeSection) and head/tail junctions (JctTable) are nested,
  // edited by dotted keys.
  ribbon: [
    {
      key: "ribbon-main",
      title: "Ribbon",
      defaultExpanded: true,
      Component: RibbonMainSection,
    },
    {
      key: "ribbon-helix",
      title: "Helix",
      defaultExpanded: true,
      Component: RibbonHelixSection,
    },
    {
      key: "ribbon-sheet",
      title: "Sheet",
      defaultExpanded: true,
      Component: RibbonSheetSection,
    },
    {
      key: "ribbon-coil",
      title: "Coil",
      defaultExpanded: true,
      Component: RibbonCoilSection,
    },
  ],
  // NARenderer ("nucl"): extends TubeRenderer. UXP nucl-propdlg adds a
  // "Nucleic acid" tab on top of the shared tube-page (Tube / Section / Putty),
  // which are reused here. The reused tube sections are disabled when
  // "Show tube" is off (UXP gTube.disableAll gate).
  nucl: [
    {
      key: "nucl-base",
      title: "Nucleic acid",
      defaultExpanded: true,
      Component: NuclBaseSection,
    },
    {
      key: "nucl-tube-main",
      title: "Tube",
      defaultExpanded: true,
      Component: NuclTubeMainSection,
    },
    {
      key: "nucl-tube-section",
      title: "Section",
      defaultExpanded: true,
      Component: NuclSectionSection,
    },
    {
      key: "nucl-tube-putty",
      title: "Putty",
      defaultExpanded: true,
      Component: NuclPuttySection,
    },
  ],
};

/**
 * Resolve the type-specific sections for a renderer type. Unknown types return
 * an empty list (common page only).
 */
export function getRendererPropSections(rendererType: string): RendererPropSectionDef[] {
  return RENDERER_SECTION_REGISTRY[rendererType] ?? [];
}

// ------------------------------------------------------------
// Temporary placeholder
// ------------------------------------------------------------

/**
 * Placeholder section appended after the common page for every renderer type
 * in this migration step, so the eventual "Common + specific" layout is
 * visible end-to-end. Remove it once `getRendererPropSections` returns real
 * sections for the known types.
 */
export const DUMMY_SECTION: RendererPropSectionDef = {
  key: "dummy",
  title: "Renderer settings",
  defaultExpanded: false,
  Component: () => (
    <div className="insp-prop-readonly">Not implemented yet.</div>
  ),
};
