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
 *   DummyPane1,
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
 * import { DummyPane1 } from "./panes/DummyPane1";
 * // ... cluttered imports
 * ```
 *
 * @module panes (barrel)
 */

/* ─── Existing Panes ─── */

export { ScenePane, type SceneNode, type SceneObjectNode, type SceneRendererNode } from "./ScenePane";
export { ColorPane } from "./ColorPane";
export { MolStructPane, type MolNode } from "./MolStructPane";
export { SelectionPane, type MolOption } from "./SelectionPane";

/* ─── PoC Dummy Panes ─── */

export { DummyPane1 } from "./DummyPane1";
export { DummyPane2 } from "./DummyPane2";
export { DummyPane3 } from "./DummyPane3";
export { DummyPane4 } from "./DummyPane4";

/* ─── Shared Components ─── */

export { SectionHeader } from "./SectionHeader";
