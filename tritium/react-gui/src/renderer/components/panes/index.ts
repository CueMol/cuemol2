/**
 * @file index.ts
 * @description Barrel export file for all pane components.
 *
 * This file aggregates all pane exports (both existing and PoC) in a single
 * location, enabling clean imports throughout the application:
 *
 * ```typescript
 * import {
 *   ScenePane,
 *   ColorPane,
 *   SymmetryPane,
 *   DensityMapPane,
 *   // ... etc
 * } from "./panes";
 * ```
 *
 * Without barrel exports, imports would be scattered across individual files:
 *
 * ```typescript
 * import { ScenePane } from "./panes/ScenePane";
 * import { ColorPane } from "./panes/ColorPane";
 * import { SymmetryPane } from "./panes/SymmetryPane";
 * // ... cluttered imports
 * ```
 *
 * @module panes (barrel)
 */

/* ─── Existing Panes ─── */

export { ScenePane } from "./ScenePane";
export { ColorPane } from "./ColorPane";
export { ViewPane } from "./ViewPane";
export { MolStructPane } from "./MolStructPane";
export { SelectionPane } from "./SelectionPane";
export { SymmetryPane } from "./SymmetryPane";
export { DensityMapPane } from "./DensityMapPane";

/* ─── Component Catalog Panes ─── */

export { CatalogPane1 } from "./CatalogPane1";
export { CatalogPane2 } from "./CatalogPane2";
export { CatalogPane3 } from "./CatalogPane3";

/* ─── Shared Components ─── */

export { SectionHeader } from "./SectionHeader";
