/**
 * @file h3-kit/index.ts
 * @description Root barrel for the design system.
 *
 * The kit is organised by what a piece is, not by what uses it:
 *
 *   primitives/  icons and the tooltip -- React and the icon libraries only
 *   form/        the label+control catalog; owns every control size
 *   list/        selectable-list rows and their keyboard navigation
 *   gradient/    the gradient stop strip and its value/pixel geometry
 *   colorpicker/ the colour popover and the field that opens it
 *   MolSelList/  the molecular-selection picker
 *   selection/   the selection-expression builder shared by the pane and the picker
 *   ObjectSelect the scene-object dropdown
 *
 * The last four read CueMol state through the worker transport; the first
 * three do not. Nothing in the kit imports application code -- no components/,
 * contexts/, state/, commands/ or shell/ -- which is what lets a pane be
 * rewritten without touching a control, and is enforced in eslint.config.mjs.
 *
 * Import from a sub-barrel (`@renderer/h3-kit/form`) or from here; reaching
 * past one at a module inside is what the barrels exist to prevent.
 */

export * from './primitives';
export * from './form';
export * from './list';
export * from './gradient';
export * from './colorpicker';
export * from './MolSelList';
export * from './selection';
export { ObjectSelect, objectFilters } from './ObjectSelect';
export type { ObjectFilter } from './ObjectSelect';
