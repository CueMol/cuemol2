/**
 * @file components/inspector/rendererPropSections.tsx
 * @description Renderer-type -> property-section dispatch for the inspector
 * Properties tab.
 *
 * The Properties tab always shows the renderer-common page first
 * (`RendererCommonSection`), then any renderer-type-specific sections. Those
 * type-specific sections are looked up here by the renderer's `type_name`
 * (e.g. `ribbon`, `cpk`, `tube`), mirroring how each UXP renderer property
 * dialog stacks its own tabs on top of the shared `renderer-common-page`
 * overlay.
 *
 * The registry is intentionally empty for now: only the common page has been
 * migrated. As each renderer-specific page is ported, add its sections to
 * `RENDERER_SECTION_REGISTRY` keyed by `type_name`. Unknown types resolve to
 * an empty list, so they will show the common page only.
 */

import React from "react";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from "../../worker/server/services/genericProps.service";
import { SimpleRendererSection } from "./SimpleRendererSection";
import { BallStickRendererSection } from "./BallStickRendererSection";
import { CPKAtomRadiiSection, CPKDetailSection } from "./CPKRendererSection";
import { AnIsoUDiscSection } from "./AnIsoURendererSection";
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
import { DisoMainSection } from "./DisoRendererSection";
import {
  DSurfaceMainSection,
  DSurfaceRadiiSection,
} from "./DSurfaceRendererSection";
import {
  TubeMainSection,
  TubeSectionSection,
  TubePuttySection,
} from "./TubeRendererSection";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

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
}

/** One accordion section in the Properties tab. */
export interface RendererPropSectionDef {
  /** Stable React key / accordion identity. */
  key: string;
  /** Accordion header title. */
  title: string;
  /** Whether the accordion starts expanded. */
  defaultExpanded?: boolean;
  /** Section body. */
  Component: React.FC<RendererPropSectionProps>;
}

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

/**
 * Renderer-type-specific sections, keyed by renderer `type_name`. Add an entry
 * here when porting a per-type page (ribbon / cpk / tube / ...). Unknown types
 * resolve to an empty list (common page only).
 */
export const RENDERER_SECTION_REGISTRY: Record<string, RendererPropSectionDef[]> = {
  // SimpleRenderer ("simple"): UXP simple-propdlg "Simple" tab -- line width only.
  simple: [
    {
      key: "simple",
      title: "Simple",
      defaultExpanded: true,
      Component: SimpleRendererSection,
    },
  ],
  // BallStickRenderer ("ballstick"): UXP ballstick-propdlg "Ball & Stick" tab.
  ballstick: [
    {
      key: "ballstick",
      title: "Ball and stick",
      defaultExpanded: true,
      Component: BallStickRendererSection,
    },
  ],
  // CPKRenderer ("cpk"): UXP cpk-propdlg "Atom radii" tab. The seven per-element
  // radii form the "Atom radii" groupbox; `detail` is a loose row outside it.
  cpk: [
    {
      key: "cpk-radii",
      title: "Atom radii",
      defaultExpanded: true,
      Component: CPKAtomRadiiSection,
    },
    {
      key: "cpk-detail",
      title: "Detail",
      defaultExpanded: true,
      Component: CPKDetailSection,
    },
  ],
  // AnIsoURenderer ("anisou"): ORTEP-like anisotropic-displacement variant of
  // ball-and-stick. The inherited base controls reuse the shared ball-and-stick
  // section; the disc-only controls live in their own section.
  anisou: [
    {
      key: "anisou-ballstick",
      title: "Atoms and bonds",
      defaultExpanded: true,
      Component: BallStickRendererSection,
    },
    {
      key: "anisou-disc",
      title: "Anisotropic displacement",
      defaultExpanded: true,
      Component: AnIsoUDiscSection,
    },
  ],
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
  // DisoRenderer ("disorder"): UXP disorder-propdlg "Disorder" tab. One section
  // surfacing the target main-chain renderer, tessellation detail, dot size /
  // separation, the two loop strengths and the default color.
  disorder: [
    {
      key: "disorder-main",
      title: "Disorder",
      defaultExpanded: true,
      Component: DisoMainSection,
    },
  ],
  // DirectSurfRenderer ("dsurface"): UXP dsurf-propdlg "MolSurf" + "Atom radii"
  // tabs. The MolSurf "Draw" groupbox (draw mode / line-point size / surface
  // type / detail) becomes the "Surface" section; the per-element van der Waals
  // radii form the "Atom radii" section. The MolSurf coloring controls (target /
  // showsel / coloring mode) stay out (UXP Coloring panel, not migrated yet).
  dsurface: [
    {
      key: "dsurface-main",
      title: "Surface",
      defaultExpanded: true,
      Component: DSurfaceMainSection,
    },
    {
      key: "dsurface-radii",
      title: "Atom radii",
      defaultExpanded: true,
      Component: DSurfaceRadiiSection,
    },
  ],
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
};

/**
 * Resolve the type-specific sections for a renderer type. Unknown types return
 * an empty list (common page only).
 */
export function getRendererPropSections(rendererType: string): RendererPropSectionDef[] {
  return RENDERER_SECTION_REGISTRY[rendererType] ?? [];
}

// ────────────────────────────────────────────────────────────
// Temporary placeholder
// ────────────────────────────────────────────────────────────

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
