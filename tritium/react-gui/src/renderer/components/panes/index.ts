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
 *   DummyPane2,
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
export { MolStructPane } from "./MolStructPane";
export { SelectionPane } from "./SelectionPane";
export { SymmetryPane } from "./SymmetryPane";

/* ─── PoC Dummy Panes ─── */

export { DummyPane2 } from "./DummyPane2";
export { DummyPane3 } from "./DummyPane3";
export { DummyPane4 } from "./DummyPane4";

/* ─── Shared Components ─── */

export { SectionHeader } from "./SectionHeader";
